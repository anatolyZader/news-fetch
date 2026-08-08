# GitHub Actions — secrets, permissions, and environment setup

This guide explains how to configure GitHub so the workflows in [`.github/workflows/`](./workflows/) run correctly: the main **[`ci.yml`](./workflows/ci.yml)** pipeline (every push and pull request) and the optional **[`resilience-live-llm.yml`](./workflows/resilience-live-llm.yml)** (weekly / manual live-LLM tests).

---

## Quick summary

| Workflow | When it runs | Secrets required? |
|----------|----------------|-------------------|
| **`ci.yml`** | Every `push` and `pull_request` | **None** for test/build/audit/doc sync. **SonarCloud:** three secrets (below) — job skips if `SONAR_TOKEN` is unset. **Red Team:** optional `ANTHROPIC_API_KEY` — job skips if unset. **Telegram alerts:** optional `TELEGRAM_BOT_TOKEN` + `TELEGRAM_SECURITY_CHAT_ID`. |
| **`security-integrity.yml`** | Weekly + manual | Optional Telegram secrets (same as CI). |
| **`dependency-review.yml`** | **`pull_request` only** | **None** — uses `GITHUB_TOKEN`; fails if the PR introduces a **high** severity dependency. |
| **`resilience-live-llm.yml`** | Mondays 06:00 UTC + manual | **Optional:** `ANTHROPIC_API_KEY` — without it, the job skips cleanly. |

You can run CI with **zero** secrets (SonarCloud skipped). For code quality gates and PR decoration, configure SonarCloud as in **Part 8** below.

---

## Part 1 — Required GitHub settings (one-time per repository)

These settings live in the GitHub web UI. You need **Admin** access on the repository (or org policy that lets you change Actions settings).

**Navigation path (always the same):**

1. Open `https://github.com/<OWNER>/<REPO>` (your repository home page).
2. Click the **Settings** tab (top bar; not visible if you only have read access).
3. In the left sidebar, click **Actions** → **General**.

The page has three areas that matter for this project: **Actions permissions**, **Workflow permissions**, and (separately) **branch protection** under **Settings → Branches**.

---

### 1.1 Actions permissions — allow workflows to run

**What it does:** If Actions are disabled or restricted too tightly, no workflow in `.github/workflows/` will run on push or pull request.

**Steps:**

1. On **Settings → Actions → General**, find the section **Actions permissions**.
2. Choose one of:
   - **Allow all actions and reusable workflows** — simplest; use this unless your organization forbids it.
   - **Allow \<ORG\> actions and reusable workflows** — common in companies; only actions from your org or GitHub Marketplace allow list run.
   - **Allow select actions…** — you must explicitly allow `actions/checkout`, `actions/setup-node`, `SonarSource/sonarqube-scan-action`, etc.
3. Scroll down and click **Save** (GitHub only applies changes after Save).

**How to verify:** Push any commit. Open the **Actions** tab on the repo. You should see a workflow run named **CI** (from `ci.yml`). If nothing appears, Actions may still be disabled at the **organization** level — ask an org owner to check **Organization → Settings → Actions**.

---

### 1.2 Workflow permissions — read/write for doc auto-commit

**What it does:** The **Sync main documentation** job runs `npm run docs:sync`, then `git commit` and `git push` when generated files differ from what is in git. By default, GitHub gives workflows **read-only** access to the repository. Read-only tokens cannot push, so doc sync fails with `403` unless you change this setting.

**What you do *not* need:** A Personal Access Token (PAT), fine-grained token, or deploy key for normal doc pushes. The workflow uses the automatic **`GITHUB_TOKEN`** that GitHub injects into every job. You only need PATs if you push to a *different* repository or use a third-party action that explicitly requires one.

**Steps:**

1. Still on **Settings → Actions → General**, scroll to **Workflow permissions**.
2. Select **Read and write permissions** (not “Read repository contents and packages permissions” only).
3. Under the same section, enable:
   - **Allow GitHub Actions to create and approve pull requests** — recommended when contributors open PRs **from branches in the same repo** (not from forks). The bot can then push doc-sync commits onto the PR branch so the PR stays up to date without manual `npm run docs:sync`.
4. Click **Save**.

**What each toggle means:**

| Setting | Effect on this repo |
|--------|---------------------|
| Read and write permissions | `GITHUB_TOKEN` can push doc-sync commits to branches the workflow is allowed to update. |
| Allow GitHub Actions to create and approve pull requests | Bot may update PR head branches and (if you use it) open/approve PRs; needed for doc commits on PR branches from the same repo. |
| Read repository contents only | Doc sync **will fail** on push with permission errors. |

**Repository-level vs organization-level:** If **Workflow permissions** is grayed out, your organization may enforce a default. Org owners: **Organization → Settings → Actions → General → Workflow permissions** — set default to read/write or allow repos to choose.

**How to verify doc-sync can push:**

1. Change something that affects generated docs (e.g. a field in `business_modules/resilience_scorer/domain/resilienceComponents.js`).
2. Push to a branch and open a PR (same repo, not a fork).
3. After **Sync main documentation** completes, either:
   - The job log says `Main documentation already up to date`, or
   - A new commit appears on the branch: `docs: sync main_docu_files from code [skip ci]` authored by `github-actions[bot]`.

---

### 1.3 Branch protection on `main` (or your default branch)

**What it does:** Protected branches can block direct pushes, require reviews, and require specific CI jobs to pass before merge. Doc sync and required checks must be compatible with those rules.

**Security checklist (2FA, secret scanning, dependency policy, AI rules):** see **[`SECURITY.md`](../SECURITY.md)** at the repository root.

**When you need this section:** Only if **Settings → Branches** shows a rule for `main` (or you use **Rulesets** under **Settings → Rules**).

#### 1.3.1 Allow `github-actions[bot]` to push doc updates

Doc sync pushes commits as **`github-actions[bot]`**. If branch protection says “only these people can push” or blocks all machine users, the push step fails even when workflow permissions are read/write.

**Classic branch protection rule (`Settings → Branches → Edit rule`):**

1. Open your rule for `main` (or `*` / default branch).
2. Check how pushes are restricted:
   - If **Restrict who can push to matching branches** is enabled, either:
     - Add **`github-actions[bot]`** to the allow list (if your plan/UI supports bots), or
     - Rely on doc-sync only on **PR branches** (not direct pushes to `main`), or
     - Temporarily disable restrict-push for the bot (team policy permitting).
   - If **Do not allow bypassing the above settings** is enabled for everyone, ensure there is an exception path for Actions or accept that doc-sync runs only on unprotected branches / via PR updates.
3. **Do not** require signed commits for `github-actions[bot]` unless you have configured commit signing for Actions (unusual).

**Repository rulesets (newer UI, `Settings → Rules → Rulesets`):**

1. Edit the ruleset that targets `main`.
2. Under **Bypass list**, add **Repository admin** as today, and consider whether **GitHub Actions** (or the specific workflow) should bypass **restrict updates** for doc-only commits. Many teams allow Actions to push to PR branches without bypassing `main` merge requirements.
3. Save the ruleset.

**Symptoms when the bot is blocked:**

- Log line: `remote: Permission to ... denied to github-actions[bot]`
- Or: `refusing to allow a GitHub Actions workflow to create or update pull requests`
- HTTP **403** on `git push` in the **Commit documentation updates** step

**Fix order:** (1) Workflow permissions read/write → (2) Allow Actions to create/update PRs → (3) Branch protection / ruleset bypass or allow bot on PR branches.

#### 1.3.2 Required status checks (merge gates)

To require CI before merge, add checks whose names match the workflow job `name:` field in [`.github/workflows/ci.yml`](./workflows/ci.yml):

| Job key in YAML | Name shown in GitHub UI (use this in branch protection) |
|---------------|--------------------------------------------------------|
| `validate` | **Validate** |
| `sync-main-docs` | **Sync main documentation** |
| `lint` | **Lint** |
| `test` | **Test** |
| `build-client` | **Build client** |
| `build-docs-site` | **Build docs site** |
| `security-audit` | **Security audit** |
| `sonarcloud` | **SonarCloud** (only if Sonar secrets are set; otherwise job is skipped) |

**Steps to add required checks:**

1. **Settings → Branches** → edit protection rule for `main`.
2. Enable **Require status checks to pass before merging**.
3. Enable **Require branches to be up to date before merging** (recommended so doc-sync + CI run on latest commit).
4. In the search box under status checks, type e.g. `Test` and select **Test** when it appears (GitHub learns check names after the workflow has run at least once on the default branch or a PR).
5. Repeat for **Validate**, **Lint**, **Build client**, **Build docs site**, **Security audit**, and optionally **SonarCloud**.
6. On PRs, require **Dependency review** (workflow `Dependency review`) after it has run once — recommended for supply-chain safety (see [`SECURITY.md`](../SECURITY.md)).
7. Save changes.

**Dependency inventory and quarterly review:** [`docs/DEPENDENCIES.md`](../docs/DEPENDENCIES.md).

**Notes:**

- **Sync main documentation** is usually *not* required for merge: it may push a follow-up commit (`[skip ci]`), which can confuse “up to date” rules. Require the test/build/audit jobs instead.
- Check names are the **job** `name:`, not the workflow file name `CI` and not the step name.
- Skipped jobs (e.g. SonarCloud without token) may not appear as required checks until they have run once.

#### 1.3.3 Direct pushes to `main` vs PR workflow

| Workflow | Doc sync on `main` push | Doc sync on PR from same repo | Doc sync on PR from fork |
|----------|-------------------------|-------------------------------|---------------------------|
| Typical | Bot may push follow-up commit to `main` | Bot may push to PR branch | **Skipped** (warning only) |

For forks, contributors must run `npm run docs:sync` locally (see Part 7).

---

### 1.4 Personal Access Tokens (PAT) — when you do **not** need one

| Goal | Use PAT? | Use instead |
|------|----------|-------------|
| Doc-sync push to same repo | **No** | `GITHUB_TOKEN` + read/write workflow permissions |
| Run tests / builds in CI | **No** | No token; public Actions checkout |
| SonarCloud analysis | **No** | `SONAR_TOKEN` from SonarCloud (not GitHub PAT) |
| Push to a different repo | Yes | PAT or GitHub App with appropriate scope |
| Trigger workflow in another repo | Yes | PAT or `workflow` scoped token |

---

### 1.5 Organization-owned repositories

If the repo is under a **GitHub Organization**:

1. **Organization → Settings → Actions → General** — confirm Actions are allowed for this repository.
2. **Policies → Workflow permissions** — if set to read-only org-wide, override per repo in **Repository → Settings → Actions** or change org default.
3. **Secrets** — org-level secrets (**Organization → Settings → Secrets and variables → Actions**) can be shared; repository secrets with the same name do not override org secrets (pick one level per secret name).

---

## Part 2 — Repository secrets and variables

GitHub stores sensitive values as **Secrets** (encrypted, not shown after save) and non-sensitive config as **Variables** (visible to admins, plain text).

**Navigation:**

1. Repository → **Settings**
2. **Secrets and variables** → **Actions**
3. Two tabs: **Secrets** (encrypted) and **Variables** (plain)

You need **Admin** or a custom role with `secrets` write access to add repository secrets.

---

### 2.1 How to add a repository secret (step by step)

1. Open **Settings → Secrets and variables → Actions**.
2. Stay on the **Secrets** tab (not Variables).
3. Click **New repository secret** (green button).
4. **Name** — type the exact name (case-sensitive, underscores as shown). Examples: `SONAR_TOKEN`, `ANTHROPIC_API_KEY`. Must match the workflow reference `${{ secrets.NAME }}`.
5. **Secret** — paste the value only (no quotes, no `KEY=value` prefix). For multiline keys (e.g. JSON service accounts), paste the full file contents.
6. Click **Add secret**.

**After saving:** GitHub never shows the value again. To rotate: open the secret → **Update** → paste new value.

**To delete:** Open the secret → **Remove secret** (workflows that reference it will see an empty value).

**Organization secrets:** If your org provides a secret with the same name, repository secrets **do not** override org secrets — avoid duplicate names unless intentional. Configure access under **Organization → Settings → Secrets and variables → Actions → Organization secrets → Repository access**.

---

### 2.2 Secrets wired in workflows today

#### SonarCloud (optional as a set of three)

| Secret | Required? | Workflow | What to put in the value |
|--------|-----------|----------|---------------------------|
| `SONAR_TOKEN` | Optional* | `ci.yml` → job **SonarCloud** | SonarCloud user token (see Part 8) |
| `SONAR_ORGANIZATION` | With Sonar* | same | Organization **key** from URL `sonarcloud.io/organizations/<key>` |
| `SONAR_PROJECT_KEY` | With Sonar* | same | Project key from SonarCloud → Project → **Information** |

\*If `SONAR_TOKEN` is missing, the **SonarCloud** job prints a notice and **exits successfully** (CI stays green). If `SONAR_TOKEN` is set but org/key are wrong, the job **fails** — set all three consistently.

**Detailed setup:** Part 8 below.

---

#### Anthropic (optional — Red Team + live LLM)

| Secret | Required? | Workflow | What to put in the value |
|--------|-----------|----------|---------------------------|
| `ANTHROPIC_API_KEY` | Optional | `ci.yml` → **Red Team review**; [`resilience-live-llm.yml`](./workflows/resilience-live-llm.yml) | API key from [Anthropic Console](https://console.anthropic.com/) → **API keys** |

**Red Team behavior without secret:** Job logs `ANTHROPIC_API_KEY not set — skipping Red Team review` and exits successfully.

**Red Team behavior with secret:** Runs `npm run security:red-team` on the PR/push diff; **fails CI** on CRITICAL findings.

**Live LLM behavior without secret:** Workflow runs on schedule (Mondays 06:00 UTC) or manual dispatch; first step detects empty key, logs `ANTHROPIC_API_KEY is not set; skipping live-LLM adversarial run`, and **does not** run tests (no failure).

**Live LLM behavior with secret:** Runs `npm test -- tests/business_modules/resilience_scorer/adversarial.test.js` with `RESILIENCE_LIVE_LLM=1` (costs real API usage).

---

#### Telegram security alerts (optional)

| Secret | Required? | Workflow | What to put in the value |
|--------|-----------|----------|---------------------------|
| `TELEGRAM_BOT_TOKEN` | Optional | `ci.yml` (Red Team, Security audit, Integrity verify); `security-integrity.yml` | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_SECURITY_CHAT_ID` | Optional | same | Chat ID for user alerts (numeric or `@channel`) |

When unset, `notifySecurityEvent()` still writes to the audit log; Telegram is skipped.

---

### 2.3 Optional secrets — not in workflows today (extend CI yourself)

These are **not** referenced in the current workflow files. Unit/integration tests **skip** live API calls when keys are absent. Add secrets only if you extend `ci.yml` to pass them into `npm test` or a dedicated job.

#### `NEWSAPI_API_KEY` / `NEWSAPI_AI_KEY` / `NEWSAPI_KEY`

| Item | Detail |
|------|--------|
| **Purpose** | Real HTTP call in `tests/articles.integration.test.js` |
| **Source** | [newsapi.ai](https://newsapi.ai) account → API key |
| **Local name** | `NEWSAPI_API_KEY` in root `.env` (see `docs/env.server.example`) |
| **CI today** | Test file skips when no key: *"skipped when not set (e.g. in CI without secrets)"* |

**If you wire it into CI later**, add to the **Test** job:

```yaml
- run: npm test
  env:
    NEWSAPI_API_KEY: ${{ secrets.NEWSAPI_API_KEY }}
```

Use **repository secret** name `NEWSAPI_API_KEY` (or align with whatever env name the test reads).

---

#### `OPENAI_API_KEY`

| Item | Detail |
|------|--------|
| **Purpose** | Recording/transcription integration tests (`recordAndTranscribe.integration.test.js`, etc.) |
| **Source** | [platform.openai.com](https://platform.openai.com/) → API keys |
| **CI today** | Tests call `t.skip('OPENAI_API_KEY not set...')` when missing |

**Cost warning:** Integration tests hit real OpenAI APIs. Prefer a separate scheduled workflow (like live LLM), not every PR, unless you accept cost and flakiness.

Also used for **RAG dense embeddings** (`cross-cut-modules/retrieval/`) when `VECTOR_INDEX_EMBEDDINGS` is not `0`.

---

#### `COHERE_API_KEY`

| Item | Detail |
|------|--------|
| **Purpose** | Chat RAG reranking (`cross-cut-modules/retrieval/cohereRerankAdapter.js`) |
| **Source** | [dashboard.cohere.com](https://dashboard.cohere.com/) → API keys |
| **CI today** | Not required; retrieval tests run FTS-only or skip rerank when missing |

Without this key, hybrid retrieval still works (RRF ordering only; one stderr notice per process).

---

### 2.4 Secrets vs variables — quick reference

| Store as **Secret** | Store as **Variable** |
|---------------------|------------------------|
| API keys (`ANTHROPIC_API_KEY`, `SONAR_TOKEN`, `VITE_FIREBASE_API_KEY`) | Public Firebase `authDomain`, `projectId` |
| Tokens, passwords | Docs base URL, feature flags |
| Private keys | Non-sensitive build IDs |

In workflow YAML: `${{ secrets.NAME }}` vs `${{ vars.NAME }}`.

---

### 2.5 Summary table (all secrets mentioned in this guide)

| Secret | In CI now? | Workflow | If missing |
|--------|------------|----------|------------|
| `SONAR_TOKEN` | Yes (optional) | `ci.yml` → SonarCloud | Sonar job skipped |
| `SONAR_ORGANIZATION` | Yes (with Sonar) | same | Sonar fails if token set but org wrong |
| `SONAR_PROJECT_KEY` | Yes (with Sonar) | same | Sonar fails if token set but key wrong |
| `ANTHROPIC_API_KEY` | Yes (optional) | `resilience-live-llm.yml` | Live LLM workflow skipped |
| `NEWSAPI_API_KEY` | No | — | Integration test skipped (default) |
| `OPENAI_API_KEY` | No | — | Integration tests skipped (default); RAG uses FTS-only |
| `COHERE_API_KEY` | No | — | Chat RAG skips Cohere rerank (RRF fallback) |
| `VITE_FIREBASE_API_KEY` | No | — | Client build still succeeds (see Part 4) |

---

## Part 3 — Environment variables in workflows

### 3.1 What CI sets automatically

You do **not** configure these in the GitHub UI:

| Variable / token | Set by | Used for |
|------------------|--------|----------|
| `GITHUB_TOKEN` | GitHub Actions | Checkout, and `git push` in `sync-main-docs` when permissions are read/write. |
| `NODE_VERSION` | `actions/setup-node` | Node **22.13+** from [`.nvmrc`](../.nvmrc) via `node-version-file` (required for built-in `node:sqlite`). |
| `CI=true` | GitHub Actions | Standard; Node/npm tools may change behavior when set. |

### 3.2 Environment variables in `ci.yml` jobs

| Job | Env vars | Notes |
|-----|----------|-------|
| `validate` | — | `npm run check:engines`, `npm run openapi:lint` (Redocly). |
| `sync-main-docs` | `BRANCH` (step env) | Branch to push doc commits to (`head_ref` on PRs, else ref name). |
| `lint` | — | `npx eslint . -f json -o eslint-report.json` (Sonar-aligned rules; uploads report for SonarCloud). |
| `test` | `GEO_ASSERT_ENVELOPE=1` | `npm run test:coverage` → LCOV artifact for SonarCloud. |
| `build-client` | — | Vite build does not require `VITE_*` at build time (see below). |
| `build-docs-site` | — | Docusaurus build only; no API keys. |
| `security-audit` | — | `node scripts/ci-audit.mjs` (high/critical except documented `xlsx`). |
| `sonarcloud` | `SONAR_TOKEN`, `SONAR_ORGANIZATION`, `SONAR_PROJECT_KEY` (via scanner `args`) | Runs after **Test** and **Lint**; downloads `coverage/lcov.info` and `eslint-report.json`; enforces Quality Gate (`sonar.qualitygate.wait=true`); needs `fetch-depth: 0` and `pull-requests: write` for PR decoration. |

### 3.3 `resilience-live-llm.yml` environment

| Variable | Source | Purpose |
|----------|--------|---------|
| `RESILIENCE_LIVE_LLM` | Hard-coded `'1'` in workflow | Turns on live LLM cases in adversarial tests. |
| `ANTHROPIC_API_KEY` | Secret `ANTHROPIC_API_KEY` | Anthropic API for live extraction cases. |

---

## Part 4 — Client build (`VITE_*`) and production parity

### 4.1 What CI does today

The **`build-client`** job in `ci.yml`:

```yaml
- run: npm ci --prefix client
- run: npm run client:build
```

It does **not** pass any `VITE_*` environment variables. Vite replaces `import.meta.env.VITE_*` at build time; missing values become `undefined` in the bundle.

| Outcome | Result |
|---------|--------|
| **CI build** | **Passes** — no Firebase config required for compile |
| **Built SPA auth** | **Broken until** you deploy a build that included real `VITE_*` values |
| **Local dev** | Use `client/.env.local` (see [`client/env.example`](../client/env.example)) |

Code checks: [`client/src/lib/firebaseClient.js`](../client/src/lib/firebaseClient.js) — `isFirebaseClientConfigured()` requires `apiKey`, `authDomain`, and `projectId`.

---

### 4.2 Where Firebase values come from (Firebase Console)

1. Open [Firebase Console](https://console.firebase.google.com/) → your project.
2. Click the gear → **Project settings**.
3. Under **Your apps**, select the **Web** app (or **Add app** → Web).
4. In **SDK setup and configuration**, choose **Config** (not npm snippet only).
5. You will see a JavaScript object like:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc"
};
```

Map each field to Vite env vars (prefix **`VITE_`** required for Vite to expose them to the client):

| Firebase config field | Vite env variable | Sensitive? |
|----------------------|-------------------|------------|
| `apiKey` | `VITE_FIREBASE_API_KEY` | Treat as secret in CI (restrict Firebase key by HTTP referrer / app ID in Google Cloud Console) |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` | Public |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` | Public |
| `appId` | `VITE_FIREBASE_APP_ID` | Public |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` | Public |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` | Public |

**Local file:** copy [`client/env.example`](../client/env.example) to `client/.env.local` and fill values (do not commit `.env.local`).

**Enable sign-in methods:** Firebase → **Authentication** → **Sign-in method** → enable **Email/Password** and/or **Google** as your app uses.

**Authorized domains:** Authentication → **Settings** → **Authorized domains** — add your production hostname (e.g. `vibeswitch.ai`).

---

### 4.3 Add GitHub Secrets and Variables for production-like CI builds

Use this when you add a **deploy** job or want CI to produce a client bundle that can sign in on your staging/production domain.

**Step A — Add a secret (API key)**

1. **Settings → Secrets and variables → Actions → Secrets**
2. **New repository secret**
3. Name: `VITE_FIREBASE_API_KEY`
4. Value: the `apiKey` string from Firebase config
5. **Add secret**

**Step B — Add variables (non-secret config)**

1. **Settings → Secrets and variables → Actions → Variables** tab
2. **New repository variable** for each:

| Variable name | Example value |
|---------------|----------------|
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `your-project-id` |
| `VITE_FIREBASE_APP_ID` | `1:123456789:web:abcdef` (optional but recommended) |

**Step C — Pass them into the workflow** (edit `ci.yml` — not enabled by default)

Replace or extend the **Build client** job:

```yaml
  build-client:
    name: Build client
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: client/package-lock.json
      - run: npm ci --prefix client
      - name: Build client (with Firebase config)
        run: npm run client:build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ vars.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ vars.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_APP_ID: ${{ vars.VITE_FIREBASE_APP_ID }}
          # Optional:
          # VITE_FIREBASE_STORAGE_BUCKET: ${{ vars.VITE_FIREBASE_STORAGE_BUCKET }}
          # VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ vars.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          # VITE_DOCS_BASE_URL: ${{ vars.VITE_DOCS_BASE_URL }}
```

**Step D — Upload artifacts (optional)** if deploy is separate:

```yaml
      - uses: actions/upload-artifact@v4
        with:
          name: client-dist
          path: client/dist
```

**Important:** Firebase web API keys are visible in the built JS bundle. Security relies on **Firebase/App Check rules**, **authorized domains**, and **API key restrictions** in Google Cloud Console — not on hiding the key from the browser.

---

### 4.4 Optional: `VITE_DOCS_BASE_URL`

| Item | Detail |
|------|--------|
| **Purpose** | In-app link to full documentation ([`DocsPanel.jsx`](../client/src/components/DocsPanel.jsx)) |
| **Example** | `https://docs.vibeswitch.ai` |
| **GitHub** | Repository **Variable** `VITE_DOCS_BASE_URL` |
| **CI today** | Not passed; in-app “full docs” link may fall back or be empty depending on code paths |

Add to the same `env:` block as Firebase vars when you customize **build-client**.

---

### 4.5 Staging vs production

| Approach | How |
|----------|-----|
| **One Firebase project** | Same `VITE_*` in CI for all deploys; use Firebase authorized domains for both hostnames |
| **Staging + production projects** | GitHub **Environments** (`staging`, `production`) with different variables per environment; reference `environment:` in the deploy job |
| **No Firebase in CI** | Keep current `ci.yml` (build only validates compile); inject `VITE_*` only on the production deploy platform (Cloudflare Pages, Cloud Run build step, etc.) |

Many teams keep **build-client** without secrets (compile check only) and set `VITE_*` only on the hosting provider’s build settings — equivalent outcome for production.

---

## Part 5 — Server / runtime secrets (not for default CI)

These belong on your **server**, **VM**, or **deployment platform** (Cloud Run, etc.), not in `ci.yml`, unless you add deploy or smoke-test jobs.

Reference: [`docs/env.server.example`](../docs/env.server.example), [`docs/IDENTITY_PLATFORM_SETUP.md`](../docs/IDENTITY_PLATFORM_SETUP.md), [`cross-cut-modules/docs/content/pages/getting-started/auth-setup.md`](../cross-cut-modules/docs/content/pages/getting-started/auth-setup.md).

| Variable | Purpose |
|----------|---------|
| `NEWSAPI_API_KEY` | News ingestion |
| `AUTH_REQUIRED`, `FIREBASE_PROJECT_ID` | API auth |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local dev only (path to JSON); production uses workload identity |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `COHERE_API_KEY` | LLM / transcription / chat RAG rerank |
| `RESILIENCE_ANALYST_EMAILS` | Developer-tier report view |
| `GEO_ASSERT_ENVELOPE` | Validate geo envelope immediately after attach (`1` in CI test job) |
| `GEO_LEGACY_SUBREGION_ID` | Set `1` only to emit deprecated flat `subregionId` duplicate (default off) |
| `GEO_OVERRIDES_SQLITE` / `GEO_UNKNOWN_REVIEW_JSONL` / `GEO_UNKNOWN_REVIEW_SQLITE` | Geo ops review and manual override queues |
| `RESILIENCE_EPISTEMIC_GEO_V2` | Exclude text-inferred / metrics-unsafe geo from component scores (default on; `=0` for legacy) |
| Many others | See `docs/env.server.example` and module docs |

**Do not** commit `.env` or `secrets/service-account.json`. **Do not** copy production server secrets into GitHub unless a specific job needs them.

---

## Part 6 — Organization secrets and environments (teams)

### 6.1 Organization-level secrets

If the repo belongs to an organization:

**Organization → Settings → Secrets and variables → Actions**

- **Organization secrets** can be shared across repos (with repository access policies).
- **Repository secrets** override nothing for the same name; pick one level and stay consistent.

### 6.2 GitHub Environments (optional)

For staging/production deploy workflows:

**Settings → Environments → New environment** (e.g. `production`)

- Add **environment secrets** (e.g. deploy keys).
- Add **protection rules** (required reviewers, deployment branches).

Current `ci.yml` does **not** use `environment:` blocks; everything runs on the default `ubuntu-latest` runner with repository secrets only.

---

## Part 7 — Fork pull requests

| Scenario | Doc auto-sync push | CI tests/build |
|----------|-------------------|----------------|
| PR from **same** repository | Bot can push to the PR branch | Runs normally |
| PR from a **fork** | **Skipped** (warning in log); author runs `npm run docs:sync` locally | Runs on fork’s code; no write to your repo |

Fork contributors need:

```bash
npm ci
npm ci --prefix docs-site
npm run docs:sync
git add docs/main_docu_files cross-cut-modules/docs/content/pages/api/generated
git commit -m "docs: sync main_docu_files from code"
```

---

## Part 8 — Configure SonarCloud

### 8.1 Create the SonarCloud project

1. Sign in at [sonarcloud.io](https://sonarcloud.io) with GitHub.
2. **+** → **Analyze new project** → import your GitHub organization/repo.
3. Note:
   - **Organization key** (e.g. `my-org`) — appears in the URL: `sonarcloud.io/organizations/<organization-key>`.
   - **Project key** (e.g. `my-org_news`) — shown on the project **Information** page.

The repo includes [`sonar-project.properties`](../sonar-project.properties) (sources, tests, exclusions). **Do not** commit `sonar.organization` or `sonar.projectKey` in that file; CI passes them from secrets.

### 8.2 Create a SonarCloud token

1. SonarCloud → your avatar → **My Account** → **Security**.
2. **Generate Token** → name it e.g. `github-actions-news`.
3. Copy the token (shown once).

### 8.3 Add GitHub repository secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|--------|
| `SONAR_TOKEN` | Token from step 8.2 |
| `SONAR_ORGANIZATION` | Organization key (not display name) |
| `SONAR_PROJECT_KEY` | Project key from SonarCloud |

### 8.4 First analysis

1. Push a commit or open a PR.
2. **Actions** → **CI** → **SonarCloud** job should run after **Test**.
3. Open the project on SonarCloud to see issues, security hotspots, and (on PRs) the Quality Gate check on GitHub.

### 8.5 Quality Gate on pull requests

The `sonarcloud` job sets `pull-requests: write` so SonarCloud can comment on PRs. In SonarCloud → **Project Settings → Pull Requests**, ensure PR analysis is enabled.

Set the SonarCloud **main branch** to match GitHub: **Project Settings → Branches and Pull Requests → Main Branch** → **`dev`** (this repository’s default branch is `dev`, not `main`).

To **block merges** on Quality Gate failure: GitHub → **Settings → Branches** → branch protection rule for **`dev`** → add required status check **SonarCloud** (exact name from the workflow job).

### 8.6 Coverage, ESLint, and Quality Gate enforcement

Coverage is wired end-to-end:

1. **Test** job runs `npm run test:coverage` and uploads `coverage/lcov.info`.
2. **Lint** job runs a single ESLint pass (`npx eslint . -f json -o eslint-report.json`) and uploads `eslint-report.json` for SonarCloud. Local `npm run lint` uses the same Sonar-aligned rules (SonarJS + Unicorn in [`eslint.config.js`](../eslint.config.js)).
3. **SonarCloud** job downloads both artifacts and scans with `sonar.qualitygate.wait=true` so the scan step **fails** when the Quality Gate fails. A follow-up step prints gate conditions, new bugs, and unreviewed security hotspots on failure.

Sources analyzed include `business_modules`, `cross-cut-modules`, `composition`, `db`, `utils`, `scripts`, entrypoints (`app.js`, `server.js`), and the React client (`client/src`). Client code is excluded from coverage expectations until client tests exist (`sonar.coverage.exclusions` in [`sonar-project.properties`](../sonar-project.properties)).

In SonarCloud → **Project Settings → Quality Gate**, prefer conditions on **new code** (bugs, vulnerabilities, coverage) so legacy gaps do not block every PR. **New code** is measured against the main branch (`dev`); confirm that under **Project Settings → Branches and Pull Requests**.

Security hotspots must be reviewed in SonarCloud (or via PR discussion)—CI does not auto-mark them SAFE.

### 8.7 Disable Automatic Analysis

When CI is the source of truth for coverage and ESLint import, disable **Automatic Analysis** in SonarCloud:

**Project Settings → Administration → Analysis Method** → turn off automatic analysis.

Otherwise SonarCloud may run a second analysis without `lcov.info` or `eslint-report.json`, producing inconsistent metrics.

### 8.8 SonarLint Connected Mode (local IDE)

1. Install the [SonarLint](https://marketplace.visualstudio.com/items?itemName=SonarSource.sonarlint-vscode) extension (recommended in [`.vscode/extensions.json`](../.vscode/extensions.json)).
2. In VS Code/Cursor: **SonarLint: Connect to SonarCloud** → bind to the same organization and project key as CI secrets.
3. Connected Mode shows server-aligned issues in the editor. [`sonarlint.automaticAnalysis`](../.vscode/settings.json) is `false` intentionally—analysis runs on save via Connected Mode, not on every keystroke.

Optional local queue (no API): `npm run sonar:issues:local` uses the same ESLint profile as `npm run lint`.

---

## Part 9 — Configure optional live LLM workflow

1. Create an Anthropic API key: [Anthropic Console](https://console.anthropic.com/) → API keys.
2. GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
3. Name: `ANTHROPIC_API_KEY`, value: your key.
4. Run manually: **Actions** → **Resilience live LLM** → **Run workflow**.
5. Or wait for the scheduled run (Mondays 06:00 UTC).

Without the secret, the workflow prints a notice and does not fail the repository.

---

## Part 10 — Verification checklist

After configuration, confirm:

- [ ] **Actions** enabled; workflow permissions **Read and write**.
- [ ] Push a small change → **Actions** tab shows **CI** workflow running.
- [ ] Jobs complete: **Validate**, **Sync main documentation**, **Lint**, **Test**, **Build client**, **Build docs site**, **Security audit**.
- [ ] Open a PR → **Dependency review** workflow runs (if dependency graph is enabled for the repo).
- [ ] If resilience code or OpenAPI changed, `sync-main-docs` may add a commit `docs: sync main_docu_files from code [skip ci]`.
- [ ] `SONAR_TOKEN`, `SONAR_ORGANIZATION`, `SONAR_PROJECT_KEY` set → **SonarCloud** job runs and project updates on [sonarcloud.io](https://sonarcloud.io).
- [ ] (Optional) `ANTHROPIC_API_KEY` set → **Resilience live LLM** runs adversarial tests when triggered.

### Local parity with CI

```bash
npm run check:engines    # matches package.json engines.node (use .nvmrc)
npm ci
npm run openapi:lint     # Redocly — same as CI Validate job
npm ci --prefix docs-site
npm run docs:sync      # same as CI doc regeneration
npm run docs:check     # cross-cut-modules/docs/content/pages validation
npm run lint           # Sonar-aligned ESLint (same rules as CI Lint job)
npm test               # fast local run (no coverage)
npm run test:coverage  # CI Test job — writes coverage/lcov.info
npm run client:build
cd docs-site && npm run gen:api && npm run build
node scripts/ci-audit.mjs
```

---

## Part 11 — Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Doc sync push rejected on `dev` | Protected default branch requires PRs | Run `npm run docs:sync` locally and commit before merge; auto-push runs only on **same-repo PRs**. |
| Doc sync push `403` | Workflow read-only | **Read and write** workflow permissions (Settings → Actions). |
| `gen:api` / Docusaurus fails in CI | Missing `docs-site` install | CI already runs `npm ci --prefix docs-site`; locally run the same before `docs:sync`. |
| `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` | Node &lt; 22.13 in CI or locally | Use Node **22.13+** (`nvm use` with root [`.nvmrc`](../.nvmrc)). |
| OpenAPI lint fails | Invalid or breaking `openapi/openapi.yaml` | Run `npm run openapi:lint`; see [`redocly.yaml`](../redocly.yaml). |
| Dependency review fails on PR | PR adds high-severity dependency | Update or remove the dependency; complements full-lockfile `ci-audit`. |
| Security audit fails | High/critical in lockfile (except `xlsx`) | Run `npm audit fix`, commit lockfile; locally run `node scripts/ci-audit.mjs`. |
| Integration tests skipped | No API keys in CI | Expected; add secrets only if you intentionally want live API tests in CI. |
| Fork PR: docs out of date | Bot cannot push to fork | Maintainer or author runs `npm run docs:sync` and pushes. |
| Infinite CI loops | Doc sync without `[skip ci]` | Commit message already includes `[skip ci]`; ensure branch protection does not re-trigger all jobs on bot commits unnecessarily. |
| Branch protection shows **No checks** / empty list | Workflow `permissions:` only listed `contents: write` | Add `checks: write` and `statuses: write` at workflow level (see `ci.yml`). Re-run CI, then search for `Test` or `CI / Test`. |
| SonarCloud skipped | `SONAR_TOKEN` not set | Add all three Sonar secrets (Part 8). |
| SonarCloud `Project not found` | Wrong `SONAR_PROJECT_KEY` or org | Match keys exactly to SonarCloud **Information** page. |
| SonarCloud `You're not authorized` | Invalid or expired token | Regenerate token in SonarCloud → Security; update `SONAR_TOKEN`. |

---

## Related files

| File | Role |
|------|------|
| [`.github/workflows/ci.yml`](./workflows/ci.yml) | Main CI pipeline |
| [`.github/workflows/dependency-review.yml`](./workflows/dependency-review.yml) | PR dependency delta review |
| [`.nvmrc`](../.nvmrc) | Node version for CI and local dev |
| [`redocly.yaml`](../redocly.yaml) | OpenAPI lint rules |
| [`sonar-project.properties`](../sonar-project.properties) | SonarCloud sources, tests, exclusions |
| [`.github/workflows/resilience-live-llm.yml`](./workflows/resilience-live-llm.yml) | Optional live LLM tests |
| [`docs/main_docu_files/README.md`](../docs/main_docu_files/README.md) | Auto-synced canonical docs |
| [`client/env.example`](../client/env.example) | Client `VITE_*` template |
| [`docs/env.server.example`](../docs/env.server.example) | Server env template |
