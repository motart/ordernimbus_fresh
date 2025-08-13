#!/bin/bash

# Auto PR Creation Script
# Automatically creates a PR to develop branch after pushing changes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔄 Auto PR Creation to develop branch"
echo "====================================="

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

# Check if we're on a protected branch
if [[ "$CURRENT_BRANCH" == "main" ]] || [[ "$CURRENT_BRANCH" == "develop" ]] || [[ "$CURRENT_BRANCH" == "staging" ]] || [[ "$CURRENT_BRANCH" == "production" ]]; then
    echo -e "${RED}❌ ERROR: Cannot create PR from protected branch '$CURRENT_BRANCH'${NC}"
    echo -e "${YELLOW}Please create a feature branch first:${NC}"
    echo "  git checkout -b feature/UC###-description"
    exit 1
fi

# Check if branch starts with feature/
if [[ ! "$CURRENT_BRANCH" =~ ^feature/ ]]; then
    echo -e "${YELLOW}⚠️  Warning: Branch name should start with 'feature/'${NC}"
    echo "  Recommended format: feature/UC###-description"
fi

# Extract UC number from branch name if present
UC_NUMBER=""
if [[ "$CURRENT_BRANCH" =~ UC([0-9]+) ]]; then
    UC_NUMBER="UC${BASH_REMATCH[1]}"
    echo "📋 Use Case: $UC_NUMBER"
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  You have uncommitted changes. Committing them first...${NC}"
    git add -A
    
    # Generate commit message
    if [[ -n "$UC_NUMBER" ]]; then
        COMMIT_MSG="feat($UC_NUMBER): auto-commit for PR"
    else
        COMMIT_MSG="feat: auto-commit for PR"
    fi
    
    git commit -m "$COMMIT_MSG"
fi

# Push current branch
echo "📤 Pushing branch to origin..."
git push -u origin "$CURRENT_BRANCH" 2>/dev/null || git push origin "$CURRENT_BRANCH"

# Create PR using GitHub CLI
echo "🔄 Creating PR to develop branch..."

# Generate PR title
if [[ -n "$UC_NUMBER" ]]; then
    PR_TITLE="feat($UC_NUMBER): $(echo $CURRENT_BRANCH | sed 's/feature\///' | sed 's/-/ /g')"
else
    PR_TITLE="feat: $(echo $CURRENT_BRANCH | sed 's/feature\///' | sed 's/-/ /g')"
fi

# Create PR body
PR_BODY="## 📋 Auto-Generated PR

### Branch
\`$CURRENT_BRANCH\` → \`develop\`

### Use Case
${UC_NUMBER:-'Not specified'}

### Type of Change
- [ ] 🆕 New feature
- [ ] 🐛 Bug fix
- [ ] 📝 Documentation
- [ ] 🧪 Tests
- [ ] ♻️ Refactoring

### Testing
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Manual testing complete

### Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] No console.log statements
- [ ] No hardcoded values
- [ ] Tests added/updated
- [ ] Documentation updated

---
*This PR was automatically created by auto-pr.sh*"

# Check if PR already exists
EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --base develop --state open --json number --jq '.[0].number' 2>/dev/null || echo "")

if [[ -n "$EXISTING_PR" ]]; then
    echo -e "${YELLOW}ℹ️  PR #$EXISTING_PR already exists for this branch${NC}"
    echo "View it at: $(gh pr view $EXISTING_PR --json url --jq '.url')"
    
    # Update PR if title changed
    gh pr edit $EXISTING_PR --title "$PR_TITLE" 2>/dev/null || true
else
    # Create new PR
    PR_URL=$(gh pr create \
        --base develop \
        --head "$CURRENT_BRANCH" \
        --title "$PR_TITLE" \
        --body "$PR_BODY" \
        --assignee @me \
        2>/dev/null || echo "")
    
    if [[ -n "$PR_URL" ]]; then
        echo -e "${GREEN}✅ PR created successfully!${NC}"
        echo "📎 PR URL: $PR_URL"
        
        # Open in browser
        echo "Opening PR in browser..."
        gh pr view --web 2>/dev/null || true
    else
        echo -e "${RED}❌ Failed to create PR${NC}"
        echo "You can create it manually at:"
        echo "https://github.com/motart/ordernimbus/compare/develop...$CURRENT_BRANCH"
    fi
fi

# Show test status
echo ""
echo "⏳ Waiting for GitHub Actions to start..."
sleep 5

# Watch PR checks
echo "📊 PR Test Status:"
gh pr checks --watch 2>/dev/null || echo "Run 'gh pr checks' to see test status"

echo ""
echo -e "${GREEN}✅ Done!${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor test results"
echo "2. Fix any failing tests"
echo "3. Request code review"
echo "4. Merge when all checks pass"