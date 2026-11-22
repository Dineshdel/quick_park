# Quick Park — Implementation Plan

Source: *Parking App – System Design* (Nov 22, 2026). Status: **Approved (Nov 22, 2026). M0–M1 done.**
Items marked **[PROPOSAL]** are my additions or interpretations that the PDF leaves open. Section 10 lists the questions that must be answered before the affected modules start.

## Progress

| Module | Status | Verified by |
|---|---|---|
| M0 Foundation | ✅ Done | lint, typecheck, build for all packages; `/health`; CI workflow |
| M1 Auth + Users | ✅ Done | 30 API e2e tests (real Postgres+PostGIS + Redis), 11 unit tests (API + web), manual full-stack run through the web proxy |
| M2 Masters | ⏳ Next (no blocking questions) | |
| M3 Vehicles | ⏳ (no blocking questions) | |
| M4–M13 | ⛔ Blocked on §10 answers (see each question's module tag) | |

### Implementation notes (technical deviations from §2–§7, no business-logic impact)
- **Auth guards without Passport.** `JwtService` plus two small global guards do the job; `@nestjs/passport` would add nothing here.
- **CSRF uses a custom header instead of a double-submit cookie.** Cookie routes require `x-qp-csrf: 1`, on top of the `SameSite=Lax` cookie scoped to `/api/v1/auth`. A cross-site form can't set headers, and a cross-origin fetch fails CORS preflight.
- **The web app proxies the API** with Next.js rewrites (`/api/v1/*`), so the refresh cookie is first-party in both dev and prod. No role cookie or middleware: role areas are gated client-side, and the API remains the enforcement point.
- **Admin invite link** is the public `/accept-invite` page, not `/admin/accept-invite`.
- **Dev email** goes to the API log (`MAIL_TRANSPORT=log`) by default. Mailpit via `MAIL_TRANSPORT=smtp` is still supported.
- **Pre-account-takeover guard:** if Google sign-in matches an account whose email was never verified, that account's password is removed and its sessions are revoked.
- **E2E safety:** tests apply migrations non-destructively, truncate tables, and refuse any database whose name doesn't end in `_test`.
- **Pinned versions:** NestJS 11, Next.js 15.5, Prisma 6.19, TypeScript 5.9, zod 4.1. The newer majors (Nest 12, TS 7, Prisma 7/8) are skipped for stability on Node 20.

---

## 0. Current state

| Item | Finding |
|---|---|
| Repository | Empty: `main` has no commits and no files. Nothing to preserve or reuse. |
| Node / npm | v20.20.2 / 10.8.2 (fine for Next.js 15 + NestJS 11) |
| pnpm | Not installed. Enable via `corepack enable` (corepack 0.34.6 is present) |
| PostgreSQL | 16.15 running locally; `pg_trgm` and `btree_gist` are available |
| PostGIS | **Not installed.** It's required for geo search |
| Redis | **Not installed.** It's required for BullMQ, live counts and rate limiting |
| Docker | **Not installed.** The PDF assumes `docker-compose.yml` (postgres+postgis, redis, mailpit) |

---

## 1. Requirements analysis

### 1.1 Objective
A single responsive web app (no mobile app) where vehicle owners find and pre-book parking (near them or in another city) and parking owners list places and run entry/exit with a browser QR scanner, like a toll gate. The platform earns commission and is run by super admins.

### 1.2 Roles and permissions

| Capability | VEHICLE_OWNER | PARKING_OWNER | SUPER_ADMIN | Public |
|---|---|---|---|---|
| Register (Google / email) | ✔ (self) | ✔ (self) | ✘ (seed or invite only) | — |
| Search parkings, view parking page and calendar | ✔ | ✔ | ✔ | ✔ |
| Manage own vehicles, vehicle QR | ✔ | ✘ | view | ✘ |
| Quote / book / pay / cancel / extend / rebook | ✔ (own) | ✘ | view, refund | ✘ |
| KYC + bank details | ✘ | ✔ (own) | approve/reject | ✘ |
| Create places, capacity, pricing, blocks, events | ✘ | ✔ (own) | approve/reject, suspend | ✘ |
| Owner dashboard, bookings at own places, earnings | ✘ | ✔ (own only) | all | ✘ |
| Scan entry/exit, walk-in | ✘ | ✔ (own places only) | ✘ | ✘ |
| Masters: categories, vehicle types, plans, cancellation rules, commission % | ✘ | ✘ | ✔ | ✘ |
| Users: view, suspend; refunds, disputes, reports | ✘ | ✘ | ✔ | ✘ |
| Invite super admin | ✘ | ✘ | ✔ | ✘ |

Every protected route has a **role guard** and an **ownership check** (for example, an owner can only reach their own `locationId`, and a customer only their own `bookingId`).
Owners see only the customer's name, vehicle and booking. They never see the customer's email or phone.

### 1.3 Functional modules → sub-features

| Module | Sub-features (PDF ref) |
|---|---|
| Auth | Google ID-token login, email register + verify (24h), login (rate limited 5/15min per email+IP), refresh rotation, logout, forgot/reset (30 min, single use, revokes refresh tokens), choose-role (first Google login), admin seed + invite |
| Users / Profile | GET/PATCH /me, change password, status ACTIVE/SUSPENDED |
| Vehicles | CRUD, type, plate, photo, random `qr_token`, printable sticker |
| Owners | Business profile, KYC docs (private S3), GSTIN, bank details → Razorpay linked account, kyc_status |
| Locations | Category, name, slug, description, address, city, map pin, photos, timings / 24x7, amenities, max_advance_days, status DRAFT→PENDING→ACTIVE/SUSPENDED, event parkings |
| Capacity | total + online slots per vehicle type, blocks / closed days |
| Pricing | price per vehicle type × plan (HOURLY…YEARLY), overstay per hour, active flag, quote |
| Search | Near me / destination (PostGIS `ST_DWithin`), filters (time window, vehicle type, category, text with pg_trgm), month calendar (free / few-left / full) |
| Bookings | Quote, 10-min hold (PENDING_PAYMENT), idempotency key, auto-expiry, cancel + refund rules, extend, rebook, list by upcoming/active/past |
| Booking pass | Signed QR on screen, PDF download, QR in email |
| Payments | Razorpay order, signed webhook (only source of truth), refunds, Route split (commission), payouts |
| Access | Scan `{token, locationId, direction}`, validation chain, sessions, overstay at exit, walk-in by sticker/plate, cash/UPI record |
| Realtime | WS `location:{id}:availability`, Redis INCR/DECR on entry/exit |
| Mail | BullMQ jobs: verify, reset, welcome, booking confirmed (with QR), reminder, entry/exit receipt, plan expiring in 3 days, owner new booking, KYC/place approved/rejected |
| Owner dashboard | Live occupancy, today's bookings, who booked, revenue, availability calendar, earnings + payouts |
| Admin | Approvals queue, masters, users, bookings, payments, refunds, disputes, suspend, reports by city/category/month, invite |

### 1.4 Non-functional requirements
- Responsive web app for any browser. The camera scanner needs HTTPS, or `localhost` in development.
- Everything is TypeScript, and zod schemas are shared between web and API.
- Security (PDF §Security): argon2, hashed single-use tokens, access token in memory (15 min), refresh token in httpOnly Secure SameSite cookie (30 days, rotated), CSRF protection on cookie routes, throttling, private S3 with signed URLs, QR tokens carry no personal data.
- No double booking under concurrency, using a transactional row lock.
- Idempotent booking creation and webhook handling.

---

## 2. Architecture

```
Browser (Next.js App Router, one site, area per role)
   │  HTTPS REST /api/v1  +  socket.io /realtime
   ▼
NestJS modular monolith ──► Google (ID token verify), Razorpay, Google Maps (client side), SES/Resend
   │            │            │
PostgreSQL 16   Redis 7      S3 (public bucket: photos; private bucket: KYC)
+ PostGIS       (BullMQ, live counts, throttler store, hold expiry)
```

### 2.1 Monorepo (pnpm + Turborepo), with separate frontend and backend folders

```
quick_park/
  frontend/              Next.js (@qp/frontend)
  backend/               NestJS (@qp/backend)
    prisma/              schema.prisma, migrations (owned by the backend)
  packages/              shared by both sides
    types/               shared enums + DTO types
    validation/          zod schemas (frontend forms + backend pipes)
    api-client/          generated from OpenAPI (orval) + TanStack Query hooks (planned)
  docker-compose.yml     postgis/postgis:16, redis:7, mailpit, minio [PROPOSAL: minio = local S3]
  .github/workflows/ci.yml
```
*Changed on request (Nov 22, 2026): the PDF's `apps/api`, `apps/web` and root `prisma/` became `backend/` (with `backend/prisma/`) and `frontend/`.*

### 2.2 Cross-cutting decisions [PROPOSAL]
- **Money** is stored as integer **paise** (`Int`), never floats. Currency is INR.
- **Time** is stored as `timestamptz` in UTC. Business rules (days, opening hours) are evaluated in **Asia/Kolkata**.
- **Validation:** zod schemas live in `packages/validation`. The API uses a global `ZodValidationPipe` (nestjs-zod), which replaces class-validator so we don't need two validation systems.
- **Errors:** one global exception filter returns `{ error: { code, message, details? } }` with stable error codes such as `SLOT_UNAVAILABLE` and `BOOKING_NOT_ACTIVE`.
- **Prisma + PostGIS:** Prisma has no native geography support, so `geo` is declared `Unsupported("geography(Point,4326)")`. Geo reads and writes and the `tstzrange` / GIST pieces go through `$queryRaw`, written in raw-SQL migrations.
- **Config:** `@nestjs/config` with a zod-validated env schema. The app refuses to boot if config is missing.
- **Logging:** pino (nestjs-pino) with a request id. Sentry is added in the hardening phase.

---

## 3. Frontend module structure (`frontend/`): one folder per user type

Next.js only creates pages from `app/`, so the role folders live there. Each role folder holds **all** of that role's pages, with components used only by that role in `_components/`. Anything two or more roles use goes in `shared/`.

```
app/
  page.tsx                           landing + search bar (public)
  search/, p/[slug]/                 search results + map, parking page with calendar (public)
  (auth)/                            login, register, verify-email, forgot/reset-password, choose-role
  account/                           profile + password (every logged-in user)
  vehicle-owner/       → /vehicle-owner/...   VEHICLE OWNER ONLY
    vehicles/                        list, add/edit, sticker print view
    book/[locationId]/               plan, vehicle, start → quote → Razorpay checkout
    bookings/                        upcoming/active/past; [id] detail, pass, cancel/extend/rebook
    _components/
  parking-owner/       → /parking-owner/...   PARKING OWNER ONLY
    onboarding/                      KYC + bank details
    dashboard/                       live occupancy, today, revenue (Recharts)
    locations/[id]/{edit,capacity,pricing,calendar,photos}
    bookings/, scanner/ (html5-qrcode + USB reader + walk-in), earnings/, payouts/
    _components/
  admin/               → /admin/...           SUPER ADMIN ONLY
    (dashboard)/                     approvals, users, bookings, payments, refunds, disputes,
                                     masters (categories, vehicle-types, cancellation-rules, commission), reports
    accept-invite/                   public page for invited admins
shared/
  ui/ forms/ layout/ auth/           buttons, inputs, FormField, header, RequireAuth, Google button
  lib/                               api.ts (fetch + session + refresh), auth/, form errors
  maps/ booking/ tables/ realtime/   (later) map pickers, AvailabilityCalendar, DataTable, socket hook
```
Role areas are gated client-side by `RequireAuth` in each role's `layout.tsx`. The API is the real enforcement point.

---

## 4. Backend module structure (`backend/src`): one folder per user type

Role folders hold the **endpoints only that role calls**. Business engines that several roles depend on (for example availability is used by search, booking and the owner calendar) live in `shared/`, so the logic exists once.

| Folder | Contains (✅ built, ⏳ planned) |
|---|---|
| `admin/` | ✅ invites, accept-invite, seed CLI · ⏳ approvals (KYC, places), masters, users/suspend, bookings, payments, refunds, disputes, reports |
| `parking-owner/` | ⏳ owner profile + KYC + bank, places (CRUD, photos, events, submit), capacity + blocks, pricing, owner bookings + occupancy, access (scan, walk-in, exit, overstay), earnings + payouts |
| `vehicle-owner/` | ⏳ vehicles + QR sticker, bookings (quote, create, cancel, extend, list), booking pass, payment order |
| `shared/auth` | ✅ register/login/Google/verify/reset/refresh/logout/choose-role, guards, sessions |
| `shared/profile` | ✅ `/me`, password change |
| `shared/http`, `config`, `database`, `redis`, `mail`, `health` | ✅ errors, validation, rate limits, env, Prisma, Redis, email queue, health |
| `shared/` (planned) | ⏳ `search` (public geo search + calendar), `availability` (sweep engine + row-lock booking insert), `pricing` (quote), `payments` (Razorpay client + webhook), `files` (S3 presign), `realtime` (socket.io), `scheduler` (hold expiry, reminders, event archive) |

---

## 5. Database schema

The PDF tables are kept as written. Additions are marked **+**.

| Table | Columns (beyond the PDF) / notes |
|---|---|
| users | `role` is **nullable** until choose-role (Google first login) **+**. `email` is citext, or lowercased with a unique index |
| auth_accounts | unique (provider, provider_user_id) |
| email_tokens | token_hash unique; type VERIFY_EMAIL / RESET_PASSWORD / **ADMIN_INVITE +** |
| refresh_tokens | **+ family_id, replaced_by_id** (reuse detection) |
| **vehicle_types +** | id, code (CAR, BIKE, AUTO, VAN, BUS, LORRY), name, icon, is_active. This is a table rather than an enum because "more types can be added" by admin |
| vehicles | user_id → users, vehicle_type_id, plate_number (normalised upper, no spaces), qr_token unique, photo_url, **deleted_at +** (soft delete keeps booking history). Unique (user_id, plate_number) where not deleted |
| owners | user_id unique → users, business_name, kyc_status (NOT_SUBMITTED, PENDING, APPROVED, REJECTED), **kyc_rejection_reason +**, gstin, bank_account_ref (Razorpay linked account id), commission_pct (nullable → falls back to the platform default) |
| **owner_kyc_documents +** | id, owner_id, doc_type, s3_key (private), uploaded_at |
| categories | id, name, icon, is_active |
| parking_locations | as in the PDF, plus **rejection_reason +**, **ARCHIVED** added to status (for ended events) **+**, **cancellation_policy_id +**. GIST(geo), GIN trgm(name), GIN trgm(address), unique slug |
| location_photos | as in the PDF (public bucket) |
| location_capacity | unique (location_id, vehicle_type_id); CHECK online_slots ≤ total_slots |
| pricing_plans | unique (location_id, vehicle_type_id, plan_type); price in paise |
| capacity_blocks | `slots` = number of slots blocked; slots = online_slots means the day is closed |
| bookings | as in the PDF, plus **idempotency_key (unique per user) +**, **hold_expires_at +**, **amount_paise +**, **commission_paise +**, **extended_from_id +**, **cancelled_at, cancel_reason +**. `period tstzrange` is a generated column with a GIST index on (location_id, vehicle_type_id, period) using btree_gist. Partial index from the PDF |
| parking_sessions | as in the PDF, plus **vehicle_type_id +**, **payment_method (CASH, UPI, RAZORPAY) +**, **walk_in_amount +**. Partial unique index: one open session per (location_id, plate_number) where exit_at is null |
| payments | as in the PDF, plus **purpose (BOOKING, EXTENSION, OVERSTAY) +**. Unique provider_payment_id |
| **webhook_events +** | provider, event_id unique, payload, processed_at (webhook idempotency) |
| refunds, payouts | as in the PDF |
| **cancellation_policies +** | admin master: name, rules jsonb, e.g. `[{hoursBefore:2, refundPct:100},{hoursBefore:0, refundPct:0}]` |
| **platform_settings +** | default commission_pct, hold minutes (10), entry grace minutes, few-left threshold |
| **disputes +** | booking_id, raised_by, reason, status, resolution, admin_id. The PDF lists disputes as an admin job but has no table |
| **audit_logs +** | actor_id, action, entity, entity_id, meta jsonb (admin approvals, suspensions, refunds) |
| reviews | as in the PDF. **No UI flow is described**, see Q14 |

Relationships: user 1–1 owner; user 1–N vehicles and bookings; owner 1–N locations; location 1–N photos, capacity, pricing_plans, blocks, bookings and sessions; booking 1–N payments; payment 1–N refunds; booking 0–1 session (one session per entry; see Q7 for monthly passes).

### 5.1 Availability algorithm
- `free(t) = online_slots − concurrent_bookings(t) − blocked(t)`, where bookings count if they are PENDING_PAYMENT (unexpired hold), CONFIRMED or ACTIVE.
- For a window [s, e), the result is `min over t in [s,e)` of free(t). This is computed **exactly** with a sweep over booking and block start/end points inside the window, in one SQL query, rather than "per-day max". The per-day approach the PDF suggests is approximate, and the sweep is the same cost.
- The calendar shows the per-day minimum for the month. A day is **free** above the few-left threshold, **few-left** at or below it, and **full** at 0.
- On create: `BEGIN; SELECT … FROM location_capacity … FOR UPDATE; compute free; INSERT booking; COMMIT` (PDF §Availability).

### 5.2 Booking state machine
`PENDING_PAYMENT →(webhook paid) CONFIRMED →(entry scan) ACTIVE →(exit scan / end) COMPLETED`.
From `PENDING_PAYMENT`, the hold timing out → `EXPIRED`. From `CONFIRMED`, the user cancelling → `CANCELLED` (refund per policy). From `CONFIRMED`, end_at passing with no entry → `EXPIRED` (no-show).

---

## 6. API endpoints (`/api/v1`)

All endpoints from the PDF table are implemented as listed. Additions **+**:

| Area | Endpoint | Who |
|---|---|---|
| Auth | POST /auth/google, /register, /verify-email, /resend-verification, /login, /refresh, /logout, /forgot-password, /reset-password, /choose-role; **POST /auth/accept-invite +** | Public / logged in |
| Profile | GET/PATCH /me, PATCH /me/password | All |
| Masters (read) | **GET /vehicle-types, GET /categories +** | Public |
| Vehicles | GET/POST /vehicles, PATCH/DELETE /vehicles/:id, GET /vehicles/:id/qr | VEHICLE_OWNER |
| Search | GET /parkings/search?lat&lng&radiusKm&start&end&vehicleType&category&q&page | Public |
| Parking | GET /parkings/:slug, /parkings/:id/calendar?month&vehicleType, /parkings/:id/availability?start&end&vehicleType | Public |
| Bookings | POST /bookings/quote, POST /bookings (header `Idempotency-Key`), GET /bookings?status, GET /bookings/:id, POST /bookings/:id/cancel, POST /bookings/:id/extend, GET /bookings/:id/pass | VEHICLE_OWNER |
| Payments | POST /payments/order, POST /payments/webhook/razorpay | VEHICLE_OWNER / Razorpay (HMAC) |
| Owner | **GET/PUT /owner/profile, POST /owner/kyc/upload-url, POST /owner/kyc/submit +** | PARKING_OWNER |
| Owner places | POST/GET /owner/locations, **GET /owner/locations/:id +**, PATCH /owner/locations/:id, POST /owner/locations/:id/submit, **POST /owner/locations/:id/photos/upload-url, DELETE …/photos/:photoId +** | PARKING_OWNER |
| Slots + pricing | PUT /owner/locations/:id/capacity, PUT /owner/locations/:id/pricing, POST /owner/locations/:id/blocks, **DELETE …/blocks/:blockId +** | PARKING_OWNER |
| Owner bookings | GET /owner/bookings?locationId&date&status, GET /owner/locations/:id/occupancy, **GET /owner/dashboard +** | PARKING_OWNER |
| Access | POST /access/scan, POST /access/walk-in, POST /access/sessions/:id/exit, **GET /access/sessions?locationId&open=true +** | PARKING_OWNER |
| Earnings | GET /owner/earnings?from&to, GET /owner/payouts | PARKING_OWNER |
| Admin | GET /admin/approvals, POST /admin/owners/:id/approve (also **/reject +**), POST /admin/locations/:id/approve (also **/reject, /suspend +**), /admin/users (**PATCH :id/status +**), /admin/bookings, **/admin/payments, POST /admin/refunds, /admin/disputes +**, CRUD /admin/categories, **/admin/vehicle-types, /admin/cancellation-policies, /admin/settings +**, GET /admin/reports?groupBy=city\|category\|month&from&to, POST /admin/invite | SUPER_ADMIN |
| Realtime | WS /realtime, event `location:{id}:availability` `{vehicleType, free, inside}` | All |

All endpoints are documented via `@nestjs/swagger` at `/api/docs`, and `packages/api-client` is generated from that spec.

---

## 7. Authentication and authorization flow

1. **Google:** GIS button → ID token → `POST /auth/google` → verify (signature, `aud`, `exp`, `email_verified`) → find by `auth_accounts.sub`, else link by verified email, else create a user with `role = null` → issue tokens. If role is null, the web app redirects to `/choose-role`. Every role-guarded route rejects a null role with `ROLE_REQUIRED`.
2. **Email:** register (zod: name, email, password ≥ 8, role ∈ {VEHICLE_OWNER, PARKING_OWNER}) → argon2id → verification token (32 random bytes; only the SHA-256 is stored; 24h) emailed via BullMQ → verify → login. **Login is refused until the email is verified** [PROPOSAL; matches "verify the email, then log in"].
3. **Tokens:** access JWT (15 min, `{sub, role, status}`) is returned in the body and held in memory. Refresh token is opaque, httpOnly + Secure + SameSite=Lax, path `/api/v1/auth`, 30 days, rotated on every refresh. Reusing an old token revokes its family. Password reset, password change and suspension revoke all refresh tokens.
4. **CSRF:** cookie routes (`/auth/refresh`, `/auth/logout`) require an `X-CSRF-Token` header that matches a non-httpOnly csrf cookie (double-submit). All other routes use a bearer token, so they are not CSRF-exposed.
5. **Suspended users:** the guard checks status on every request, with a short Redis cache, so a suspension takes effect within seconds rather than waiting up to 15 minutes.
6. **Super admin:** `pnpm seed:admin --email … --name …` creates an admin with a random password printed once, or sends an invite link. Invites (`ADMIN_INVITE` token, 72h) are accepted at `/admin/accept-invite`. Requiring Google login with a company domain is optional (Q12).
7. **Throttling:** `@nestjs/throttler` with Redis storage. Login: 5 / 15 min per email+IP. Register, forgot-password, resend-verification: 5 / hour per IP. Scan: 60 / min per user.

---

## 8. Module-wise implementation tasks (in order)

Each module is finished, tested (§9) and summarised for you before the next one starts.

| # | Module | Tasks | Done when |
|---|---|---|---|
| M0 | Foundation | pnpm + Turborepo, tsconfig/eslint/prettier, docker-compose (postgis, redis, mailpit, minio), NestJS skeleton (config, prisma, pino, exception filter, zod pipe, swagger, health), Next.js skeleton (Tailwind, shadcn/ui, TanStack Query, layout, theme), shared packages, GitHub Actions CI (lint, typecheck, test, prisma migrate) | `pnpm dev` runs both apps; `/health` is green; CI passes |
| M1 | Auth + Users | Prisma: users, auth_accounts, email_tokens, refresh_tokens. All auth endpoints, guards, throttling, CSRF, mail queue (verify / reset / welcome), admin seed + invite. Web: login, register, verify, forgot/reset, choose-role, AuthProvider, silent refresh, protected route groups, profile | Every auth path is covered by e2e tests, including the failure cases |
| M2 | Masters | categories, vehicle_types, cancellation_policies, platform_settings plus seed data. Admin CRUD screens | Seeded data appears in the UI; non-admins get 403 |
| M3 | Vehicles | CRUD, qr_token, sticker print page (qrcode) | Ownership tests pass |
| M4 | Owners + KYC | owner profile, presigned private uploads, KYC submit, admin approve/reject + emails, bank details form (Razorpay linked account in M8) | Owner flow and admin approval work end-to-end |
| M5 | Locations, capacity, pricing | Place wizard (category, LocationPicker map pin, Places Autocomplete, photos, timings, amenities, event fields), capacity, pricing, blocks, submit → admin approval, event archive job | Approved place is ACTIVE; an owner can't touch another owner's place |
| M6 | Search + availability | PostGIS search, pg_trgm text search, filters, AvailabilityService (sweep), calendar, public parking page, results map | Seeded fixtures return correct free counts at boundaries |
| M7 | Bookings | quote (PricingService), create with row lock + idempotency + hold, expiry job, list/detail, cancel (policy), extend, rebook | Concurrency test: 2 slots + 20 parallel requests gives exactly 2 bookings |
| M8 | Payments | Razorpay order, Checkout on web, webhook HMAC + webhook_events idempotency, CONFIRMED transition, refunds, Route linked accounts + transfers, payouts records | Test-mode payment confirms the booking; a replayed webhook is a no-op |
| M9 | Pass + notifications | signed QR token (HMAC, validity window), pass page, PDF (pdfkit), booking emails, reminder, plan-expiring, owner new-booking email | Emails render in Mailpit with the QR |
| M10 | Access + realtime | scan validation chain, sessions, entry/exit transitions, overstay calculation + collection (Q5), walk-in, Redis counters, socket.io gateway, Scanner page (camera + keyboard-wedge input) | Scan matrix tests pass; the count updates live in a second browser |
| M11 | Owner dashboard + earnings | occupancy, today's bookings, revenue charts, bookings table, earnings/payouts pages | Numbers reconcile with payments in tests |
| M12 | Admin ops + reports | users list/suspend, bookings, payments, refunds, disputes, reports by city/category/month, audit log | Report totals match the fixtures |
| M13 | Hardening | security review, rate-limit review, Sentry, Playwright smoke suite, accessibility/responsive pass, deployment docs (Vercel + API Docker + RDS) | Release checklist is green |

---

## 9. Testing strategy

| Layer | Tool | What is tested |
|---|---|---|
| Unit (API) | Jest | PricingService, availability sweep, refund policy, overstay calculation, QR sign/verify, token hashing, state transitions |
| Integration / e2e (API) | Jest + supertest against a **real** Postgres+PostGIS and Redis (docker-compose test profile, schema reset per suite) | Every endpoint: success, validation 400, unauthenticated 401, wrong role 403, other user's resource 403/404, conflicts 409; DB state checked after each write |
| Concurrency | Parallel requests in Jest | No double booking; idempotency key; webhook replay |
| Payments | Razorpay test mode + signed webhook fixtures | Order → webhook → CONFIRMED; refund |
| Unit (web) | Vitest + Testing Library | Forms (zod errors), calendar states, auth refresh logic |
| E2E (web) | Playwright | Register → verify (via the Mailpit API) → add vehicle → search → book → pay (test) → owner scans entry/exit; owner onboarding → admin approval |
| Manual | Phone browser on LAN over HTTPS | Camera scanner on real devices |
| CI | GitHub Actions | lint, typecheck, unit, API e2e (service containers), build |

---

## 10. Open questions (need your answers)

**Business logic (these block the modules listed)**
1. **Revenue model:** commission per booking, or a monthly subscription for owners? If commission, what is the default %, and does it apply to walk-in and overstay income? *(PDF open question; blocks M8 and M11)*
2. **Walk-ins in live availability:** yes, as the PDF recommends? Walk-ins would then use `total_slots − online_slots` first, then any unbooked online slots? *(M10)*
3. **One role per account:** confirm the PDF's "simplest" option (use a second email for the other role). *(M1)*
4. **Plan durations:** Hourly = N hours chosen by the user (min 1)? Daily = 24h from start, or calendar day(s)? Weekly = 7×24h? Monthly = calendar month or 30 days? Yearly = 365 days? Can a user book N days or N weeks in one booking? *(M6, M7)*
5. **Overstay collection:** "collected by UPI before exit". Should this be a Razorpay payment link/QR shown on the owner's scanner screen, or should the owner just record "paid by cash/UPI" manually? Same question for walk-in charges. *(M10)*
6. **Grace periods:** how early can a vehicle enter before `start_at`, and how many minutes after `end_at` before overstay starts? *(M10)*
7. **Monthly/yearly passes:** unlimited in/out during the period? Then a booking stays ACTIVE across many sessions. *(M10)*
8. **Vehicle sticker scan:** when a sticker is scanned, should the system find that vehicle's current valid booking at this location, and fall back to walk-in if there isn't one? *(M10)*
9. **Gate staff:** only three roles are allowed. Does the parking owner always scan personally, or do we need owner-created "attendant" logins limited to the scanner? (That would mean adding a role or sub-account.) *(M10)*
10. **Opening hours vs bookings:** must hourly bookings fit inside open hours? Do daily+ plans ignore them? What happens to a vehicle still inside at closing time? *(M6, M7)*
11. **Cancellation / refunds:** is the policy chosen per place by the owner from admin-defined templates, or is it platform-wide? Is the default "100% if cancelled ≥ 2h before start, else 0%"? Do monthly/yearly passes get pro-rata refunds? *(M7, M8)*
12. **Extension:** is it a separate payment for the extra period only, charged at the same plan rate? *(M7, M8)*
13. **Event parking:** "flat price". Is that one price per vehicle type for the whole event (a new `EVENT` plan type), or does it reuse DAILY? *(M5)*
14. **Reviews:** the table exists but there's no feature. Include rating after a completed booking, or defer? *(scope)*
15. **Disputes:** what is the flow? Customer raises one from a booking, the admin resolves it with an optional refund? *(M12)*
16. **GST / invoices:** do bookings need GST-compliant invoices, and should prices be shown inclusive of GST? *(M8, M9)*
17. **KYC:** which documents and fields are required (PAN, Aadhaar, GST certificate, proof of land use)? Can an owner create draft places before KYC is approved? *(M4)*
18. **Payouts:** automatic Razorpay Route transfers on payment (settled by Razorpay), or a manual/periodic payout table run by admin? *(M8, M11)*
19. **Customer phone number:** required at booking (useful for gate staff), or optional as in the schema?
20. **Admin login:** require Google with a company domain? If so, which domain?
21. **"Website Plan" document:** the PDF references a week-by-week plan that wasn't provided. Should I align milestones to it? If so, please share it.

**Environment and credentials**
22. **Local infrastructure:** Docker, PostGIS and Redis are not installed. Options: (a) install Docker Engine + compose plugin and use the PDF's docker-compose (recommended); (b) install `postgresql-16-postgis-3` and `redis-server` natively via apt. Which one? (Both need sudo, which you'd run yourself.)
23. **Third-party keys for development:** do you already have a Google OAuth Client ID, a Google Maps API key, and Razorpay **test** keys? Until you do, I'll build behind interfaces: Mailpit for email, MinIO for S3, and a Razorpay test or mock adapter.
24. **Email provider:** SES or Resend for production? (Mailpit in development either way.)
25. **Languages:** English only for v1? Tamil/Hindi are listed as a later upgrade.

---

## 11. Proposed deviations from the PDF (please approve or reject)
- `vehicle_types` becomes a table instead of an enum, because admins can add types.
- zod everywhere instead of class-validator (the PDF allows "class-validator / zod").
- Exact sweep-line availability instead of per-day max.
- Added tables: vehicle_types, owner_kyc_documents, cancellation_policies, platform_settings, webhook_events, disputes, audit_logs.
- Local S3 via MinIO, and orval for client generation.
- `users.role` is nullable until the role is chosen.
