# Code Conventions & Style Guide

**Naming, structure, and style guidelines for Forza Fantasy League.**

---

## JavaScript / React

### Naming

| Entity | Convention | Example |
|--------|-----------|---------|
| **Files** | PascalCase (components), camelCase (utilities/hooks) | `SquadScreen.jsx`, `useSquad.js` |
| **Components** | PascalCase | `FormationDisplay`, `PlayerCard` |
| **Hooks** | `use` prefix + PascalCase | `useAuth`, `useSquad`, `useTransfer` |
| **Utility functions** | camelCase | `formatPrice()`, `calculatePoints()` |
| **Constants** | UPPER_SNAKE_CASE | `FORMATION_RULES`, `MAX_SQUAD_SIZE` |
| **CSS classes** | kebab-case | `.formation-display`, `.player-card` |
| **Data attributes** | kebab-case | `data-testid="squad-formation"` |

### File Organization

**Screens** (route-level components):
```
src/screens/
├── ScoresScreen.jsx
├── SquadScreen.jsx
├── LeagueScreen.jsx
└── ... (11 total)
```

**Components** (reusable building blocks):
```
src/components/
├── PlayerCard.jsx        # Single responsibility
├── FormationDisplay.jsx
├── ChatMessage.jsx
└── ... (20+ total)
```

**Hooks** (business logic extraction):
```
src/hooks/
├── useAuth.js           # Auth state
├── useSquad.js          # Squad queries
├── useTransfer.js       # Transfer logic
└── ... (10+ total)
```

**Utilities** (pure functions, singletons):
```
src/lib/
├── supabase.js          # Supabase client
├── capacitor.js         # Native plugin init
├── api.js               # HTTP client
└── utils.js             # Helpers (formatters, validators)
```

### React Best Practices

**Always use hooks** (no class components):
```javascript
// ✅ Good
export default function MyComponent() {
  const [state, setState] = useState(null);
  return <div>{state}</div>;
}

// ❌ Bad
class MyComponent extends React.Component {
  // ...
}
```

**Extract to custom hooks** if logic appears in 2+ components:
```javascript
// ✅ Good: Shared logic in hook
function useSquadData() {
  const [squad, setSquad] = useState(null);
  useEffect(() => { /* fetch squad */ }, []);
  return squad;
}

// Use in multiple screens
export default function SquadScreen() {
  const squad = useSquadData();
}
```

**Avoid prop drilling** with Context:
```javascript
// ✅ Good
const AuthContext = createContext();
export function useAuth() {
  return useContext(AuthContext);
}

// In component
function MyComponent() {
  const { user } = useAuth();  // Not passed as prop
}
```

**Use `data-testid` for selectors**:
```jsx
<button data-testid="submit-squad">Save Squad</button>
// In tests: page.click('[data-testid="submit-squad"]')
```

### Comments

**No comments for "what"** (code should be self-documenting):
```javascript
// ❌ Bad
const p = users.filter(u => u.age > 18);  // Get adults

// ✅ Good
const adults = users.filter(u => u.age > 18);
```

**Comments explain "why"** (especially non-obvious decisions):
```javascript
// ✅ Good
// Debounce to 500ms to avoid spamming RLS-blocked requests
const debouncedSearch = useMemo(() => debounce(search, 500), []);
```

---

## Database (SQL/Postgres)

### Table & Column Naming

| Entity | Convention | Example |
|--------|-----------|---------|
| **Table** | snake_case, plural | `users`, `squads`, `player_match_stats` |
| **Column** | snake_case | `created_at`, `user_id`, `total_points` |
| **Primary Key** | Always `id` | `id UUID PRIMARY KEY` |
| **Foreign Key** | `{table}_id` | `user_id`, `squad_id`, `league_id` |
| **Boolean** | `is_` or `has_` prefix | `is_captain`, `has_wildcard` |
| **Timestamp** | `_at` suffix | `created_at`, `updated_at` |

### Migration Structure

**Always create new files**, never modify existing:
```bash
supabase/migrations/
├── 01_initial_schema.sql
├── 02_draft_system.sql
├── ...
└── 89_bet_notification_trigger_fix.sql
```

**Next migration**: `90_*.sql`

**Naming convention**:
```sql
-- NN_feature_description.sql
-- 90_add_player_stats_index.sql
```

### RLS Policies

**Policy naming**:
```
{table}_{action}_{role}
-- Examples:
squads_select_owner          -- Only owner can SELECT
squads_update_league_member  -- League members can UPDATE
```

**Always include comments**:
```sql
-- Only squad owner can view their own squad
CREATE POLICY "squads_select_owner"
ON squads FOR SELECT
USING (auth.uid() = user_id);
```

### Constraint Naming

| Type | Convention | Example |
|------|-----------|---------|
| **Primary Key** | `{table}_pkey` | `users_pkey` |
| **Foreign Key** | `{table}_fk_{column}` | `squads_fk_user_id` |
| **Unique** | `{table}_unique_{columns}` | `fantasy_points_unique_squad_matchday` |
| **Check** | `{table}_check_{condition}` | `squads_check_valid_formation` |
| **Index** | `idx_{table}_{columns}` | `idx_squads_league_id` |

---

## CSS / Tailwind

### Class Organization

Use Tailwind's **layered approach**:
```css
/* src/index.css */
@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';
```

### Naming Convention

Use **kebab-case** for custom class names:
```javascript
// ✅ Good
<div className="formation-grid formation-grid--active">

// ❌ Bad
<div className="formationGrid formationGridActive">
```

### Responsive Classes

Use Tailwind breakpoints consistently:
```jsx
<div className="w-full md:w-1/2 lg:w-1/3">
  {/* Full width on mobile, 50% on tablet, 33% on desktop */}
</div>
```

**Breakpoints**:
- `sm`: 640px (tablets)
- `md`: 768px (landscape tablet)
- `lg`: 1024px (desktop)
- `xl`: 1280px (large desktop)

### Custom Utilities

Define in `tailwind.config.js`, not inline:
```javascript
// ✅ Good: In tailwind.config.js
{
  theme: {
    extend: {
      colors: {
        gold: '#FFD700',
        ink: '#0A0E27',
      },
    },
  },
}

// In JSX: <div className="text-gold">
```

### Avoid Inline Styles

```javascript
// ❌ Bad
<div style={{ color: 'red', padding: '10px' }}>

// ✅ Good
<div className="text-red-500 p-2.5">
```

**Exception**: Dynamic values that can't use Tailwind:
```javascript
// ✅ Okay (dynamic background image)
<div style={{ backgroundImage: `url(${playerImage})` }}>
```

---

## Git & Commits

### Branch Naming

```
claude/{slug}              # Feature branch
bugfix/{slug}              # Bug fix
refactor/{slug}            # Refactoring
docs/{slug}                # Documentation
```

**Examples**:
```
claude/add-auction-system
bugfix/fix-squad-validation
refactor/extract-transfer-logic
docs/update-testing-guide
```

### Commit Messages

**Format**:
```
type(scope): description

type: feat | fix | refactor | docs | test | chore
scope: optional, e.g., (squad), (transfer), (chat)
description: lowercase, imperative, ~50 chars
```

**Examples**:
```
feat(squad): add formation validation rules
fix(transfer): prevent duplicate player proposals
docs(testing): update E2E test guide
chore: bump Node version to 18
```

### Pull Requests

**Title**:
```
[CATEGORY] Brief description
Categories: [FEATURE], [BUG], [REFACTOR], [DOCS]
```

**Examples**:
```
[FEATURE] Add auction bidding system
[BUG] Fix squad RLS spoofing vulnerability
[REFACTOR] Extract transfer logic to hook
```

**Description** (in PR body):
```markdown
## Summary
What does this PR do?

## Changes
- Bullet 1
- Bullet 2

## Testing
How to verify the fix/feature?

## Closes
Fixes #123 (if applicable)
```

---

## SQL Style

### Query Formatting

```sql
-- ✅ Good: Readable, consistent
SELECT 
  u.id,
  u.email,
  COUNT(s.id) as squad_count
FROM users u
LEFT JOIN squads s ON s.user_id = u.id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id
ORDER BY squad_count DESC;

-- ❌ Bad: Hard to read
select u.id,u.email,count(s.id)as squad_count from users u left join squads s on s.user_id=u.id where u.created_at>now()-interval '30 days' group by u.id order by squad_count desc;
```

### Standards

- **Keywords**: UPPERCASE
- **Functions**: lowercase
- **Identifiers**: snake_case
- **Indentation**: 2 spaces
- **Line length**: Max 100 characters

---

## TypeScript (Future)

When migrating to TypeScript:

### Type Naming

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
}

type SquadStatus = 'active' | 'archived';

// ❌ Bad
interface IUser {}  // Avoid I prefix
type TSquadStatus = 'active' | 'archived';  // Avoid T prefix
```

### Generics

```typescript
// ✅ Good
function fetch<T>(url: string): Promise<T> {
  // ...
}

// ❌ Bad
function fetch(url: string): Promise<any> {
  // ...
}
```

---

## Documentation

### Code Comments

```javascript
// ✅ Good: Explains why
// Debounce to 500ms because RLS-blocked requests spam
const debouncedSearch = useMemo(() => debounce(search, 500), []);

// ❌ Bad: Explains what (code already shows this)
// Create debounced search function
const debouncedSearch = useMemo(() => debounce(search, 500), []);
```

### JSDoc (Minimal)

Only for exported functions with non-obvious behavior:
```javascript
/**
 * Calculate fantasy points for a player in a matchday.
 * Applies captain multiplier if selected; uses scoring rules from DB.
 * @param {string} playerId - Player UUID
 * @param {string} matchdayId - Matchday ID (e.g., "426-r35")
 * @returns {number} Total fantasy points
 */
export function calculatePlayerPoints(playerId, matchdayId) {
  // ...
}
```

---

## ESLint & Formatting

### ESLint Rules (Enforced in CI)

Run locally:
```bash
npm run lint
npm run lint -- --fix
```

**Key rules** (from `eslint.config.js`):
- `react/hooks-rules-of-hooks` — Enforce Hook rules
- `no-console` — Warn on console.log (except warnings/errors)
- `no-unused-vars` — Error on unused variables
- `prefer-const` — Prefer const over let
- `no-var` — Forbid var

### Prettier (Auto-formatting)

Configured in Vite — runs on save in most editors.

**Format on save**:
```bash
# VS Code: Install Prettier extension
# Then: Settings → Format On Save ✓
```

---

## Project Structure Conventions

### Single Responsibility Principle

Each file has one clear purpose:
```
FormationDisplay.jsx        # Only renders formation
useSquad.js                 # Only squad data/state
api.js                      # Only API calls
```

### Avoid Circular Dependencies

**Vite v8/Rolldown is strict about this** — see [CLAUDE.md](../CLAUDE.md) for TDZ details.

**Check**:
```bash
npx madge --circular src/
```

### Use Barrel Exports Sparingly

```javascript
// components/index.js
export { FormationDisplay } from './FormationDisplay';
export { PlayerCard } from './PlayerCard';

// In other files: import { FormationDisplay } from './components';
```

**Avoid excessive barrel exports** — explicit imports are clearer.

---

## Testing Conventions

### Test File Naming

```
src/components/__tests__/FormationDisplay.test.jsx
src/hooks/__tests__/useSquad.test.js
e2e/tests/squad.spec.js
```

### Test Organization

```javascript
describe('FormationDisplay', () => {
  describe('rendering', () => {
    test('displays 11 players', () => {});
  });
  
  describe('interactions', () => {
    test('allows player selection', () => {});
  });
});
```

### Assertion Style

Use Playwright's built-in assertions (more readable):
```javascript
// ✅ Good
await expect(page.locator('[data-testid="submit"]')).toBeVisible();
await expect(page.locator('text=Formation')).toHaveText('4-3-3');

// ❌ Avoid
expect(page.url()).toBe('http://localhost:5173/squad');
```

---

## Related Documents

- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) — Setup and daily commands
- [../CLAUDE.md](../CLAUDE.md) — Project instructions (includes TDZ Rolldown rule)
- [../BACKLOG.md](../BACKLOG.md) — Current tasks and priorities
- `eslint.config.js` — ESLint rules (authoritative)
- `tailwind.config.js` — Tailwind tokens (authoritative)

---

Last Updated: 2026-05-28
