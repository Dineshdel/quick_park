/**
 * Browser security headers for every page, used by next.config.ts.
 *
 * The Content-Security-Policy lists every outside service the site really uses. If you add a new
 * script, map, payment or analytics provider, add its domain here or the browser will block it
 * (open DevTools → Console and look for "Refused to load / connect").
 */

const isDev = process.env.NODE_ENV !== 'production';

/** "https://abc.ingest.sentry.io/123" → "https://abc.ingest.sentry.io" (empty when unset or invalid). */
function originOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** The live-availability socket talks to the API directly (http → ws, https → wss). */
function socketOrigins(): string[] {
  const api = originOf(process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:4000');
  return api ? [api, api.replace(/^http/, 'ws')] : [];
}

const GOOGLE_MAPS = ['https://maps.googleapis.com', 'https://maps.gstatic.com'];
const GOOGLE_SIGN_IN = 'https://accounts.google.com/gsi/';
const RAZORPAY = ['https://checkout.razorpay.com', 'https://api.razorpay.com'];

function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next.js puts small inline scripts in every page (and the theme boot script), so inline is allowed;
    // scripts from any other site are still blocked. Dev mode also needs eval for fast refresh.
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      'https://checkout.razorpay.com',
      'https://accounts.google.com/gsi/client',
      ...GOOGLE_MAPS,
    ],
    'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
    // Place photos (uploads, S3/CDN, stock photos), map tiles and QR codes.
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    // Which servers the page may call with fetch / WebSocket.
    'connect-src': [
      "'self'",
      ...socketOrigins(),
      'https://photon.komoot.io',
      'https://places.googleapis.com',
      ...GOOGLE_MAPS,
      GOOGLE_SIGN_IN,
      ...RAZORPAY,
      'https://lumberjack.razorpay.com',
      originOf(process.env.NEXT_PUBLIC_SENTRY_DSN),
      ...(isDev ? ['ws:', 'wss:'] : []),
    ],
    // Payment window and the Google sign-in button run in frames from these sites only.
    'frame-src': [...RAZORPAY, GOOGLE_SIGN_IN],
    'worker-src': ["'self'", 'blob:'],
    'media-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    // Nobody may show this site inside a frame (stops click-jacking).
    'frame-ancestors': ["'none'"],
    ...(isDev ? {} : { 'upgrade-insecure-requests': [] }),
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values.filter(Boolean)].join(' '))
    .join('; ');
}

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  // Never guess a file's type from its contents.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Old-browser version of frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Camera only for the gate scanner, location only for "Near me", payment for checkout; everything else off.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(self), geolocation=(self), payment=(self "https://api.razorpay.com"), microphone=(), usb=(), serial=()',
  },
  // Keeps other sites' windows from reaching into ours; popups are still allowed for Google sign-in and Razorpay.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  // HTTPS only, for two years. Only in production: on localhost it would break plain-http development.
  ...(isDev
    ? []
    : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];
