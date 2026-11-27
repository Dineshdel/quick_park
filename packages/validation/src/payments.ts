import { z } from 'zod';
import type { BrandLogo } from './brand-logos';

/**
 * Payment methods offered at checkout (web and mobile). The customer picks one in our own screen, then Razorpay
 * Checkout opens locked to that method: the UPI app itself, the UPI ID (collect request to the phone), the card
 * form (debit / credit, entered on Razorpay's secure form: card numbers never touch our servers), net banking
 * or a QR code.
 */
export const UPI_APPS = [
  { code: 'google_pay', name: 'Google Pay', short: 'G', color: '#1a73e8', logo: 'googlepay' },
  { code: 'phonepe', name: 'PhonePe', short: 'Pe', color: '#5f259f', logo: 'phonepe' },
  { code: 'paytm', name: 'Paytm', short: 'P', color: '#00baf2', logo: 'paytm' },
  { code: 'bhim', name: 'BHIM UPI', short: 'B', color: '#f47216', logo: null },
  { code: 'amazon_pay', name: 'Amazon Pay', short: 'a', color: '#232f3e', logo: 'amazonpay' },
  { code: 'cred', name: 'CRED', short: 'C', color: '#1b1b1b', logo: null },
] as const satisfies readonly {
  code: string;
  name: string;
  short: string;
  color: string;
  /** Brand logo in BRAND_LOGOS, or null to show the coloured letter instead. */
  logo: BrandLogo | null;
}[];

/** Card networks shown on the card option. */
export const CARD_LOGOS = ['visa', 'mastercard', 'americanexpress'] as const satisfies readonly BrandLogo[];
export type UpiAppCode = (typeof UPI_APPS)[number]['code'];

/** name@bank, e.g. 9876543210@ybl or asha.k@okhdfcbank. */
export const upiIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/, 'Enter a valid UPI ID, like name@okaxis');

export type PaymentChoice =
  | { kind: 'upi_app'; app: UpiAppCode }
  | { kind: 'upi_id'; vpa: string }
  | { kind: 'upi_qr' }
  | { kind: 'card' }
  | { kind: 'netbanking' };

/** Short label for buttons and progress text: "Google Pay", "UPI ID asha@okaxis", "Card"… */
export function paymentChoiceLabel(c: PaymentChoice): string {
  switch (c.kind) {
    case 'upi_app':
      return UPI_APPS.find((a) => a.code === c.app)?.name ?? 'UPI app';
    case 'upi_id':
      return `UPI ID ${c.vpa}`;
    case 'upi_qr':
      return 'UPI QR code';
    case 'card':
      return 'Debit / credit card';
    case 'netbanking':
      return 'Net banking';
  }
}

/**
 * Razorpay Checkout options that open straight on the chosen method and hide the others
 * (`config.display` with one block and `show_default_blocks: false`).
 */
export function razorpayMethodOptions(c: PaymentChoice): {
  config: Record<string, unknown>;
  prefill: Record<string, string>;
} {
  const instrument =
    c.kind === 'upi_app'
      ? { method: 'upi', flows: ['intent'], apps: [c.app] }
      : c.kind === 'upi_id'
        ? { method: 'upi', flows: ['collect'] }
        : c.kind === 'upi_qr'
          ? { method: 'upi', flows: ['qr'] }
          : c.kind === 'card'
            ? { method: 'card', types: ['debit', 'credit'] }
            : { method: 'netbanking' };
  return {
    config: {
      display: {
        blocks: { chosen: { name: paymentChoiceLabel(c), instruments: [instrument] } },
        sequence: ['block.chosen'],
        preferences: { show_default_blocks: false },
      },
    },
    prefill: {
      method: c.kind === 'card' ? 'card' : c.kind === 'netbanking' ? 'netbanking' : 'upi',
      ...(c.kind === 'upi_id' ? { vpa: c.vpa } : {}),
    },
  };
}
