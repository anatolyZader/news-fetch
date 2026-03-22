#!/usr/bin/env node
/**
 * CLI entry: home-front multi-site ingest → articles-homefront.md
 * Usage: node business_modules/news-sites/input/extract-homefront-articles.js [date YYYY-MM-DD]
 */
import { runExtractHomefrontArticles } from '../app/extractHomefrontArticles.js';

runExtractHomefrontArticles().catch((err) => {
  console.error(err);
  process.exit(1);
});
