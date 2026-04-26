# Figma to Code Map

This file defines the stable mapping used for Figma MCP workflows in the client app.

## Core surfaces

- App shell: `client/src/MainApp.jsx`
- Report flow panel: `client/src/components/ReportBuildPanel.jsx`
- Documentation panel: `client/src/components/DocsPanel.jsx`
- Municipalities dashboard: `client/src/components/MunicipalitiesTab.jsx`
- Education dashboard: `client/src/components/EducationTab.jsx`

## UI primitives (code targets for design updates)

- Modal shell: `client/src/ui/ModalPanel.jsx`
- Action controls: `client/src/ui/Button.jsx`
- Loading/error/empty states: `client/src/ui/LoadState.jsx`
- Auto layout structure: `client/src/ui/AutoLayout.jsx` (`Stack`, `Inline`)
- Tabs: `client/src/ui/PrimaryTab.jsx`
- Sidebar item: `client/src/ui/SidebarItem.jsx`
- Status chip/tag: `client/src/ui/StatusTag.jsx`
- Overall resilience card: `client/src/ui/ResilienceSummaryCard.jsx`

When Figma changes a primitive (panel chrome, button treatment, state messaging), update these files first so the change propagates.

## Token mapping

- Global token source: `client/src/index.css`
- Semantic score tokens:
  - `--score-critical`
  - `--score-weak`
  - `--score-moderate`
  - `--score-good`
  - `--score-strong`
- Score backgrounds:
  - `--score-critical-bg`
  - `--score-weak-bg`
  - `--score-moderate-bg`
  - `--score-good-bg`
  - `--score-alert-bg`
- Chart tokens:
  - `--chart-red`, `--chart-orange`, `--chart-amber`, `--chart-yellow`
  - `--chart-green`, `--chart-blue`, `--chart-purple`
  - `--chart-gray`, `--chart-gray-light`

## Shared score helpers

- `client/src/lib/score.js`
  - `scoreColor10()` and `scoreLabel10()` for 0-10 resilience scores.
  - `scoreColor01()` and `scoreBg01()` for normalized 0-1 scores.

Use these helpers instead of re-implementing score-to-style logic in feature components.

## Feature composition guidance

- Feature components in `client/src/components` should compose primitives from `client/src/ui`.
- Prefer `Stack`/`Inline` from `client/src/ui/AutoLayout.jsx` for layout wrappers (Figma Auto Layout parity in code structure).
- Data loading and orchestration should move to hooks under `client/src/hooks` when a feature becomes large.
- Naming should stay semantic (`ModalPanel`, `LoadingState`) instead of color/styling-based names.
