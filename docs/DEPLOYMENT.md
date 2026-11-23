# Deploying Quick Park

Two apps plus managed services:

| Piece | Suggested hosting |
|---|---|
| `frontend/` (Next.js) | Vercel, or `next build && next start` on any Node 20 host |
| `backend/` (NestJS) | Docker / any Node 20 host behind HTTPS (one or more instances) |
| PostgreSQL 16 + PostGIS | AWS RDS for PostgreSQL (enable `postgis`, `pg_trgm`, `btree_gist`) |
| Redis 7 | ElastiCache / Upstash (rate limits, auth cache, BullMQ queues, scheduler) |
| Files | Two S3 buckets: public (place photos, readable by everyone) and private (KYC, no public access) |
| Email | SES or Resend over SMTP |
| Payments | Razorpay (live keys + webhook) |

## Backend environment (production)

```
NODE_ENV=production
PORT=4000
TRUST_PROXY=true                      # behind a load balancer
WEB_ORIGIN=https://quickpark.example  # comma-separated; first one is used in email links
DATABASE_URL=postgresql://…?schema=public
REDIS_URL=rediss://…
JWT_ACCESS_SECRET=<openssl rand -base64 48>
PASS_SECRET=<openssl rand -base64 48> # optional, else derived from JWT secret
REQUIRE_EMAIL_VERIFICATION=true
MAIL_TRANSPORT=smtp
SMTP_URL=smtps://user:pass@email-smtp.ap-south-1.amazonaws.com:465
MAIL_FROM=Quick Park <no-reply@quickpark.example>
GOOGLE_CLIENT_ID=…
STORAGE_DRIVER=s3
S3_REGION=ap-south-1
S3_PUBLIC_BUCKET=quickpark-public
S3_PRIVATE_BUCKET=quickpark-private
S3_PUBLIC_URL=https://quickpark-public.s3.ap-south-1.amazonaws.com
# S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY, or use an instance/task IAM role
PAYMENTS_DRIVER=razorpay              # mock is refused when NODE_ENV=production
RAZORPAY_KEY_ID=rzp_live_…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…
APP_TIMEZONE=Asia/Kolkata
SENTRY_DSN=https://…@….ingest.sentry.io/…   # optional error tracking
# API_DOCS=true                       # Swagger at /api/docs is off in production unless set
```

The API refuses to start if required values are missing or inconsistent. In production that includes:
mock payments, `MAIL_TRANSPORT=log` (emails would only reach the log) and `REQUIRE_EMAIL_VERIFICATION=false`.

## Frontend environment

```
API_INTERNAL_URL=https://api.quickpark.example   # Next.js rewrites /api/v1/* here (keeps the refresh cookie first-party)
NEXT_PUBLIC_API_WS_URL=https://api.quickpark.example
NEXT_PUBLIC_SITE_URL=https://quickpark.example     # link previews, sitemap.xml, canonical URLs
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=…                  # Maps JavaScript API + Places API (New), restricted to your domain
NEXT_PUBLIC_SENTRY_DSN=…                           # optional browser error tracking
NEXT_PUBLIC_GOOGLE_CLIENT_ID=…
```

## Release steps

1. `pnpm install --frozen-lockfile && pnpm build`
2. `pnpm db:deploy` (applies migrations, including raw-SQL PostGIS/trigram indexes and seed masters)
3. `pnpm seed:admin --email <you> --name "<name>"` once, to create the first super admin
4. Start the API (`node backend/dist/main.js`) and the web app.
5. Razorpay dashboard → Webhooks → `https://api.quickpark.example/api/v1/payments/webhook/razorpay`, events `payment.captured`, `payment.failed`, with the webhook secret above.
6. The scheduler (hold expiry, no-shows, reminders, event archive) runs as a BullMQ repeatable job; any API instance picks it up, only one runs each tick.

## Checklist

- HTTPS everywhere (the camera scanner needs HTTPS on phones).
- Private bucket: block all public access. Public bucket: read-only public policy for `places/*`.
- Redis and Postgres not reachable from the internet.
- Back up Postgres daily; test a restore.
- Not yet done (plan M13): Sentry error tracking, Playwright smoke suite, accessibility audit.

## Before and after going live

- **HTTPS everywhere.** Phones only allow the camera (gate scanner) on HTTPS pages. Test the scanner on a real
  phone at the real gate after deploying: light, distance and a printed sticker.
- **Browser tests** against staging: `BASE_URL=https://staging.quickpark.example pnpm --filter @qp/frontend test:browser`
  (first run: `pnpm --filter @qp/frontend exec playwright install chromium`). They create a test customer each run.
- **Refunds** that the payment provider rejects are retried automatically 6 times (backoff 5 min × attempt).
  After that they show on the admin home page as "Refunds that failed": refund those by hand in the Razorpay dashboard.
- **Suspending** a place (or a parking owner, which suspends all their places) cancels its unpaid and upcoming
  bookings with a full refund. Bookings already in progress are listed for the admin to settle.
- **Owner payouts** are recorded by the admin (Payouts page) after paying by bank transfer. Automatic transfers
  (Razorpay Route) need each owner onboarded as a Razorpay linked account first; add that once volume justifies it.

