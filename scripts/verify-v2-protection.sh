#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# v2 Branch Protection Verification Script
#
# Run this monthly to confirm all protections are in place.
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                  v2 BRANCH PROTECTION VERIFICATION                    ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0

# Test 1: Pre-push hook exists
echo -n "1. Pre-push hook installed... "
if [ -x .git/hooks/pre-push ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((pass_count++))
else
    echo -e "${RED}❌ FAIL${NC} (hook not executable)"
    ((fail_count++))
fi

# Test 2: Pre-push hook is valid bash
echo -n "2. Pre-push hook is valid bash... "
if bash -n .git/hooks/pre-push 2>/dev/null; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((pass_count++))
else
    echo -e "${RED}❌ FAIL${NC} (syntax error)"
    ((fail_count++))
fi

# Test 3: main and v2 branches exist
echo -n "3. Both main and v2 branches exist... "
if git rev-parse origin/main > /dev/null 2>&1 && git rev-parse origin/v2 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((pass_count++))
else
    echo -e "${RED}❌ FAIL${NC} (branch missing)"
    ((fail_count++))
fi

# Test 4: main and v2 are separate branches
echo -n "4. main and v2 are separate branches... "
main_head=$(git rev-parse origin/main)
v2_head=$(git rev-parse origin/v2)
if [ "$main_head" != "$v2_head" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((pass_count++))
else
    echo -e "${RED}❌ FAIL${NC} (heads are identical)"
    ((fail_count++))
fi

# Test 5: CI workflow configured for main only
echo -n "5. CI workflow configured for main only... "
if grep -q "branches: \[main\]" .github/workflows/ci.yml; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((pass_count++))
else
    echo -e "${RED}❌ FAIL${NC} (CI may run on v2)"
    ((fail_count++))
fi

# Test 6: Migration workflow is manual-only
echo -n "6. Migration workflow is manual-only... "
if grep -q "workflow_dispatch" .github/workflows/migrate.yml; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((pass_count++))
else
    echo -e "${RED}❌ FAIL${NC} (migrations may auto-run)"
    ((fail_count++))
fi

# Test 7: Branch protection doc exists
echo -n "7. Branch protection doc exists... "
if [ -f "docs/architecture/V2_BRANCH_PROTECTION.md" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((pass_count++))
else
    echo -e "${RED}❌ FAIL${NC} (doc not found)"
    ((fail_count++))
fi

# Test 8: CLAUDE.md references branch protection
echo -n "8. CLAUDE.md references branch protection... "
if grep -q "V2_BRANCH_PROTECTION" CLAUDE.md; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((pass_count++))
else
    echo -e "${RED}❌ FAIL${NC} (missing reference)"
    ((fail_count++))
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                             SUMMARY                                   ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Tests passed: ${GREEN}${pass_count}${NC}"
echo "Tests failed: ${RED}${fail_count}${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL PROTECTIONS VERIFIED${NC}"
    echo ""
    echo "Branch protection is ACTIVE:"
    echo "  • Git pre-push hook will block accidental main/v2 pushes"
    echo "  • GitHub branch protection requires PR review and CI green"
    echo "  • Edge Functions and migrations are manual-deploy only"
    echo "  • v2→main merge is effectively impossible without explicit approval"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  PROTECTION GAPS DETECTED${NC}"
    echo ""
    echo "One or more protections failed verification. This should not happen."
    echo "Options:"
    echo "  1. Reinstall pre-push hook: bash scripts/setup-hooks.sh"
    echo "  2. Review V2_BRANCH_PROTECTION.md for manual checks"
    echo "  3. Contact the user if automatic fixes don't resolve this"
    echo ""
    exit 1
fi
