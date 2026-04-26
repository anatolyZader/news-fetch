# UI Primitive Naming Contract

These primitives are now thin wrappers around Material UI (MUI v5) components, themed by `client/src/theme/theme.js`. Feature components should compose these primitives rather than redefining shell styles.

- Use semantic names that map to design intent, not color intent.
  - Preferred: `Button`, `ModalPanel`, `LoadingState`/`ErrorState`/`EmptyState`, `PrimaryTab`, `SidebarItem`, `StatusTag`, `ResilienceSummaryCard`, `MarkdownArticle`.
  - Avoid: `GreenButton`, `BigModalBox`.
- `Button` re-exports MUI `Button` with a `rounded` prop for pill styling.
- `StatusTag` maps `variant` (`critical|weak|moderate|good|strong|alert|neutral`) to `theme.palette.score.*` tones.
- `ModalPanel` wraps MUI `Dialog` with `title`, `headerRight`, `width` to keep call-sites stable.
- `MarkdownArticle` wraps `react-markdown` with prose styles for `doc` and `report` variants.
- `LoadState` exports `LoadingState`, `ErrorState`, and `EmptyState` (using MUI `Alert`/`Typography`).
- `AutoLayout` re-exports MUI `Stack` (`Stack`, `Inline`) for structural layout blocks.
- All score color logic lives in `client/src/lib/score.js` and resolves against the active MUI theme — do not reach for CSS variables.
- RTL: theme `direction` and the Emotion cache are set by `client/src/theme/AppProviders.jsx` from `LanguageContext`.
