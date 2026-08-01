/**
 * Pure helpers for municipal PBO review batch export / send selection.
 */
import { resolve } from 'node:path';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_COLON = /^(\d{1,2}):(\d{1,2}):(\d{4})$/;
const DMY_SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Parse CLI/slash dates to YYYY-MM-DD.
 * Accepts ISO (`2026-07-26`) and `dd:mm:yyyy` / `dd/mm/yyyy`.
 * @param {string|null|undefined} input
 * @returns {string}
 */
export function parsePboReviewDate(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('date is required');
  if (ISO_DATE.test(raw)) {
    assertValidYmd(raw);
    return raw;
  }
  const m = raw.match(DMY_COLON) || raw.match(DMY_SLASH);
  if (!m) {
    throw new Error(`invalid date "${raw}" — use YYYY-MM-DD or dd:mm:yyyy`);
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  assertValidYmd(iso);
  return iso;
}

function assertValidYmd(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`invalid calendar date "${iso}"`);
  }
}

/**
 * @param {string} repoRoot
 * @param {string} date YYYY-MM-DD
 * @returns {string}
 */
export function defaultBatchPath(repoRoot, date) {
  return resolve(
    repoRoot,
    'business_modules/pbo_report_review/data/reviews/batches',
    `pbo-muni-review-${date}.json`,
  );
}

/**
 * @param {string} batchPath
 * @returns {string}
 */
export function defaultSendLogPath(batchPath) {
  return String(batchPath).replace(/\.json$/i, '-send-log.json');
}

/**
 * @param {{ email?: string, language?: string }|null|undefined} officer
 * @returns {{ email: string, language: string }|null}
 */
function normalizeOfficer(officer) {
  const email = String(officer?.email ?? '').trim();
  if (!email) return null;
  const language = ['en', 'he', 'ru'].includes(officer?.language) ? officer.language : 'he';
  return { email, language };
}

/**
 * Group a review's gaps (critique) and questions (missing info) under each
 * resilience component of the raw report, so every component block reads:
 * raw fields → critique → questions. Component-less items go to `general`.
 * @param {{ components?: Record<string, object> }|null} raw
 * @param {Array<object>} gaps
 * @param {Array<object>} questions
 */
function groupReviewByComponent(raw, gaps, questions) {
  const components = {};
  for (const [cid, fields] of Object.entries(raw?.components ?? {})) {
    components[cid] = { ...fields, gaps: [], questions: [] };
  }
  const general = { gaps: [], questions: [] };
  const bucket = (componentId) => {
    if (!componentId) return general;
    components[componentId] ??= { name: componentId, avg: null, scores: [], texts: [], gaps: [], questions: [] };
    return components[componentId];
  };
  for (const g of gaps ?? []) bucket(g.componentId).gaps.push(g);
  for (const q of questions ?? []) bucket(q.componentId).questions.push(q);
  return { components, general };
}

/**
 * Flatten a batch row's editable questions back into one list for sending.
 * Order: general (universal) questions first, then per-component.
 * Legacy batches with a top-level `questions` array pass through unchanged.
 * @param {object} row batch municipality row
 * @returns {Array<object>|null} null when the row carries no question fields at all
 */
export function collectBatchRowQuestions(row) {
  if (Array.isArray(row?.questions)) return row.questions;
  if (!row?.components && !row?.general) return null;
  const out = [...(row?.general?.questions ?? [])];
  for (const c of Object.values(row?.components ?? {})) {
    out.push(...(c?.questions ?? []));
  }
  return out;
}

/**
 * @param {object} opts
 * @param {string} opts.date
 * @param {Array<object>} opts.reviews store review rows
 * @param {(name: string) => ({ email?: string, language?: string }|null)} opts.lookupOfficer
 * @param {(name: string) => (object|null)} [opts.lookupRawReport] original PBO report fields for the municipality
 * @param {string} [opts.generatedAt]
 */
export function buildBatchDocument({ date, reviews, lookupOfficer, lookupRawReport, generatedAt }) {
  const municipalities = (reviews ?? []).map((r) => {
    const officer = normalizeOfficer(lookupOfficer?.(r.municipality));
    const sufficient = Boolean(r.sufficient);
    const send = !sufficient && Boolean(officer?.email);
    const raw = lookupRawReport?.(r.municipality) ?? null;
    const { components, general } = groupReviewByComponent(raw, r.gaps ?? [], r.questions ?? []);
    return {
      municipality: r.municipality,
      sufficient,
      status: r.status ?? (sufficient ? 'resolved' : 'open'),
      gapsHash: r.gapsHash ?? '',
      language: r.language ?? officer?.language ?? 'he',
      officer,
      send,
      emailSentAt: r.emailSentAt ?? null,
      sourceFile: raw?.sourceFile ?? null,
      components,
      general,
    };
  });

  const sufficientCount = municipalities.filter((m) => m.sufficient).length;
  const missingOfficerEmail = municipalities.filter((m) => !m.sufficient && !m.officer?.email).length;
  const needsFeedback = municipalities.filter((m) => !m.sufficient).length;

  return {
    date,
    generatedAt: generatedAt ?? new Date().toISOString(),
    municipalities,
    summary: {
      total: municipalities.length,
      sufficient: sufficientCount,
      needsFeedback,
      missingOfficerEmail,
    },
  };
}

/**
 * Rows eligible for outbound feedback mail from an operator-revised batch.
 * @param {{ municipalities?: Array<object> }} batch
 * @returns {Array<object>}
 */
export function selectMunicipalitiesToSend(batch) {
  return (batch?.municipalities ?? []).filter((row) => {
    if (row.send === false) return false;
    if (row.sufficient) return false;
    const email = String(row.officer?.email ?? '').trim();
    return Boolean(email);
  });
}
