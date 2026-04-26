import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';

const VARIANT_STYLES = {
  doc: (theme) => ({
    color: theme.palette.text.primary,
    fontSize: theme.typography.body1.fontSize,
    lineHeight: theme.typography.body1.lineHeight,
    '& h2': {
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(1),
      fontSize: theme.typography.h2.fontSize,
      fontWeight: theme.typography.h2.fontWeight,
      lineHeight: theme.typography.h2.lineHeight,
    },
    '& pre': {
      border: theme.custom.border.hairline,
      borderRadius: theme.custom.radius.lg,
      paddingTop: theme.spacing(1.25),
      paddingBottom: theme.spacing(1.25),
      paddingLeft: theme.spacing(1.5),
      paddingRight: theme.spacing(1.5),
      overflow: 'auto',
      background: theme.custom.surface.code,
    },
    '& a': { color: theme.palette.primary.main, wordBreak: 'break-word' },
  }),
  report: (theme) => ({
    color: theme.palette.text.primary,
    fontSize: theme.typography.body2.fontSize,
    lineHeight: theme.typography.body2.lineHeight,
    overflowX: 'auto',
    '& h1': {
      fontSize: theme.typography.h1.fontSize,
      fontWeight: theme.typography.h1.fontWeight,
      letterSpacing: theme.typography.h1.letterSpacing,
      margin: `0 0 ${theme.spacing(1)}`,
    },
    '& h2': {
      fontSize: theme.typography.h2.fontSize,
      fontWeight: theme.typography.h2.fontWeight,
      margin: `${theme.spacing(2)} 0 ${theme.spacing(1)}`,
      paddingBottom: theme.spacing(0.5),
      borderBottom: theme.custom.border.hairline,
    },
    '& h3': { fontSize: theme.typography.h3.fontSize, fontWeight: 600, margin: `${theme.spacing(1.5)} 0 ${theme.spacing(0.5)}` },
    '& h4': { fontSize: theme.typography.body1.fontSize, fontWeight: 600, margin: `${theme.spacing(1.25)} 0 ${theme.spacing(0.5)}` },
    '& p':  { margin: `${theme.spacing(0.75)} 0` },
    '& ul, & ol': { margin: `${theme.spacing(0.75)} 0 ${theme.spacing(0.75)} ${theme.spacing(2)}`, padding: 0 },
    '& li': { margin: `${theme.spacing(0.25)} 0` },
    '& hr': { border: 'none', borderTop: theme.custom.border.hairline, margin: `${theme.spacing(1.25)} 0` },
    '& table': {
      width: '100%',
      minWidth: 'min(100%, 48rem)',
      borderCollapse: 'collapse',
      fontSize: theme.typography.cardTitle.fontSize,
      margin: `${theme.spacing(1)} 0 ${theme.spacing(1.5)}`,
    },
    '& thead': { background: theme.palette.background.default },
    '& th, & td': {
      border: theme.custom.border.hairline,
      paddingTop: theme.spacing(0.5),
      paddingBottom: theme.spacing(0.5),
      paddingLeft: theme.spacing(0.75),
      paddingRight: theme.spacing(0.75),
      textAlign: 'left',
      verticalAlign: 'top',
    },
    '& th': { fontWeight: 600 },
    '& a': { color: theme.palette.primary.main, wordBreak: 'break-word' },
    '& strong': { fontWeight: 600 },
    '& code': {
      fontSize: '0.88em',
      background: theme.palette.background.default,
      paddingTop: theme.spacing(0.15),
      paddingBottom: theme.spacing(0.15),
      paddingLeft: theme.spacing(0.4),
      paddingRight: theme.spacing(0.4),
      borderRadius: theme.custom.radius.xs,
    },
    '& pre': {
      background: theme.palette.background.default,
      paddingTop: theme.spacing(1),
      paddingBottom: theme.spacing(1),
      paddingLeft: theme.spacing(1.5),
      paddingRight: theme.spacing(1.5),
      borderRadius: theme.custom.radius.md,
      overflowX: 'auto',
      fontSize: theme.typography.body2.fontSize,
    },
    '& blockquote': {
      margin: `${theme.spacing(0.75)} 0`,
      paddingLeft: theme.spacing(1.25),
      borderLeft: `3px solid ${theme.palette.divider}`,
      color: theme.palette.text.secondary,
    },
  }),
};

export function MarkdownArticle({
  markdown,
  banner,
  bannerSeverity = 'info',
  variant = 'doc',
  components,
  maxWidth,
}) {
  const articleSx = VARIANT_STYLES[variant] ?? VARIANT_STYLES.doc;
  return (
    <Box sx={{ maxWidth: maxWidth ?? (variant === 'doc' ? '820px' : '100%') }}>
      {banner && (
        <Alert
          severity={bannerSeverity}
          icon={false}
          sx={(theme) => ({
            marginBottom: theme.spacing(1),
            backgroundColor:
              variant === 'report' ? theme.custom.surface.bannerSubtle : theme.custom.surface.code,
            border: theme.custom.border.hairline,
            borderRadius: variant === 'report' ? theme.custom.radius.md : theme.custom.radius.lg,
            color: theme.palette.text.secondary,
            fontSize: variant === 'report' ? theme.typography.body2.fontSize : theme.typography.body2.fontSize,
            lineHeight: theme.typography.body2.lineHeight,
          })}
        >
          {banner}
        </Alert>
      )}
      <Box component="article" dir="auto" sx={articleSx}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      </Box>
    </Box>
  );
}
