# parking-owner/ — Parking Owner

Everything that **only Parking Owners** can do. Routes will be under `/api/v1/owner/*` and `/api/v1/access/*`, guarded by `@Roles('PARKING_OWNER')`.
Every query must be limited to the owner's own places (ownership check).

| File | What it does |
|---|---|
| `parking-owner.module.ts` | Registers everything in this folder (empty for now) |

**Coming next (plan M4, M5, M10, M11):**
- KYC and bank details
- parking places (map pin, photos, timings, events)
- slots per vehicle type, prices, blocked days
- scanner (QR entry/exit, walk-in)
- dashboard, bookings at my places, earnings and payouts
