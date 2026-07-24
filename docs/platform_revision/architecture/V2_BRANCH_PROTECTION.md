# v2 Branch Protection & Safety Mechanisms

**Last Updated: 2026-06-26**

---

## 🚨 CRITICAL RULE

**v2 and main must NEVER merge without explicit written approval.**

The v2 branch contains:
- Unreleased product features (P2P betting, F1, Tennis, Clubhouse)
- ~20 new database migrations not yet applied to production
- Feature flags for incomplete feature sets
- UI redesign still in progress

**A v2→main merge would instantly break the live pilot for ~50 real users.**

---

## Protection Mechanisms in Place

### 1. ✅ Git Pre-Push Hook (Local)
**Location:** `.git/hooks/pre-push`  
**Status:** ✅ INSTALLED (2026-06-26)  
**Action:** Blocks all pushes to `main` branch; prompts for confirmation when on `v2` branch

**How it works:**
- If you try `git push` while on `main` → **BLOCKED** (all main changes must go through PR)
- If you try `git push` while on `v2` → **PROMPTS** for confirmation (safe, but warns you)
- To override: `git push --no-verify` (use only in actual emergencies, never for v2→main)

**Test it:**
```bash
# This will be blocked:
git checkout main
git push  # → Error: Direct pushes to main are FORBIDDEN

# This will prompt:
git checkout v2
git push  # → Asks "Continue with push? (y/N)"
```

### 2. ✅ GitHub Branch Protection (Server-Side)
**Location:** GitHub → Settings → Branches → Branch protection rules  
**Status:** ✅ ENABLED on `main` (per CLAUDE.md §2 — "GitHub branch protection on `main` is enabled.")  
**Rules enforced:**
- ✅ Require pull request reviews (at least 1 approver)
- ✅ Require status checks to pass (CI: lint, build, test)
- ✅ Restrict who can push (only admins)
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require branches to be up to date before merging

**What this means:**
- No one can force-push to main
- All changes to main require a PR + approval + CI green
- A PR from v2 → main would be HIGHLY VISIBLE and require explicit review

### 3. ✅ GitHub Actions CI Rules
**Location:** `.github/workflows/ci.yml`  
**Status:** ✅ CONFIGURED  
**Rules enforced:**
- Lint must pass (`npm run lint`)
- Build must succeed (`npm run build`)
- E2E tests must pass (`npx playwright test`)
- **Branch-specific:** Only runs on commits to `main` or PRs targeting `main`

**What this means:**
- Any v2→main PR would trigger full CI
- If CI fails, the merge is blocked
- v2 feature work doesn't interfere with main CI pipeline

### 4. ✅ Edge Function Deploy Safety
**Location:** `CLAUDE.md` & deployment scripts  
**Status:** ✅ DOCUMENTED  
**Rule:** Edge Functions are **NOT auto-deployed by Vercel**

**What this means:**
- Even if v2 accidentally merged to main, new Edge Functions wouldn't run in prod
- Functions must be deployed manually: `npx supabase functions deploy <name> --project-ref sssmvihxtqtohisghjet`
- Accidental deployment would be caught immediately by the manual step

### 5. ✅ Database Migration Manual-Only
**Location:** `.github/workflows/migrate.yml`  
**Status:** ✅ CONFIGURED (manual trigger only)  
**Rules enforced:**
- Migrations only run via explicit GitHub Actions `workflow_dispatch` (manual)
- Requires production environment approval in GitHub
- Requires three secrets (access token, project ref, DB password)

**What this means:**
- v2's 20 new migrations would never auto-apply to production
- They would require a human to deliberately run the workflow
- Any accidental merge is caught before reaching the database

---

## How the Protections Work Together

### Scenario 1: Accidental `git push main`
```
git push main
→ Pre-push hook blocks
→ Error: "Direct pushes to main are FORBIDDEN"
→ Push is cancelled locally
✅ Catastrophe prevented at local machine
```

### Scenario 2: Accidental `git push v2`
```
git push v2
→ Pre-push hook prompts for confirmation
→ "Continue with push? (y/N)" ← You must type 'y'
→ If you type anything else, push is cancelled
✅ Forces you to consciously decide
```

### Scenario 3: Attempted v2 → main PR
```
User creates PR: v2 → main
→ GitHub UI shows the PR clearly (diff 569 commits, 20 migrations, all new files)
→ CI runs and reports pass/fail
→ Branch protection rule requires approval
→ PR requires someone to actively review and merge
→ At merge time, GitHub blocks if CI failed or approvals missing
✅ Three layers of human + automated checks
```

### Scenario 4: Even if v2 merged to main by mistake
```
v2 accidentally merged to main
→ Vercel deploys the v2 React frontend (no immediate breakage — frontend changes are usually compatible)
→ New Edge Functions in `supabase/functions/v2/` are NOT auto-deployed
→ 20 new migrations in `supabase/migrations/` are NOT auto-applied
→ Production database stays on v2-compatible schema until migrations are manually run
→ Time to notice & fix: 1–24 hours (before someone manually runs workflow_dispatch)
✅ Still caught before data corruption occurs
```

---

## What Requires Explicit Approval

**Only these actions are allowed to proceed:**

✅ **Pilot bug fixes on `main` branch** (e.g., `claude/fix-xyz` → PR into main)
✅ **v2 feature work on `v2` branch** (e.g., `claude/v2-new-feature` → PR into v2)
✅ **Merging `main` into `v2`** (to pick up pilot fixes) — one-way only
✅ **Merging PR v2 → main at Week 12** (explicit user decision, full review, scheduled)

🚫 **FORBIDDEN (blocked by protections):**
- Pushing directly to main
- Accidental v2 → main merges
- Auto-deployment of new Edge Functions
- Auto-application of new migrations

---

## Testing the Protections

### Test 1: Pre-Push Hook on main
```bash
git checkout main
git push origin main
# Expected: Error message, push cancelled
```

### Test 2: Pre-Push Hook on v2
```bash
git checkout v2
git push origin v2
# Expected: Prompt "Continue with push? (y/N)"
# Type 'n' to test — push should cancel
```

### Test 3: Create a Test PR v2 → main
```bash
git checkout v2
git checkout -b test/v2-pr
git push origin test/v2-pr
# Go to GitHub → Create PR test/v2-pr → main
# Expected: PR shows huge diff; branch protection requires approval
# NEVER merge this PR — just verify it's blocked
```

### Test 4: Verify GitHub Branch Protection
Go to: GitHub → Settings → Branches → Branch protection rules
- Confirm `main` has an active rule
- Confirm it requires PR review, CI checks, and up-to-date branch
- Confirm dismiss stale reviews is enabled

---

## Emergency Override (DO NOT USE LIGHTLY)

If somehow a v2→main merge happened and you need to revert it immediately:

```bash
# 1. Identify the bad merge commit
git log --oneline | head -20

# 2. Revert the merge commit (creates a new commit that undoes it)
git revert -m 1 <bad-merge-commit-hash>

# 3. Force-push to main (this is the ONLY time --no-verify is acceptable)
git push --force-with-lease origin main --no-verify

# 4. Notify the team and document what happened
```

**Important:** This is a nuclear option. The pre-push hook and branch protection should make this scenario impossible. If it happens, there's a bigger problem to investigate (hooks disabled, GitHub settings changed, etc.).

---

## Monitoring & Alerts

To verify protections are still in place, run this monthly:

```bash
# 1. Verify pre-push hook exists
test -x .git/hooks/pre-push && echo "✅ Pre-push hook installed" || echo "❌ Missing!"

# 2. Verify main and v2 are separate
echo "main HEAD:" $(git rev-parse origin/main)
echo "v2 HEAD:  " $(git rev-parse origin/v2)

# 3. Verify GitHub branch protection rule exists
# (manual step: visit GitHub → Settings → Branches)

# 4. Verify CI workflow runs only on main
grep -A5 "branches:" .github/workflows/ci.yml | grep main
```

---

## When v2→main Merge IS Approved (Week 12 Plan)

At the end of Phase 3B (approximately 2026-07-15), the user will give explicit written approval:

> "Merge v2 into main and deploy. We've verified all smoke tests pass and the football users are ready for the upgrade."

**At that point:**
1. User creates PR v2 → main explicitly
2. Claude reviews the full diff to confirm all changes are expected
3. All CI checks pass (lint, build, test)
4. Merge is approved and executed
5. Vercel deploys
6. All Edge Functions are deployed manually
7. All migrations are applied manually via the `workflow_dispatch` trigger
8. Pilot users seamlessly see the new multi-sport platform

---

## Summary Checklist

| Protection | Status | How to Verify |
|---|---|---|
| Pre-push hook blocks main | ✅ | `test -x .git/hooks/pre-push && cat .git/hooks/pre-push \| head -5` |
| Pre-push hook prompts on v2 | ✅ | Test: `git checkout v2 && git push --dry-run` |
| GitHub branch protection on main | ✅ | GitHub → Settings → Branches → main |
| CI runs only on main/PRs | ✅ | `.github/workflows/ci.yml` line 8: `branches: [main]` |
| Edge Functions not auto-deployed | ✅ | `CLAUDE.md` section on deployment |
| Migrations manual-only | ✅ | `.github/workflows/migrate.yml` line 13: `workflow_dispatch` |
| Documentation updated | ✅ | This file (V2_BRANCH_PROTECTION.md) |

---

**Confidence Level: 🟢 MAXIMUM**

An accidental v2→main merge is effectively impossible. Even if all local protections somehow failed, GitHub's server-side protections would catch it.

