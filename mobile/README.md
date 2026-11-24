# Quick Park mobile app (Android + iOS)

Expo (SDK 58) + Expo Router app for **drivers** and **gate staff**. It talks to the same API as the website and shares `@qp/types` and `@qp/validation`.

| Who | What they can do |
|---|---|
| Driver (vehicle owner) | Find parking (search, near me, category and vehicle filters), see photos, prices or "Free", floors with live free slots. Book with area → floor → slot, pay (test mode or Razorpay), see the QR entry pass, extend, cancel, report a problem. Manage vehicles and their QR sticker. |
| Parking owner / gate staff | Camera QR scanner for check-in and check-out (or type a plate or booking code). Overstay charges with the full breakdown, collect cash or UPI, walk-ins, and an "Inside now" list with live amounts due. |
| Admin | Uses the website. The app shows a link to it. |

Place setup (floors, slot numbers, prices), earnings and admin stay on the website. The Account tab links there.

## Run it in development

1. Start the API as usual (`pnpm dev:backend` from the repo root). It listens on port 4000.
2. Start the app from the repo root:
   ```bash
   pnpm dev:mobile        # = pnpm --filter @qp/mobile start
   ```
3. Open it:
   - **Phone:** install **Expo Go** and scan the QR code shown in the terminal. The phone must be on the same Wi-Fi as the computer.
   - **Android emulator:** press `a` in the terminal.
   - **iOS simulator (macOS only):** press `i`.

The app finds the API by itself:
- **Phone:** it uses the computer running `expo start`, on port 4000.
- **Android emulator:** it uses `10.0.2.2:4000`.
- **Fixed address:** to use a specific address, copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`, for example `http://192.168.1.20:4000`.

**Payments:** in development, payments use the API's test mode. The "Pay now" button asks you to simulate success or failure. With `PAYMENTS_DRIVER=razorpay` on the API, the real Razorpay checkout opens in the app.

## Build the store apps

Builds run in the cloud on Expo's build service, EAS. You don't need Android Studio or Xcode, and this works from Linux.

1. Set your real addresses in `eas.json` under `preview` and `production` → `env`:
   - `EXPO_PUBLIC_API_URL`: your HTTPS API.
   - `EXPO_PUBLIC_WEB_URL`: your website.
2. Sign in to Expo and link the project (first time only):
   ```bash
   cd mobile
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
3. Build:
   ```bash
   pnpm --filter @qp/mobile build:android   # installable .apk (preview profile)
   pnpm --filter @qp/mobile build:ios       # App Store build (needs an Apple Developer account)
   ```
   - For the Google Play Store, build an `.aab` with `npx eas-cli@latest build -p android --profile production`.
   - Submit with `npx eas-cli@latest submit`.

The app id is `com.quickpark.app` on both platforms. Change it in `app.json` before the first store upload if you want a different one.

## Checks

```bash
pnpm --filter @qp/mobile typecheck
pnpm --filter @qp/mobile lint
cd mobile && npx expo-doctor
```

## How sign-in works

The website keeps the refresh token in an httpOnly cookie. A phone has no cookie jar, so the app sends `X-QP-Client: mobile`:
- The API then returns the refresh token in the response body.
- The app keeps it in the device's secure storage (Keychain on iOS, Keystore on Android).
- The app sends the token back in the body to `/auth/refresh` and `/auth/logout`.

Web sign-in is unchanged.
