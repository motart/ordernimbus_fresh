# Pull Request Workflow

## 🔒 Mandatory PR Process

**All code changes MUST go through a Pull Request. No direct commits to main, staging, or production branches.**

## 📋 PR Requirements

### Before Creating a PR

1. **All tests must pass locally**
   ```bash
   npm run test:all
   ```

2. **Frontend builds successfully**
   ```bash
   cd app/frontend && npm run build
   ```

3. **No console.log statements**
   ```bash
   grep -r "console.log" src/
   ```

4. **No hardcoded credentials or secrets**

### Automated Checks (GitHub Actions)

Every PR automatically runs:

| Check | Description | Required to Pass |
|-------|-------------|-----------------|
| **Unit Tests** | All backend and frontend unit tests | ✅ Yes |
| **Backend Tests** | Lambda function tests | ✅ Yes |
| **Frontend Tests** | React component tests | ✅ Yes |
| **E2E Tests** | Selenium browser automation tests | ✅ Yes |
| **Integration Tests** | API endpoint tests | ✅ Yes |
| **Security Scan** | Checks for vulnerabilities and secrets | ✅ Yes |
| **Code Quality** | ESLint and TypeScript checks | ✅ Yes |

## 🚀 Step-by-Step PR Process

### 1. Create Feature Branch

```bash
# Always branch from main
git checkout main
git pull origin main

# Create feature branch with UC number
git checkout -b feature/UC###-brief-description

# Example
git checkout -b feature/UC001-user-registration
```

### 2. Make Your Changes

```bash
# Implement your feature
# Add tests for new functionality
# Update documentation
```

### 3. Run Tests Locally

```bash
# Run all tests before committing
npm run test:all

# Or run specific test suite
npm run test:uc001  # For specific use case
npm run test:unit   # Just unit tests
npm run test:e2e    # Just E2E tests
```

### 4. Commit Your Changes

```bash
# Stage your changes
git add .

# Commit with conventional message
git commit -m "feat(UC001): implement user registration with email verification"

# Pre-commit hook will run automatically
```

#### Commit Message Format
```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `test`: Adding tests
- `docs`: Documentation
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `ci`: CI/CD changes

### 5. Push to GitHub

```bash
# Push your branch
git push origin feature/UC###-brief-description

# Pre-push hook will run tests
```

### 6. Create Pull Request

1. Go to GitHub repository
2. Click "Compare & pull request"
3. Fill out the PR template:
   - Use case ID
   - Description
   - Test results
   - Checklist

### 7. Wait for Automated Checks

GitHub Actions will automatically run:
- All test suites
- Security scanning
- Code quality checks

**All checks must be green ✅**

### 8. Code Review

- At least 1 approval required for `main` and `staging`
- At least 2 approvals required for `production`
- Address all review comments
- Re-run tests after changes

### 9. Merge

Once approved and all checks pass:
1. Click "Squash and merge"
2. Edit commit message if needed
3. Delete feature branch

## 🛡️ Branch Protection Rules

### Main Branch
- ✅ Requires PR
- ✅ Requires 1 approval
- ✅ Requires all status checks to pass
- ✅ Requires branches to be up to date
- ✅ Requires conversation resolution

### Production Branch
- ✅ Requires PR
- ✅ Requires 2 approvals
- ✅ Requires all status checks to pass
- ✅ Include administrators
- ✅ Restrict push access

## 🚨 Emergency Hotfix Process

For critical production issues only:

1. Create hotfix branch from production
   ```bash
   git checkout production
   git checkout -b hotfix/critical-issue
   ```

2. Fix the issue with minimal changes

3. Create PR directly to production

4. Get expedited review (still requires approval)

5. After merge, backport to main
   ```bash
   git checkout main
   git cherry-pick <hotfix-commit>
   ```

## 📊 Test Reports

Test results are available in:
- **GitHub Actions**: Check the "Actions" tab
- **PR Comments**: Bot will comment test results
- **Artifacts**: Download test reports and screenshots

## 🔧 Local Setup

### Install Git Hooks

```bash
# Install husky
npm install

# This will set up pre-commit and pre-push hooks
npm run prepare
```

### Hooks Installed
- **pre-commit**: Runs unit tests and checks for secrets
- **pre-push**: Runs comprehensive tests based on target branch

## 📝 PR Template Fields

When creating a PR, you must fill out:

- **Use Case ID**: UC### reference
- **Type of Change**: Feature/Bug/Breaking/Docs/Test/Refactor
- **Description**: What and why
- **Testing**: What tests were run
- **Checklist**: All items must be checked
- **Screenshots**: If UI changes
- **Related Issues**: Link to issues

## ❌ What NOT to Do

- **Never** push directly to main, staging, or production
- **Never** merge without approval
- **Never** merge with failing tests
- **Never** commit secrets or API keys
- **Never** skip the PR template
- **Never** force push to shared branches
- **Never** merge without resolving conversations

## 🎯 Best Practices

1. **Keep PRs small and focused**
   - One feature per PR
   - Easier to review
   - Faster to merge

2. **Write descriptive PR titles**
   - Include UC number
   - Clear description
   - Example: "feat(UC001): Add email verification to registration flow"

3. **Update tests**
   - Add tests for new features
   - Update tests for changes
   - Ensure all tests pass

4. **Document your changes**
   - Update USE_CASES.md
   - Add code comments
   - Update README if needed

5. **Respond to reviews promptly**
   - Address feedback
   - Ask questions if unclear
   - Re-request review after changes

## 📚 Resources

- [GitHub Actions Workflows](.github/workflows/)
- [Branch Protection Rules](.github/branch-protection-rules.md)
- [PR Template](.github/pull_request_template.md)
- [Use Cases](USE_CASES.md)
- [Testing Guide](tests/README.md)

---

**Remember: Quality over speed. A well-tested PR saves time in the long run.**