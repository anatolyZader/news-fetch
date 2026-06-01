/**
 * @deprecated Use sourceArchiveQuery.js (search_sources / get_source tools).
 * Re-exports for backward compatibility in tests and legacy callers.
 */
export { searchSources as searchEvidenceCandidates, getSource as lookupEvidenceText } from './sourceArchiveQuery.js';
export { parseMarkdownArticles as parseHomefrontMd, loadHomefrontArticlesForDate } from '../../../db/source_archive/markdownArticles.js';
