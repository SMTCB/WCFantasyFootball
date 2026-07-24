# Session Workflow — Checklist for Claude

**When**: Start of every session  
**Who**: Claude automatically runs this  
**Purpose**: Establish clean state, understand priorities, sync context

---

## ✅ Session Start Checklist (Do This First)

### Phase 1: Understand Context (5 min)
```
☐ Read CLAUDE.md (project tech stack, current implementation status)
☐ Read BACKLOG.md (priorities, what was completed last session, what's next)
☐ Read BEHAVIORAL_RULES.md (refresh on how to approach work)
```

### Phase 2: Verify Git State (2 min)
```
☐ Run: git status → should show clean working tree or clear feature branch
☐ Run: git pull origin main → sync with latest
☐ Run: git log --oneline -5 → check recent commits are on main
```

### Phase 3: Understand the Task (5 min)
```
☐ User has described what needs fixing/building
☐ Correlate with BACKLOG.md items (if ticket number mentioned, cross-reference)
☐ Check if depends on other open items in BACKLOG
```

### Phase 4: Plan Session Work
```
☐ Define scope: What will be done this session?
☐ Define acceptance: How will we know it's complete?
☐ Identify blockers: Any external dependencies?
☐ Estimate effort: Small / Medium / Large
```

---

## 📝 Session Work (During Development)

### While Coding:
```
☐ Run tests frequently: npm run lint && npx playwright test
☐ Commit atomically (one logical change per commit)
☐ Use commit prefixes: Fix: | #XXX: | docs: | Refactor: | Migration N:
```

### Before Pushing:
```
☐ Verify tests pass: npx playwright test (116 tests should all be green)
☐ Verify lint passes: npm run lint (0 errors)
☐ Verify E2E test count hasn't changed (unless intentionally adding/removing tests)
☐ Check BACKLOG.md updated? (If major changes, update it incrementally)
```

---

## 🚀 Session End (Critical)

### Commits & Push:
```
☐ All work committed with clear messages
☐ Run: git push origin claude/[branch-name]
☐ No uncommitted changes left behind
```

### GitHub PR:
```
☐ Create PR with:
  - Title: Short action-focused description
  - Body: Summary of what was fixed + testing done
  - Co-author: Claude Haiku 4.5 <noreply@anthropic.com>
☐ Wait for CI checks to pass (GitHub Actions)
☐ Merge PR to main using squash strategy
☐ Delete feature branch (automatic via gh CLI)
```

### Documentation:
```
☐ Update BACKLOG.md with session summary:
  - Date of session
  - What was completed (list specific fixes/features)
  - E2E test results
  - Any blockers or notes for next session
```

### Verification:
```
☐ Pull latest main: git fetch origin main && git pull origin main
☐ Check Vercel deployment: https://wc-fantasy-football.vercel.app
☐ Spot-check features work as expected
```

---

## 🚨 If Something Goes Wrong

### Merge Conflict:
```
☐ Fetch main: git fetch origin main
☐ Merge main into feature branch: git merge origin/main
☐ Resolve conflicts
☐ Commit: git commit -m "Merge main into feature branch"
☐ Push: git push origin [branch]
☐ Retry PR merge
```

### PR Won't Merge (stuck checks):
```
☐ Check GitHub Actions status (https://github.com/SMTCB/WCFantasyFootball/actions)
☐ If E2E tests failing: npm run lint && npx playwright test locally
☐ Fix issues, commit, push
☐ Retry merge
```

### Tests Failing:
```
☐ Run locally: npx playwright test [specific-test-file]
☐ Read error message carefully
☐ Fix code
☐ Re-run tests
☐ Commit, push, re-run CI
```

### Uncommitted Work Left Behind:
```
☐ If at start of new session, find hanging work on feature branch
☐ Pull that branch: git checkout claude/[old-branch]
☐ Complete the work
☐ Create PR, merge, continue
```

---

## 📌 Key Rules

| Rule | Why | How |
|------|-----|-----|
| **Every commit pushed to feature branch** | Prevents context loss | Push after every meaningful change |
| **Every session ends with merged PR** | Keeps main stable and deployed | Never leave PR hanging |
| **BACKLOG updated after every session** | Tracks progress and context | Add summary before session ends |
| **Tests run before merge** | Catches bugs early | Run `npx playwright test` locally first |
| **Git is automated** | User never touches git | Claude handles all git operations |
| **One feature branch per session** | Keeps branches clean | Delete after merge, create fresh branch next session |

---

## ✋ When to Stop & Ask User

1. **Unclear requirements** — User hasn't described what to fix
2. **Scope creep** — Task expanded beyond original ask
3. **Blocker** — External dependency needed (API not ready, DB config missing)
4. **Multiple valid approaches** — No clear right answer, user judgment needed
5. **Risk** — Change might break other systems, need user approval

**How to ask**: Short, specific question. Propose option A vs B. Wait for clear answer before proceeding.

---

## 📊 Session Metrics (Track)

- **Tests passing**: Should be 116/116
- **Commits**: Atomic, clear messages
- **PR**: Title < 70 chars, body explains why
- **Time**: Keep it reasonable (if spiraling, ask for scope adjustment)
- **Blockers**: Zero at end of session (or clearly documented for next session)

---

## Example: Good Session Flow

```
Morning: Read CLAUDE.md, BACKLOG.md, BEHAVIORAL_RULES.md → Understand priorities

User says: "Fix the captain selection bug"

Session:
  1. Find captain selection code in SquadScreen.jsx
  2. Identify root cause (roulette selecting bench players)
  3. Fix code
  4. Test: npm run lint && npx playwright test
  5. Commit: "Fix: Roulette restricted to starting XI only"
  6. Push: git push origin claude/fix-captain-selection
  7. Create PR with summary + test results
  8. Check CI → all green
  9. Merge PR
  10. Update BACKLOG.md
  11. Verify Vercel deployment

Evening: BACKLOG.md shows session summary. Next session reads it. No confusion.
```

---

## Next Reading

- **BEHAVIORAL_RULES.md** — How to approach work decisions
- **GIT_WORKFLOW_GUIDE.md** — Detailed git procedures (for reference, not usually needed)
- **CLAUDE.md** — Tech stack and current project status
