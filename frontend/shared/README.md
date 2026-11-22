# shared/ — used by all three users

| Folder | What |
|---|---|
| `ui/` | Basic building blocks: Button, Input, Label, Card, Alert (shadcn/ui style) |
| `forms/` | `FormField`: label, input and error message |
| `auth/` | Sign-in pieces: `RequireAuth` (page guard), Google button, role picker, auth card |
| `layout/` | Site header, page shell |
| `lib/` | `api.ts` (API calls, session, token refresh), `auth/` (role home URLs, `useSession`), form error helper, `cn()` |
| `providers.tsx` | React Query, Google sign-in and session restore, wrapped around the whole app |

Pages shared by everyone live in `app/(auth)/` (login, register, verify, forgot/reset password, choose role), `app/account/` (profile) and `app/page.tsx` (home).
