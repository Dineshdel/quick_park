import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { type MailMessage, type MailTransport } from './mail.types';

/** Development: print emails (including links) to the API log instead of sending. */
export class LogMailTransport implements MailTransport {
  private readonly logger = new Logger('Mail');
  async send(m: MailMessage) {
    this.logger.log(`To: ${m.to} | ${m.subject}\n${m.text}`);
  }
}

/** SMTP: Mailpit locally, or SES / Resend SMTP endpoints in production. */
export class SmtpMailTransport implements MailTransport {
  private readonly transporter: Transporter;
  constructor(url: string, private readonly from: string) {
    this.transporter = createTransport(url);
  }
  async send(m: MailMessage) {
    await this.transporter.sendMail({ from: this.from, to: m.to, subject: m.subject, html: m.html, text: m.text });
  }
}
