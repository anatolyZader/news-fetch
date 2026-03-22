#!/usr/bin/env node
/**
 * CLI entry: delegates to business_modules/news-sites single-site fetch.
 * Usage: node scripts/fetch-articles-to-md.js [site] [date]
 */
import { runFetchArticlesToMd } from '../business_modules/news-sites/app/fetchArticlesToMd.js';

runFetchArticlesToMd().catch((err) => {
  console.error(err);
  process.exit(1);
});
