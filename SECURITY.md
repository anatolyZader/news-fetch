# Security

Supply-chain and CI security practices for this repository.

## Organization and repository settings (manual, one-time)

Repository admins should configure:

1. **Two-factor authentication** — Require 2FA for all org members (GitHub: Organization → Settings → Security).
2. **Secret scanning and push protection** — Enable under Settings → Code security and analysis.
3. **Branch protection on `main`** (and release branches if used):
   - Require pull request reviews before merging
   - Require status checks to pass (see [Required CI checks](#required-ci-checks))
   - Do not allow force pushes
   - Dismiss stale pull request approvals when new commits are pushed (recommended for dependency changes)
4. **GitHub Actions workflow permissions** — Settings → Actions → General → **Read and write** (needed for doc-sync bot pushes). See [.github/CI-SETUP.md](.github/CI-SETUP.md).

Detailed UI steps: [.github/CI-SETUP.md](.github/CI-SETUP.md) Part 1.

## Required CI checks

When configuring branch protection, require these **job names** (as shown in the Actions UI):

| Check name | Workflow |
|------------|----------|
| Validate | CI |
| Lint | CI |
| Test | CI |
| Build client | CI |
| Build docs site | CI |
| Security audit | CI |
| Dependency review | Dependency review (pull requests only) |

Optional: **SonarCloud** (only if `SONAR_TOKEN` and related secrets are configured).

Usually **do not** require **Sync main documentation** — it may push a follow-up commit on PRs.

## Dependency and lockfile policy

- All installs in CI use `npm ci` (never `npm install`).
- Lockfiles are required: root, `client/`, and `docs-site/`.
- Dependency changes go through PR review; see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).
- Dependabot opens grouped weekly PRs; merge after CI passes.
- CI enforces **min-release-age = 7 days** for npm packages (see below).

## min-release-age (CI only)

CI installs use npm 11.10+ with `min-release-age=7` so freshly published package versions are not installed without a cooling-off period. Local development is not restricted unless you opt in via `.npmrc`.

**Exceptions** (document the reason in the PR):

1. Add the label **`security-exception`** to the pull request, or
2. Re-run the **CI** workflow via **Actions → CI → Run workflow** with **Skip min-release-age check** enabled (emergency CVE fixes only).

Do not auto-skip this check for Dependabot or other bots.

## Fork pull requests

- Workflows must not expose repository `secrets.*` to `pull_request` runs from forks.
- Do not use `pull_request_target` unless you fully understand the threat model.
- Fork PRs cannot receive doc-sync bot pushes; authors run `npm run docs:sync` locally.

## AI-assisted development

- Code from AI tools (Cursor, Copilot, etc.) goes through the **same** review, tests, `npm audit`, and Dependency Review as human-written code.
- Do not relax checks because a bot authored the diff.
- AI tools must **not** receive production secrets, deploy keys, or write access to production infrastructure.
- Use read-only or staging credentials when agents need API access.

## Reporting vulnerabilities

If you discover a security issue, contact the repository maintainers privately rather than opening a public issue with exploit details.
