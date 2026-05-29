# Google Antigravity — Project Instructions

## Project Overview

**ForzaKit / Forza Fantasy League** — EPL fantasy football app.

- **Web app**: React 19 + Vite + Tailwind CSS 4 + Supabase (production-ready, 82/84 E2E passing)
- **Your scope**: iOS and Android native apps via **Capacitor** (scaffold already exists)
- **Other AI platform**: Claude Code handles web app and backend — coordinate before touching `src/`, `supabase/`, or `backend/`
- **Implementation guide**: [`docs/reference/MOBILE_DEVELOPMENT.md`](docs/reference/MOBILE_DEVELOPMENT.md) — start here, Phase 1 & 2 already done

---

## Multi-AI Collaboration Protocol

**Two AI platforms share this repo — never simultaneously.**

| Platform | Scope | Branch convention |
|----------|-------|-------------------|
| Claude Code | Web app, backend, infrastructure | `claude/<slug>` |
| Google Antigravity (you) | Mobile — Capacitor iOS/Android | `antigravity/<slug>` |

**Before starting any session**:
```bash
git status                          # must be clean
git checkout main
git pull origin main                # always start from latest main
git checkout -b antigravity/<name>  # create feature branch
```

**Before ending any session**:
```bash
git status          # must be clean
git push origin antigravity/<name>
# open PR to main
```

---

## What's Already Done (Do Not Redo)

| Task | Status |
|------|--------|
| Capacitor install + `capacitor.config.ts` | ✅ Done |
| iOS Xcode project (`ios/`) | ✅ Done |
| Android Studio project (`android/`) | ✅ Done |
| `viewport-fit=cover` in `index.html` | ✅ Done |
| StatusBar + SplashScreen init from React (`src/lib/capacitor.js`) | ✅ Done |
| App resume → Supabase session refresh | ✅ Done |
| iOS URL scheme for OAuth deep link (`Info.plist`) | ✅ Done |
| Android deep link intent filter (`AndroidManifest.xml`) | ✅ Done |
| Android `minSdkVersion` 26, `targetSdk` 36 | ✅ Done |
| iOS portrait-only orientation + arm64 | ✅ Done |
| Auth mobile redirect URL (`AuthContext.jsx`) | ✅ Done |
| Brand colors in Android resources | ✅ Done |

---

## What Remains

See `MOBILE_IMPLEMENTATION_GUIDE.md` Phase 3 onwards:

- Push notifications (Firebase FCM + APNs)
- App icons (1024×1024 PNG needed from design)
- Splash screen asset (replace Capacitor default)
- TestFlight + Play Store internal testing setup
- Store listing copy, screenshots, privacy policy
- CI/CD workflow for mobile builds

---

## Repository Structure (Your Domain)

```
ios/                    # Xcode project — your primary ownership
android/                # Android Studio project — your primary ownership
capacitor.config.ts     # Capacitor config — your ownership
src/lib/capacitor.js    # Native init — coordinate with Claude before editing
```

**Coordinate before touching**: `src/`, `supabase/`, `backend/`, `package.json`

---

## Key Commands

```bash
npm install                   # install dependencies
npm run build                 # build web app (required before cap sync)
npx cap sync                  # sync dist/ to ios/ and android/
npx cap open ios              # open Xcode
npx cap open android          # open Android Studio
npx cap run ios               # run on iOS simulator
npx cap run android           # run on Android emulator
```

App ID: `com.fantasykit.forzaedition`  
iOS: Xcode project at `ios/App/App.xcodeproj`  
Android: project at `android/`

---

## Development Guidelines

- **Never commit secrets**: `.env` is gitignored; use `.env.example`
- **Build before sync**: always `npm run build` before `npx cap sync`
- **Branch discipline**: feature branches only, PRs to `main`
- **Clean handoffs**: `git status` must be clean when you stop
