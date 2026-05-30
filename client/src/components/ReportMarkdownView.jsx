import {
  COMPONENTS_TABLE_HELP_MARKDOWN,
  EVIDENCE_LEVEL_INLINE_NOTE,
} from '../../../business_modules/resilience/domain/copy/componentsTableGlossary.js';
import { MarkdownArticle } from '../ui/MarkdownArticle.jsx';
import PropTypes from 'prop-types';

/**
 * LLM output uses `[source](url)`; show the actual URL as link text so the browser matches
 * saved reports where citations read like `'…quote.' ((https://…))` instead of `(source)`.
 */
export function expandSourceCitationLinks(markdown) {
  if (typeof markdown !== 'string') return '';
  if (!markdown) return markdown;
  return markdown.replaceAll(/\[source\]\((https?:[^)\s]+)\)/gi, (_, url) => `[${url}](${url})`);
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
  return markdown.replaceAll(
    '*(amount of relevant evidence found for this component)*',
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
    <MarkdownArticle
      markdown={body}
      variant="report"
      banner={
        readOnly
          ? 'Read-only — full assessment document (same as saved .md report).'
          : null
      }
      bannerSeverity="info"
    />
  );
}

ReportMarkdownView.propTypes = {
  markdown: PropTypes.string,
  readOnly: PropTypes.bool,
};
