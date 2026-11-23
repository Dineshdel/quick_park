import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BOOKING_QR_PREFIX, formatRupees } from '@qp/types';
import { formatPlate, PLAN_RULES } from '@qp/validation';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { type Env } from '../config/env';

export interface PassBooking {
  id: string;
  code: string;
  planType: keyof typeof PLAN_RULES;
  quantity: number;
  startAt: Date;
  endAt: Date;
  amountPaise: number;
  plateNumber: string;
  vehicleTypeName: string;
  locationName: string;
  address: string;
  customerName: string;
}

/**
 * Booking pass QR: `qpb:<bookingId>.<sig>`, sig = first 22 chars of base64url(HMAC-SHA256(secret, bookingId)).
 * No personal data; can't be forged; validity is checked against the booking's window at scan time.
 */
@Injectable()
export class PassService {
  private readonly secret: Buffer;
  private readonly tz: string;

  constructor(config: ConfigService<Env, true>) {
    const explicit = config.get('PASS_SECRET', { infer: true });
    this.secret = explicit
      ? Buffer.from(explicit)
      : createHash('sha256').update(`pass:${config.get('JWT_ACCESS_SECRET', { infer: true })}`).digest();
    this.tz = config.get('APP_TIMEZONE', { infer: true });
  }

  private sign(bookingId: string) {
    return createHmac('sha256', this.secret).update(bookingId).digest('base64url').slice(0, 22);
  }

  payload(bookingId: string) {
    return `${BOOKING_QR_PREFIX}${bookingId}.${this.sign(bookingId)}`;
  }

  /** Returns the booking id if the token is a genuine pass, else null. */
  verify(token: string): string | null {
    if (!token.startsWith(BOOKING_QR_PREFIX)) return null;
    const [id, sig] = token.slice(BOOKING_QR_PREFIX.length).split('.');
    if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const expected = Buffer.from(this.sign(id));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
  }

  svg(bookingId: string) {
    return QRCode.toString(this.payload(bookingId), { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  }

  png(bookingId: string) {
    return QRCode.toBuffer(this.payload(bookingId), { errorCorrectionLevel: 'M', margin: 1, width: 360 });
  }

  fmt(d: Date) {
    return d.toLocaleString('en-IN', { timeZone: this.tz, dateStyle: 'medium', timeStyle: 'short' });
  }

  async pdf(b: PassBooking): Promise<Buffer> {
    const qr = await this.png(b.id);
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
    doc.fontSize(18).font('Helvetica-Bold').text('Quick Park - Parking pass', { align: 'center' });
    doc.moveDown(0.3).fontSize(11).font('Helvetica').text(`Booking ${b.code}`, { align: 'center' });
    doc.image(qr, (doc.page.width - 200) / 2, doc.y + 10, { width: 200 });
    doc.y += 220;
    const row = (k: string, v: string) => doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(v);
    row('Place', b.locationName);
    row('Address', b.address);
    row('Vehicle', `${formatPlate(b.plateNumber)} (${b.vehicleTypeName})`);
    row('Plan', `${PLAN_RULES[b.planType].label}${b.planType === 'EVENT' ? '' : ` x ${b.quantity}`}`);
    row('From', this.fmt(b.startAt));
    row('Until', this.fmt(b.endAt));
    row('Paid', formatRupees(b.amountPaise).replace('₹', 'Rs. '));
    row('Name', b.customerName);
    doc.moveDown().fontSize(9).fillColor('#555').text('Show this QR code at the gate, or tell the booking code or number plate. Valid only for the vehicle and times above.', { align: 'center' });
    doc.end();
    return done;
  }
}
