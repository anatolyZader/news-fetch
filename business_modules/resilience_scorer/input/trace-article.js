#!/usr/bin/env node
/**
 * Single-article extraction trace: closed extract + decision trace on one article.
 * Cheap, side-effect-free, for one-by-one inspection of model reasoning.
 * @see business_modules/resilience_scorer/app/extraction/traceArticleCli.js
 */
import 'dotenv/config';
import { bootstrapDefaultStateStore } from '../../../cross-cut-modules/persistence/bootstrapStateStore.js';

bootstrapDefaultStateStore();

import { runTraceArticleCli } from '../app/extraction/traceArticleCli.js';

try {
  await runTraceArticleCli();
} catch (err) {
  console.error('trace-article failed:', err.message);
  process.exit(1);
}
