# Ubiquitous language

Shared vocabulary across backend, API, UI, and docs. Use these terms consistently — avoid synonyms unless they denote a **different** concept.

---

## People and access

| Term | Meaning |
|------|---------|
| **Operator** | Default user. Sees narratives, evidence, instruments, attention — not headline 1–10 scores. |
| **Analyst** | Privileged user (`canViewAnalystDisplay`). Drift, validation review, catalog proposals. |
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
| **Signal bundle** | `signals-{sourceType}-{date}.json` — extraction output. |
| **Assessment** | Scored object inside `resilience-report-*.json`. |
| **Source archive** | SQLite store of ingested originals; ephemeral types purged after retention. |

---

## Signals, catalog, validation

| Term | Meaning |
|------|---------|
| **Signal type** | Stable id from closed catalog (`signalCatalog.js`, `CATALOG_VERSION` v6). |
| **OOV** | Out-of-vocabulary type — captured to `oov-capture-{date}.jsonl`, not scored. |
| **Catalog proposal** | Analyst-reviewed draft from `signal_catalog_evolution` module. |
| **Grounding tier** | Verification outcome: `grounded`, `weak`, `unverified_critical`, `rejected`. |
| **Review queue** | Stratified daily sample for human validation review (max 15/day). |
| **Drift** | Historical component score series for analyst dashboard. |

---

## Epistemic

| Term | Meaning |
|------|---------|
| **Data void** | Abnormally low press/digital volume vs baseline. |
| **Sampling blind** | Instrument when sources too sparse for reliable inference. |
| **Abstention** | Deliberate `null` score — not “all clear.” |
| **Thin evidence** | Low evidence mass; operator instruments hide or qualify scores. |

---

## Related docs

- Operator model: [SYSTEM-AND-OPERATOR-MODEL.md](../main_docu_files/SYSTEM-AND-OPERATOR-MODEL.md)
- Pipeline artifacts: [PIPELINE-AND-SOURCES.md](../main_docu_files/PIPELINE-AND-SOURCES.md)
- Policy tables: [MODEL-CARD.md](../MODEL-CARD.md)
