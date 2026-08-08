#!/usr/bin/env node
/**
 * Daily digest — one-shot CLI for cron (or systemd timer).
 *
 * Loads mailing preferences from SQLite, sends one Resend email per subscriber
 * who has a non-empty email and at least one product enabled.
 *
 * Ops example (07:00 Asia/Jerusalem; set paths for your host):
 *
 *   CRON_TZ=Asia/Jerusalem
 *   0 7 * * * cd /path/to/news && /usr/bin/env node business_modules/mailing/input/runDailyDigest.js >> /var/log/vibes-witch-mail.log 2>&1
 *
 * Ensure the same environment as the API process: RESEND_API_KEY, MAIL_FROM,
 * optional SQLITE_PATH (defaults to ./db/app.sqlite under repo root when unset),
 * optional MAIL_DIGEST_REPORT_SCOPE / MAIL_DIGEST_REPORT_SELECTION (see mailingConfig.js).
 * Set MAILING_ENABLED=false to skip sends (script exits 0 without sending).
 *
 * Exits 1 on an unrecognized MAIL_DIGEST_REPORT_SCOPE rather than silently
 * mailing subscribers the national report the typo degrades to.
 */
import 'dotenv/config';
import { bootstrapDefaultStateStore } from '../../../cross-cut-modules/persistence/bootstrapStateStore.js';

bootstrapDefaultStateStore();
import { createMailingPreferencesStore } from '../infrastructure/mailingPreferencesStore.js';
import { createMailingResendAdapter } from '../infrastructure/adapters/mailingResendAdapter.js';
import { createMailingService } from '../app/mailingService.js';
import { createDigestReportSource } from '../app/digestReportSource.js';
import { createReportReadPort } from '../../resilience_scorer/index.js';
import { createEvidenceStore } from '../../../db/persistence/evidenceStore.js';
import { getTranslatedReport } from '../../translation/index.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';
import { isMailingConfigured } from '../../../cross-cut-modules/config/mailingEnv.js';

const sqlitePath = resolveSqlitePath();

async function main() {
  if (!isMailingConfigured()) {
    console.log('[mail-digest] Skipping: mailing not configured or MAILING_ENABLED=false');
    process.exit(0);
  }

  const evidenceStore = createEvidenceStore(sqlitePath);
  const prefsStore = createMailingPreferencesStore(sqlitePath);
  const reportReadPort = createReportReadPort();
  const reportSource = createDigestReportSource({ reportReadPort, evidenceStore });
  if (reportSource.config.scopeCoerced) {
    console.error(
      `[mail-digest] Aborting: MAIL_DIGEST_REPORT_SCOPE="${reportSource.config.scopeRaw}" is not a known scope`,
    );
    process.exit(1);
  }

  const mailingService = createMailingService({
    deliveryPort: createMailingResendAdapter({ apiKey: process.env.RESEND_API_KEY.trim() }),
    mailFrom: process.env.MAIL_FROM.trim(),
    getCachedReport: reportSource,
    translateReport: getTranslatedReport,
  });

  const subs = prefsStore.listDigestSubscribers();
  if (subs.length === 0) {
    console.log('[mail-digest] No subscribers');
    process.exit(0);
  }

  let failures = 0;
  for (const sub of subs) {
    const { userUid, email, products, language } = sub;
    try {
      await mailingService.sendDigest({ to: email, products, language });
      console.log(`[mail-digest] Sent ok uid=${userUid} to=${email} lang=${language}`);
    } catch (e) {
      failures += 1;
      console.error(`[mail-digest] Failed uid=${userUid} to=${email}: ${e?.message ?? e}`);
    }
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[mail-digest] Fatal:', e);
  process.exit(1);
});
