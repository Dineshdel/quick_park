# admin/ — Super Admin

Everything that **only the Super Admin** can do. All routes here are under `/api/v1/admin/*` and guarded by `@Roles('SUPER_ADMIN')`.
The one exception is `POST /auth/accept-invite`, which is public so that invited admins can finish setting up their account.

| File | What it does |
|---|---|
| `admin.module.ts` | Registers everything in this folder |
| `admin.controller.ts` | `POST /admin/invite`: invite another admin by email |
| `accept-invite.controller.ts` | `POST /auth/accept-invite`: the invited person sets their name and password |
| `admin-invite.service.ts` | Invite logic (72-hour single-use link) |
| `masters/admin-masters.controller.ts` | CRUD `/admin/vehicle-types`, `/admin/categories`, `/admin/cancellation-policies`; GET/PATCH `/admin/settings` |
| `masters/admin-masters.service.ts` | Master writes: duplicate → `409 DUPLICATE`, in use → `409 IN_USE`, default-policy rules → `409 DEFAULT_POLICY_LOCKED` |
| `ops/admin-ops.controller.ts` | Overview, approvals (KYC + places), owners + KYC document download, commission, places suspend/reinstate, users + suspend, bookings, payments, refunds, disputes, payouts, reports, audit log |
| `seed-admin.cli.ts` | `pnpm seed:admin --email … --name …`: creates the first admin |


