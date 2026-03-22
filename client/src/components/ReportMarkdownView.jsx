import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  COMPONENTS_TABLE_HELP_MARKDOWN,
  EVIDENCE_LEVEL_INLINE_NOTE,
} from '../../../shared/componentsTableGlossary.js';
import styles from './ReportMarkdownView.module.css';

/**
 * LLM output uses `[source](url)`; show the actual URL as link text so the browser matches
 * saved reports where citations read like `'…quote.' ((https://…))` instead of `(source)`.
 */
export function expandSourceCitationLinks(markdown) {
  if (!markdown) return markdown;
  return markdown.replace(/\[source\]\((https?:[^)\s]+)\)/gi, (_, url) => `[${url}](${url})`);
}

/** Legacy reports only had a one-line legend; inject the full glossary after `## Components`. */
function ensureComponentsTableGlossary(markdown) {
  if (!markdown?.trim()) return markdown;
  if (!markdown.includes('## Components')) return markdown;
  if (markdown.includes('**What each column means**')) return markdown;
  return markdown.replace(
    /^## Components\s*\n/i,
    `## Components\n\n${COMPONENTS_TABLE_HELP_MARKDOWN}\n\n`,
  );
}

/** Older exports used vague wording next to each Evidence level %. */
function clarifyLegacyEvidenceLevelNotes(markdown) {
  if (!markdown?.includes('amount of relevant evidence found for this component')) return markdown;
  return markdown.replace(
    /\*\(amount of relevant evidence found for this component\)\*/g,
    `*(${EVIDENCE_LEVEL_INLINE_NOTE})*`,
  );
}

/**
 * Renders the full resilience report Markdown (tables, appendices, links) from the server.
 */
export function ReportMarkdownView({ markdown, readOnly }) {
  if (!markdown?.trim()) return null;

  const body = expandSourceCitationLinks(
    clarifyLegacyEvidenceLevelNotes(ensureComponentsTableGlossary(markdown)),
  );

  return (
    <div className={styles.wrap}>
      {readOnly && (
        <p className={styles.banner} role="status">
          Read-only — full assessment document (same as saved <code className={styles.code}>.md</code> report).
        </p>
      )}
      <article className={styles.article}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </article>
    </div>
  );
}
