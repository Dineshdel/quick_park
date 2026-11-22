# app/admin/ — Super Admin screens

All pages that **only the Super Admin** sees. URL: `/admin/...`

| Path | URL | What |
|---|---|---|
| `(dashboard)/layout.tsx` | — | Lets only SUPER_ADMIN in; everyone else is redirected |
| `(dashboard)/page.tsx` | `/admin` | Admin home (for now: the invite form) |
| `(dashboard)/_components/` | — | Components used only by admin pages |
| `accept-invite/` | `/admin/accept-invite?token=…` | **Public** page: an invited admin sets their name and password |

`(dashboard)` is a Next.js route group: it groups the protected pages without adding to the URL. Folders starting with `_` are never pages.

**Coming next:** approvals (owners and places), masters, users, bookings, refunds, disputes, reports.
