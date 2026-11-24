import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { type Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { MastersService } from '../masters/masters.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export const SCHEDULER_QUEUE = 'scheduler';
const HOUR = 3_600_000;

/**
 * Time-based transitions, run every minute by one worker (BullMQ repeatable job, so only one instance runs it):
 * hold expiry, no-shows, completing ended passes, reminders, pass-expiring notices, archiving ended events.
 * Every step is a guarded UPDATE, so running it twice is harmless.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<Env, true>,
    private readonly masters: MastersService,
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
  ) {}

  /** "10:30" in the business time zone, for the no-show reason. */
  private fmt(d: Date) {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: this.config.get('APP_TIMEZONE', { infer: true }),
    }).format(d);
  }

  async onApplicationBootstrap() {
    if (!this.config.get('SCHEDULER_ENABLED', { infer: true })) return;
    await this.queue.upsertJobScheduler(
      'tick',
      { every: 60_000 },
      { name: 'tick', opts: { removeOnComplete: 100, removeOnFail: 100 } },
    );
  }

  async tick(now = new Date()) {
    const touched = new Map<string, { locationId: string; vehicleTypeId: string }>();
    const remember = (rows: { locationId: string; vehicleTypeId: string }[]) =>
      rows.forEach((r) => touched.set(`${r.locationId}:${r.vehicleTypeId}`, r));

    // 1. Unpaid holds lapse.
    const holds = await this.prisma.booking.findMany({
      where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lt: now } },
      select: { id: true, locationId: true, vehicleTypeId: true },
    });
    if (holds.length) {
      await this.prisma.booking.updateMany({
        where: { id: { in: holds.map((h) => h.id) }, status: 'PENDING_PAYMENT' },
        data: { status: 'EXPIRED' },
      });
      remember(holds);
    }

    // 2. No-shows: confirmed but never entered before the end. An extension of a stay whose vehicle is still
    //    inside is not a no-show (its session belongs to the first booking); it completes at exit instead.
    const ended2 = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', endAt: { lt: now } },
      select: { id: true, locationId: true, vehicleTypeId: true, vehicleId: true },
    });
    const inside = ended2.length
      ? await this.prisma.parkingSession.findMany({
          where: {
            exitAt: null,
            OR: ended2.map((b) => ({ vehicleId: b.vehicleId, locationId: b.locationId })),
          },
          select: { vehicleId: true, locationId: true },
        })
      : [];
    const insideKeys = new Set(inside.map((s) => `${s.vehicleId}:${s.locationId}`));
    const noShows = ended2.filter((b) => !insideKeys.has(`${b.vehicleId}:${b.locationId}`));
    if (noShows.length) {
      await this.prisma.booking.updateMany({
        where: { id: { in: noShows.map((h) => h.id) }, status: 'CONFIRMED' },
        data: { status: 'EXPIRED', cancelReason: 'No-show: the vehicle never checked in' },
      });
      remember(noShows);
    }

    // 2b. Early no-show release: hourly/daily bookings whose vehicle hasn't checked in `noShowReleaseMinutes`
    //     after the start free their slot for the rest of the time. Passes (weekly+) and events allow arriving any
    //     time, so they keep their slot. A vehicle already inside (e.g. on an extension) is never released.
    const { noShowReleaseMinutes } = await this.masters.settings();
    const released: { id: string; locationId: string; vehicleTypeId: string; checkInBy: Date }[] =
      [];
    if (noShowReleaseMinutes > 0) {
      const due = await this.prisma.booking.findMany({
        where: {
          status: 'CONFIRMED',
          planType: { in: ['HOURLY', 'DAILY'] },
          startAt: { lte: new Date(now.getTime() - noShowReleaseMinutes * 60_000) },
          endAt: { gte: now },
          sessions: { none: {} },
        },
        select: { id: true, locationId: true, vehicleTypeId: true, vehicleId: true, startAt: true },
      });
      const insideNow = due.length
        ? await this.prisma.parkingSession.findMany({
            where: {
              exitAt: null,
              OR: due.map((b) => ({ vehicleId: b.vehicleId, locationId: b.locationId })),
            },
            select: { vehicleId: true, locationId: true },
          })
        : [];
      const insideSet = new Set(insideNow.map((s) => `${s.vehicleId}:${s.locationId}`));
      for (const b of due.filter((x) => !insideSet.has(`${x.vehicleId}:${x.locationId}`))) {
        const checkInBy = new Date(b.startAt.getTime() + noShowReleaseMinutes * 60_000);
        const done = await this.prisma.booking.updateMany({
          where: { id: b.id, status: 'CONFIRMED' },
          data: {
            status: 'EXPIRED',
            cancelReason: `No-show: not checked in by ${this.fmt(checkInBy)}, slot released`,
          },
        });
        if (done.count) released.push({ ...b, checkInBy });
      }
      remember(released);
      for (const b of released) await this.notify.noShow(b.id, b.checkInBy);
    }

    // 3. Ended bookings whose vehicle is not inside → COMPLETED (vehicles still inside complete at exit, with overstay).
    const ended = await this.prisma.booking.findMany({
      where: { status: 'ACTIVE', endAt: { lt: now }, sessions: { none: { exitAt: null } } },
      select: { id: true, locationId: true, vehicleTypeId: true },
    });
    if (ended.length) {
      await this.prisma.booking.updateMany({
        where: { id: { in: ended.map((h) => h.id) }, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });
      remember(ended);
    }

    // 4. Reminder one hour before start.
    const soon = await this.prisma.booking.findMany({
      // Not for extensions of a stay that is already running (the car is inside).
      where: {
        status: 'CONFIRMED',
        reminderSentAt: null,
        startAt: { gt: now, lte: new Date(now.getTime() + HOUR) },
        OR: [
          { extendedFromId: null },
          { extendedFrom: { status: { notIn: ['ACTIVE', 'CONFIRMED'] } } },
        ],
      },
      select: { id: true },
    });
    for (const b of soon) {
      const claimed = await this.prisma.booking.updateMany({
        where: { id: b.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claimed.count) await this.notify.reminder(b.id);
    }

    // 5. Monthly / yearly passes ending within 3 days.
    const expiring = await this.prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'ACTIVE'] },
        planType: { in: ['MONTHLY', 'YEARLY'] },
        expiryNoticeAt: null,
        endAt: { gt: now, lte: new Date(now.getTime() + 72 * HOUR) },
      },
      select: { id: true },
    });
    for (const b of expiring) {
      const claimed = await this.prisma.booking.updateMany({
        where: { id: b.id, expiryNoticeAt: null },
        data: { expiryNoticeAt: now },
      });
      if (claimed.count) await this.notify.planExpiring(b.id);
    }

    // 6. Event parkings archive after the event.
    const archived = await this.prisma.parkingLocation.updateMany({
      where: { isEvent: true, status: 'ACTIVE', eventEndAt: { lt: now } },
      data: { status: 'ARCHIVED' },
    });

    // 7. Retry refunds the payment provider rejected earlier.
    const refundsRetried = await this.payments.retryFailedRefunds(now);

    for (const t of touched.values()) await this.realtime.publish(t.locationId, t.vehicleTypeId);
    const summary = {
      expiredHolds: holds.length,
      noShows: noShows.length,
      released: released.length,
      completed: ended.length,
      reminders: soon.length,
      expiring: expiring.length,
      archivedEvents: archived.count,
      refundsRetried,
    };
    if (Object.values(summary).some(Boolean)) this.logger.log(`tick ${JSON.stringify(summary)}`);
    return summary;
  }
}

@Processor(SCHEDULER_QUEUE)
export class SchedulerProcessor extends WorkerHost {
  constructor(private readonly scheduler: SchedulerService) {
    super();
  }
  async process() {
    return this.scheduler.tick();
  }
}
