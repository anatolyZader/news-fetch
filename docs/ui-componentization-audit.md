# UI Componentization Audit (Figma MCP Readiness)

This audit catalogs the highest-priority UI duplication and mixed-concern hotspots in `client/src/components`.

## Priority 1 (extract shared primitives first)

- Modal/panel shell duplication
  - `client/src/components/DocsPanel.jsx`
  - `client/src/components/ReportBuildPanel.jsx`
  - Matching repeated styles in:
    - `client/src/components/DocsPanel.module.css`
    - `client/src/components/ReportBuildPanel.module.css`
- Repeated load/error/empty early-return markup
  - `client/src/components/SubmissionsTab.jsx`
  - `client/src/components/MunicipalitiesTab.jsx`
  - `client/src/components/EducationTab.jsx`

## Priority 2 (centralize design semantics)

- Duplicated score-to-color mappings
  - `client/src/components/ReportView.jsx`
  - `client/src/components/SubmissionsTab.jsx`
  - `client/src/components/MunicipalitiesTab.jsx`
- Hardcoded chart palettes (not token-driven)
  - `client/src/components/EducationTab.jsx`

## Priority 3 (reduce mixed concerns in large files)

- Large panel with network + state machine + rendering
  - `client/src/components/ReportBuildPanel.jsx`
- Large tab with fetch + aggregation + chart rendering
  - `client/src/components/MunicipalitiesTab.jsx`
  - `client/src/components/EducationTab.jsx`

## Refactor order

1. Add shared UI primitives (`ModalPanel`, `Button`, `LoadState`).
2. Move score/color decisions to shared helpers.
3. Refactor `DocsPanel` and `ReportBuildPanel` to shared modal primitives.
4. Refactor at least one heavy tab to separate data hook from rendering.
