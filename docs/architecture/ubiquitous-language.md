# Ubiquitous language

Terms used consistently across backend modules, API, and UI.

| Term | Meaning |
|------|---------|
| **Operator** | Home-front operator using the daily resilience report (default display tier). |
| **Analyst** | Privileged user who may request the analyst display view (full scores). |
| **Maintainer** | User who can run costly analysis, validation review, and maintainer-only tools. |
| **Actor** | Generic label in audit logs for whoever performed an action (email or system). |
| **Principal** | Authenticated Firebase user on an API request (`request.user`). |
| **Report scope** | Geographic scope of a report (`national`, `north`, etc.); see `cross-cut-modules/geo/reportScopeIds.js`. |

When adding features, reuse these terms in code names and user-facing copy instead of introducing synonyms (`member`, `account`, `profile`) unless they denote a distinct concept.
