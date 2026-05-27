import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { MarkdownArticle } from '../ui/MarkdownArticle.jsx';
import PropTypes from 'prop-types';

function CopyablePre({ children }) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    const node = Array.isArray(children) ? children[0] : children;
    const raw = node?.props?.children;
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('') : '';
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
    <Box>
      <Box
        sx={(theme) => ({
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: theme.spacing(-0.75),
          marginBottom: theme.spacing(0.5),
        })}
      >
        <Button
          type="button"
          onClick={onCopy}
          disabled={!text}
          variant="outlined"
          size="small"
          sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Box>
      <pre>{children}</pre>
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
