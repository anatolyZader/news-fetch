/**
 * Helpers for evidence submission ingest and content review.
 */

import { safeFetch } from '../../cross-cut-modules/security/infrastructure/safeFetch.js';

const AUDIO_URL_HINT_REGEX = /\.(mp3|wav|m4a|aac|ogg|flac|opus|webm|mp4)(?:$|[?#])/i;
const VIDEO_URL_HINT_REGEX = /\.(mp4|mov|mkv|webm|avi|m4v)(?:$|[?#])/i;
const TITLE_TAG_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const SPEAKER_LINE_RE = /^\s*([A-Za-z_][A-Za-z0-9_ -]{1,40}):/;
const URL_TERMINATOR_RE = /[\s<>"')\]]/;

const LOCAL_VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm']);
const LOCAL_AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.opus']);

function trimUrlTrailingPunctuation(url) {
  let end = url.length;
  while (end > 0 && '),.;!?'.includes(url[end - 1])) end -= 1;
  return url.slice(0, end);
}

function nextUrlStart(text, from) {
  const httpAt = text.indexOf('http://', from);
  const httpsAt = text.indexOf('https://', from);
  if (httpAt === -1) return httpsAt;
  if (httpsAt === -1) return httpAt;
  return Math.min(httpAt, httpsAt);
}

function extractUrlsFromText(text) {
  /** @type {string[]} */
  const urls = [];
  let i = 0;
  while (i < text.length) {
    const start = nextUrlStart(text, i);
    if (start === -1) break;

    let end = start;
    while (end < text.length && !URL_TERMINATOR_RE.test(text[end])) end += 1;
    urls.push(trimUrlTrailingPunctuation(text.slice(start, end)));
    i = end;
  }
  return urls;
}

export function extractUrls(text) {
  if (typeof text !== 'string' || !text) return [];
  return extractUrlsFromText(text);
}

export function isLikelyAudioDownloadUrl(url) {
  if (!AUDIO_URL_HINT_REGEX.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isLikelyVideoDownloadUrl(url) {
  if (!VIDEO_URL_HINT_REGEX.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isYoutubeUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes('youtube.com') || h === 'youtu.be';
  } catch {
    return false;
  }
}

/** @param {string} filePath @returns {'audio'|'video'|'unsupported'} */
export function classifyLocalEvidenceFile(filePath, extnameFn) {
  const ext = extnameFn(filePath).toLowerCase();
  if (LOCAL_VIDEO_EXT.has(ext)) return 'video';
  if (LOCAL_AUDIO_EXT.has(ext)) return 'audio';
  return 'unsupported';
}

export function isPathUnderUploadRoot(filePath, rootDir, resolveFn, sepChar) {
  const file = resolveFn(filePath);
  const root = resolveFn(rootDir);
  return file === root || file.startsWith(root + sepChar);
}

function normalizeWhitespace(text) {
  return String(text ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function stripTaggedHtmlBlocks(html, tagName) {
  const openNeedle = `<${tagName}`;
  const closeNeedle = `</${tagName}>`;
  let result = '';
  let i = 0;
  while (i < html.length) {
    const start = html.toLowerCase().indexOf(openNeedle, i);
    if (start === -1) {
      result += html.slice(i);
      break;
    }
    result += html.slice(i, start);
    const openEnd = html.indexOf('>', start);
    if (openEnd === -1) break;
    const closeStart = html.toLowerCase().indexOf(closeNeedle, openEnd);
    if (closeStart === -1) break;
    i = html.indexOf('>', closeStart);
    if (i === -1) break;
    i += 1;
  }
  return result;
}

function stripHtmlTags(html) {
  let result = '';
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf('<', i);
    if (open === -1) {
      result += html.slice(i);
      break;
    }
    result += html.slice(i, open);
    const close = html.indexOf('>', open);
    if (close === -1) break;
    result += ' ';
    i = close + 1;
  }
  return result;
}

function htmlToPlainText(html) {
  const noScript = stripTaggedHtmlBlocks(stripTaggedHtmlBlocks(html, 'script'), 'style');
  const noTags = stripHtmlTags(noScript);
  return normalizeWhitespace(noTags);
}

export async function webPageToEvidenceItem(url, date) {
  const response = await safeFetch(url);
  if (!response.ok) throw new Error(`Web page fetch failed (${response.status})`);
  const html = await response.text();
  const titleMatch = TITLE_TAG_RE.exec(html);
  const title = normalizeWhitespace(titleMatch?.[1] ?? '');
  const body = htmlToPlainText(html).slice(0, 3000);
  if (!body) throw new Error('Web page had no parseable text');
  return {
    date,
    source_type: 'news',
    source_label: 'web-url',
    source_url: url,
    title: title || `Web evidence from ${url}`,
    body,
    published_at: date,
  };
}

/** @returns {'audio_download_url'|'video_download_url'|'youtube_url'|'web_article_url'} */
export function classifyUrlKind(url) {
  if (isLikelyAudioDownloadUrl(url)) return 'audio_download_url';
  if (isYoutubeUrl(url)) return 'youtube_url';
  if (isLikelyVideoDownloadUrl(url)) return 'video_download_url';
  return 'web_article_url';
}

export function toAnalysisArticle(item, idx, sourceFile) {
  return {
    title: item.title ?? `Submission evidence ${idx + 1}`,
    body: item.body ?? '',
    url: item.source_url ?? '',
    publishedAt: item.published_at ?? '',
    source: item.source_label ?? 'submission',
    sourceFile,
  };
}

function collectParticipants(items) {
  const participantSet = new Set();
  for (const item of items) {
    const lines = String(item.body ?? '').split('\n');
    for (const line of lines) {
      const speakerMatch = SPEAKER_LINE_RE.exec(line);
      if (speakerMatch) {
        const raw = speakerMatch[1].trim();
        if (raw.length > 0) participantSet.add(raw);
      }
    }
  }
  return [...participantSet].slice(0, 12);
}

function buildTopicAndScenes(items) {
  const scenePoints = [];
  const topicFragments = [];
  for (const item of items) {
    const compact = String(item.body ?? '').replaceAll(/\s+/g, ' ').trim();
    if (!compact) continue;
    topicFragments.push(compact);
    if (scenePoints.length < 6) {
      scenePoints.push(compact.length > 220 ? `${compact.slice(0, 220)}...` : compact);
    }
  }
  const topicSummaryRaw = topicFragments.slice(0, 2).join(' ');
  const topicSummary =
    topicSummaryRaw.length > 360 ? `${topicSummaryRaw.slice(0, 360)}...` : topicSummaryRaw;
  return { topicSummary, scenePoints };
}

function buildVideoTimeline(items) {
  const isYoutubeSubmission = items.some((i) => i.source_label === 'youtube');
  if (!isYoutubeSubmission) return null;
  return items.slice(0, 14).map((i) => {
    const headline = String(i.title ?? '').replace(/^.*?—\s*scene\s+\d+:\s*/i, '').trim() || null;
    return {
      headline,
      url: i.source_url || null,
      quality: i.quality ?? null,
      text: String(i.body ?? '').trim(),
    };
  });
}

export function buildExtractedContentReview(items, autoIngest) {
  const { topicSummary, scenePoints } = buildTopicAndScenes(items);
  const sourceTypes = [...new Set(items.map((i) => i.source_type).filter(Boolean))];
  const sources = [...new Set(items.map((i) => i.source_label).filter(Boolean))].slice(0, 6);
  const snippets = items.slice(0, 10).map((i) => {
    const text = String(i.body ?? '').replaceAll(/\s+/g, ' ').trim();
    return {
      title: i.title ?? '(untitled)',
      sourceType: i.source_type ?? 'unknown',
      sourceUrl: i.source_url ?? '',
      snippet: text.length > 260 ? `${text.slice(0, 260)}...` : text,
    };
  });

  return {
    extractedItems: items.length,
    sourceTypes,
    sources,
    ingest: autoIngest,
    snippets,
    videoTimeline: buildVideoTimeline(items),
    plotReview: {
      topic: topicSummary || 'Topic could not be confidently inferred from extracted text.',
      participants: collectParticipants(items),
      whatWasShown: scenePoints,
    },
  };
}

export function buildChatSystemHint(scope) {
  if (!scope || typeof scope !== 'object') return '';
  if (scope.type === 'component' && scope.id) {
    const labelSuffix = scope.label ? ` (${scope.label})` : '';
    return `User focus: component=${scope.id}${labelSuffix}. Prefer citing evidence for this component unless asked otherwise.`;
  }
  if (scope.type === 'all') return 'User focus: full report context.';
  return '';
}

export function multipartFieldValue(part) {
  return typeof part.value === 'string' ? part.value : '';
}
