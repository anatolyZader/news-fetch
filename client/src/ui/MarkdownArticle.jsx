import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { mergeSafeMarkdownComponents } from './safeMarkdownComponents.js';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';

const VARIANT_STYLES = {
  doc: (theme) => ({
    color: theme.palette.text.primary,
    fontSize: theme.typography.body1.fontSize,
    lineHeight: theme.typography.body1.lineHeight,
    textAlign: 'left',
    width: '100%',
    '& h1': {
      fontSize: theme.typography.display.fontSize,
      fontWeight: theme.typography.display.fontWeight,
      letterSpacing: theme.typography.display.letterSpacing,
      lineHeight: theme.typography.display.lineHeight,
      margin: `0 0 ${theme.spacing(1.25)}`,
    },
    '& h2': {
      marginTop: theme.spacing(2.5),
      marginBottom: theme.spacing(1),
      paddingBottom: theme.spacing(0.75),
      fontSize: '1.15rem',
      fontWeight: 700,
      lineHeight: 1.35,
      letterSpacing: '-0.01em',
      borderBottom: `2px solid ${alpha(theme.palette.primary.main, 0.22)}`,
    },
    '& h3': {
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(0.75),
      fontSize: theme.typography.h3.fontSize,
      fontWeight: 600,
      lineHeight: theme.typography.h3.lineHeight,
      color: theme.palette.primary.dark,
    },
    '& h4': {
      marginTop: theme.spacing(1.5),
      marginBottom: theme.spacing(0.5),
      fontSize: theme.typography.body1.fontSize,
      fontWeight: 600,
    },
    '& p': { margin: `${theme.spacing(1)} 0`, textAlign: 'left' },
    '& ul, & ol': {
      margin: `${theme.spacing(1)} 0 ${theme.spacing(1.25)}`,
      marginInlineStart: 0,
      paddingInlineStart: theme.spacing(2.5),
      paddingInlineEnd: 0,
      listStylePosition: 'outside',
    },
    '& li': {
      margin: `${theme.spacing(0.5)} 0`,
      paddingInlineStart: theme.spacing(0.25),
      textAlign: 'left',
    },
    '& li::marker': { color: theme.palette.primary.main },
    '& li > ul, & li > ol': {
      marginTop: theme.spacing(0.5),
      marginBottom: 0,
    },
    '& hr': {
      border: 'none',
      borderTop: theme.custom.border.hairline,
      margin: `${theme.spacing(2)} 0`,
    },
    '& table': {
      width: '100%',
      minWidth: 'min(100%, 36rem)',
      borderCollapse: 'separate',
      borderSpacing: 0,
      fontSize: theme.typography.body2.fontSize,
      margin: `${theme.spacing(1.5)} 0 ${theme.spacing(2)}`,
      border: theme.custom.border.hairline,
      borderRadius: `${theme.custom.radius.section}px`,
      overflow: 'hidden',
    },
    '& thead': {
      background: alpha(theme.custom.pastel.mist, 0.85),
    },
    '& th, & td': {
      borderBottom: theme.custom.border.hairline,
      paddingTop: theme.spacing(0.75),
      paddingBottom: theme.spacing(0.75),
      paddingLeft: theme.spacing(1.25),
      paddingRight: theme.spacing(1.25),
      textAlign: 'left',
      verticalAlign: 'top',
    },
    '& tr:last-child td': { borderBottom: 'none' },
    '& th': { fontWeight: 600, color: theme.palette.text.primary },
    '& a': {
      color: theme.palette.primary.dark,
      fontWeight: 500,
      textDecoration: 'underline',
      textDecorationColor: alpha(theme.palette.primary.main, 0.35),
      textUnderlineOffset: '0.15em',
      wordBreak: 'break-word',
      '&:hover': {
        textDecorationColor: theme.palette.primary.main,
      },
    },
    '& strong': { fontWeight: 600, color: theme.palette.text.primary },
    '& code': {
      fontSize: '0.88em',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      background: alpha(theme.custom.pastel.lilac, 0.2),
      color: theme.palette.primary.dark,
      paddingTop: theme.spacing(0.15),
      paddingBottom: theme.spacing(0.15),
      paddingLeft: theme.spacing(0.45),
      paddingRight: theme.spacing(0.45),
      borderRadius: `${theme.custom.radius.control}px`,
    },
    '& pre': {
      margin: `${theme.spacing(1.5)} 0`,
      border: theme.custom.border.hairline,
      borderRadius: `${theme.custom.radius.section}px`,
      paddingTop: theme.spacing(1.25),
      paddingBottom: theme.spacing(1.25),
      paddingLeft: theme.spacing(1.5),
      paddingRight: theme.spacing(1.5),
      overflow: 'auto',
      background: alpha(theme.custom.pastel.lilac, 0.12),
      fontSize: theme.typography.body2.fontSize,
      lineHeight: 1.55,
      '& code': {
        background: 'transparent',
        color: 'inherit',
        padding: 0,
      },
    },
    '& blockquote': {
      margin: `${theme.spacing(1.5)} 0`,
      paddingTop: theme.spacing(1.25),
      paddingBottom: theme.spacing(1.25),
      paddingLeft: theme.spacing(1.5),
      paddingRight: theme.spacing(1.5),
      borderRadius: `${theme.custom.radius.section}px`,
      border: `1px solid ${alpha(theme.custom.pastel.skyDeep, 0.35)}`,
      borderLeft: `4px solid ${theme.custom.pastel.skyDeep}`,
      background: theme.custom.surface.bannerSubtle,
      color: theme.palette.text.secondary,
      '& p': { margin: `${theme.spacing(0.5)} 0` },
    },
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
    '& a': {
      color: theme.palette.text.secondary,
      fontWeight: 400,
      textDecoration: 'none',
      borderBottom: `1px dotted ${alpha(theme.palette.divider, 0.9)}`,
      wordBreak: 'break-word',
      '&:hover': { color: theme.palette.primary.dark },
    },
    '& strong': { fontWeight: 600 },
    '& code': {
      fontSize: '0.88em',
      background: theme.palette.background.default,
      paddingTop: theme.spacing(0.15),
      paddingBottom: theme.spacing(0.15),
      paddingLeft: theme.spacing(0.4),
      paddingRight: theme.spacing(0.4),
      borderRadius: `${theme.custom.radius.section}px`,
    },
    '& pre': {
      background: theme.palette.background.default,
      paddingTop: theme.spacing(1),
      paddingBottom: theme.spacing(1),
      paddingLeft: theme.spacing(1.5),
      paddingRight: theme.spacing(1.5),
      borderRadius: `${theme.custom.radius.section}px`,
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
  const mdComponents = mergeSafeMarkdownComponents(components);
  return (
    <Box sx={{ maxWidth: maxWidth ?? '100%', width: '100%', textAlign: 'left' }}>
      {banner && (
        <Alert
          severity={bannerSeverity}
          icon={false}
          sx={(theme) => ({
            marginBottom: theme.spacing(1.5),
            backgroundColor: theme.custom.surface.bannerSubtle,
            border: `1px solid ${alpha(theme.custom.pastel.skyDeep, 0.28)}`,
            borderRadius: `${theme.custom.radius.section}px`,
            color: theme.palette.text.secondary,
            fontSize: theme.typography.body2.fontSize,
            lineHeight: theme.typography.body2.lineHeight,
          })}
        >
          {banner}
        </Alert>
      )}
      <Box component="article" dir={variant === 'doc' ? 'ltr' : 'auto'} sx={articleSx}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {markdown}
        </ReactMarkdown>
      </Box>
    </Box>
  );
}

MarkdownArticle.propTypes = {
  markdown: PropTypes.string,
  banner: PropTypes.node,
  bannerSeverity: PropTypes.string,
  variant: PropTypes.oneOf(['doc', 'report']),
  components: PropTypes.object,
  maxWidth: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
