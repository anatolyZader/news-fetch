/** Shared horizontal shell for header toolbar, main content, and footer. */
export const APP_CONTENT_MAX_WIDTH = 1320;

/**
 * MUI Container sx shared by main content and footer for identical horizontal bounds.
 * @param {import('@mui/material/styles').Theme} theme
 * @param {number} [maxWidth]
 * @param {object} [overrides]
 */
export function appContentContainerSx(theme, maxWidth = APP_CONTENT_MAX_WIDTH, overrides = {}) {
  return {
    width: '100%',
    maxWidth: `${maxWidth}px !important`,
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: `${theme.spacing(4)} !important`,
    paddingRight: `${theme.spacing(4)} !important`,
    [theme.breakpoints.down('sm')]: {
      paddingLeft: `${theme.spacing(2)} !important`,
      paddingRight: `${theme.spacing(2)} !important`,
    },
    ...overrides,
  };
}

/**
 * @deprecated Use appContentContainerSx inside AppLayout Container instead.
 * @param {import('@mui/material/styles').Theme} theme
 */
export function appContentShellSx(theme) {
  return appContentContainerSx(theme);
}
