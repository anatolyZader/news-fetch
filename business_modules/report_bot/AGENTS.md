# Report bot module — agent entry

Read this before any file under `business_modules/report_bot/`.

## Entry

- `index.js` — facade
- `input/reportBotManualReportsRoutes.js` — HTTP routes
- `app/reportBotManualReportsService.js` — service

## Ports (`domain/ports/`)

`IReportBotManualReportsPort`

## Do not read

- Other ingestion modules unless sync explicitly requires it

## Neighbors

- `composition/registerIngestion.js` — service wiring
- `composition/createApp.js` — `reportBotManualReportsRoutes` registration
