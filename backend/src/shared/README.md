# shared/ — used by all three users

Code that the Admin, Parking Owner **and** Vehicle Owner all depend on. Keeping it in one place means login, errors and so on behave the same everywhere.

| Folder | What it does |
|---|---|
| `auth/` | Register, login, Google sign-in, verify email, forgot/reset password, refresh/logout, choose role. Also the guards: `@Public()`, `@Roles()`, `@AllowNoRole()`, `@CurrentUser()` |
| `profile/` | `GET/PATCH /me`, `PATCH /me/password`, for every logged-in user |
| `mail/` | Email templates and the sending queue (BullMQ) |
| `database/` | Prisma connection (`PrismaService`). The schema lives in `backend/prisma/schema.prisma` |
| `redis/` | Redis connection (cache, counters, rate limits) |
| `config/` | `.env` validation (`env.ts`) and the `webLink()` helper for links in emails |
| `http/` | Error format (`AppException`), zod validation pipe and decorators, rate-limit guard, global error filter |
| `health/` | `GET /health` |
