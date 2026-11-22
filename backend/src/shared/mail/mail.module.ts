import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env } from '../config/env';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { MAIL_QUEUE, MAIL_TRANSPORT } from './mail.types';
import { LogMailTransport, SmtpMailTransport } from './transports';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [
    MailService,
    MailProcessor,
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('MAIL_TRANSPORT', { infer: true }) === 'smtp'
          ? new SmtpMailTransport(config.get('SMTP_URL', { infer: true })!, config.get('MAIL_FROM', { infer: true }))
          : new LogMailTransport(),
    },
  ],
  exports: [MailService],
})
export class MailModule {}
