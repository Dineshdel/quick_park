# shared/ — used by all three users

Code that the Admin, Parking Owner **and** Vehicle Owner all depend on. Keeping it in one place means login, errors and so on behave the same everywhere.

| Folder | What it does |
|---|---|
| `auth/` | Register, login, Google sign-in, verify email, forgot/reset password, refresh/logout, choose role. Also the guards: `@Public()`, `@Roles()`, `@AllowNoRole()`, `@CurrentUser()` |
| `profile/` | `GET/PATCH /me`, `PATCH /me/password`, for every logged-in user |
| `masters/` | Public `GET /vehicle-types` and `GET /categories` (active only), plus `MastersService` so other modules can read master data and platform settings. Admin edits live in `admin/masters/` |
| `mail/` | Email templates and the sending queue (BullMQ) |
| `database/` | Prisma connection (`PrismaService`). The schema lives in `backend/prisma/schema.prisma` |
| `redis/` | Redis connection (cache, counters, rate limits) |
| `config/` | `.env` validation (`env.ts`) and the `webLink()` helper for links in emails |
| `http/` | Error format (`AppException`), zod validation pipe and decorators, rate-limit guard, global error filter |
| `health/` | `GET /health` |
| `engines.module.ts` | Registers the shared business engines below (global) |
| `availability/` | Exact sweep-line availability, capacity row lock, month calendar, live counts |
| `pricing/` | `QuoteService`: plan durations, opening hours, advance limit, price |
| `search/` | Public `GET /parkings/search`, `/parkings/:slug`, `/parkings/by-id/:id`, `/parkings/:id/calendar`, `/parkings/:id/availability`, `POST /parkings/quote` |
| `payments/` | Mock + Razorpay providers, `POST /payments/order`, mock checkout, signed idempotent webhook, refunds |
| `pass/` | Signed booking-pass QR (`qpb:`), SVG/PNG, PDF |
| `notifications/` | Booking, reminder, receipt, KYC/place decision and dispute emails |
| `realtime/` | socket.io `/realtime` gateway: `availability` events per place |
| `scheduler/` | Every minute: hold expiry, no-shows, completing passes, reminders, event archive |
| `files/` | Local-disk or S3 storage (public photos / private KYC); serves local public files |
| `audit/` | Audit log writes |
| `reports/` | `MoneyService`: one definition of revenue, refunds, commission and net |
| `locations/`, `time/` | Place DTO mapper; time-zone helpers |
