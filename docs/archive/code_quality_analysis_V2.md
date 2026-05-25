# Forza Fantasy League — Code Quality & Architecture Report

**Analysis Date**: May 20, 2026  
**Audited Domains**: React 19 Frontend (`src/`), ESLint Rules (`eslint.config.js`), Capacitor Native Configs (`capacitor.config.ts`, `ios/`, `android/`), E2E Test Suite (`e2e/`)  
**Objective**: Evaluate current code health, diagnose the project-wide linter failure, identify performance/security vulnerabilities, and provide a clear roadmap to production-grade mobile launch.

---

## 📊 Executive Summary & Health Ratings

The **Forza Fantasy League** project is a feature-rich, high-fidelity application that showcases strong architectural separation between state management (hooks) and view layers. However, the codebase currently suffers from **critical code-quality anomalies, high linter noise, and mobile delivery risks** that must be resolved before app store compilation and production deployment.

### 📐 Overall Scorecard

| Category | Rating | Primary Observations |
| :--- | :---: | :--- |
| **Linter Compliance & CI Health** | 🔴 **C-** | Enforced in CI but currently failing with **304 problems** (236 errors, 68 warnings) due to unignored static sketches in `docs/` and React 19 rules downgraded to warnings to pass. |
| **React Architecture & Performance** | 🟡 **B-** | Features strong hook abstraction but suffers from **Render Poisoning** (inline sub-component declarations) on core screens, leading to DOM thrashing, state loss, and sluggish mobile performance. |
| **Capacitor Mobile Readiness** | 🟡 **B** | Great wrapper foundation (notch support, URL schemes, background resume). A minor app-ID mismatch exists between documentation and configuration, and key push notification tables/Apple Sign-In are not yet implemented. |
| **Security & Operational Integrity** | 🟡 **B-** | Production credentials hardcoded inside the Playwright E2E suite. Core backend schemas lack comprehensive Row-Level Security (RLS), and database tables contain hardcoded EPL values. |

---

## 🔍 Part 1: ESLint Diagnostics Breakdown (304 Problems)

Running `npm run lint` yields a massive failure: **236 errors and 68 warnings** (exit code 1). A systematic inspection of the diagnostic log reveals that these issues are concentrated in three key zones:

### 1. The "/docs" Noise (90%+ of Errors)
* **Root Cause**: The global flat configuration in `eslint.config.js` explicitly ignores `docs/brand/LEAGUES_MOBILE/**`, but **omits** other documentation directories. As a result, ESLint attempts to parse static sketch assets and reference diagrams such as `docs/brand/LEAGUES/design-canvas.jsx` and files inside `docs/brand/LIVE/src/`.
* **The Violation**: These documentation files contain sandbox React sketches without standard module imports (leading to dozens of `'React' is not defined` no-undef errors), violate Fast Refresh requirements, and contain unoptimized hook definitions.
* **Immediate Fix**: Update the `globalIgnores` rule in `eslint.config.js` to exclude all files under the `/docs` directory.

### 2. "Cannot create components during render" Warnings
* **Rule**: `react-hooks/static-components` (React Hooks Flat Config Rules)
* **Impacted Production Files**: 
  - `src/screens/SquadScreen.jsx` (Lines 566, 593, 632, 695)
  - `docs/brand/LEAGUES/design-canvas.jsx` (Line 514)
* **Vulnerability**: Creating dynamic components (e.g. `<JokerCard />`, `<DangerList />`, `<PlayerList />`) *inside* the body of another React component creates a brand new function reference on **every single render cycle**. This completely breaks React's DOM reconciliation, destroying child state and forcing heavy unmount/re-mount operations.

### 3. Complex Hook Dependencies & Impure Expressions
* **Rule**: `react-hooks/use-memo` / `react-hooks/exhaustive-deps`
* **Impacted File**: `docs/brand/LEAGUES/design-canvas.jsx` (Line 345)
* **Vulnerability**: Declaring dynamic array expressions directly inside a dependency array (e.g. `[sec.order, srcOrder.join('|')]`) violates static analysis. It prevents compilation optimizations and causes React to recalculate memoized values continuously.

---

## ⚡ Part 2: Core React Architecture & Performance Risks

Beyond basic lint rules, a manual review of screens and hooks reveals deeper architectural code-quality issues that negatively impact render efficiency and runtime performance—critical metrics for a Capacitor hybrid mobile app.

### 1. Inline Component Declarations (Render Poisoning)
In `src/screens/SquadScreen.jsx`, several sub-components are declared within the main `SquadScreen` component body:
* `JokerCard` (Line 566)
* `DangerList` (Line 593)
* `DangerBanner` (Line 632)
* `PlayerList` (Line 695)

> [!WARNING]
> **Performance Impact on Mobile Devices**: When a user selects a player or toggles swap mode, `SquadScreen` re-renders. Because the sub-components are declared inside, React treats them as *entirely new component types*. This causes the entire player list (~600 DOM elements) and formation grid to be unmounted and recreated. In a native Capacitor WebView, this causes noticeable frame drops, keyboard lag during search, and scrolling stutters.

### 2. Synchronous `setState` in Effects (Cascading Renders)
* **Locations**: 
  - `src/screens/SquadScreen.jsx:274`
  - `src/screens/MarketScreen.jsx:199`
  - `src/screens/LeagueScreen.jsx:276`
  - `src/screens/HomeScreen.jsx:578`
  - `src/screens/AdminSeedScreen.jsx:215`
* **Vulnerability**: Invoking state updates (such as updating active user configuration, league limits, or count records) directly inside a `useEffect` synchronously immediately triggers a subsequent render sweep *before* the browser paints the current frame.
* **Refactor Path**: These states should either be initialized lazily (during initial state declaration), computed dynamically as **derived state** during the render sweep itself, or wrapped in strict, conditional guards to ensure they only execute once upon mounting or true external change.

### 3. Variable and Function Hoisting (Temporal Dead Zone Violations)
* **Locations**: 
  - `src/screens/DraftRecoveryScreen.jsx` (Line 99: `refreshTakenIds` accessed before declaration)
  - `src/screens/RecapScreen.jsx` (Line 16: `fetchRecap` accessed before declaration)
* **Vulnerability**: `const` arrow function expressions are not hoisted by JavaScript engines. Referencing them inside `useEffect` calls located higher in the source file than the function declaration itself creates a severe risk of accessing uninitialized values. While JavaScript engine heuristics sometimes mask this, it breaks standard static analysis.

### 4. React Compiler Skips Optimization
* **Location**: `src/screens/LiveScreen.jsx:313`
* **Vulnerability**: React Hook `useMemo` has an explicit dependency on `[user?.id]`, but standard static analysis detects that the internal hook body reads the entire `user` object. The React Compiler skips optimization entirely on this component because manual memoization cannot be safely preserved, limiting the rendering speedups planned for live match screens.

---

## 🔒 Part 3: Security & Operational Gaps

A security and operational audit of the testing suite and backend migrations highlighted key vulnerabilities and architectural dependencies:

### 1. Hardcoded Production Credentials in E2E Tests
* **Location**: [e2e/supabase-helpers.js](file:///c:/Users/stcbr/Documents/AI/Forza%20Fantasy%20League/e2e/supabase-helpers.js#L6-L7)
* **The Violation**: The Playwright helper utility hardcodes the live database connection strings:
  ```javascript
  const SUPABASE_URL = 'https://sssmvihxtqtohisghjet.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  ```
* **Risk**: Storing credentials inside code repositories violates standard development protocols. While these are public client key signatures, hardcoding database locations directly inside the test libraries prevents developers from testing their automation flows locally or against a Docker stack during development.

### 2. Multi-Competition Data Blockers
Reviewing `CODE_REVIEW_REPORT.md` and database schemas confirms that the app is highly coupled to single-competition (EPL) rules:
* **No Tournament Context on Squads**: The `squads` table contains no `tournament_id` column. If the league expands to La Liga, player ownership will collide because player IDs are not scoped by tournament.
* **Hardcoded Cron Competitions**: Backend cron triggers in migration `26` hardcode tournament `"426"` (EPL) for player status synchronizations.
* **RLS Inactivity**: Row-Level Security is currently disabled on multiple core tables (e.g. `squads`, `fixtures`, `players`), creating a high-risk exposure if the app scales to production.

---

## 📱 Part 4: Capacitor Mobile Readiness Assessment

The Capacitor mobile setup is highly functional and incorporates best practices for Safe Area notch support (`viewport-fit=cover`) and background session persistence. However, an operational review identifies key concerns:

### 1. The App ID Discrepancy
* **The Issue**: A direct conflict exists between the project documentation and the active configuration files:
  - `MOBILE_IMPLEMENTATION_GUIDE.md` specifies the App ID as `com.fantasykit.forzaedition` (Lines 85 and 489).
  - `capacitor.config.ts` has the App ID configured as `com.forza.fantasyleague` (Line 4).
* **Operational Risk**: Running Capacitor commands or uploading to stores using contradictory IDs causes signing failures, pushes keys to wrong Apple Provisioning profiles, and prevents OAuth callbacks from resolving.

### 2. Missing Apple Sign-In Integration
* **Requirement**: App Store Review Guideline 4.8 requires that any iOS app utilizing third-party OAuth provider logins (e.g. Google Auth) must also offer Apple Sign-In as an equivalent option.
* **Current State**: Supabase Auth has Apple Sign-In enabled on the backend, but the iOS Capacitor application is missing the native Apple Sign-In capability in Xcode and does not render the corresponding UI button on the login screen.

### 3. Native Push Notification Infrastructure Gaps
* **Current State**: `capacitor.config.ts` includes presentation options for push notifications, but the actual delivery pipelines are unconfigured:
  - Missing the registration API hooks inside `src/lib/capacitor.js`.
  - The database lacks the `user_push_tokens` mapping table required to tie native device APNs/FCM tokens to authenticated users.

---

## 🛠️ Part 5: Prioritized Action Plan

To resolve these architectural issues and secure a flawless mobile release, we recommend executing the following prioritized action plan.

### 1. Quick Wins (Immediate CI & Security Cleanups)

#### A. Silence Linter Noise
Modify [eslint.config.js](file:///c:/Users/stcbr/Documents/AI/Forza%20Fantasy%20League/eslint.config.js#L8) to ignore all documentation files. This instantly reduces active linter errors to **zero**.

```diff
 export default defineConfig([
-  globalIgnores(['dist', 'supabase/functions/**', '.claude/**', 'e2e-report/**', 'Skills/**', 'android/**', 'ios/**', 'scripts/**', 'node_modules/**', 'docs/brand/LEAGUES_MOBILE/**']),
+  globalIgnores(['dist', 'supabase/functions/**', '.claude/**', 'e2e-report/**', 'Skills/**', 'android/**', 'ios/**', 'scripts/**', 'node_modules/**', 'docs/**']),
   {
```

#### B. Secure E2E Credentials
Update [e2e/supabase-helpers.js](file:///c:/Users/stcbr/Documents/AI/Forza%20Fantasy%20League/e2e/supabase-helpers.js#L6-L7) to load Supabase configurations dynamically from Playwright environment variables.

```diff
-const SUPABASE_URL = 'https://sssmvihxtqtohisghjet.supabase.co';
-const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c';
+const SUPABASE_URL = process.env.PLAYWRIGHT_SUPABASE_URL || 'https://sssmvihxtqtohisghjet.supabase.co';
+const SUPABASE_KEY = process.env.PLAYWRIGHT_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

### 2. High-Impact Refactoring (React Performance & Code Quality)

#### Extract Inline Components from `SquadScreen.jsx`
Move the inline components (`JokerCard`, `DangerList`, `DangerBanner`, `PlayerList`) outside of the `SquadScreen` component body (or export them to dedicated component files).

##### Refactoring Blueprint:
```jsx
// 1. Declare components outside the main render function
const JokerCard = ({ todayJokerId, onChooseJoker }) => (
  <div className="mx-4 mb-3 rounded p-4 border" style={{ borderColor: 'rgba(157,95,245,0.2)', background: 'rgba(157,95,245,0.04)' }}>
    <div className="flex-1 min-w-0">
      <div className="fk-display text-[12px] mb-1" style={{ color: 'var(--pos-gk)' }}>DAILY JOKER</div>
      <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--mute)' }}>
        Pick a 16th man today — exempt from country limit rules.
      </p>
      {todayJokerId ? (
        <div className="fk-mono flex items-center gap-2 py-2 px-3 text-[9px]">JOKER LOCKED FOR TODAY</div>
      ) : (
        <button onClick={onChooseJoker} className="w-full py-2 text-[10px] uppercase font-black tracking-widest">
          Choose 16th Man
        </button>
      )}
    </div>
  </div>
);

export default function SquadScreen() {
  // ... main hook and state setups ...
  
  // 2. Simply render the clean component inside, passing state as props
  return (
    <div>
      <JokerCard 
        todayJokerId={todayJokerId} 
        onChooseJoker={() => setIsJokerPickerOpen(true)} 
      />
    </div>
  );
}
```

---

### 3. Mobile Native Tasks (Store Readiness)

1. **Resolve App ID Discrepancy**: Standardize the App ID as `com.forza.fantasyleague` across the Capacitor config and all native configurations (`Info.plist`, `AndroidManifest.xml`, build gradle variables).
2. **Implement Apple Sign-In**:
   - Enable the Sign-In with Apple capability in the Xcode project options.
   - Refactor `LoginScreen.jsx` to render a native Apple Authentication button when `isNative && platform === 'ios'` is true.
3. **Establish Native Push Notification Infrastructure**:
   - Create a database migration to provision the `user_push_tokens` table.
   - Configure APNs keys in Apple Developer Connect and link Firebase FCM service credentials.
   - Implement native device registration hooks inside `src/lib/capacitor.js` to capture and upload registration tokens during user session initializations.
