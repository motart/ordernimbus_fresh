# Branch Protection Rules

This document outlines the branch protection rules that must be configured in GitHub repository settings.

## Protected Branches

### Main Branch (`main`)

**Settings → Branches → Add rule**

Pattern: `main`

#### Required Settings:

✅ **Require a pull request before merging**
- ✅ Require approvals: 1
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require review from CODEOWNERS (if applicable)

✅ **Require status checks to pass before merging**
- ✅ Require branches to be up to date before merging
- **Required status checks:**
  - `All Tests Pass`
  - `Unit Tests`
  - `Backend Tests`
  - `Frontend Tests`
  - `Security Scan`
  - `Code Quality`

✅ **Require conversation resolution before merging**

✅ **Include administrators** (optional, recommended for production)

✅ **Restrict who can push to matching branches** (optional)
- Add specific teams or users who can push

### Production Branch (`production`)

Pattern: `production`

#### Required Settings:

✅ **Require a pull request before merging**
- ✅ Require approvals: 2
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require review from CODEOWNERS

✅ **Require status checks to pass before merging**
- ✅ Require branches to be up to date before merging
- **Required status checks:**
  - `All Tests Pass`
  - `Unit Tests`
  - `Backend Tests`
  - `Frontend Tests`
  - `E2E Tests`
  - `Integration Tests`
  - `Security Scan`
  - `Code Quality`

✅ **Require conversation resolution before merging**

✅ **Include administrators**

✅ **Restrict who can push to matching branches**
- Only senior developers and DevOps team

### Staging Branch (`staging`)

Pattern: `staging`

#### Required Settings:

✅ **Require a pull request before merging**
- ✅ Require approvals: 1
- ✅ Dismiss stale pull request approvals when new commits are pushed

✅ **Require status checks to pass before merging**
- **Required status checks:**
  - `All Tests Pass`
  - `Unit Tests`
  - `Backend Tests`
  - `Frontend Tests`
  - `Security Scan`

✅ **Require conversation resolution before merging**

## How to Configure in GitHub

1. Go to repository **Settings**
2. Navigate to **Branches** in the left sidebar
3. Click **Add rule**
4. Enter the branch name pattern (e.g., `main`)
5. Configure the protection rules as listed above
6. Click **Create** or **Save changes**

## Status Checks Configuration

The following GitHub Actions workflows provide the required status checks:

- `.github/workflows/pr-tests.yml` - Runs all test suites
- `.github/workflows/security-scan.yml` - Security scanning (if separate)
- `.github/workflows/deploy.yml` - Deployment workflow (if applicable)

## Required GitHub Actions Secrets

Configure these in **Settings → Secrets and variables → Actions**:

- `AWS_ACCESS_KEY_ID` - AWS credentials for integration tests
- `AWS_SECRET_ACCESS_KEY` - AWS credentials for integration tests
- `AWS_REGION` - AWS region (us-west-1)
- `COGNITO_USER_POOL_ID` - For auth tests
- `COGNITO_CLIENT_ID` - For auth tests

## PR Workflow

1. **Create feature branch** from `main` or `develop`
   ```bash
   git checkout -b feature/UC###-description
   ```

2. **Make changes** and commit
   ```bash
   git add .
   git commit -m "feat: implement UC### - description"
   ```

3. **Push branch** to GitHub
   ```bash
   git push origin feature/UC###-description
   ```

4. **Create Pull Request**
   - Go to GitHub repository
   - Click "Compare & pull request"
   - Fill in PR template
   - Wait for all checks to pass

5. **Review Process**
   - Automated tests run
   - Code review by team member
   - Address feedback
   - All checks must be green

6. **Merge**
   - Once approved and all checks pass
   - Squash and merge (recommended)
   - Delete feature branch

## Commit Message Convention

Follow conventional commits for better automation:

- `feat:` - New feature
- `fix:` - Bug fix
- `test:` - Adding tests
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `style:` - Formatting, no code change
- `perf:` - Performance improvement
- `ci:` - CI/CD changes
- `chore:` - Maintenance

Example: `feat: implement UC001 - user registration with email verification`

## Bypass Rules (Emergency Only)

For emergency hotfixes, repository admins can:
1. Temporarily disable branch protection
2. Make direct commits
3. Re-enable protection

⚠️ **This should be documented and reviewed post-incident**