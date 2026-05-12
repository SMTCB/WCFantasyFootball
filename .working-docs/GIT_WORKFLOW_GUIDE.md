# Git Workflow — Complete Automation Guide

**For Claude Code: All git operations are handled automatically. You should never need to touch git directly.**

---

## Session Start Checklist

Before starting a session, these steps are **automatically handled** by Claude Code:

1. ✅ Sync with main: `git pull origin main`
2. ✅ Verify clean state: `git status` (should show "nothing to commit")
3. ✅ Create feature branch: `git checkout -b claude/<kebab-case-description>`

**You just describe what you want fixed, Claude handles the git part.**

---

## Commit Strategy

Claude creates **atomic commits** for each logical change:

```bash
# Each commit has:
# 1. Clear message describing WHY (not what)
# 2. Proper prefix: Fix: | #XXX: | docs: | Refactor:
# 3. Co-author attribution

Example:
  Fix: Roulette captain selection restricted to starting XI only
  
  Only players in the starting XI can be selected as captain via Roulette spin.
  Previously bench players could be randomly selected.
  
  Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

### Commit Prefixes

| Prefix | Usage | Example |
|--------|-------|---------|
| `Fix:` | Bug fixes | `Fix: Captain benching prompt` |
| `#XXX:` | Feature IDs | `#038: Captain selection bug` |
| `docs:` | Documentation | `docs: Update BACKLOG` |
| `Refactor:` | Code reorganization | `Refactor: Extract captain logic` |
| `Migration N:` | Database changes | `Migration 26: Add fixture scores` |

---

## Pull Request Workflow (Automated)

Once a session ends, Claude handles:

### 1. Push Branch
```bash
git push origin claude/<branch-name> -u
```

### 2. Create PR (Auto)
```bash
gh pr create --title "..." --body "..." --draft=false
```
- **Title**: Short (< 70 chars), action-focused
- **Body**: Summary + Test Results + Co-author

### 3. Wait for Checks
```bash
gh pr checks <PR#> --watch=false
```
Vercel Build + Lint + (E2E Tests) must pass

### 4. Merge to Main
```bash
gh pr merge <PR#> --squash --delete-branch
```
- `--squash`: Combines all commits into one for cleaner main history
- `--delete-branch`: Removes feature branch from remote (local auto-cleaned)

### 5. Sync Main
```bash
git fetch origin main
git pull origin main
```

---

## Branch Naming Convention

```
claude/<action>-<item>

Examples:
  claude/fix-captain-selection-bug
  claude/implement-auction-system
  claude/update-error-messages
```

---

## BACKLOG.md — Your Session Record

After **every session**, Claude updates BACKLOG.md:

```markdown
**Last Updated**: YYYY-MM-DD (session N)
**E2E Test Suite**: X/116 passing

## 📋 Current Status Summary

### ✅ Completed This Session (YYYY-MM-DD — session N: summary)
- ✅ **#XXX Feature/Bug**: What was fixed and how
- ✅ **#YYY Feature/Bug**: What was fixed and how
```

**This file IS your project state.** Always check it first in next session.

---

## Next Session Checklist

1. Read `BACKLOG.md` → understand what was done
2. Read `CLAUDE.md` → refresh git workflow
3. Run: `git pull origin main && git status`
4. Create feature branch
5. Start work

---

## Emergency Git Recovery

**Problem: Accidental changes on wrong branch?**

Claude will:
1. Stash changes: `git stash`
2. Switch branch: `git checkout -b claude/<new-branch>`
3. Pop changes: `git stash pop`
4. Commit properly

**Problem: Need to undo a commit?**

Claude will:
1. Check what went wrong: `git log --oneline -5`
2. Soft reset: `git reset --soft HEAD~1` (undo commit, keep changes)
3. Or hard reset: `git reset --hard HEAD~1` (undo commit, discard changes)
4. Re-commit properly

**You never need to run these — just describe the problem.**

---

## PR Merge Conflict Resolution

**If PR won't merge due to conflicts (e.g., main has advanced):**

Claude will:
1. Fetch main: `git fetch origin main`
2. Merge main into branch: `git merge origin/main`
3. Resolve conflicts (keep main, merge feature changes)
4. Commit merge: `git commit -m "Merge main into feature branch"`
5. Push: `git push origin <branch>`
6. Retry PR merge: `gh pr merge <PR#> --squash`

---

## What You Do

**EVERYTHING ABOVE IS AUTOMATED.**

Your job:
- ✅ Describe what needs fixing
- ✅ Wait for Claude to handle git
- ✅ Check Vercel deployment (https://wc-fantasy-football.vercel.app)
- ✅ Review BACKLOG.md for what was done

Your job **NOT**:
- ❌ `git add` / `git commit`
- ❌ `git push`
- ❌ `gh pr create`
- ❌ `gh pr merge`
- ❌ Manage branches manually

---

## Session 8 Example (2026-05-12)

**You said:** "Fix critical bugs. I want all git handled on my side."

**Claude did:**
1. Created `claude/fix-critical-bugs` branch
2. Fixed 4 bugs with 5 atomic commits:
   - Fix: Roulette captain selection
   - Fix: Captain benching prompt
   - Fix: Captain validation
   - Migration 26: Fixture scores
   - Update BACKLOG.md
3. Pushed branch
4. Created PR #20
5. Resolved merge conflicts (main had advanced)
6. Merged PR to main
7. Updated BACKLOG.md with session summary

**You did:** None of the above. ✅

---

## Verifying Your Changes Are Deployed

After Claude merges a PR:

1. **Check Vercel**: https://wc-fantasy-football.vercel.app
   - Vercel auto-deploys from main
   - Deployment typically finishes in ~30 seconds
   - Check GH PR page for Vercel status badge

2. **Check BACKLOG.md**
   - Updated date and summary
   - Lists all fixes for this session
   - Serves as your change log

3. **Check GitHub**: Visit PR page to see merge status
   - PR shows "Merged" with green checkmark
   - Feature branch automatically deleted
   - Commit history clean (squashed)

---

## One Final Rule

**If something goes wrong with git, tell Claude immediately.**

Claude will:
- Analyze the state: `git status`, `git log`
- Fix the issue
- Update BACKLOG.md to reflect what happened
- Continue with your work

You never fix git problems manually — Claude does.

---

**Session 8 Status: ✅ COMPLETE — PR #20 MERGED, Vercel DEPLOYED**
