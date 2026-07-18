# Ubiquitous language

Shared vocabulary across backend, API, UI, and docs. Use these terms consistently — avoid synonyms unless they denote a **different** concept.

---

## People and access

| Term | Meaning |
|------|---------|
| **Operator** | Default user. Sees narratives, evidence, instruments, attention — not headline 1–10 scores. |
| **Analyst** | Privileged user (`canViewAnalystDisplay`). Sees headline scores and score-revealing UI (`WhyThisScore`, `DeltaLine`, `InstrumentMetricsBadges`, etc.) that operators do not; also gates `CrisisBudgetPanel` crisis-chat-budget activation. |
| **Maintainer** | Highest tier (`canRunAnalysisDisplay`). Maintainer-only costly tools. |
| **Principal** | Authenticated Firebase user on an API request (`request.user`). |

Access levels: `operator` \| `analyst` \| `maintainer` — `config/userAccess.json`, `cross-cut-modules/auth/userAccess.js`.

---

## Product and pipeline

| Term | Meaning |
|------|---------|
| **Decision support** | Narrow attention with evidence and instruments; humans decide. |
| **Instrument** | Operator-safe flag (sufficiency, contestation, salience) — not a hidden score. |
| **Report scope** | Geographic scope: `national` or district id (`north`, `south`, …). |
| **Signal bundle** | File `business_modules/resilience_scorer/data/signals/signals-{sourceType}-{date}.json` (field: `business_modules/visits/data/signals/…`) — output of extraction. |
| **Assessment** | Scored object inside `resilience-report-*.json`. |
| **Source archive** | SQLite store of ingested originals; ephemeral types purged after retention. |

---

## Signals and catalog

| Term | Meaning |
|------|---------|
| **Signal type** | Stable id from closed catalog (`signalCatalog.js`, `CATALOG_VERSION` v6). |
| **OOV** | Out-of-vocabulary type — captured to `oov-capture-{date}.jsonl`, not scored. |
| **Grounding outcome** | Verification outcome: `grounded`, `weak`, `unverified_critical`, `rejected`. |

---

## Epistemic

| Term | Meaning |
|------|---------|
| **Data void** | Abnormally low press/digital volume vs baseline. |
| **Sampling blind** | Instrument when sources too sparse for reliable inference. |
| **Abstention** | Deliberate `null` score — not “all clear.” |
| **Thin evidence** | Low evidence mass; operator instruments hide or qualify scores. |

---

## Terminology: avoid overloaded "tier"

Use these canonical terms in docs, logs, and new code. The word **tier** is overloaded — prefer the specific term.

| Canonical term | Meaning | Do not call it |
|----------------|---------|----------------|
| **display_view** | `operator` \| `analyst` API/UI redaction | "display tier" |
| **context_slice** | Chat prompt slice: `full\|compare\|hub\|minimal\|component\|standard` | "chat context tier" |
| **specialist_depth** | Assessment agent depth `A\|B\|C` | "specialist tier" (in new prose) |
| **grounding_outcome** | `grounded`, `weak`, `unverified_critical`, `rejected` | "grounding tier" (in new prose) |

Legacy persisted field **`specialist_tier`** remains readable on disk; new writes also emit **`specialist_depth`**.

Optional economy (rollback via env): `CHAT_CONTEXT_TIERING=0` → always full context; `RESILIENCE_ASSESS_TIERED_SPECIALISTS=0` → always depth A. See [MODEL-CARD.md](../MODEL-CARD.md) § Economy rollback.

---

## Related docs

- Operator model: [SYSTEM-AND-OPERATOR-MODEL.md](../main_docu_files/SYSTEM-AND-OPERATOR-MODEL.md)
- Pipeline artifacts: [PIPELINE-AND-SOURCES.md](../main_docu_files/PIPELINE-AND-SOURCES.md)
- Policy tables: [MODEL-CARD.md](../MODEL-CARD.md)
