import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma } from '@prisma/client';
import { type DisputeDto, type Paginated } from '@qp/types';
import { type adminBookingListSchema, type disputeResolveSchema, type payoutCreateSchema, type refundCreateSchema, type reportSchema, type userListSchema } from '@qp/validation';
import { type z } from 'zod';
import { AuditService } from '../../shared/audit/audit.service';
import { AuthCacheService } from '../../shared/auth/auth-cache.service';
import { SessionService } from '../../shared/auth/session.service';
import { type Env } from '../../shared/config/env';
import { PrismaService } from '../../shared/database/prisma.service';
import { StorageService } from '../../shared/files/storage.service';
import { AppException, Errors } from '../../shared/http/app-exception';
import { ownerLocationInclude, toOwnerLocationDto } from '../../shared/locations/location.mapper';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { PaymentsService, REFUND_MAX_ATTEMPTS } from '../../shared/payments/payments.service';
import { RealtimeGateway } from '../../shared/realtime/realtime.gateway';
import { MoneyService } from '../../shared/reports/money.service';
import { toPayoutDto } from '../../parking-owner/bookings/owner-bookings.service';

const OWNER_SUSPENDED_NOTE = 'Owner account suspended';
const badState = (m: string) => new AppException(HttpStatus.CONFLICT, 'INVALID_STATE', m);
type Out<S extends z.ZodType> = z.output<S>;

/** Super-admin operations (plan M4 approvals, M5 approvals, M12). Every decision is audit-logged. */
@Injectable()
export class AdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly storage: StorageService,
    private readonly payments: PaymentsService,
    private readonly money: MoneyService,
    private readonly realtime: RealtimeGateway,
    private readonly sessions: SessionService,
    private readonly authCache: AuthCacheService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ---------- approvals ----------

  async approvals() {
    const [owners, locations] = await Promise.all([
      this.prisma.owner.findMany({
        where: { kycStatus: 'PENDING' },
        include: { user: { select: { name: true, email: true } }, documents: { select: { id: true, docType: true, fileName: true, contentType: true } } },
        orderBy: { kycSubmittedAt: 'asc' },
      }),
      this.prisma.parkingLocation.findMany({
        where: { status: 'PENDING' },
        include: { ...ownerLocationInclude, owner: { select: { businessName: true } } },
        orderBy: { submittedAt: 'asc' },
      }),
    ]);
    return {
      owners: owners.map(({ bankAccountNumber, ...o }) => ({ ...o, bankAccountNumber: bankAccountNumber ? `••••${bankAccountNumber.slice(-4)}` : null })),
      locations: locations.map((l) => ({ ...toOwnerLocationDto(l), businessName: l.owner.businessName })),
    };
  }

  async owners() {
    const rows = await this.prisma.owner.findMany({
      include: { user: { select: { name: true, email: true, status: true } }, _count: { select: { locations: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((o) => ({
      id: o.id,
      businessName: o.businessName,
      name: o.user.name,
      email: o.user.email,
      userStatus: o.user.status,
      kycStatus: o.kycStatus,
      commissionPct: o.commissionPct?.toNumber() ?? null,
      locations: o._count.locations,
      upiId: o.upiId,
      bankAccountName: o.bankAccountName,
      bankAccountNumber: o.bankAccountNumber,
      bankIfsc: o.bankIfsc,
    }));
  }

  async ownerDocument(ownerId: string, docId: string) {
    const d = await this.prisma.ownerKycDocument.findFirst({ where: { id: docId, ownerId } });
    if (!d) throw Errors.notFound('Document');
    return { doc: d, stream: await this.storage.read('private', d.storageKey) };
  }

  async decideKyc(adminId: string, ownerId: string, approve: boolean, reason?: string) {
    const o = await this.prisma.owner.findUnique({ where: { id: ownerId } });
    if (!o) throw Errors.notFound('Owner');
    if (o.kycStatus !== 'PENDING') throw badState('This verification is not waiting for review');
    await this.prisma.$transaction(async (tx) => {
      await tx.owner.update({
        where: { id: ownerId },
        data: { kycStatus: approve ? 'APPROVED' : 'REJECTED', kycRejectionReason: approve ? null : reason, kycReviewedAt: new Date() },
      });
      await this.audit.log(adminId, approve ? 'kyc.approve' : 'kyc.reject', 'owner', ownerId, reason ? { reason } : undefined, tx);
    });
    await this.notify.kycDecision(ownerId, approve, reason);
    return { ok: true };
  }

  async setCommission(adminId: string, ownerId: string, pct: number | null) {
    await this.prisma.owner.update({ where: { id: ownerId }, data: { commissionPct: pct } });
    await this.audit.log(adminId, 'owner.commission', 'owner', ownerId, { pct });
    return { ok: true };
  }

  async locations(status?: string) {
    const rows = await this.prisma.parkingLocation.findMany({
      where: status ? { status: status as Prisma.EnumLocationStatusFilter['equals'] } : {},
      include: { ...ownerLocationInclude, owner: { select: { businessName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    });
    return rows.map((l) => ({ ...toOwnerLocationDto(l), businessName: l.owner.businessName }));
  }

  async decideLocation(adminId: string, id: string, action: 'approve' | 'reject' | 'suspend' | 'reinstate', reason?: string) {
    const l = await this.prisma.parkingLocation.findUnique({ where: { id } });
    if (!l) throw Errors.notFound('Parking place');
    const allowed = { approve: ['PENDING'], reject: ['PENDING'], suspend: ['ACTIVE'], reinstate: ['SUSPENDED'] }[action];
    if (!allowed.includes(l.status)) throw badState(`Can't ${action} a ${l.status.toLowerCase()} place`);
    const data: Prisma.ParkingLocationUpdateInput =
      action === 'approve'
        ? { status: 'ACTIVE', approvedAt: new Date(), rejectionReason: null }
        : action === 'reject'
          ? { status: 'DRAFT', rejectionReason: reason }
          : action === 'suspend'
            ? { status: 'SUSPENDED', rejectionReason: reason }
            : { status: 'ACTIVE', rejectionReason: null };
    await this.prisma.$transaction(async (tx) => {
      await tx.parkingLocation.update({ where: { id }, data });
      await this.audit.log(adminId, `location.${action}`, 'location', id, reason ? { reason } : undefined, tx);
    });
    if (action !== 'reinstate') await this.notify.locationDecision(id, action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended', reason);
    if (action === 'suspend') return { ok: true, ...(await this.cancelForSuspension([id], adminId, `Parking place suspended${reason ? `: ${reason}` : ''}`)) };
    return { ok: true };
  }

  /**
   * A suspended place can't serve its bookings: unpaid holds and confirmed bookings that haven't ended are cancelled
   * with a full refund and an email. ACTIVE bookings (vehicle inside or a pass in use) are left for the admin to
   * settle from Bookings, and are counted in the result.
   */
  private async cancelForSuspension(locationIds: string[], adminId: string, reason: string) {
    const now = new Date();
    const affected = await this.prisma.booking.findMany({
      where: { locationId: { in: locationIds }, OR: [{ status: 'PENDING_PAYMENT' }, { status: 'CONFIRMED', endAt: { gt: now } }] },
      select: { id: true, status: true, locationId: true, vehicleTypeId: true },
    });
    let cancelled = 0;
    let refundedPaise = 0;
    for (const b of affected) {
      const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, status: b.status }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason } });
      if (!claimed.count) continue;
      cancelled++;
      if (b.status === 'CONFIRMED') {
        const { paid, refunded } = await this.payments.paidAndRefunded(b.id);
        const refund = paid - refunded > 0 ? await this.payments.refundBooking(b.id, paid - refunded, reason, adminId) : 0;
        refundedPaise += refund;
        await this.notify.bookingCancelled(b.id, refund);
      }
    }
    for (const key of new Set(affected.map((b) => `${b.locationId}:${b.vehicleTypeId}`))) {
      const [locationId, vehicleTypeId] = key.split(':') as [string, string];
      await this.realtime.publish(locationId, vehicleTypeId);
    }
    const activeLeft = await this.prisma.booking.count({ where: { locationId: { in: locationIds }, status: 'ACTIVE' } });
    await this.audit.log(adminId, 'location.suspension_cancellations', 'location', locationIds[0] ?? null, { locationIds, cancelled, refundedPaise, activeLeft });
    return { cancelled, refundedPaise, activeLeft };
  }

  // ---------- users ----------

  async users(q: Out<typeof userListSchema>) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q.toLowerCase() } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, lastLoginAt: true, emailVerifiedAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page: q.page, pageSize: q.pageSize, total };
  }

  async setUserStatus(adminId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED') {
    if (userId === adminId) throw badState('You cannot change your own status');
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw Errors.notFound('User');
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    if (status === 'SUSPENDED') await this.sessions.revokeAllForUser(userId);
    await this.authCache.invalidate(userId);
    await this.audit.log(adminId, `user.${status.toLowerCase()}`, 'user', userId);
    // A suspended owner can't run the gate, so their live places are suspended too. Reactivating the owner
    // reinstates only the places that were suspended because of the account (not ones an admin suspended separately).
    if (status === 'ACTIVE' && u.role === 'PARKING_OWNER') {
      const places = await this.prisma.parkingLocation.findMany({ where: { owner: { userId }, status: 'SUSPENDED', rejectionReason: OWNER_SUSPENDED_NOTE }, select: { id: true } });
      if (places.length) {
        const ids = places.map((p) => p.id);
        await this.prisma.parkingLocation.updateMany({ where: { id: { in: ids } }, data: { status: 'ACTIVE', rejectionReason: null } });
        await this.audit.log(adminId, 'location.reinstate', 'location', ids[0] ?? null, { locationIds: ids, reason: 'Owner account reactivated' });
        return { ok: true, placesReinstated: ids.length };
      }
    }
    if (status === 'SUSPENDED' && u.role === 'PARKING_OWNER') {
      const places = await this.prisma.parkingLocation.findMany({ where: { owner: { userId }, status: 'ACTIVE' }, select: { id: true } });
      if (places.length) {
        const ids = places.map((p) => p.id);
        await this.prisma.parkingLocation.updateMany({ where: { id: { in: ids } }, data: { status: 'SUSPENDED', rejectionReason: OWNER_SUSPENDED_NOTE } });
        return { ok: true, placesSuspended: ids.length, ...(await this.cancelForSuspension(ids, adminId, 'Parking owner account suspended')) };
      }
    }
    return { ok: true };
  }

  // ---------- bookings, payments, refunds ----------

  async bookings(q: Out<typeof adminBookingListSchema>) {
    const where: Prisma.BookingWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? { OR: [{ code: { contains: q.q.toUpperCase() } }, { user: { email: { contains: q.q.toLowerCase() } } }, { vehicle: { plateNumber: { contains: q.q.toUpperCase().replace(/\s/g, '') } } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          vehicle: { select: { plateNumber: true } },
          location: { select: { name: true, city: true } },
          payments: { select: { id: true, status: true, amountPaise: true, provider: true, providerPaymentId: true } },
          refunds: { select: { amountPaise: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      items: rows.map((b) => ({
        id: b.id,
        code: b.code,
        status: b.status,
        planType: b.planType,
        startAt: b.startAt,
        endAt: b.endAt,
        amountPaise: b.amountPaise,
        commissionPaise: b.commissionPaise,
        customerName: b.user.name,
        customerEmail: b.user.email,
        plateNumber: b.vehicle.plateNumber,
        location: b.location,
        paidPaise: b.payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amountPaise, 0),
        refundedPaise: b.refunds.filter((r) => r.status === 'PROCESSED').reduce((s, r) => s + r.amountPaise, 0),
        createdAt: b.createdAt,
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async paymentsList(page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        include: { booking: { select: { code: true, user: { select: { name: true } } } }, refunds: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count(),
    ]);
    return { items, page, pageSize, total };
  }

  async refund(adminId: string, input: Out<typeof refundCreateSchema>) {
    const b = await this.prisma.booking.findUnique({ where: { id: input.bookingId } });
    if (!b) throw Errors.notFound('Booking');
    const refunded = await this.payments.refundBooking(b.id, input.amountPaise, `Admin: ${input.reason}`, adminId);
    return { refundedPaise: refunded };
  }

  // ---------- disputes ----------

  async disputes(status?: string): Promise<DisputeDto[]> {
    const rows = await this.prisma.dispute.findMany({
      where: status ? { status: status as 'OPEN' | 'RESOLVED' | 'REJECTED' } : {},
      include: { booking: { select: { code: true, user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map((d) => ({
      id: d.id,
      bookingId: d.bookingId,
      bookingCode: d.booking.code,
      customerName: d.booking.user.name,
      reason: d.reason,
      status: d.status,
      resolution: d.resolution,
      refundPaise: d.refundPaise,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
    }));
  }

  async resolveDispute(adminId: string, id: string, input: Out<typeof disputeResolveSchema>) {
    const d = await this.prisma.dispute.findUnique({ where: { id } });
    if (!d) throw Errors.notFound('Dispute');
    if (d.status !== 'OPEN') throw badState('This issue is already closed');
    let refunded = 0;
    if (input.status === 'RESOLVED' && input.refundPaise > 0) {
      refunded = await this.payments.refundBooking(d.bookingId, input.refundPaise, `Dispute resolution`, adminId);
    }
    await this.prisma.dispute.update({
      where: { id },
      data: { status: input.status, resolution: input.resolution, refundPaise: refunded, adminId, resolvedAt: new Date() },
    });
    await this.audit.log(adminId, `dispute.${input.status.toLowerCase()}`, 'dispute', id, { refunded });
    await this.notify.disputeUpdate(id);
    return { ok: true, refundedPaise: refunded };
  }

  // ---------- payouts ----------

  async payouts() {
    const rows = await this.prisma.payout.findMany({ include: { owner: { select: { businessName: true } } }, orderBy: { createdAt: 'desc' }, take: 300 });
    return rows.map(toPayoutDto);
  }

  /** Manual payout record for a period (assumed default, Q18). Periods may not overlap an existing payout. */
  async createPayout(adminId: string, input: Out<typeof payoutCreateSchema>) {
    const owner = await this.prisma.owner.findUnique({ where: { id: input.ownerId } });
    if (!owner) throw Errors.notFound('Owner');
    const overlap = await this.prisma.payout.findFirst({ where: { ownerId: owner.id, periodFrom: { lt: input.periodTo }, periodTo: { gt: input.periodFrom } } });
    if (overlap) throw Errors.conflict('DUPLICATE', 'A payout already covers part of this period');
    const t = await this.money.totals({ ownerId: owner.id, from: input.periodFrom, to: input.periodTo });
    const p = await this.prisma.payout.create({
      data: {
        ownerId: owner.id,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        grossPaise: t.grossPaise,
        commissionPaise: t.commissionPaise,
        refundPaise: t.refundPaise,
        netPaise: t.netPaise,
        createdById: adminId,
      },
      include: { owner: { select: { businessName: true } } },
    });
    await this.audit.log(adminId, 'payout.create', 'payout', p.id, { netPaise: p.netPaise });
    return toPayoutDto(p);
  }

  async markPayoutPaid(adminId: string, id: string, reference: string) {
    const p = await this.prisma.payout.findUnique({ where: { id } });
    if (!p) throw Errors.notFound('Payout');
    if (p.status === 'PAID') throw badState('Already marked paid');
    const updated = await this.prisma.payout.update({ where: { id }, data: { status: 'PAID', reference, paidAt: new Date() }, include: { owner: { select: { businessName: true } } } });
    await this.audit.log(adminId, 'payout.paid', 'payout', id, { reference });
    return toPayoutDto(updated);
  }

  // ---------- reports + audit ----------

  async report(q: Out<typeof reportSchema>) {
    const rows = await this.money.grouped(q.groupBy, { from: q.from, to: q.to }, this.config.get('APP_TIMEZONE', { infer: true }));
    const totals = rows.reduce(
      (t, r) => ({ bookings: t.bookings + r.bookings, grossPaise: t.grossPaise + r.grossPaise, commissionPaise: t.commissionPaise + r.commissionPaise, refundPaise: t.refundPaise + r.refundPaise }),
      { bookings: 0, grossPaise: 0, commissionPaise: 0, refundPaise: 0 },
    );
    return { rows: rows.map((r) => ({ key: r.label, bookings: r.bookings, grossPaise: r.grossPaise, commissionPaise: r.commissionPaise, refundPaise: r.refundPaise })), totals };
  }

  async overview() {
    const [users, owners, activeLocations, pendingKyc, pendingLocations, openDisputes, month, failedRefunds] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.owner.count(),
      this.prisma.parkingLocation.count({ where: { status: 'ACTIVE' } }),
      this.prisma.owner.count({ where: { kycStatus: 'PENDING' } }),
      this.prisma.parkingLocation.count({ where: { status: 'PENDING' } }),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
      this.money.totals({ from: new Date(Date.now() - 30 * 86_400_000) }),
      // Gave up after every automatic retry: the admin must refund these by hand (e.g. from the Razorpay dashboard).
      this.prisma.refund.count({ where: { status: 'FAILED', attempts: { gte: REFUND_MAX_ATTEMPTS } } }),
    ]);
    return { users, owners, activeLocations, pendingKyc, pendingLocations, openDisputes, failedRefunds, last30Days: month };
  }

  async auditLogs(page: number, pageSize: number): Promise<Paginated<unknown>> {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count(),
    ]);
    const actors = await this.prisma.user.findMany({ where: { id: { in: items.map((i) => i.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const names = new Map(actors.map((a) => [a.id, a.name]));
    return { items: items.map((i) => ({ ...i, actorName: i.actorId ? (names.get(i.actorId) ?? null) : 'System' })), page, pageSize, total };
  }

  async publishLocation(locationId: string) {
    const caps = await this.prisma.locationCapacity.findMany({ where: { locationId } });
    for (const c of caps) await this.realtime.publish(locationId, c.vehicleTypeId);
  }
}
