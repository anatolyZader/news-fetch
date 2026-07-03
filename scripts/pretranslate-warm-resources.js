/**
 * CLI helper: warm locale caches for daily ingest resources (invoked from pretranslate-daily).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localizePayload } from '../business_modules/translation/app/localePresentationService.js';
import { createNewsSitesFsAdapter } from '../business_modules/news-sites/index.js';
import { createRadioFsAdapter } from '../business_modules/audio/index.js';
import { createVisitsFsAdapter, createVisitsService } from '../business_modules/visits/index.js';
import { getEducationDashboard, getNaftaliDashboard } from '../business_modules/pool/index.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} date
 * @param {'he' | 'ru'} lang
 */
export async function warmDailyLocaleResources(date, lang) {
  const errors = [];

  async function warm(label, fn) {
    try {
      await fn();
      console.log(`[pretranslate] ${label} ${date} ${lang}`);
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.warn(`[pretranslate] ${label} failed: ${msg}`);
      errors.push(`${label}: ${msg}`);
    }
  }

  const newsRepo = createNewsSitesFsAdapter({ rootDir: ROOT_DIR });
  await warm('news', async () => {
    const feed = newsRepo.loadDailyFeed(date);
    if (!feed) return;
    await localizePayload(feed, 'news.daily', lang, { fingerprintExtra: date, costDate: date });
  });

  const radioRepo = createRadioFsAdapter({ rootDir: ROOT_DIR });
  await warm('radio', async () => {
    const feed = radioRepo.loadDailyFeed(date);
    if (!feed) return;
    await localizePayload(feed, 'radio.daily', lang, { fingerprintExtra: date, costDate: date });
  });

  const visitsRepo = createVisitsFsAdapter({ rootDir: ROOT_DIR });
  const visitsService = createVisitsService({ visitsRepository: visitsRepo });
  await warm('visits', async () => {
    const data = visitsService.getDashboard();
    await localizePayload(data, 'visits.list', lang, { fingerprintExtra: date, costDate: date });
  });

  await warm('education', async () => {
    const data = await getEducationDashboard();
    await localizePayload(data, 'education.sessions', lang, { fingerprintExtra: date, costDate: date });
  });

  await warm('naftali', async () => {
    const data = await getNaftaliDashboard();
    await localizePayload(data, 'naftali.pool', lang, { fingerprintExtra: date, costDate: date });
  });

  return errors;
}
