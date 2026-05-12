# Behavioral Rules — How Claude Operates on This Project

**Purpose**: Rules for decision-making, work approach, and collaboration  
**Who**: Claude reference (user sets these, Claude follows them)  
**When to review**: At start of each session, or when making non-obvious decisions

---

## 🎯 Core Principles

### Principle 1: User Never Touches Git
- **Rule**: Claude handles 100% of git operations — commits, pushes, PR creation, merging
- **Why**: Eliminates confusion, prevents accidental force-pushes, keeps workflow clean
- **How**: User describes what to fix; Claude manages git automatically
- **Exception**: None. If git state is corrupted, Claude diagnoses and fixes it

### Principle 2: No Hanging Work
- **Rule**: Every session ends with work either merged to main or clearly documented as blockers
- **Why**: Context loss happens when PRs hang. Next session you find unknown branches and confused state
- **How**: At session end, always: (1) merge PR to main, (2) update BACKLOG.md with summary
- **Exception**: Only if user explicitly says "save this for later" (rare)

### Principle 3: Documentation is Authority
- **Rule**: CLAUDE.md, BACKLOG.md, and .working-docs/ are single source of truth
- **Why**: Prevents repeated prompts and ensures context carries forward
- **How**: Never ask "what should I do?" if BACKLOG.md answers it. Always update docs after session.
- **Exception**: If docs are outdated, update them and mark the update clearly

### Principle 4: Tests Stay Green
- **Rule**: 116 E2E tests must pass before any PR is merged
- **Why**: One failing test means users encounter bugs in production
- **How**: Run `npx playwright test` before pushing. Fix failures before merging.
- **Exception**: Only if test itself is broken (wrong selector, outdated assertion) — then fix test + code

### Principle 5: Atomic Commits
- **Rule**: One logical change per commit. Commits should be reviewable independently.
- **Why**: Makes git history readable and reversible. Future you can understand why.
- **How**: Fix: Fix one bug. Feature: Complete one feature. Migration: One schema change.
- **Exception**: None. Don't combine unrelated changes.

---

## 📋 How to Approach Work

### When User Describes a Task

1. **Parse the ask** — What's the actual problem? What's the desired outcome?
2. **Check BACKLOG.md** — Is it already tracked? What's the priority?
3. **Understand scope** — Is it small (one component fix) or large (multi-component refactor)?
4. **Verify dependency** — Does this depend on something not yet done?
5. **If unclear**: Ask user for clarification before starting

### During Implementation

1. **Read existing code first** — Understand the pattern, don't rewrite
2. **Make minimal changes** — Fix only what's broken, don't refactor surrounding code
3. **Test early** — After each logical chunk, verify tests still pass
4. **Commit frequently** — Don't wait for "done" — commit atomic changes as you go
5. **Document as you go** — If logic is non-obvious, explain WHY in code (not WHAT)

### Before Pushing

1. **Run full lint**: `npm run lint` — 0 errors required
2. **Run full E2E tests**: `npx playwright test` — 116/116 passing
3. **Review commits** — Does each commit message explain the change clearly?
4. **Check for accidents** — Any console.logs left behind? Any `TODO` comments?
5. **Verify no large files** — Don't accidentally commit build output or node_modules

### Before Merging PR

1. **Verify CI passes** — GitHub Actions lint + test + build
2. **Check deployment** — Vercel shows green checkmark
3. **Quick smoke test** — Visit deployed app, click around, verify basic flows work
4. **Update BACKLOG.md** — Add session summary while context fresh

---

## ❌ What NOT to Do

| Rule | Example | Why |
|------|---------|-----|
| **No `--no-verify`** | Never skip git hooks | Hooks catch errors early |
| **No force-push** | Avoid `git push --force` | Rewrites history, breaks collaboration |
| **No uncommitted work** | Always commit before session end | Context loss, confusion next session |
| **No hardcoded values** | Don't use magic numbers in code | Makes code hard to modify later |
| **No dead code** | Delete unused functions/variables | Clutters codebase, confuses readers |
| **No refactoring beyond scope** | Don't "clean up" code while fixing bug | Increases change surface, harder to review |
| **No feature flags** | Don't add conditional logic for "future use" | Complicates code, rarely actually used |
| **No large comments** | Don't write multi-paragraph docstrings | Keep comments short, explain WHY not WHAT |
| **No console.logs** | Remove debug logs before merging | Clutters production console |
| **No skipped tests** | Don't use `test.skip()` or `.only()` | Test suite must run fully |

---

## ✅ What TO Do

| Rule | Example | Why |
|------|---------|-----|
| **Be specific in commits** | "Fix: Captain benching prompt shows when user tries to bench starter" | Future you understands context |
| **Test edge cases** | "What if user has < 11 players?" | Catches bugs before users hit them |
| **Document decisions** | "Chose Position-based projection over ML because Forza API not available yet" | Explains tradeoffs, prevents rework |
| **Keep main deployable** | Never commit broken code to main | Every commit on main should work |
| **Use existing patterns** | Copy hook structure from useSquad if building useTransfer | Consistency, less learning curve |
| **Ask before big changes** | "Should I refactor this component?" | User might have context you don't |
| **Verify after merge** | Check Vercel deployment after PR merges | Catches deployment issues early |

---

## 🔄 Decision Framework

**When you're unsure about an approach**, ask yourself:

1. **Does CLAUDE.md say to do this?** → Follow CLAUDE.md
2. **Does BACKLOG.md indicate priority?** → Follow priority order
3. **Does it match existing patterns?** → Use existing patterns
4. **Will it break tests?** → Don't do it, fix tests first
5. **Is it reversible?** → If not, ask user first
6. **Will next session understand it?** → If not, add a comment explaining WHY

If still unsure → **Ask user** (don't guess).

---

## 📱 Specific to This Project

### React/Frontend
- Prefer hooks over class components
- Use existing custom hooks (useSquad, useTransfer, etc.) instead of inline logic
- Test on mobile (375px viewport) AND desktop
- Use Tailwind classes, avoid inline styles except for dynamic values

### Supabase/Backend
- Always apply Row-Level Security (RLS) — never bypass it
- Create NEW migration files, never modify existing ones
- Test migrations locally before applying to production
- Use prepared statements, never concatenate SQL

### Testing
- E2E tests use Playwright
- Target by role/text, not by CSS class or ID
- Tests must work on both mobile (375px) and desktop (1440px)
- Add tests when adding features, update tests when changing behavior

### Git/Deployment
- Feature branches always from clean main
- PR always goes to main (never other branches)
- Always use squash merge for cleaner history
- Delete feature branch immediately after merge
- Vercel deploys automatically from main (30–60 seconds)

---

## 🎓 Learning from This Project

### What Works Well
- Feature branch + PR model prevents broken main
- Atomic commits make history readable
- E2E tests catch regressions early
- Supabase RLS prevents data leaks
- Documentation in git tracks decisions

### What Caused Problems Before (Don't Repeat)
- Multiple scattered documentation files (now consolidated in .working-docs/)
- Hanging PRs that never merged (now end sessions with merged PRs)
- Context loss between sessions (now BACKLOG.md tracks everything)
- Forgotten migrations or untracked edge cases (now tests verify them)
- Mixing refactoring with bug fixes (now atomic commits keep them separate)

---

## Next Steps After Reading This

1. ✅ You understand the rules
2. ✅ You know what to do and what to avoid
3. Next: Read CLAUDE.md (tech stack) and BACKLOG.md (priorities)
4. Then: Start the work
5. Finally: At session end, update BACKLOG.md and merge PR

**Remember**: Every decision you make is documented in commits and BACKLOG.md. Next session starts with clear context. No confusion.
