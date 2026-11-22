# vehicle-owner/ — Vehicle Owner (customer)

Everything that **only Vehicle Owners** can do. Routes will be under `/api/v1/vehicles/*` and `/api/v1/bookings/*`, guarded by `@Roles('VEHICLE_OWNER')`.
Every query must be limited to the user's own vehicles and bookings.

| File | What it does |
|---|---|
| `vehicle-owner.module.ts` | Registers everything in this folder (empty for now) |

**Coming next (plan M3, M7, M8, M9):**
- my vehicles and their QR stickers
- price quote, booking, cancel, extend, rebook
- payment
- booking pass (QR, PDF)

Public parking search (no login needed) will live in `shared/`, because every visitor uses it.
