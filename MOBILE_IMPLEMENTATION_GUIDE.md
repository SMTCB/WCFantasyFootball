# Mobile Implementation Guide
## Forza Fantasy League — iOS & Android (Capacitor)

**For**: Google Antigravity  
**Updated**: 2026-04-24  
**Approach**: Capacitor hybrid (wraps existing React web app)

---

## Current Status

| Phase | Task | Status |
|-------|------|--------|
| 1 | Capacitor install + config | ✅ Done |
| 1 | iOS Xcode project | ✅ Done |
| 1 | Android Studio project | ✅ Done |
| 1 | `viewport-fit=cover` (notch support) | ✅ Done |
| 2 | StatusBar + SplashScreen init | ✅ Done |
| 2 | App resume → session refresh | ✅ Done |
| 2 | iOS URL scheme (OAuth deep link) | ✅ Done |
| 2 | Android deep link intent filter | ✅ Done |
| 2 | Android minSdk 26 / targetSdk 36 | ✅ Done |
| 2 | iOS portrait-only + arm64 | ✅ Done |
| 2 | Auth mobile redirect URL | ✅ Done |
| 3 | Push notifications | ⏳ Not started |
| 3 | App icons (need 1024×1024 PNG) | ⏳ Not started |
| 3 | Splash screen asset | ⏳ Not started |
| 4 | TestFlight + Play Store internal testing | ⏳ Not started |
| 5 | Store listing copy, screenshots, legal | ⏳ Not started |
| 5 | App Store + Play Store submission | ⏳ Not started |

---

## 1. Context & Decision

Architecture decision: **Capacitor** (final — not React Native, not Flutter).  
Rationale: 95%+ React code reuse, 4–6 week timeline, single codebase for web + mobile.  
Full rationale: `APP_STORE_ASSESSMENT.md`.

The React web app is production-ready (82/84 E2E passing, responsive 375px+).

---

## 2. Prerequisites (Complete Before Store Submission)

- [ ] **Apple Developer Account** ($99/year) — iOS signing + TestFlight
- [ ] **Google Play Console account** ($25 one-time)
- [ ] **Apple Sign-In** capability — required for any iOS app using OAuth
- [ ] **Code signing certificates** — 2–3 week Apple lead time
- [ ] **Legal docs** — Privacy Policy, Terms of Service
- [ ] **Firebase project** — push notifications (FCM + APNs)
- [ ] **App icon asset** — 1024×1024px PNG (no alpha, no rounded corners)

---

## 3. Repository Setup

### Branch Convention
```bash
git checkout main && git pull origin main
git checkout -b antigravity/<feature-name>
# e.g. antigravity/push-notifications, antigravity/app-icons
```

### Files You Own
```
ios/                    # Xcode project
android/                # Android Studio project
capacitor.config.ts     # Capacitor configuration
```

### Files — Coordinate Before Touching
```
src/                    # React web app (Claude's domain)
supabase/               # DB migrations (Claude's domain)
package.json            # shared — coordinate dependency changes
```

---

## 4. Phase 1 — Capacitor Setup ✅ COMPLETE

All done. Key files committed:

- `capacitor.config.ts` — app ID `com.fantasykit.forzaedition`, splash `#080A0E`, dark status bar
- `ios/App/` — full Xcode project, 7 plugins via Swift Package Manager
- `android/` — full Android Studio project, `com.fantasykit.forzaedition`
- `index.html` — `viewport-fit=cover` added

Installed plugins: `@capacitor/app`, `@capacitor/browser`, `@capacitor/device`, `@capacitor/haptics`, `@capacitor/preferences`, `@capacitor/splash-screen`, `@capacitor/status-bar`

---

## 5. Phase 2 — Native Init + Auth + Native Config ✅ COMPLETE

All done. Key files:

**`src/lib/capacitor.js`** — single init module, call once on boot:
```js
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
// initNative() — sets status bar, hides splash, wires app resume → session refresh
```

**`src/main.jsx`** — `initNative()` called before React renders.

**`ios/App/App/Info.plist`** — URL scheme `com.fantasykit.forzaedition`, portrait-only, arm64.

**`android/app/src/main/AndroidManifest.xml`** — deep link intent filter for `com.fantasykit.forzaedition://`.

**`src/context/AuthContext.jsx`** — `getRedirectUrl()` returns native URL scheme on mobile, web origin on web.

**`android/variables.gradle`** — `minSdkVersion=26`, `targetSdkVersion=36`.

---

## 6. Phase 3 — Push Notifications

### Architecture
```
User event (score, rank change, deadline)
  → Supabase Edge Function
    → Firebase Cloud Messaging / APNs
      → Device
```

### Install
```bash
npm install @capacitor/push-notifications
npm run build && npx cap sync
```

### Database Tables (coordinate with Claude)
```sql
create table user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  token text not null,
  platform text not null, -- 'ios' | 'android'
  updated_at timestamptz default now(),
  unique(user_id, token)
);
```

### Frontend Registration
```typescript
import { PushNotifications } from '@capacitor/push-notifications';
import { isNative, platform } from '../lib/capacitor';
import { supabase } from '../lib/supabase';

async function registerPush(userId) {
  if (!isNative) return;
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== 'granted') return;
  await PushNotifications.register();

  PushNotifications.addListener('registration', async ({ value: token }) => {
    await supabase.from('user_push_tokens').upsert({ user_id: userId, token, platform });
  });
}
```

### iOS Setup (Xcode)
- Enable **Push Notifications** capability
- Enable **Background Modes → Remote notifications**
- Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) to projects

---

## 7. App Icons

**Required sizes**:
- iOS: one 1024×1024px PNG → `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- Android: place assets in `android/app/src/main/res/mipmap-*/` (use Android Studio Asset Studio)

**Spec**: PNG, no alpha channel, no pre-rounded corners (both stores apply rounding).

---

## 8. Testing (Phase 4)

### iOS TestFlight
1. Archive in Xcode: Product → Archive
2. Upload to App Store Connect
3. Add internal testers → distribute via TestFlight

### Android Internal Testing
1. `cd android && ./gradlew bundleRelease`
2. Upload `.aab` to Play Console → Internal testing track

### Minimum Device Matrix

| Device | OS | Priority |
|--------|----|----------|
| iPhone 15 Pro | iOS 17 | Critical |
| iPhone 12 | iOS 16 | Critical |
| iPhone SE 3rd gen | iOS 16 | High |
| Samsung Galaxy S23 | Android 13 | Critical |
| Google Pixel 7 | Android 13 | Critical |

### Key Scenarios
- [ ] Cold launch (splash → home in < 2s)
- [ ] Google OAuth login (redirects back via URL scheme)
- [ ] Apple Sign-In (iOS only — required for App Store)
- [ ] App backgrounded and resumed (session still valid)
- [ ] Squad screen at 375px portrait
- [ ] Transfer flow end-to-end
- [ ] Push notification (foreground + background)

---

## 9. Store Submission (Phase 5)

### iOS App Store
**Required assets**: 6.7" screenshots (iPhone 15 Pro Max), 5.5" (iPhone 8 Plus), 1024×1024 icon  
**Key requirements**:
- Sign in with Apple implemented (non-negotiable if using any OAuth)
- No references to other platforms in UI
- Privacy nutrition labels completed in App Store Connect
- Privacy Policy URL

### Google Play Store
**Required assets**: 512×512 icon, 1024×500 feature graphic, ≥2 phone screenshots  
**Key requirements**:
- `targetSdkVersion` 34+ (currently 36 ✅)
- Privacy Policy URL
- Content rating questionnaire completed
- App signing by Google Play configured

---

## 10. CI/CD for Mobile Builds

Add `.github/workflows/mobile.yml` — coordinate with Claude before merging:

```yaml
name: Mobile Build
on:
  push:
    branches: [main, 'antigravity/**']
jobs:
  build-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with: { name: web-dist, path: dist/ }

  build-ios:
    runs-on: macos-latest
    needs: build-web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { name: web-dist, path: dist/ }
      - run: npx cap sync ios
      - run: |
          xcodebuild -workspace ios/App/App.xcworkspace \
            -scheme App -configuration Debug \
            -sdk iphonesimulator \
            -destination 'platform=iOS Simulator,name=iPhone 15'

  build-android:
    runs-on: ubuntu-latest
    needs: build-web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { name: web-dist, path: dist/ }
      - run: npx cap sync android && cd android && ./gradlew assembleDebug
```

---

## 11. Known Gotchas

**Apple Sign-In is required** — any iOS app with third-party OAuth must also offer Apple Sign-In. It's already in the Supabase auth config; just needs the iOS capability enabled in Xcode and a UI button.

**OAuth callback on mobile** — uses `com.fantasykit.forzaedition://auth/callback`. Add this to Supabase dashboard → Authentication → URL Configuration → Redirect URLs before testing auth on device.

**Build before sync** — always `npm run build` before `npx cap sync`. Capacitor copies `dist/` directly.

**Android back button** — Capacitor handles it by default. Test that back works on modals/drawers.

---

## 12. Session Handoff Checklist

Before ending any Antigravity session:
- [ ] `git status` is clean
- [ ] All changes committed with descriptive messages  
- [ ] PR opened to `main`
- [ ] `ios/` and `android/` in consistent build state
- [ ] No `.env` files committed
- [ ] `BACKLOG.md` updated with any new issues

---

**Document owner**: Google Antigravity team  
**Last updated**: 2026-04-24
