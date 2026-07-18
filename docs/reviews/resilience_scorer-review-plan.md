# resilience_scorer cleanup — review plan, as executed

**Status: completed and pushed** — 7 refactor commits on `rich-narrative` (`b1b314d…ed5f181`), plus `12112c0` carrying the pre-existing analyst-flattening WIP, plus the flagged retry follow-up (§8). Full suite green after every commit and on the final pushed state: **1589 tests, 1587 pass, 0 fail, 2 skipped**.

## Context

A code review of `business_modules/resilience_scorer/` flagged seven problem classes: duplication (§3.2), dead code (§3.3), redundant indirection (§3.4), naming drift (§3.5), config/env sprawl (§3.6), inconsistent error handling (§3.7), and oversized files (§3.8). Every claim was verified against the code before execution; the work was a pure refactor — no behavior changes, with one flagged exception deliberately deferred (see §3.7c).

**Scope decisions:**

- Naming: low-churn renames only; the open/closed/grounding vocabulary drift is documented in the module `AGENTS.md` instead of a ~40-file mass rename.
- Config consolidation (§3.6) was applied **repo-wide**, not just inside resilience_scorer.
- One commit per review section, tests green before each, files staged by explicit path list.

## Corrections to the original review

Verification found five claims wrong or overstated — none of these were "fixed":

| Review claim | Reality |
|---|---|
| `fitSignalWeightsRidgeMock` is dead code | Doesn't exist anywhere in the repo |
| `contentBatchFromMdArticles.js` has no callers | Live: exported via `index.js`, used by `evidence_submission` |
| `probeCorroborationPolicy` ≈ `signalGamingPolicy` (merge) | Different mechanics (distinct-source corroboration vs per-key volume caps); cross-referencing comments added instead |
| `reportRoutes.js` hardcodes the shadow artifact path | Only `pipeline-run-audit.js` did |
| `resilienceComponents` double entry point — remove one | The `contracts/index.js` re-export is load-bearing for `pbo_report` and `cross-cut-modules/retrieval`; both paths kept, comment added |

Also confirmed intentional (documented, not unified): `reportCacheService` picks the report to *serve* (critical → generatedAt → articles → mtime) while `reportHistoryReader` picks the most *complete* record for trend history (articles → mtime) — merging them would change selection behavior.

## What landed, by commit

### 1. `b1b314d` — Dead code (§3.3)

Deleted: `runAssessment` alias, `SIGNAL_FILE_PATTERN`, `isNorthSignal`, `getComponentWeightsForSignal`, `LEGACY_NORTH_STRUCTURED_SOURCE_TYPES`, `isLegacyNorthStructuredSource` (+ its test cases), `synthesizeComponents`, and `assertCatalogPolarityCoherence` (self-marked `@deprecated`). Its two test call-sites now assert `validateSignalCatalog()` and `validateSignalRouting()` return empty errors **and** warnings — same assertion strength as before.

### 2. `960ec10` — Duplication merges (§3.2)

- `prepareInvestigationSignals.js` + `prepareScoringSignals.js` (~90% identical) → one `app/assessment/prepareSignals.js` with a shared `prepareSignalsBase()` and two thin exported wrappers keeping the original names and return shapes.
- `buildNarrativeScoredComponents.js`: the production-dead namesake function deleted (which dissolved the duplicated `SUPPRESSION_KEYS`/`suppressionSliceFromScored` pair); file renamed to `narrativeClaims.js` matching its surviving claim-merging helpers.
- `oovBurstAlert.js`: both burst evaluators now share a `prepareOovEvaluation()` prelude; each is ~4 lines.
- Entailment threshold table (0.7/0.5/0.5/0.4) now lives once in `groundingPolicy.js` as `ENTAILMENT_THRESHOLDS` + `entailmentThresholdFor()`; both verifiers import it.
- `assessSignalsHelpers.js`: `visits:`/`field:` compute the shared bundle set once, with a "field is a legacy alias of visits" comment (both keys are required by consumers).

### 3. `454c365` — Indirection collapse (§3.4)

- The 3-hop facade stack is now 2 hops: the pure re-export facade `domain/services/signals/signalCatalog.js` was **deleted** and `signalRouter.js` became the single facade over `contracts/signalCatalog.js` (taxonomy), `signalRouting.js` (routing policy), and `scoringPriors.js`. Eleven importers repointed. This also removed the duplicate-filename trap — only `domain/contracts/signalCatalog.js` remains.
- `narrativeGrounding/inlineCitationResolver.js` (4-line wrapper) deleted; consumers import `contracts/inlineCitationResolve.js` directly.

### 4. `632cbc7` — Naming, low-churn (§3.5)

- `app/assessment/assessmentPipeline.js` → **`signalScopePartition.js`** (it is a scope-filter/partition step, not a pipeline). `assessmentStage.js` kept its accurate name — swapping names within one series is git-archaeology poison.
- `paths/reportNames.js` header now states it is parameter-driven filename format/parsing *by design*, unlike its repoRoot-based siblings.
- Module `AGENTS.md` § Terminology now maps: **open** vocabulary (extraction) / observations (artifacts) / evidence (scoring); **closed** catalogue (extraction) / core (assessment path) / signalBundle (artifact); and the two unrelated **groundings** — `GROUNDING_TIER` scoring tiers (`comp.grounding_score`, written by specialist_agents) vs `narrativeGrounding/` prose QA (`comp.narrative_grounding_score`, written by claudeNarratives / operatorNarrativePipeline).

### 5. `1e90033` — Config consolidation, repo-wide (§3.6)

- **`cross-cut-modules/config/sqlitePath.js`** — `resolveSqlitePath(env?, rootDir?)`; 31 call sites migrated (resilience_scorer, cross-cut llm/retrieval, pbo_report, social_media, translation, audio, radio, mailing, visits, video, db/input, …). Flagged nuance: `resilienceAnalysisService`, `extractionCacheStore`, `youtubeToMdCli`, `loadConfig` previously defaulted cwd-relative; identical behavior when run from repo root (the universal case).
- **`cross-cut-modules/config/envFlags.js`** — `envFlagOn` / `envFlagOff` / `envFlag(env, name, default)`. Only **exact-polarity** matches migrated (6 files). Everything with bespoke semantics (`envFlagEnabled`'s unset→true/`'on'`→false, the ragConfig `!== '0'` family, `extractionPrompt`'s `'full'` value, etc.) was deliberately left local — approximating them would flip flag polarity.
- **`cross-cut-modules/llm/modelIds.js`** — `HAIKU_MODEL` / `SONNET_MODEL`; 23 production files migrated with env-override chains preserved (`process.env.X ?? HAIKU_MODEL`). `agentConfig.js` re-exports, so its importers are untouched. `llmPricing.js` intentionally keeps literal ids.
- **`divergenceArtifactPath(scope, date)`** added next to `analystShadowDir()` in `paths/outputDirs.js`, exported via the module facade, used by `pipeline-run-audit.js`.
- Magic numbers in `infrastructure/`: **skipped** — single-use constants next to their logic; a central tuning module would destroy locality for no payoff.

### 6. `734c2db` — Error handling (§3.7)

- `input/pipeline-status.js` and the `ingest-connectivity-probes` chain got the standard try/catch → `console.error` → `process.exit(1)` wrapper. `pipeline-status` keeps its default-to-today `--date` (documented as intentional vs the audit CLI's explicit-date requirement).
- `assessSignalsCli.js` standardized on **thrown errors** caught by its sole caller `input/assess-signals.js`: helper `process.exit(1)` calls became throws (`assertApiKey`, `assertSignalBundles`, `assertLoadedSignalFiles`, both `.code`-branched scoring failures). Exit codes unchanged; stderr messages gain the `assess-signals failed:` prefix. Smoke-tested both paths.
- **`cross-cut-modules/llm/withLlmRetry.js`** — the 429-aware backoff (90s on rate-limit, else 5s × attempt) extracted from `claudeExtraction.js`, which was ported to it (pure refactor).

### 7. `ed5f181` — Oversized-file splits (§3.8) — pure code motion

- `assessSignalsCli.js` **840 → 164 lines**, + `assessSignalsDeps.js` (bundle loading, safe service factories), `buildScopedScoring.js`, `finalizeReport.js`. Acyclic import graph; `runAssessSignalsCli` unchanged.
- New `operator/evidenceFormatting.js` holds the shared signal-resolution/evidence-bullet formatting and absorbed `routingLabel.js` (deleted) — inheriting its cycle-breaker role: it never imports from either surface file.
- `operatorNarrativePipeline.js`: the two identical token-overflow loops are now one `runWithOverflowRebudget()` helper, parameterized on the three observable differences (label, attempt body, fallback). The facts/polish attempt loops differ legitimately and were left alone.
- `componentDiagnostics.js` (516 → ~350): the display-state machine moved to `operatorDisplayState.js`, re-exported from the original path so tests and callers are untouched.
- `signalTypeHygiene.js` → three files: hygiene core + `harmInfrastructureSplit.js` (clause splitting) + `fieldReportHygiene.js`. Every previously-public name still resolves from the module facade.

### 8. Follow-up — LLM retries on the four single-call sites (§3.7c, flagged behavior change)

Initially deferred, then approved and landed: `decisionBriefGenerator`, `narrativeFactsExtract` (both shard and single-shot paths), `narrativeRelationJudge` (batch and per-claim), and `narrativePolish` now wrap their LLM calls in `withLlmRetry` (3 attempts, 429-aware backoff: 90s on rate limit, else 5s × attempt). Two safeguards keep the change contained:

- `withLlmRetry` gained a `shouldRetry(err)` option; the three narrative-pipeline sites pass `!isTokenOverflowError(err)` so deterministic token-overflow errors propagate immediately to `runWithOverflowRebudget`'s escalation instead of burning three identical failed attempts.
- Retry logging matches each site's existing log style (`⚠ <label> attempt N failed … retrying in Ns`).

Cost note: a transiently failing narrative call can now bill up to 3 attempts where it previously failed fast.

## Verification record

- `npm test` (root, `node --test`, 105 resilience test files among 1589 tests) run before each commit and on the final pushed state — green every time.
- Every "zero importers" claim re-grepped immediately before deletion (this caught the stale `contentBatchFromMdArticles` claim).
- CLI smoke tests after the splits: `pipeline-status` (clean exit) and `assess-signals --date 1999-01-01` (correct guidance message through the new thrown-error path).
- Public facade audit: `index.js`, `domain/contracts/index.js`, `narrativeGrounding/index.js` — all previously-public names still importable from their original paths (barrel loads with 183 exports).
