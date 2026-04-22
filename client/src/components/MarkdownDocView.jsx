import { useCallback, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownDocView.module.css';

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
    <div>
      <div className={styles.copyRow}>
        <button type="button" className={styles.copyBtn} onClick={onCopy} disabled={!text}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function MarkdownDocView({ markdown, banner }) {
  if (!markdown?.trim()) {
    return (
      <div className={styles.wrap}>
        <p className={styles.banner} role="status">
          No content to display.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {banner && (
        <p className={styles.banner} role="status">
          {banner}
        </p>
      )}
      <article className={styles.article}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre: CopyablePre,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}

