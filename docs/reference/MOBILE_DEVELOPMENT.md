# Mobile Development Guide

## Clubhouse — iOS and Android (Capacitor)

**For:** whoever works on `ios/` and `android/` (Google Antigravity by convention, branch `antigravity/<slug>`)
**Approach:** Capacitor wraps the React web app; one codebase for web and both stores. Capacitor is final (not React Native, not Flutter). The rationale is in [APP_STORE_ASSESSMENT.md](../archive/stale-launch-docs/APP_STORE_ASSESSMENT.md) (archived).

---

## Current status (2026-11-22)

| Area | State |
|---|---|
| Capacitor 8 (`@capacitor/core`, `ios`, `android`, `cli` ^8.3) | ✅ Installed |
| Xcode and Android Studio projects | ✅ In `ios/` and `android/` |
| Status bar, splash, app resume → session refresh (`src/lib/capacitor.js`) | ✅ Done |
| Notch support (`viewport-fit=cover`), iOS portrait-only, arm64 | ✅ Done |
| CI compile check (`.github/workflows/mobile.yml`) | ✅ Runs on PRs to `main`, pushes to `main` and `antigravity/**` |
| App identifiers agree with each other | ❌ They do not, see [Identifiers](#identifiers) (MOBILE-2) |
| App name and icon on the Clubhouse brand | ❌ Still "Forza Fantasy League" / "Frontrow" (MOBILE-1, BRAND-4) |
| Push notifications | ⏳ Not started (LOW-6, needs MOBILE-1) |
| Signing, TestFlight, Play internal testing, store listings | ⏳ Not started (MOBILE-1) |

Installed plugins: `app`, `browser`, `device`, `haptics`, `preferences`, `splash-screen`, `status-bar`. `@capacitor/push-notifications` is **not** installed, although `capacitor.config.ts` already has a `PushNotifications` block.

---

## Versions and targets

| | Value | Where |
|---|---|---|
| iOS deployment target | 15.0 | `ios/App/App.xcodeproj/project.pbxproj` |
| Android minSdk / targetSdk / compileSdk | 26 / 36 / 36 | `android/variables.gradle` |
| Web build folder | `dist/` | `capacitor.config.ts` (`webDir`) |
| Android scheme | `https` | `capacitor.config.ts` (`server.androidScheme`) |
| Splash and status bar colour | `#080A0E` | `capacitor.config.ts` (the old dark theme; the app is light-only now) |

---

## Identifiers

The app ID is meant to be changeable until the first store submission, but today four places disagree:

| Place | Value |
|---|---|
| `capacitor.config.ts` `appId` | `com.forza.fantasyleague` |
| Android `applicationId` and deep-link scheme (`AndroidManifest.xml`) | `com.forza.fantasyleague` |
| iOS `PRODUCT_BUNDLE_IDENTIFIER` | `com.fantasykit.forzaedition` |
| iOS URL scheme (`Info.plist` `CFBundleURLSchemes`) | `com.forza.fantasyleague` |
| OAuth return address (`src/context/AuthContext.jsx` `MOBILE_REDIRECT`) | `com.fantasykit.forzaedition://auth/callback` |

The OAuth return address uses a scheme neither native app listens on, so a Google sign-in started inside the native app would not come back to it. Email and password sign-in is not affected. The fix is to pick one final ID (it should follow the Clubhouse brand decision), set it in all five places, and add `<id>://auth/callback` to Supabase → Authentication → URL Configuration → Redirect URLs. Tracked as MOBILE-2.

Display names are also pre-rebrand: `CFBundleDisplayName` and Android `app_name` are "Forza Fantasy League", and `appName` in `capacitor.config.ts` is "Frontrow".

---

## Key files

- **`src/lib/capacitor.js`** — the one native init module. Exports `isNative`, `platform` (`'ios' | 'android' | 'web'`) and `initNative()` (status bar, splash, resume → session refresh). Import `isNative` / `platform` from here for any platform check.
- **`src/main.jsx`** — calls `initNative()` before React renders.
- **`src/context/AuthContext.jsx`** — `getRedirectUrl()` returns the native scheme on mobile, the web origin on web.
- **`capacitor.config.ts`**, **`ios/App/App/Info.plist`**, **`android/app/src/main/AndroidManifest.xml`**, **`android/variables.gradle`**.

### Who owns what

| Owned by mobile work | Coordinate first |
|---|---|
| `ios/`, `android/`, `capacitor.config.ts` | `src/` (web app), `supabase/` (database and functions), `package.json` (shared dependencies) |

---

## Everyday workflow

```bash
npm run build && npx cap sync   # always build first: cap sync copies dist/ as it is
npx cap open ios                # then Build + Run in Xcode
npx cap open android            # then Run in Android Studio
```

CI (`mobile.yml`) does the same without signing: a web build, then an iOS simulator build on `macos-latest` and a debug APK with `./gradlew assembleDebug` on Ubuntu. It proves both projects compile; it does not run the app.

---

## Before the stores (MOBILE-1)

- Apple Developer account ($99/year) and Google Play Console account ($25 once)
- Code-signing certificates (allow 2–3 weeks on Apple's side)
- Sign in with Apple: required on iOS for any app that offers another OAuth provider. It needs the Xcode capability and a button
- Privacy Policy and Terms URLs (GDPR-1 to GDPR-3, LEGAL-1)
- App icon: one 1024×1024 PNG, no alpha, no rounded corners. iOS goes in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`, Android in `android/app/src/main/res/mipmap-*/` (Android Studio Asset Studio)
- Splash asset on the current brand
- One final app ID and name (MOBILE-2, BRAND-4)
- Store assets. iOS: 6.7" and 5.5" screenshots and the 1024 icon. Play: 512×512 icon, 1024×500 feature graphic, at least 2 phone screenshots, content-rating questionnaire, Play app signing. `targetSdk` 36 already meets Play's minimum

### Test builds

- **iOS TestFlight:** Xcode → Product → Archive → upload to App Store Connect → add internal testers.
- **Android internal testing:** `cd android && ./gradlew bundleRelease`, upload the `.aab` to the Internal testing track.

Minimum device matrix: iPhone 15 Pro, iPhone 12, iPhone SE (3rd gen), Samsung Galaxy S23, Pixel 7.

Scenarios: cold launch under 2 s; Google and Apple sign-in come back via the URL scheme; background then resume keeps the session; every main screen at 375 px portrait; a transfer end to end; the Android back button closes sheets and modals before leaving the screen.

---

## Push notifications (LOW-6, later)

The plan: an Edge Function sends through Firebase Cloud Messaging (Android) and APNs (iOS). It needs `npm install @capacitor/push-notifications`, a Firebase project with `google-services.json` and `GoogleService-Info.plist`, the Push Notifications and Background Modes → Remote notifications capabilities in Xcode, and a new migration for a per-user device-token table with RLS. That migration needs the owner's approval like any other (see CLAUDE.md).

---

## Session handoff checklist

- `git status` clean, changes committed on an `antigravity/` or `claude/` branch, PR open to `main`
- `ios/` and `android/` left in a state that builds
- No `.env` files or signing material committed
- New issues added to [BACKLOG.md](../../BACKLOG.md)

---

## Related

- [../../CLAUDE.md](../../CLAUDE.md) — Capacitor commands, multi-AI protocol
- [../../BACKLOG.md](../../BACKLOG.md) — MOBILE-1, MOBILE-2, LOW-6, BRAND-4
- [../testing/README.md](../testing/README.md) — the web test layers the native shell sits on

Last Updated: 2026-11-22
