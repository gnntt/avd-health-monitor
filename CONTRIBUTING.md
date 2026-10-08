# Contributing to AVD Health Monitor

Thank you for your interest in contributing to AVD Health Monitor!

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated changelog generation and semantic versioning via [Release Please](https://github.com/googleapis/release-please).

### Commit Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | Minor (0.1.0 → 0.2.0) |
| `fix` | Bug fix | Patch (0.1.0 → 0.1.1) |
| `perf` | Performance improvement | Patch |
| `docs` | Documentation changes | None |
| `style` | Code style changes (formatting, etc.) | None |
| `refactor` | Code refactoring | None |
| `test` | Adding or updating tests | None |
| `chore` | Build process, dependencies, tooling | None |
| `ci` | CI/CD changes | None |
| `deps` | Dependency updates | Patch (if user-facing) |

### Breaking Changes

To indicate a breaking change, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```
feat!: redesign settings API

BREAKING CHANGE: Settings API has been completely redesigned.
Old settings files are not compatible.
```

This triggers a **major** version bump (0.1.0 → 1.0.0).

### Examples

#### Good Examples ✅

```
feat: add custom endpoint configuration
```

```
fix: resolve favicon flickering during tests

The tab icon was flickering when latency values changed rapidly.
This fix implements debouncing to prevent excessive icon updates.

Fixes #123
```

```
perf: optimize latency test parallelization

Reduced latency test time by 40% by running endpoint tests in parallel.
```

```
deps: bump recharts from 3.6.0 to 3.6.1
```

```
docs: update usage instructions
```

```
chore: configure release-please automation
```

#### Bad Examples ❌

```
updated readme
```
*Missing type prefix*

```
Fix bug
```
*Not descriptive, missing type*

```
feat: added some stuff
```
*Too vague*

### Scopes (Optional)

You can add a scope to provide more context:

```
feat(ui): add dark mode toggle
fix(latency): correct timeout handling
docs(api): update command documentation
```

Common scopes:
- `ui` - User interface changes
- `latency` - Latency testing logic
- `status` - Tab icon, title and notifications
- `settings` - Settings management
- `ci` - CI/CD workflows
- `deps` - Dependencies

## Development Workflow

### 1. Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Commit using conventional commit format:
   ```bash
   git commit -m "feat: add new feature"
   ```

4. Push and create a pull request

### 2. Release Process

Releases are **fully automated** via Release Please:

1. **Commits to main** trigger the release-please workflow
2. **Release Please** analyzes commits and creates/updates a Release PR
3. The Release PR contains:
   - Updated `CHANGELOG.md`
   - Version bump in `package.json`
4. **Merge the Release PR** to trigger the release workflow:
   - Builds the single-file web page (`avd-health-monitor.html`)
   - Creates GitHub release with changelog
   - Uploads the page as a release asset
5. **GitHub Release** is published automatically

**You don't need to manually update versions or create releases!**

## Setting Up Development Environment

### Prerequisites

- **Node.js** 22+ and **pnpm** 10+

### Setup

```bash
# Install frontend dependencies
pnpm install

# Run development server
pnpm dev

# Run tests
pnpm test:run

# Build the single-file page (dist/index.html)
pnpm build
```

## Code Quality

### Running Tests

```bash
pnpm test:run
```

### Linting

```bash
pnpm exec tsc --noEmit
```

## Pull Request Guidelines

1. **Use conventional commits** for all commits
2. **Write tests** for new features
3. **Update documentation** if needed
4. **Keep PRs focused** - one feature/fix per PR
5. **Describe changes** in PR description
6. **Link related issues** using `Fixes #123` or `Closes #456`

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about contributing

Thank you for contributing! 🎉
