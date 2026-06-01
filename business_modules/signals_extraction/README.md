# signals_extraction

Open-vocabulary **observation** extraction (tabula rasa) — no fixed `SIGNAL_CATALOG` at extract time.

## Outputs

`data/observations-{profile}-{date}.json`

Profiles: `exploratory`, `document_pack`, `residual`.

## CLI

```bash
npm run extract-observations -- \
  --profile exploratory \
  --files business_modules/news-sites/articles_extracted/articles-homefront-2026-05-23.md \
  --date 2026-05-23 \
  --content-kind news \
  --source-type news
```

## Assess with mapped observations

After extraction, map observations to closed signals and assess:

```bash
npm run assess-signals -- --date 2026-05-23 --bundle-source observations --observations-profile exploratory
```

Production daily pipeline still uses closed `extract-signals` → `signals/`.

## Residual capture

When `RESILIENCE_RESIDUAL_CAPTURE=1`, closed `extract-signals` delegates zero-signal articles to this module's residual profile (also appends catalog-learning captures).
