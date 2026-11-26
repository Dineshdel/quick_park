import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit/audit.service';
import { AvailabilityService } from './availability/availability.service';
import { type Env } from './config/env';
import { FilesController } from './files/files.controller';
import { StorageService } from './files/storage.service';
import { MastersModule } from './masters/masters.module';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { PassService } from './pass/pass.service';
import { MockPaymentProvider, PAYMENT_PROVIDER, RazorpayPaymentProvider } from './payments/payment-provider';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { QuoteService } from './pricing/quote.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { MoneyService } from './reports/money.service';
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';
import { SCHEDULER_QUEUE, SchedulerProcessor, SchedulerService } from './scheduler/scheduler.service';

/**
 * Business engines shared by several roles (plan §4): files, audit, availability, booking pass, payments,
 * notifications, realtime and the scheduler. Global so role modules can inject them directly.
 */
@Global()
@Module({
  imports: [MastersModule, BullModule.registerQueue({ name: SCHEDULER_QUEUE })],
  controllers: [FilesController, PaymentsController, SearchController, NotificationsController],
  providers: [
    StorageService,
    AuditService,
    AvailabilityService,
    PassService,
    NotificationsService,
    RealtimeGateway,
    PaymentsService,
    SchedulerService,
    SchedulerProcessor,
    QuoteService,
    SearchService,
    MoneyService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) =>
        c.get('PAYMENTS_DRIVER', { infer: true }) === 'razorpay'
          ? new RazorpayPaymentProvider(
              c.get('RAZORPAY_KEY_ID', { infer: true })!,
              c.get('RAZORPAY_KEY_SECRET', { infer: true })!,
              c.get('RAZORPAY_WEBHOOK_SECRET', { infer: true })!,
            )
          : new MockPaymentProvider(),
    },
  ],
  exports: [MoneyService, QuoteService, StorageService, AuditService, AvailabilityService, PassService, NotificationsService, RealtimeGateway, PaymentsService, SchedulerService, MastersModule],
})
export class EnginesModule {}
