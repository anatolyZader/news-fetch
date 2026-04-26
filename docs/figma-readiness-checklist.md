# Figma MCP Readiness Checklist

Use this checklist before running design-to-code iterations with Figma MCP.

## 1) Design system page (Figma)

- Create a dedicated page named `DesignSystem`.
- Define color styles:
  - `Color/Primary`
  - `Color/Success`
  - `Color/Warning`
  - `Color/Error`
  - `Color/Surface`
  - `Color/TextPrimary`
  - `Color/TextMuted`
- Define text styles:
  - `Text/H1`
  - `Text/H2`
  - `Text/Body`
  - `Text/Caption`
- Define spacing scale variables:
  - `Space/4`, `Space/8`, `Space/12`, `Space/16`, `Space/24`
- All components and frames must use Auto Layout.

## 2) Figma component naming (required)

Use semantic names only:

- `Tab/Primary`
- `Nav/SidebarItem`
- `Tag/Status`
- `Card/ResilienceSummary`
- `Layout/Page`
- `Layout/HeaderNavBar`
- `Section/ExecutiveSummary`

Avoid generic layer names like `Frame 123`, `Rectangle`, `Group 45`.

## 3) Code mapping in this repo

Design component to code target:

- `Tab/Primary` -> `client/src/ui/PrimaryTab.jsx`
- `Nav/SidebarItem` -> `client/src/ui/SidebarItem.jsx`
- `Tag/Status` -> `client/src/ui/StatusTag.jsx`
- `Card/ResilienceSummary` -> `client/src/ui/ResilienceSummaryCard.jsx`
- `Layout/AutoLayout` -> `client/src/ui/AutoLayout.jsx`
- `Layout/ModalPanel` -> `client/src/ui/ModalPanel.jsx`

Main composition targets:

- Page/shell -> `client/src/MainApp.jsx`
- Report summary + sections -> `client/src/components/ReportView.jsx`

## 4) MCP connection in Cursor

- Ensure the Figma MCP server is authenticated in Cursor MCP settings.
- If using a local bridge command, keep token and file id in environment variables.
- Restart Cursor after server/auth changes.

## 5) Definition of done

- A change in `Card/ResilienceSummary` is implemented by editing `ResilienceSummaryCard` once.
- A change in `Tab/Primary` is implemented by editing `PrimaryTab` once.
- A change in status chips is implemented by editing `StatusTag` once.
- New screens compose existing primitives rather than inline recreations.
