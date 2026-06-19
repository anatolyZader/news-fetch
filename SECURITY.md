# Security

Supply-chain and CI security practices for this repository.

## Organization and repository settings (manual, one-time)

Repository admins should configure:

1. **Two-factor authentication** — Require 2FA for all org members (GitHub: Organization → Settings → Security).
2. **Secret scanning and push protection** — Enable under Settings → Code security and analysis.
3. **Branch protection on `dev`** (and release branches if used):
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
| Red Team review | CI |
| Integrity verify | CI |
| Dependency review | Dependency review (pull requests only) |

Optional: **SonarCloud** (only if `SONAR_TOKEN` and related secrets are configured). **Red Team review** skips when `ANTHROPIC_API_KEY` is unset.

Usually **do not** require **Sync main documentation** — it may push a follow-up commit on PRs.

## AIS security controls (Phase 0)

Bounded CI scripts in `scripts/` and [`cross-cut-modules/security/`](cross-cut-modules/security/):

| Control | Script / job | Behavior |
|---------|----------------|----------|
| Red Team LLM review | `npm run security:red-team` / **Red Team review** | Attacker mindset on git diff; **fails CI on CRITICAL** |
| Integrity manifest | `npm run security:integrity:verify` / **Integrity verify** | SHA-256 of lockfiles, configs, `client/dist`; fails on drift |
| Supply chain | `npm run security:supply-chain` / **Security audit** | `npm audit` + osv-scanner + lockfile maintainer warnings |
| Outbound fetch audit | `npm run security:check-fetch` / **Lint** | Static scan for raw `fetch()` on user-URL paths |
| Tiered notifications | `notifySecurityEvent()` | Audit log always; Telegram on WARNING/CRITICAL when configured |

**Post-deploy (pm2 host):** after `npm ci && npm run client:build && pm2 restart news`, run `npm run security:integrity:verify`. If lockfiles or build output changed intentionally, run `npm run security:integrity:record` and commit [`security/integrity-baseline.json`](security/integrity-baseline.json). **Client dist hashes are CI-canonical** — when `client/` changes, run the **Record integrity baseline** GitHub Actions workflow and commit the uploaded artifact (local Vite output may differ from CI).

**Optional secrets:** `ANTHROPIC_API_KEY` (Red Team), `TELEGRAM_BOT_TOKEN` + `TELEGRAM_SECURITY_CHAT_ID` (alerts). See [.github/CI-SETUP.md](.github/CI-SETUP.md).

**Weekly cron:** [`.github/workflows/security-integrity.yml`](.github/workflows/security-integrity.yml) re-runs integrity verify on main.

## Dependency and lockfile policy

- All installs in CI use `npm ci` (never `npm install`).
- Lockfiles are required: root, `client/`, and `tools/docs-site/`.
- Dependency changes go through PR review; see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).
- Dependabot opens grouped weekly PRs; merge after CI passes.
- CI **maintainer-change warnings** (`security:supply-chain`) complement Dependabot review when lockfile versions change.
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

- **security.txt**: `/.well-known/security.txt` (also at [.well-known/security.txt](.well-known/security.txt) in the repo — update contact email before production).
- **Production hardening**: see [cross-cut-modules/docs/content/pages/operations/edge-security.md](cross-cut-modules/docs/content/pages/operations/edge-security.md), [siem-alerts.md](cross-cut-modules/docs/content/pages/operations/siem-alerts.md), and [backup-restore.md](cross-cut-modules/docs/content/pages/operations/backup-restore.md).

## Application security controls (production)

When `NODE_ENV=production`, the server enforces:

- `AUTH_REQUIRED=true`, `FIREBASE_PROJECT_ID`, `FIREBASE_CHECK_REVOKED=true`, `TRUST_PROXY=true`, `ENABLE_HSTS=true` (startup validation)
- `GOOGLE_APPLICATION_CREDENTIALS` must **not** be set (use runtime service account)
- `SECURITY_CONTACT_EMAIL` (dynamic `/.well-known/security.txt`)
- `ENABLE_SWAGGER` must not be `true` (startup fails)
- Default bind `127.0.0.1` unless `HOST` or `ALLOW_PUBLIC_BIND=true`
- Helmet security headers, `@fastify/rate-limit`, SSRF guard on user URL fetches
- WhatsApp webhook `X-Hub-Signature-256` (required in production when webhooks enabled)
- Firebase App Check required on costly routes (`APP_CHECK_ENFORCE=true` in production)
- HTTP daily budget gate on LLM/OSINT API routes (`DAILY_BUDGET_USD`)
- Evidence LLM analysis quota in SQLite (`EVIDENCE_ANALYSIS_DAILY_LIMIT`, optional)
- DNS-aware SSRF checks on outbound `safeFetch` and video download URL resolution
- Per-route rate limits including report-build, catalog generate, video download, and WhatsApp webhooks
- SBOM artifact generated in CI (`SBOM` job)
