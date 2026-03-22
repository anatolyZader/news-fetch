#!/usr/bin/env node
/**
 * CLI entry: delegates to business_modules/news-sites home-front ingest.
 * Usage: node scripts/extract-homefront-articles.js [date YYYY-MM-DD]
 */
import { runExtractHomefrontArticles } from '../business_modules/news-sites/app/extractHomefrontArticles.js';

runExtractHomefrontArticles().catch((err) => {
  console.error(err);
  process.exit(1);
});
