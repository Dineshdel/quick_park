import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MAIL_QUEUE } from './mail.types';
import { type TemplateData, type TemplateName } from './templates';

export interface MailJob<T extends TemplateName = TemplateName> {
  to: string;
  template: T;
  data: TemplateData<T>;
}

/** Enqueue emails; delivery happens in MailProcessor with retries, so requests never wait on SMTP. */
@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJob>) {}

  async send<T extends TemplateName>(to: string, template: T, data: TemplateData<T>) {
    await this.queue.add(template, { to, template, data } as MailJob, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
