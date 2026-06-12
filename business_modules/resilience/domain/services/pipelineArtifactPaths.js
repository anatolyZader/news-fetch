/**
 * Canonical filesystem paths for pipeline ingest artifacts (relative to repo root).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultClosedSignalsDir } from '../../../signals_extraction/index.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export function resolveRepoRoot(rootDir) {
  return rootDir ?? REPO_ROOT;
}

export function pipelineSignalsDir(rootDir) {
  return defaultClosedSignalsDir({ dataDir: resolve(resolveRepoRoot(rootDir), 'business_modules/signals_extraction/data') });
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

export function fieldSignalsPath(date, rootDir) {
  return resolve(resolveRepoRoot(rootDir), `business_modules/visits/data/signals/signals-field-${date}.json`);
}

export function fieldReportsGlobDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/visits/data');
}

export function regionalPboDataDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/pbo_report_regional/data');
}
