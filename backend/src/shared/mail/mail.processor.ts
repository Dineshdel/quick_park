import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { type Job } from 'bullmq';
import { type MailJob } from './mail.service';
import { MAIL_QUEUE, MAIL_TRANSPORT, type MailTransport } from './mail.types';
import { templates } from './templates';

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(@Inject(MAIL_TRANSPORT) private readonly transport: MailTransport) {
    super();
  }

  async process(job: Job<MailJob>) {
    const render = templates[job.data.template] as (d: unknown) => { subject: string; html: string; text: string };
    await this.transport.send({ to: job.data.to, ...render(job.data.data) });
  }
}
