# Quick Park

Parking booking web app: vehicle owners find and book parking, parking owners list places and scan QR codes at the gate, and super admins run the platform. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the design and progress. Each role folder has a `README.md` explaining what is inside.

| Path | What |
|---|---|
| `frontend/` | Next.js site (`@qp/frontend`): `app/admin/`, `app/parking-owner/`, `app/vehicle-owner/` for each user type; `shared/` for everything common |
| `backend/` | NestJS API (`@qp/backend`, `/api/v1`, Swagger at `/api/docs`): `src/admin/`, `src/parking-owner/`, `src/vehicle-owner/` for each user type; `src/shared/` for everything common |
| `backend/prisma/` | Prisma schema and migrations |
| `packages/types` | Shared enums and error codes (used by both sides) |
| `packages/validation` | Shared zod schemas (frontend forms and backend pipes) |

## Local setup

Requirements: Node ≥ 20.9, pnpm 10 (`corepack enable`), Docker.

```bash
cp .env.example .env            # then set JWT_ACCESS_SECRET (openssl rand -base64 48)
docker compose up -d            # postgres+postgis, redis, mailpit, minio
pnpm install
pnpm db:deploy                  # apply migrations (use `pnpm db:migrate` when changing the schema)
pnpm seed:admin --email you@example.com --name "Your Name"   # prints a one-time password
pnpm dev                        # frontend http://localhost:3000, backend http://localhost:4000
                                # or one side only: pnpm dev:frontend / pnpm dev:backend
```

- In development, emails are printed to the API console (`MAIL_TRANSPORT=log`). To see them in Mailpit, set `MAIL_TRANSPORT=smtp` and `SMTP_URL=smtp://localhost:1025`, then open http://localhost:8025.
- Google sign-in appears once `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` are set. The authorised JavaScript origin must be `http://localhost:3000`.
- The browser calls the API through Next.js rewrites (`/api/v1/*` → `API_INTERNAL_URL`), so the refresh cookie is first-party.

## Tests

```bash
pnpm test        # unit tests (backend: jest, frontend: vitest)
pnpm test:e2e    # API e2e against real Postgres+PostGIS and Redis
```

E2E tests use the database named in `TEST_DATABASE_URL`. If that isn't set, they use `DATABASE_URL` with `_test` appended to the name (create that database once). They apply migrations, truncate tables between files, and **refuse to run unless the database name ends with `_test`**. Redis uses logical DB 1.

## Auth model (summary)

- Access JWT (15 min) is held in memory. The refresh token is opaque, httpOnly, `SameSite=Lax`, scoped to `/api/v1/auth`, lasts 30 days, and rotates on every use; reusing an old token revokes that whole login family.
- Cookie routes (`/auth/refresh`, `/auth/logout`) also require the header `x-qp-csrf: 1`.
- Global guards run in order: rate limit (Redis) → JWT → roles. Routes need an explicit `@Public()`, `@Roles(...)` or `@AllowNoRole()` to opt out of the defaults.
- Errors always have the shape `{ "error": { "code", "message", "details?" } }`. The codes live in `packages/types`.
