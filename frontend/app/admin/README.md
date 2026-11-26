# app/admin/ — Super Admin screens

URL: `/admin/...` (only SUPER_ADMIN), except `accept-invite/` (public, for invited admins).

| Path                                                                   | What                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `(dashboard)/page.tsx`                                                 | Overview KPIs, invite admin                                  |
| `approvals/`                                                           | Owner KYC (view documents) and place approvals               |
| `places/`, `users/`                                                    | Suspend / reinstate places and users                         |
| `bookings/`, `payments/`                                               | Search bookings, refund; payment and refund history          |
| `disputes/`, `payouts/`                                                | Resolve customer issues; create payouts and record transfers |
| `reports/`, `audit/`                                                   | Revenue by month / city / category; audit log                |
| `vehicle-types/`, `categories/`, `cancellation-policies/`, `settings/` | Master data (M2)                                             |
