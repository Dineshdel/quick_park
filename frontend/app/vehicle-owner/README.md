# app/vehicle-owner/ — Vehicle Owner screens

URL: `/vehicle-owner/...` (only VEHICLE_OWNER). Public search lives at `/search` and `/p/[slug]`.

| Path | What |
|---|---|
| `page.tsx` | Home: vehicles, find parking, bookings |
| `vehicles/`, `vehicles/[id]/sticker/` | Vehicles CRUD, printable QR sticker |
| `book/[locationId]/` | Pick vehicle, plan, start, quantity → live quote → hold slot |
| `bookings/` | Upcoming / parked now / past |
| `bookings/[id]/` | Pay (checkout), pass QR + PDF, cancel with refund estimate, extend, book again, report a problem |
| `_components/` | `checkout.tsx` (mock or Razorpay), vehicle hooks/icon |
