#!/usr/bin/env node
/**
 * Composition entry: wire Resend + send municipal PBO feedback from a batch.
 *
 * Usage:
 *   node composition/runSendMunicipalPboFeedback.js --date YYYY-MM-DD|dd:mm:yyyy [--from-batch path] [--force] [--dry-run]
 */
import 'dotenv/config';
import { createMailingResendAdapter } from '../business_modules/mailing/infrastructure/adapters/mailingResendAdapter.js';
import { isPboReviewMailingConfigured } from '../business_modules/pbo_report_review/index.js';
import { runSendMunicipalPboFeedbackCli } from '../business_modules/pbo_report_review/app/sendMunicipalPboFeedbackCli.js';

function createDeliveryPort() {
  if (!isPboReviewMailingConfigured()) return null;
  return createMailingResendAdapter({ apiKey: process.env.RESEND_API_KEY.trim() });
}

try {
  const code = await runSendMunicipalPboFeedbackCli(process.argv.slice(2), {
    mailingDeliveryPort: createDeliveryPort(),
  });
  process.exit(code);
} catch (err) {
  console.error('sendMunicipalPboFeedback failed:', err.message);
  process.exit(1);
}
