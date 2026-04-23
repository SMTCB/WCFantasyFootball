# Mobile Implementation Guide
## Forza Fantasy League — iOS & Android (Capacitor)

**For**: Google Antigravity  
**Date**: 2026-04-23  
**Status**: Ready to start  
**Approach**: Capacitor hybrid (wraps existing React web app)

---

## 1. Context & Decision Already Made

The architecture decision is final: **Capacitor** (not React Native, not Flutter).

**Why Capacitor**:
- Reuses 95%+ of existing React codebase — no rewrite
- 4–6 week timeline to both App Store and Play Store
- Single codebase (web + mobile stay in sync)
- Proven approach for this type of app

The React web app is **production-ready** (97.6% E2E test coverage, responsive from 375px). Your job is to add the Capacitor layer, configure native projects, and get both apps through store submission.

Full architecture rationale: see `APP_STORE_ASSESSMENT.md`.

---

## 2. Prerequisites (Complete Before Week 1)

Before writing any code, confirm these are ready:

- [ ] **Apple Developer Account** ($99/year) — required for iOS signing and TestFlight
- [ ] **Google Play Console account** ($25 one-time) — required for Android submission
- [ ] **Apple Sign-In** provisioning — required for iOS (any app using OAuth must support Apple Sign-In)
- [ ] **Code signing certificates** — allow 2–3 weeks lead time for Apple
- [ ] **Legal docs** — Privacy Policy, Terms of Service (required by both stores)
- [ ] **Firebase project** — for push notifications (FCM + APNs)

---

## 3. Repository Setup

### Branch Convention

Always work on a dedicated branch:
```bash
git checkout main
git pull origin main
git checkout -b antigravity/<feature-name>
# e.g. antigravity/capacitor-init, antigravity/ios-auth, antigravity/push-notifications
```

### Git Hygiene (Critical)

Two AI platforms share this repo. **Never leave uncommitted changes.**  
Before ending any session:
```bash
git status          # must be clean before switching platforms
git add -p          # stage intentional changes only
git commit -m "..."
git push origin antigravity/<feature-name>
```

### Files You Own

```
ios/                    # Capacitor iOS project
android/                # Capacitor Android project
capacitor.config.ts     # Capacitor configuration
.github/workflows/      # Mobile CI/CD workflows (coordinate with Claude)
```

### Files — Coordinate Before Touching

```
src/                    # React web app (Claude's primary domain)
supabase/               # DB migrations (Claude's domain)
backend/                # Edge Functions (Claude's domain)
package.json            # Shared — coordinate dependency changes
```

---

## 4. Phase 1: Capacitor Setup (Week 1–2)

### Step 1: Install Capacitor

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npm install @capacitor/browser @capacitor/secure-storage @capacitor/push-notifications @capacitor/status-bar @capacitor/splash-screen @capacitor/device @capacitor/haptics
```

### Step 2: Initialize

```bash
npx cap init "Forza Fantasy League" "com.forzafantasyleague.app" --web-dir=dist
```

This creates `capacitor.config.ts`. Edit it:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forzafantasyleague.app',
  appName: 'Forza Fantasy League',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',   // Match app dark theme
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0f172a',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
```

### Step 3: Add Platforms

```bash
npm run build
npx cap add ios
npx cap add android
npx cap sync
```

### Step 4: Configure iOS (Xcode)

```bash
npx cap open ios
```

In Xcode:
- Set **Bundle Identifier**: `com.forzafantasyleague.app`
- Set **Deployment Target**: iOS 14.0 minimum
- Enable **Sign in with Apple** capability (required for App Store)
- Enable **Push Notifications** capability
- Enable **Background Modes** → Remote notifications
- Set **Display Name**: Forza Fantasy League

### Step 5: Configure Android (Android Studio)

```bash
npx cap open android
```

In Android Studio:
- Set **applicationId**: `com.forzafantasyleague.app`
- Set **minSdkVersion**: 26 (Android 8.0)
- Set **targetSdkVersion**: 34 (required by Google Play)
- Enable **internet permission** (already in default manifest)

---

## 5. Phase 2: OAuth & Authentication (Week 2–3)

### The Problem

The web app uses OAuth redirects to `localhost` or the Vercel URL. On mobile, this needs to redirect back to the app via a custom URL scheme.

### Solution: Capacitor Browser Plugin + Deep Links

**Step 1: Add URL scheme to iOS (`ios/App/App/Info.plist`)**:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.forzafantasyleague.app</string>
    </array>
  </dict>
</array>
```

**Step 2: Add intent filter to Android (`android/app/src/main/AndroidManifest.xml`)**:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="com.forzafantasyleague.app" />
</intent-filter>
```

**Step 3: Update Supabase callback URL** (in Supabase dashboard):
```
com.forzafantasyleague.app://auth/callback
```

**Step 4: Update the auth flow in `src/lib/supabase.ts`** (coordinate with Claude):
```typescript
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

// Detect platform and use appropriate redirect URL
const getRedirectUrl = () => {
  if (Capacitor.isNativePlatform()) {
    return 'com.forzafantasyleague.app://auth/callback';
  }
  return window.location.origin + '/auth/callback';
};
```

**Step 5: Secure token storage**:
```bash
npm install @capacitor/preferences
```

Replace `localStorage` JWT storage with `Preferences` plugin on native platforms.

---

## 6. Phase 3: Native UI Adjustments (Week 2–3)

### Safe Area Handling

Add to `src/index.css` (coordinate with Claude):
```css
:root {
  --safe-area-top: env(safe-area-inset-top);
  --safe-area-bottom: env(safe-area-inset-bottom);
  --safe-area-left: env(safe-area-inset-left);
  --safe-area-right: env(safe-area-inset-right);
}
```

In `index.html`:
```html
<meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0, maximum-scale=1.0" />
```

Apply to top nav and bottom tab bar:
```css
.top-nav {
  padding-top: calc(var(--safe-area-top) + 1rem);
}
.bottom-tab-bar {
  padding-bottom: calc(var(--safe-area-bottom) + 0.5rem);
}
```

### Platform Detection

```typescript
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
```

### Status Bar

```typescript
import { StatusBar, Style } from '@capacitor/status-bar';

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark });
  StatusBar.setBackgroundColor({ color: '#0f172a' });
}
```

---

## 7. Phase 4: Push Notifications (Week 4 / Post-MVP)

### Architecture

```
User action (match score, rank change, deadline)
  → Supabase Edge Function
    → Firebase Cloud Messaging (FCM) / APNs
      → User device
```

### Database Tables Needed

Coordinate with Claude to add these migrations:

```sql
-- User push tokens
create table user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  token text not null,
  platform text not null, -- 'ios' | 'android'
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, token)
);

-- Notification history
create table notification_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb,
  sent_at timestamptz default now(),
  read_at timestamptz
);
```

### Frontend Integration

```typescript
import { PushNotifications } from '@capacitor/push-notifications';

async function registerPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    // Save token to Supabase
    await supabase.from('user_push_tokens').upsert({
      user_id: currentUser.id,
      token: token.value,
      platform: Capacitor.getPlatform(),
    });
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Handle foreground notification
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    // Handle tap on notification
  });
}
```

---

## 8. Phase 5: Testing (Week 4)

### iOS TestFlight

1. Archive build in Xcode: Product → Archive
2. Upload to App Store Connect
3. Add internal testers
4. Distribute via TestFlight link

### Android Internal Testing

1. Build signed AAB: `./gradlew bundleRelease`
2. Upload to Play Console → Internal testing track
3. Share test link with QA team

### Device Coverage Targets

| Device | OS | Priority |
|--------|----|----------|
| iPhone 15 Pro | iOS 17 | Critical |
| iPhone 12 | iOS 16 | Critical |
| iPhone SE 3rd gen | iOS 16 | High |
| Samsung Galaxy S23 | Android 13 | Critical |
| Google Pixel 7 | Android 13 | Critical |
| Samsung Galaxy A54 | Android 13 | High |

### Key Test Scenarios

- [ ] App launch (cold + warm)
- [ ] Login via Google OAuth (redirects correctly back to app)
- [ ] Login via Apple Sign-In (iOS only — required for App Store)
- [ ] Login via email/password
- [ ] View squad screen (375px, portrait)
- [ ] Make transfer (full flow)
- [ ] View leaderboard
- [ ] App backgrounding and resuming (token refresh)
- [ ] Offline behaviour (graceful error states)
- [ ] Push notification received (foreground + background)
- [ ] Deep link navigation

---

## 9. Phase 6: App Store Submission (Week 5)

### iOS App Store (App Store Connect)

**Required assets**:
- App icon: 1024×1024px PNG (no alpha, no rounded corners — Apple applies them)
- Screenshots: 6.7" (iPhone 15 Pro Max), 5.5" (iPhone 8 Plus), 12.9" iPad (if universal)
- Preview video (optional but recommended)

**App Store listing copy**:
- Title: "Forza Fantasy League"
- Subtitle (30 chars max): "EPL Fantasy Football"
- Description (4000 chars max)
- Keywords (100 chars max): fantasy, football, EPL, premier league, squad, transfers
- Support URL
- Privacy Policy URL (required)

**Submission checklist**:
- [ ] Sign in with Apple implemented and tested
- [ ] All OAuth flows tested on physical device
- [ ] No crashes on supported iOS versions (14.0+)
- [ ] Privacy nutrition labels completed in App Store Connect
- [ ] No references to other platforms in app UI

### Google Play Store (Play Console)

**Required assets**:
- App icon: 512×512px PNG
- Feature graphic: 1024×500px
- Screenshots: Phone (min 2), Tablet (optional)

**Play Store listing copy**:
- Title (50 chars max): "Forza Fantasy League"
- Short description (80 chars): "Build your EPL fantasy squad and compete in leagues"
- Full description (4000 chars max)

**Submission checklist**:
- [ ] Target API 34+ confirmed
- [ ] 64-bit support confirmed
- [ ] Permissions justified in Play Console
- [ ] Privacy policy linked
- [ ] Content rating questionnaire completed
- [ ] App signing by Google Play configured

---

## 10. CI/CD Pipeline for Mobile

Add `.github/workflows/mobile.yml` (coordinate with Claude before merging):

```yaml
name: Mobile Build

on:
  push:
    branches: [main, 'antigravity/**']
  pull_request:
    branches: [main]

jobs:
  build-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: web-dist
          path: dist/

  build-ios:
    runs-on: macos-latest
    needs: build-web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          name: web-dist
          path: dist/
      - run: npx cap sync ios
      - name: Build iOS
        run: |
          xcodebuild -workspace ios/App/App.xcworkspace \
            -scheme App \
            -configuration Debug \
            -sdk iphonesimulator \
            -destination 'platform=iOS Simulator,name=iPhone 15'

  build-android:
    runs-on: ubuntu-latest
    needs: build-web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          name: web-dist
          path: dist/
      - run: npx cap sync android
      - name: Build Android
        run: cd android && ./gradlew assembleDebug
```

---

## 11. Known Constraints & Gotchas

### Apple Sign-In is Non-Negotiable
Any iOS app that offers third-party login (Google, GitHub) **must also offer Sign in with Apple**. This is an App Store requirement. It's already in the Supabase auth config — just needs the iOS capability enabled and UI button added.

### OAuth Callback on Mobile
The web app redirects OAuth to `window.location.origin`. On mobile this breaks. The auth callback URL must be the custom URL scheme (`com.forzafantasyleague.app://auth/callback`). Coordinate with Claude to update Supabase allowed redirect URLs.

### Token Refresh on App Resume
When the app returns from background, the Supabase session may have expired. Add a listener on `App` plugin's `appStateChange` event to trigger token refresh.

```typescript
import { App } from '@capacitor/app';
App.addListener('appStateChange', async ({ isActive }) => {
  if (isActive) {
    await supabase.auth.getSession(); // triggers refresh if needed
  }
});
```

### Android Back Button
Capacitor handles Android back navigation by default. Test that the back button works correctly on all screens, particularly modals and drawers.

### Viewport Meta Tag
The current `index.html` must include `viewport-fit=cover` for safe area support. Coordinate with Claude before modifying this file.

### Web App Build Required Before Sync
Always `npm run build` before `npx cap sync`. Capacitor copies the `dist/` folder — if it's stale, the native app runs old code.

---

## 12. Handoff Checklist (Before Switching Back to Claude)

After completing any session:

- [ ] `git status` is clean (no uncommitted changes)
- [ ] All changes committed with descriptive messages
- [ ] PR opened to `main` (or changes merged if approved)
- [ ] `ios/` and `android/` directories in consistent build state
- [ ] No `.env` files committed
- [ ] `BACKLOG.md` updated with any new issues discovered

---

## 13. Contacts & Resources

| Resource | URL |
|----------|-----|
| Capacitor docs | https://capacitorjs.com/docs |
| Capacitor plugins | https://capacitorjs.com/docs/plugins |
| App Store guidelines | https://developer.apple.com/app-store/review/guidelines |
| App Store Connect | https://appstoreconnect.apple.com |
| Play Console | https://play.google.com/console |
| Supabase docs | https://supabase.com/docs |
| Firebase Console | https://console.firebase.google.com |

---

**Document Version**: 1.0  
**Owner**: Google Antigravity team  
**Last Updated**: 2026-04-23  
**Next Review**: End of Week 2 (after Capacitor setup complete)
