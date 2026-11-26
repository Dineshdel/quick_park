import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatRupees, type NotificationListDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { type Env } from '../config/env';
import { webLink } from '../config/web-link';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { PassService } from '../pass/pass.service';

/** Business emails. Each loads what it needs and never throws (a failed email must not fail the action). */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly pass: PassService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private link(path: string) {
    return webLink(this.config, path);
  }

  private async safe(what: string, run: () => Promise<unknown>) {
    try {
      await run();
    } catch (e) {
      this.logger.warn(`${what} email failed: ${(e as Error).message}`);
    }
  }

  private booking(id: string) {
    return this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        vehicle: { select: { plateNumber: true } },
        vehicleType: { select: { name: true } },
        location: {
          select: {
            name: true,
            slug: true,
            address: true,
            owner: { select: { user: { select: { name: true, email: true } } } },
          },
        },
      },
    });
  }

  bookingConfirmed(bookingId: string) {
    return this.safe('bookingConfirmed', async () => {
      const b = await this.booking(bookingId);
      const vehicle = `${formatPlate(b.vehicle.plateNumber)} (${b.vehicleType.name})`;
      const qr = await this.pass.png(b.id);
      await this.mail.send(b.user.email, 'bookingConfirmed', {
        name: b.user.name,
        code: b.code,
        place: b.location.name,
        address: b.location.address,
        vehicle,
        from: this.pass.fmt(b.startAt),
        until: this.pass.fmt(b.endAt),
        amount: formatRupees(b.amountPaise),
        link: this.link(`/vehicle-owner/bookings/${b.id}`),
        qrDataUrl: `data:image/png;base64,${qr.toString('base64')}`,
      });
      const owner = b.location.owner.user;
      await this.mail.send(owner.email, 'ownerNewBooking', {
        name: owner.name,
        code: b.code,
        place: b.location.name,
        customer: b.user.name,
        vehicle,
        from: this.pass.fmt(b.startAt),
        until: this.pass.fmt(b.endAt),
        link: this.link('/parking-owner/bookings'),
      });
    });
  }

  bookingCancelled(bookingId: string, refundPaise: number) {
    return this.safe('bookingCancelled', async () => {
      const b = await this.booking(bookingId);
      await this.mail.send(b.user.email, 'bookingCancelled', {
        name: b.user.name,
        code: b.code,
        place: b.location.name,
        refund: refundPaise ? formatRupees(refundPaise) : 'none (per the cancellation policy)',
      });
    });
  }

  /** The vehicle didn't check in in time, so the booking was released. */
  noShow(bookingId: string, checkInBy: Date) {
    return this.safe('noShow', async () => {
      const b = await this.booking(bookingId);
      await this.mail.send(b.user.email, 'bookingNoShow', {
        name: b.user.name,
        code: b.code,
        place: b.location.name,
        by: this.pass.fmt(checkInBy),
        link: this.link(`/p/${b.location.slug}`),
      });
    });
  }

  reminder(bookingId: string) {
    return this.safe('reminder', async () => {
      const b = await this.booking(bookingId);
      await this.mail.send(b.user.email, 'bookingReminder', {
        name: b.user.name,
        code: b.code,
        place: b.location.name,
        from: this.pass.fmt(b.startAt),
        link: this.link(`/vehicle-owner/bookings/${b.id}`),
      });
    });
  }

  planExpiring(bookingId: string) {
    return this.safe('planExpiring', async () => {
      const b = await this.booking(bookingId);
      await this.mail.send(b.user.email, 'planExpiring', {
        name: b.user.name,
        code: b.code,
        place: b.location.name,
        until: this.pass.fmt(b.endAt),
        link: this.link(`/vehicle-owner/bookings/${b.id}`),
      });
    });
  }

  session(sessionId: string, action: 'entry' | 'exit') {
    return this.safe('session', async () => {
      const s = await this.prisma.parkingSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: {
          location: { select: { name: true } },
          vehicleType: { select: { name: true } },
          vehicle: { select: { user: { select: { name: true, email: true } } } },
        },
      });
      const user = s.vehicle?.user;
      if (!user) return; // walk-ins have no account
      const due = s.overstayAmountPaise + s.walkInAmountPaise;
      await this.mail.send(user.email, 'sessionReceipt', {
        name: user.name,
        place: s.location.name,
        vehicle: `${formatPlate(s.plateNumber)} (${s.vehicleType.name})`,
        action,
        at: this.pass.fmt(action === 'entry' ? s.entryAt : (s.exitAt ?? new Date())),
        extra:
          action === 'exit' && due
            ? `Overstay of ${s.overstayMinutes} min charged ${formatRupees(due)}.`
            : '',
      });
    });
  }

  // ---------- in-app (bell menu) ----------

  /** Adds an in-app notification. Never throws. */
  inApp(
    userId: string,
    n: {
      type: string;
      title: string;
      body: string;
      link?: string | null;
      paymentId?: string | null;
      amountPaise?: number | null;
    },
  ) {
    return this.safe('inApp', () => this.prisma.notification.create({ data: { userId, ...n } }));
  }

  async list(userId: string): Promise<NotificationListDto> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      unread,
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        paymentId: n.paymentId,
        amountPaise: n.amountPaise,
        read: !!n.readAt,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async markRead(userId: string, id?: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  /** Marks every notification about this payment as read (e.g. once it is paid or cancelled). */
  async markPaymentRead(paymentId: string) {
    await this.prisma.notification
      .updateMany({ where: { paymentId, readAt: null }, data: { readAt: new Date() } })
      .catch(() => undefined);
  }

  kycDecision(ownerId: string, approved: boolean, reason?: string) {
    return this.safe('kycDecision', async () => {
      const o = await this.prisma.owner.findUniqueOrThrow({
        where: { id: ownerId },
        include: { user: true },
      });
      await this.mail.send(o.user.email, 'kycDecision', {
        name: o.user.name,
        approved,
        reason,
        link: this.link('/parking-owner/onboarding'),
      });
    });
  }

  locationDecision(
    locationId: string,
    status: 'approved' | 'rejected' | 'suspended',
    reason?: string,
  ) {
    return this.safe('locationDecision', async () => {
      const l = await this.prisma.parkingLocation.findUniqueOrThrow({
        where: { id: locationId },
        include: { owner: { include: { user: true } } },
      });
      await this.mail.send(l.owner.user.email, 'locationDecision', {
        name: l.owner.user.name,
        place: l.name,
        status,
        reason,
        link: this.link(`/parking-owner/locations/${l.id}`),
      });
    });
  }

  disputeUpdate(disputeId: string) {
    return this.safe('disputeUpdate', async () => {
      const d = await this.prisma.dispute.findUniqueOrThrow({
        where: { id: disputeId },
        include: { booking: { include: { user: true } } },
      });
      await this.mail.send(d.booking.user.email, 'disputeUpdate', {
        name: d.booking.user.name,
        code: d.booking.code,
        status: d.status,
        resolution: d.resolution ?? '',
      });
    });
  }
}
