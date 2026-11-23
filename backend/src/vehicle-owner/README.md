# vehicle-owner/ — Vehicle Owner (customer)

Everything only customers call, guarded by `@Roles('VEHICLE_OWNER')`. Every query is scoped to the signed-in user (others' records are 404).

| Folder | Routes |
|---|---|
| `vehicles/` | `GET/POST /vehicles`, `GET/PATCH/DELETE /vehicles/:id`, `GET /vehicles/:id/qr`, `POST /vehicles/:id/qr/rotate` |
| `bookings/` | `POST /bookings` (Idempotency-Key), `GET /bookings?tab=`, `GET /bookings/:id`, `POST …/cancel`, `POST …/extend`, `GET …/pass`, `GET …/pass.pdf`, `POST/GET …/disputes` |

Payments (`POST /payments/order`, mock checkout) live in `shared/payments` because the webhook is shared. Public search and quotes live in `shared/search`.
