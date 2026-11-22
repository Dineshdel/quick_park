# admin/ — Super Admin

Everything that **only the Super Admin** can do. All routes here are under `/api/v1/admin/*` and guarded by `@Roles('SUPER_ADMIN')`.
The one exception is `POST /auth/accept-invite`, which is public so that invited admins can finish setting up their account.

| File | What it does |
|---|---|
| `admin.module.ts` | Registers everything in this folder |
| `admin.controller.ts` | `POST /admin/invite`: invite another admin by email |
| `accept-invite.controller.ts` | `POST /auth/accept-invite`: the invited person sets their name and password |
| `admin-invite.service.ts` | Invite logic (72-hour single-use link) |
| `seed-admin.cli.ts` | `pnpm seed:admin --email … --name …`: creates the first admin |

**Coming next (plan M2, M4, M5, M12):** categories, vehicle types, cancellation rules, commission %, KYC and parking-place approvals, users and suspensions, bookings, payments, refunds, disputes, reports.
