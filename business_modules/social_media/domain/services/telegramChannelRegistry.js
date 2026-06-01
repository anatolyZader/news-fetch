import { getDefaultStateStore } from '../../../../cross-cut-modules/persistence/infrastructure/fsStateStoreAdapter.js';
const stateStore = getDefaultStateStore();
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNELS_FILENAME = 'telegram-public-channels.json';
const DEFAULT_MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Normalized channel entry for MTProto collection.
 * Legacy flat entries and research `sources[]` entries are both supported.
 *
 * @typedef {{
 *   username: string,
 *   title?: string,
 *   locality?: string,
 *   lang?: string,
 *   type?: string,
 *   enabled?: boolean,
 *   collectEnabled?: boolean,
 *   priority?: number,
 *   id?: string,
 *   sourceCategory?: string,
 *   sourceType?: string,
 *   citizenVoiceLevel?: string,
 *   emergencyResearchValue?: string,
 *   coverageArea?: string[],
 *   exampleSearchTerms?: string[],
 *   accessStatus?: string,
 *   recommendedUse?: string[],
 *   doNotUseFor?: string[],
 *   collectionNotes?: string,
 * }} TelegramChannelEntry
 */

/**
 * @param {unknown} entry
 * @returns {string}
 */
function extractUsername(entry) {
  const handle = entry.telegram_handle ?? entry.username ?? '';
  return String(handle).trim().replace(/^@/, '');
}

/**
 * @param {unknown} entry
 * @returns {string|undefined}
 */
function extractLocality(entry) {
  if (entry.locality) return String(entry.locality);
  const areas = entry.coverage_area ?? entry.coverageArea;
  if (!Array.isArray(areas) || !areas.length) return undefined;
  const broad = new Set(['ישראל', 'צפון', 'קו העימות', 'גליל', 'גולן', 'גליל עליון', 'גליל מערבי']);
  const specific = areas.find((a) => !broad.has(String(a).trim()));
  return String(specific ?? areas[0]).trim();
}

/**
 * @param {unknown} entry
 * @returns {string|undefined}
 */
function extractLang(entry) {
  if (entry.lang) return String(entry.lang);
  const langs = entry.language;
  if (Array.isArray(langs) && langs.length) return String(langs[0]);
  return undefined;
}

/**
 * Only explicit opt-outs skip collection. Research metadata (citizen_voice_level,
 * source_category, candidate access_status) is preserved for downstream review,
 * not used to hard-exclude sources at load time.
 *
 * @param {unknown} entry
 */
function isCollectEnabled(entry) {
  if (entry.enabled === false) return false;
  if (entry.collect_enabled === false || entry.collectEnabled === false) return false;
  return true;
}

/**
 * @param {unknown} entry
 * @param {Partial<TelegramChannelEntry>} mapped
 * @returns {TelegramChannelEntry|null}
 */
function finalizeEntry(entry, mapped) {
  if (!mapped.username || !isCollectEnabled(entry)) return null;
  return /** @type {TelegramChannelEntry} */ (mapped);
}

/**
 * @param {unknown} entry
 * @returns {TelegramChannelEntry|null}
 */
function normalizeLegacyEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const username = extractUsername(entry);
  return finalizeEntry(entry, {
    username,
    title: entry.title ? String(entry.title) : undefined,
    locality: extractLocality(entry),
    lang: extractLang(entry),
    type: entry.type ? String(entry.type) : undefined,
    collectEnabled: true,
    priority: Number(entry.priority ?? 99),
  });
}

/**
 * @param {unknown} entry
 * @returns {string|undefined}
 */
function extractTitle(entry) {
  if (entry.display_name) return String(entry.display_name);
  if (entry.title) return String(entry.title);
  return undefined;
}

/**
 * @param {unknown} entry
 * @returns {TelegramChannelEntry|null}
 */
function normalizeResearchEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const username = extractUsername(entry);
  return finalizeEntry(entry, {
    username,
    title: extractTitle(entry),
    locality: extractLocality(entry),
    lang: extractLang(entry),
    collectEnabled: true,
    priority: Number(entry.priority ?? 99),
    id: entry.id ? String(entry.id) : undefined,
    sourceCategory: entry.source_category ? String(entry.source_category) : undefined,
    sourceType: entry.source_type ? String(entry.source_type) : undefined,
    citizenVoiceLevel: entry.citizen_voice_level ? String(entry.citizen_voice_level) : undefined,
    emergencyResearchValue: entry.emergency_research_value
      ? String(entry.emergency_research_value)
      : undefined,
    coverageArea: Array.isArray(entry.coverage_area)
      ? entry.coverage_area.map(String)
      : [],
    exampleSearchTerms: Array.isArray(entry.example_search_terms)
      ? entry.example_search_terms.map(String)
      : [],
    accessStatus: entry.access_status ? String(entry.access_status) : undefined,
    recommendedUse: Array.isArray(entry.recommended_use)
      ? entry.recommended_use.map(String)
      : [],
    doNotUseFor: Array.isArray(entry.do_not_use_for)
      ? entry.do_not_use_for.map(String)
      : [],
    collectionNotes: entry.collection_notes ? String(entry.collection_notes) : undefined,
  });
}

/**
 * @param {unknown} parsed
 * @returns {TelegramChannelEntry[]}
 */
export function parseTelegramChannelRegistry(parsed) {
  let entries = [];
  if (Array.isArray(parsed)) {
    entries = parsed.map(normalizeLegacyEntry).filter(Boolean);
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.sources)) {
    entries = parsed.sources.map(normalizeResearchEntry).filter(Boolean);
  }
  return entries.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

/**
 * @param {string} [moduleRoot] Defaults to business_modules/social_media/
 * @returns {TelegramChannelEntry[]}
 */
export function loadTelegramChannels(moduleRoot = DEFAULT_MODULE_ROOT) {
  const path = resolve(moduleRoot, CHANNELS_FILENAME);
  if (!stateStore.existsSync(path)) return [];
  let parsed;
  try {
    parsed = JSON.parse(stateStore.readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
  return parseTelegramChannelRegistry(parsed);
}

export { CHANNELS_FILENAME, DEFAULT_MODULE_ROOT };
