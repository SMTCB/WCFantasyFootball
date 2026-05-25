# Git & Code Repository Walkthrough

## For Non-Developers: How Your App Gets Updated

You don't need to understand git branches, pull requests, or technical jargon. Here's the simple mental model:

### The Three-Step Cycle

**1. Claude works on a new feature or bug fix**
   - Claude creates an isolated workspace (a "branch") for the work
   - Code changes happen in this isolated space, never touching the live version
   - Prevents broken code from accidentally going live

**2. Claude commits and pushes to GitHub**
   - Changes are saved to your GitHub repository
   - A "pull request" (PR) is created — this is just a proposal saying "I've fixed this, here's what changed"
   - GitHub automatically runs tests to verify nothing broke

**3. Claude merges to main**
   - **This is the critical step for going live**
   - The fixed code is merged into the `main` branch
   - Vercel sees the update to `main` and automatically deploys it within 30-60 seconds
   - Your live app at https://wc-fantasy-football.vercel.app is updated

### The Golden Rule

**For every bug correction or new feature: merge to the main branch on GIT.**

This is what makes your Vercel app update. Without this step, code stays in a feature branch and never reaches your live app.

### What You See

- **GitHub**: Your repo where code lives. PRs show up here for review.
- **Vercel**: Your live app. Always pulling the latest code from the `main` branch on GitHub.
- **Your Vercel Link**: https://wc-fantasy-football.vercel.app — what your testers use.

### Timeline

| Step | Time | What Happens |
|------|------|---|
| Claude starts | 0 min | Feature branch created, work begins |
| Claude finishes | ~30-60 min | Code complete, tests passing, PR created |
| Claude merges | ~61 min | Main branch updated, Vercel triggers build |
| You see it live | ~62-90 min | Vercel deployment done, live app updated |

### Pre-Launch Checklist (What Happens Next)

Once code is merged to main and live on Vercel:
1. ✅ Test the app yourself at the Vercel link
2. ✅ Verify the fix or feature works
3. ✅ Share the Vercel link with testers

### Deployment Requires

- Code on `main` branch (via PR merge)
- No breaking tests
- Vercel connected to GitHub (already done)

---

## Claude's Workflow (Transparent to You)

When you ask Claude to build something:

```
1. git pull origin main              # Get latest code
2. git checkout -b claude/feature    # Create isolated workspace
3. [Edit code, test locally]
4. git add . && git commit -m "..."  # Save changes
5. git push origin claude/feature    # Push to GitHub
6. gh pr create                      # Create pull request
7. [GitHub tests run automatically]
8. gh pr merge --squash              # MERGE TO MAIN ← THIS IS KEY
9. Vercel auto-deploys               # 30-60 seconds, live app updates
```

You only need to know step 8 exists and that it makes your live app update.

---

## FAQ

**Q: Why not just deploy directly?**  
A: Branches prevent accidents. If code breaks, it's isolated and never reaches your live app.

**Q: Can I see what changed?**  
A: Yes — check GitHub pull requests. Each PR shows exactly what was added/fixed.

**Q: What if something goes wrong?**  
A: Vercel keeps the previous version. Claude reverts the bad code, creates a fix, and merges again.

**Q: How often does the app update?**  
A: Whenever Claude merges a PR to main. Could be once a day, could be multiple times.

---

## Remember

**Main branch = Live app**  
**Feature branch = Safe workspace**  
**Merge to main = Your live app updates**

That's it.
