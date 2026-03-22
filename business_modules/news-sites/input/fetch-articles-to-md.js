#!/usr/bin/env node
/**
 * CLI entry: single-site article fetch → markdown
 * Usage: node business_modules/news-sites/input/fetch-articles-to-md.js [site] [date]
 */
import { runFetchArticlesToMd } from '../app/fetchArticlesToMd.js';

runFetchArticlesToMd().catch((err) => {
  console.error(err);
  process.exit(1);
});
