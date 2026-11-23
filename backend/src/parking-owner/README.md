# parking-owner/ — Parking Owner

Everything only Parking Owners call. All routes are guarded by `@Roles('PARKING_OWNER')`, and `OwnerContext` makes another owner's places return 404.

| Folder / file | Routes |
|---|---|
| `owner-context.service.ts` | Resolves the owner row; ownership checks |
| `profile/` | `GET/PUT /owner/profile`, `POST/DELETE /owner/kyc/documents`, `POST /owner/kyc/submit` |
| `locations/` | `GET/POST /owner/locations`, `GET/PATCH /owner/locations/:id`, `POST …/submit`, `POST/DELETE …/photos`, `PUT …/capacity`, `PUT …/pricing`, `POST/DELETE …/blocks` |
| `bookings/` | `GET /owner/bookings`, `GET /owner/locations/:id/occupancy`, `GET /owner/dashboard`, `GET /owner/earnings`, `GET /owner/payouts` |
| `access/` | Gate: `POST /access/scan`, `POST /access/walk-in`, `POST /access/sessions/:id/exit`, `GET /access/sessions` |

Customers' email and phone are never returned to owners.
