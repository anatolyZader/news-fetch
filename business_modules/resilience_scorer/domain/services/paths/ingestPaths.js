/**
 * Canonical filesystem paths for pipeline ingest artifacts (relative to repo root).
 */
import { resolve } from 'node:path';
import { closedSignalsDir } from '../../contracts/index.js';
import { resolveRepoRoot } from './repoRoot.js';

// rootDir kept for call-site compatibility; closedSignalsDir resolves via import.meta.url
export function pipelineSignalsDir(rootDir) {
  return closedSignalsDir({
    signalsDir: resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/signals'),
  });
}

export function newsArticlesPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/news-sites/articles_extracted/articles-homefront-${date}.md`);
}

export function newsSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-news-${date}.json`);
}

export function radioSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-radio-${date}.json`);
}

export function whatsappReportPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/whatsapp/reports/whatsapp_reports-${date}.md`);
}

export function whatsappSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-whatsapp-${date}.json`);
}

export function socialSignalsPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/social_media/data/signals-social-${date}.json`);
}

export function visitsSignalsPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/visits/data/signals/signals-field-${date}.json`);
}

/** @deprecated use visitsSignalsPath */
export const fieldSignalsPath = visitsSignalsPath;

export function pboSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-pbo-${date}.json`);
}

export function pboRegionalSignalsPath(date, rootDir) {
  return resolve(pipelineSignalsDir(rootDir), `signals-pbo_regional-${date}.json`);
}

export function visitsReportsGlobDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/visits/data');
}

/** @deprecated use visitsReportsGlobDir */
export const fieldReportsGlobDir = visitsReportsGlobDir;

export function regionalPboDataDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/pbo_report_regional/data');
}

export function pipelineOpenObservationsDataDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/open_observation_extraction/data');
}

/**
 * @param {string} sourceType
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 */
export function pipelineOpenObservationsPath(sourceType, date, rootDir) {
  const safe = String(sourceType ?? 'adhoc').replaceAll(/[^a-z0-9_-]/gi, '_');
  return resolve(pipelineOpenObservationsDataDir(rootDir), `observations-pipeline-${safe}-${date}.json`);
}
