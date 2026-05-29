import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { alpha } from '@mui/material/styles';
import { MarkdownArticle } from '../ui/MarkdownArticle.jsx';
import PropTypes from 'prop-types';

function CopyablePre({ children }) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    const node = Array.isArray(children) ? children[0] : children;
    const raw = node?.props?.children;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.join('');
    return '';
  }, [children]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }, [text]);

  return (
    <Box
      sx={(theme) => ({
        margin: `${theme.spacing(1.5)} 0`,
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: alpha(theme.custom.pastel.lilac, 0.1),
      })}
    >
      <Box
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing(1),
          paddingTop: theme.spacing(0.5),
          paddingBottom: theme.spacing(0.5),
          paddingLeft: theme.spacing(1.25),
          paddingRight: theme.spacing(0.75),
          borderBottom: theme.custom.border.hairline,
          background: alpha(theme.custom.pastel.mist, 0.75),
        })}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          Code
        </Typography>
        <Button
          type="button"
          onClick={onCopy}
          disabled={!text}
          variant="text"
          size="small"
          startIcon={copied ? <CheckRoundedIcon fontSize="inherit" /> : <ContentCopyRoundedIcon fontSize="inherit" />}
          sx={{ color: 'text.secondary', minWidth: 0, '&:hover': { color: 'text.primary' } }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Box>
      <Box
        component="pre"
        sx={(theme) => ({
          margin: 0,
          border: 'none',
          borderRadius: 0,
          paddingTop: theme.spacing(1.25),
          paddingBottom: theme.spacing(1.25),
          paddingLeft: theme.spacing(1.5),
          paddingRight: theme.spacing(1.5),
          overflow: 'auto',
          background: 'transparent',
          fontSize: theme.typography.body2.fontSize,
          lineHeight: 1.55,
        })}
      >
        {children}
      </Box>
    </Box>
  );
}

CopyablePre.propTypes = {
  children: PropTypes.node,
};

export function MarkdownDocView({ markdown, banner }) {
  if (!markdown?.trim()) {
    return (
      <MarkdownArticle
        markdown=""
        banner="No content to display."
        bannerSeverity="info"
        variant="doc"
      />
    );
  }

  return (
    <MarkdownArticle
      markdown={markdown}
      banner={banner}
      bannerSeverity="info"
      variant="doc"
      components={{ pre: CopyablePre }}
    />
  );
}

MarkdownDocView.propTypes = {
  markdown: PropTypes.string,
  banner: PropTypes.string,
};
