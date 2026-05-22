import { isHomefrontRelevant } from './homefrontKeywords.js';
import { normalizeTopicConcept } from './topicConceptNormalizer.js';

/**
 * Population-behavior relevance for Telegram/resilience pipeline.
 * Mirrors news-sites homefront LLM prefilter intent (extractHomefrontArticles.js):
 * keep observable civilian functioning under emergency; drop general news/announcements.
 *
 * @see business_modules/news-sites/app/extractHomefrontArticles.js FETCH_PREFILTER_SYSTEM_PROMPT
 */

/** Observable population behavior / functioning signals (8-component evidence). */
const BEHAVIOR_SIGNAL_RES = [
  /\bתושב|תושבים|אזרח|אזרחים|population|residents?|civilians?\b/i,
  /\bמקלט|ממ"ד|ממ״ד|מרחב מוגן|מקלטים|shelter|safe room\b/i,
  /\bפינוי|מפונ|מפונים|evacuat|displaced\b/i,
  /\bבתי\s*ספר|לימודים|schools?|remote learning|למידה מרחוק\b/i,
  /\b(פתיח|סגיר|סגור|נפתח|נסגר).{0,40}(בתי|בית|עסק|בתי ספר|גנים)\b/i,
  /\bשגרת חירום\b/i,
  /\b(תושב|תושבים).{0,40}(שגרה|חזרה לשגרה)\b/i,
  /\b(חזרה לשגרה).{0,40}(לימודים|בתי|תושב|עסק|קהילה)\b/i,
  /\bחרדה|חרדות|פחד|לחץ|טראומ|מצוק|anxiety|fear|trauma|stress|PTSD\b/i,
  /\bהתנהג|התנדב|מתנדב|solidarity|עזרה הדדית|קהילה\b/i,
  /\b(נכנס|נכנסו|יוצא|יוצאים|נשאר|נשארו|עזב|עזבו|יצאו)\b/i,
  /\bתושבים מדווחים|דיווח.{0,20}שטח|field report|report from residents\b/i,
  /\bמצב נפש|תמיכה נפש|חוסן|resilien|cop(?:ing|e)\b/i,
  /\b(קשיש|ילד|נוער|מוגבל|פגיע|vulnerable|elderly|disabled|special needs)\b/i,
  /\b(סגיר|פיטור|כלכלי|economic|workforce|עסקים)\b/i,
  /\b(דלתות|שער|לא נכנס|אי.?ציות|compliance|gate)\b/i,
  /\b(מחסה|התגוננ|הנחיות.{0,30}(עורף|תושב|פינוי|מקלט))\b/i,
];

/** UAV / hostile-aircraft mention — topic signal only, not population behavior by itself. */
const UAV_MENTION_RES = [
  /חדירת כלי טיס/i,
  /כטב["']?ם/i,
  /ירי כטב/i,
  /מטרה אווירית/i,
  /רחפן/i,
  /hostile aircraft|UAV intrusion|drone intrusion/i,
  /התרעות.{0,40}(כלי טיס|כטב|רחפן|UAV|drone)/i,
  /(כלי טיס|כטב|רחפן|UAV|drone).{0,40}התרעות/i,
];

/** Short template alerts — event markers, not population-behavior evidence. */
const PURE_ALERT_START_RE = /^(🚨|✈️|\s)*(אזעקה|ירי|ירי רקטות|חדירת כלי טיס|כטב["']?ם|ירי כטב["']?ם|alert|siren|rocket fire|UAV|drone)/i;

/** IDF / military operational reporting — not population-behavior evidence. */
const MILITARY_OPS_NEWS_RES = [
  /\b(מחבל|מחבלים|חיסול|חוסל|חוסלו|אביר לילה|מטוס קרב|מטוסי קרב|גדוד \d+|אוגדה \d+|תא"ל|חדירת מחבל|תצפיות צה"ל|terrorist|eliminated|infiltration|airstrike|fighter jet)\b/i,
  /^פרטים חדשים על/i,
  /\bNews \d+\s*\|/i,
];

/** Generic official announcements without civilian behavior described. */
const EXCLUDE_NON_BEHAVIOR_RES = [
  /^(דובר|הודעה רשמית|הודעת דובר|משרד ה|ועדת|הכנסת|ממשלה)\b/i,
];

/** Channels flagged in registry as news/editorial — require resident voice, not reposts. */
function channelRequiresStrictBehaviorFilter(channel = {}) {
  const notes = String(channel.collectionNotes ?? '');
  if (/strict filter|general news repost/i.test(notes)) return true;
  return (channel.doNotUseFor ?? []).some((item) => /news|editorial|repost/i.test(String(item)));
}

/**
 * @param {string} [topic]
 * @returns {string[]}
 */
function topicConceptIds(topic) {
  if (!topic) return [];
  return normalizeTopicConcept(topic).conceptIds;
}

/**
 * @param {string} text
 */
export function isMilitaryOperationsNews(text) {
  const body = String(text ?? '');
  return MILITARY_OPS_NEWS_RES.some((re) => re.test(body));
}

/**
 * @param {string} text
 */
export function isUavMention(text) {
  const body = String(text ?? '');
  return UAV_MENTION_RES.some((re) => re.test(body));
}

/**
 * Attack/siren alert templates with no described civilian response.
 *
 * @param {string} text
 */
export function isAttackAlertOnly(text) {
  const body = String(text ?? '').trim();
  if (!isUavMention(body) && !PURE_ALERT_START_RE.test(body) && !/צופר\s*-\s*צבע אדום/i.test(body)) {
    return false;
  }
  if (hasPopulationBehaviorSignal(body)) return false;
  if (/\b(תושב|תושבים|אזרח|מקלט|מרחב מוגן|חרדה|פחד|נכנס|יוצא|מפונ|ראיתי|שומע)\b/i.test(body)) {
    return false;
  }
  return true;
}

/**
 * @param {string} text
 */
export function hasPopulationBehaviorSignal(text) {
  const body = String(text ?? '');
  return BEHAVIOR_SIGNAL_RES.some((re) => re.test(body));
}

/**
 * @param {string} text
 */
export function isPureAlertTemplate(text) {
  const body = String(text ?? '').trim();
  if (body.length > 200 && !isAttackAlertOnly(body)) return false;
  if (isAttackAlertOnly(body)) return true;
  if (body.length > 140) return false;
  if (!PURE_ALERT_START_RE.test(body)) return false;
  return !hasPopulationBehaviorSignal(body);
}

/**
 * @param {string} text
 * @param {import('./telegramChannelRegistry.js').TelegramChannelEntry} [channel]
 * @param {{ topic?: string }} [options]
 */
export function isHomefrontBehaviorRelevant(text, channel = {}, options = {}) {
  const body = String(text ?? '').trim();
  if (body.length < 8) return false;

  if (isAttackAlertOnly(body)) return false;
  if (isPureAlertTemplate(body)) return false;
  if (isMilitaryOperationsNews(body)) return false;

  const conceptIds = topicConceptIds(options.topic);
  const uavTopic = conceptIds.includes('uav_drone');

  if (uavTopic && isUavMention(body) && !hasPopulationBehaviorSignal(body)) {
    const hasResidentVoice = /\b(תושב|תושבים מדווחים|דיווח|ראיתי|שומע|שכנ|שאל|חושש)\b/i.test(body);
    if (!hasResidentVoice) return false;
  }

  if (!isHomefrontRelevant('', body) && !(uavTopic && hasPopulationBehaviorSignal(body))) {
    return false;
  }

  const category = String(channel.sourceCategory ?? '');
  const citizenLevel = String(channel.citizenVoiceLevel ?? '');
  const isOfficialOrLowVoice = /official|municipal|security_updates|regional_updates/i.test(category)
    || citizenLevel === 'low';
  const strictChannel = channelRequiresStrictBehaviorFilter(channel);

  const hasBehavior = hasPopulationBehaviorSignal(body);
  const hasResidentVoice = /\b(תושב|תושבים מדווחים|דיווח|ראיתי|שומע|שכנ|שאל|חושש)\b/i.test(body);

  if (strictChannel && !hasResidentVoice) return false;

  if (isOfficialOrLowVoice) {
    if (!hasBehavior) return false;
  } else if (!hasBehavior && !hasResidentVoice) {
    return false;
  }

  for (const re of EXCLUDE_NON_BEHAVIOR_RES) {
    if (re.test(body) && !hasBehavior && !hasResidentVoice) return false;
  }

  return true;
}

/**
 * @param {object} post
 * @param {import('./telegramChannelRegistry.js').TelegramChannelEntry} channel
 * @param {{ topic?: string }} [options]
 */
export function isTelegramPostBehaviorEvidence(post, channel, options = {}) {
  return isHomefrontBehaviorRelevant(post?.text ?? '', channel, options);
}

/** @deprecated use isUavMention */
export const isUavAlertEvidence = isUavMention;
