# Local Development Setup

**Complete guide to setting up your development environment and running the app locally.**

---

## Prerequisites

- **Node.js**: 18+ (check with `node --version`)
- **npm**: 8+ (included with Node)
- **Git**: 2.30+
- **Supabase CLI**: Latest version
- **Capacitor CLI**: For mobile development (optional)
- **Xcode** (Mac only, for iOS development)
- **Android Studio** (for Android development, optional)

---

## One-Time Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/forza-fantasy-league.git
cd forza-fantasy-league
```

### 2. Install Dependencies
```bash
npm install
# or
pnpm install
yarn install
```

### 3. Environment Configuration

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

**Edit `.env.local` and add**:
```
VITE_SUPABASE_URL=https://sssmvihxtqtohisghjet.supabase.co
VITE_SUPABASE_ANON_KEY=<get-from-supabase-dashboard>
```

**To get the anon key**:
1. Go to https://supabase.com/dashboard/project/sssmvihxtqtohisghjet
2. Settings → API → Project URL & Key
3. Copy `anon` (public) key

### 4. Link Supabase (Optional but Recommended)
```bash
npx supabase login                      # Opens browser auth
npx supabase link --project-ref sssmvihxtqtohisghjet
```

This enables local DB access without Docker:
```bash
npx supabase db query --linked "SELECT COUNT(*) FROM users;"
```

---

## Daily Development

### Start Dev Server
```bash
npm run dev
# Output: ➜  Local:   http://localhost:5173
```

Open http://localhost:5173 in your browser.

**Hot Module Replacement (HMR)** is enabled — changes auto-reload without full refresh.

### Build for Production
```bash
npm run build
# Creates dist/ folder (ready for Vercel)
```

### Lint Code
```bash
npm run lint
# Check for ESLint violations
# Fix automatically:
npm run lint -- --fix
```

### Run Tests

**CI-enforced test** (platform.spec.js):
```bash
npx playwright test e2e/tests/platform.spec.js
```

**All integration tests**:
```bash
npx playwright test e2e/
```

**Single test with debugging**:
```bash
npx playwright test e2e/tests/auth.spec.js --debug
```

**View test report**:
```bash
npx playwright show-report e2e-report/
```

---

## Database Access

### Query Live Supabase
```bash
# Read query
npx supabase db query --linked "SELECT * FROM users LIMIT 5;"

# Write query (bypasses RLS)
npx supabase db query --linked "UPDATE players SET price = 5.0 WHERE id = '123';"

# Check cron jobs
npx supabase db query --linked "SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;"
```

### View Database Dashboard
https://supabase.com/dashboard/project/sssmvihxtqtohisghjet

### Run Migrations Locally
```bash
# Apply pending migrations to local stack (if using Docker)
npx supabase migration up

# Check applied migrations
npx supabase migration list
```

---

## Mobile Development

### Build Web App for Mobile
```bash
npm run build          # Web build → dist/
npx cap sync           # Sync to iOS + Android projects
```

### iOS (Mac Only)
```bash
npx cap open ios
# Opens Xcode; click Run to build + test on simulator
```

**Requirements**:
- Xcode 15+
- iOS deployment target: 15.0

### Android
```bash
npx cap open android
# Opens Android Studio; click Run to build + test on emulator
```

**Requirements**:
- Android Studio (latest)
- minSdk: 26 (Android 8.0)
- targetSdk: 36

---

## Debugging

### Browser DevTools
```
Cmd/Ctrl + Shift + I  # Open DevTools
```

**Tips**:
- **Console**: Check for errors and logs
- **Network**: Inspect API calls, Supabase requests
- **Application**: View localStorage (auth tokens), IndexedDB
- **Lighthouse**: Performance audit

### React DevTools Extension
Install [React DevTools](https://react-devtools-tutorial.vercel.app/) for easier component inspection.

### Debug Specific Component
```javascript
// In your code, temporarily add:
import { useEffect } from 'react';

export default function MyComponent() {
  useEffect(() => {
    console.log('Component mounted:', { props: this.props });
  }, []);
  // ...
}
```

### Check Realtime Subscriptions
```javascript
// In browser console:
window.supabaseClient.getChannels()
// Shows active subscriptions (chat, live scores, etc)
```

### Database Debug
```bash
# Check if migrations are applied
npx supabase db query --linked "SELECT version FROM _supabase_migrations ORDER BY version DESC LIMIT 5;"

# Inspect RLS policies
npx supabase db query --linked "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';"

# Check table structure
npx supabase db query --linked "\\d squads"
```

---

## Common Issues & Fixes

### Issue: `npm install` fails
**Cause**: Node version too old  
**Fix**: 
```bash
node --version          # Check current
nvm install 18          # Install Node 18+ with nvm
nvm use 18
npm install
```

### Issue: Dev server won't start
**Cause**: Port 5173 already in use  
**Fix**:
```bash
# Kill process using port 5173
lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or use different port
npm run dev -- --port 3000
```

### Issue: Supabase CLI not linked
**Cause**: First-time setup  
**Fix**:
```bash
npx supabase login
npx supabase link --project-ref sssmvihxtqtohisghjet
```

### Issue: Tests fail with "Cannot find module"
**Cause**: Dependencies not installed  
**Fix**:
```bash
rm -rf node_modules package-lock.json
npm install
npx playwright install
```

### Issue: RLS blocks query in browser
**Cause**: Using anon key on restricted table  
**Fix**:
- Use `npx supabase db query --linked` instead (bypasses RLS)
- Or add RLS policy allowing anon access
- Or authenticate first (login in browser)

### Issue: Capacitor sync fails
**Cause**: Web build out of date  
**Fix**:
```bash
npm run build           # Rebuild web app
npx cap sync            # Sync to native projects
```

---

## Tips & Best Practices

### Use Environment Variables
Never hardcode secrets or API keys:
```javascript
// ❌ Bad
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// ✅ Good
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

### Enable Verbose Logging
```bash
# See all Supabase requests
DEBUG=supabase-* npm run dev
```

### Use Playwright Debug Mode
```bash
# Step through tests interactively
npx playwright test --debug --headed
```

### Test on Mobile Viewport
```javascript
// DevTools → Device toolbar
// Set to 375px width (mobile minimum)
```

### Check Bundle Size
```bash
npm run build
# Look for warnings about large chunks in console
# Use vite-plugin-visualizer to inspect
npx vite-plugin-visualizer dist/stats.html
```

---

## Performance Monitoring

### Lighthouse Audit
```bash
npm run build
# Open dist/index.html in browser
# DevTools → Lighthouse → Generate report
```

### Measure Network Waterfall
```bash
# In browser DevTools → Network tab
# Look for slow requests to Supabase or Forza API
# Aim for <500ms p95
```

### React Profiler
```javascript
// DevTools → Profiler tab
// Record user interactions
// Identify slow renders
```

---

## File Watching & Auto-Reload

Vite automatically watches these directories:
- `src/` — React components, hooks, screens
- `public/` — Static assets
- `index.html` — HTML template

**Changes auto-reload** in the browser (HMR).

**To disable HMR** (if it interferes):
```bash
npm run dev -- --no-hmr
```

---

## Next Steps

1. **Read the project structure** in [CONVENTIONS.md](CONVENTIONS.md)
2. **Check active tasks** in [../BACKLOG.md](../BACKLOG.md)
3. **Run tests locally** to verify setup: `npx playwright test e2e/tests/platform.spec.js`
4. **Start a feature branch** and begin development

---

## Getting Help

**Project Instructions**: [../CLAUDE.md](../CLAUDE.md)  
**Architecture Docs**: [../architecture/](../architecture/)  
**API Reference**: [../api/](../api/)  
**Conventions**: [CONVENTIONS.md](CONVENTIONS.md)

---

Last Updated: 2026-05-28
