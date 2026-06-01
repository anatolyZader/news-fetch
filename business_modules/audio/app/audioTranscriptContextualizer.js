/**
 * Transforms raw diarized transcript segments into scene-structured, English-language
 * narrative articles suitable for resilience signal extraction.
 *
 * Pipeline:
 *   Stage 1 — Deterministic cleaning: merge same-speaker runs, drop filler turns
 *   Stage 2 — LLM scene segmentation: segment by topic, translate to English,
 *             write behavioral narrative per scene
 *   Stage 3 — Format as resilience-ready articles (title + body)
 */

import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import {
  retrieveAudioSceneContext,
  formatAudioSceneContextBlock,
} from '../../../cross-cut-modules/retrieval/fieldRetrieval.js';


/** Max chars per LLM chunk (roughly 15 min of dialogue). */
const CHUNK_CHARS = 8000;
/** Min words for a speaker turn to be kept (drops filler/back-channel). */
const MIN_TURN_WORDS = 4;
/** Model for scene segmentation + translation. */
const MODEL = 'claude-haiku-4-5-20251001';

// ─── Stage 1: Deterministic cleaning ─────────────────────────────────────────

/**
 * Merge consecutive same-speaker turns, drop very short filler turns.
 * @param {Array<{speaker: string, text: string, start?: number, end?: number}>} segments
 * @returns {Array<{speaker: string, text: string, tStart: number, tEnd: number}>}
 */
export function cleanAndMergeSegments(segments) {
  const merged = [];

  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).length;
    if (words < MIN_TURN_WORDS) continue;

    const prev = merged[merged.length - 1];
    if (prev && prev.speaker === seg.speaker) {
      prev.text += ' ' + seg.text.trim();
      prev.tEnd = seg.end ?? prev.tEnd;
    } else {
      merged.push({
        speaker: seg.speaker,
        text: seg.text.trim(),
        tStart: seg.start ?? 0,
        tEnd: seg.end ?? seg.start ?? 0,
      });
    }
  }

  return merged;
}

/**
 * Format merged turns into a plain transcript string for the LLM.
 * @param {Array<{speaker: string, text: string, tStart: number}>} turns
 */
function formatTranscriptForLlm(turns) {
  return turns
    .map((t) => {
      const min = Math.floor(t.tStart / 60);
      const sec = Math.floor(t.tStart % 60);
      const ts = `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}]`;
      return `${ts} ${t.speaker}: ${t.text}`;
    })
    .join('\n');
}

// ─── Stage 2: LLM scene segmentation ─────────────────────────────────────────

const SCENE_PROMPT = `You are analyzing a transcript of a field interview or broadcast to extract behavioral evidence for a population resilience assessment. The transcript may be in Hebrew, Arabic, or mixed languages.

Your task: segment the transcript into coherent scenes, then for each scene write a structured English-language analysis.

A SCENE is a coherent unit of dialogue with a consistent topic, location, or set of speakers. It may be a few turns or a few minutes long. Split when the topic, location, or speakers change significantly.

Each turn in the transcript is prefixed with a timestamp like [02:14]. Use the timestamp of the FIRST turn in each scene for "time_start_sec".

For each scene output a JSON object with these fields:
- "headline": short English headline (max 12 words) describing the behavioral situation
- "scene_type": one of: civilian_testimony | field_report | anchor_report | expert_interview | official_statement | discussion | advertisement | music | station_promo
  Advertisements, commercial breaks, background music segments, and station IDs/promos must be tagged as advertisement/music/station_promo with quality "low".
- "speakers": array of speaker descriptions WITH ROLES, e.g. ["host/interviewer", "civilian (elderly female resident)", "official (mayor)", "expert (psychologist)"]
- "narrative": 2-4 English sentences written in third person describing what people ARE DOING, FEELING, and DECIDING — not just what they say. Focus on behavioral evidence: coping, compliance, avoidance, community action, institutional response, etc.
- "key_quotes": array of up to 4 verbatim quotes translated to English, preserving the speaker's register
- "quality": "high" if the scene contains clear behavioral evidence; "medium" if partial; "low" if mostly noise/logistics/unclear
- "time_start_sec": integer — seconds from start of video where this scene begins (convert [MM:SS] → MM*60+SS)

Return a JSON array of scene objects. No markdown, no commentary — only the JSON array.`;

/**
 * Split merged turns into chunks under CHUNK_CHARS for LLM batching.
 */
function chunkTurns(turns) {
  const chunks = [];
  let current = [];
  let currentChars = 0;

  for (const turn of turns) {
    const line = `${turn.speaker}: ${turn.text}`;
    if (currentChars + line.length > CHUNK_CHARS && current.length > 0) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(turn);
    currentChars += line.length + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Parse LLM JSON array response without backtracking-prone regexes.
 * @param {string} text
 * @returns {Array<object>}
 */
function parseSceneJsonArray(text) {
  const fence = text.indexOf('```');
  if (fence >= 0) {
    const bodyStart = text.indexOf('\n', fence);
    const fenceEnd = text.indexOf('```', bodyStart + 1);
    if (bodyStart >= 0 && fenceEnd > bodyStart) {
      try {
        return JSON.parse(text.slice(bodyStart + 1, fenceEnd).trim());
      } catch {
        // fall through
      }
    }
  }

  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      return JSON.parse(text.slice(arrStart, arrEnd + 1));
    } catch {
      // fall through
    }
  }

  return [];
}

/**
 * Call LLM to segment and contextualize one chunk of transcript turns.
 * @returns {Array<object>} scene objects
 */
async function segmentChunk(turns, ragBlock = '') {
  const transcript = formatTranscriptForLlm(turns);
  let userBody = `Transcript:\n\n${transcript}`;
  if (ragBlock) {
    userBody = `${ragBlock}\n\n${userBody}`;
  }

  const response = await getDefaultLlmPort().createMessage({
    model: MODEL,
    max_tokens: 4096,
    system: SCENE_PROMPT,
    messages: [
      {
        role: 'user',
        content: userBody,
      },
    ],
  });

  const text = response.content[0]?.text ?? '';
  const parsed = parseSceneJsonArray(text);
  if (parsed.length > 0) return parsed;

  console.error('  ⚠ audioTranscriptContextualizer: could not parse LLM response for chunk');
  return [];
}

// ─── Stage 3: Format as resilience-ready articles ─────────────────────────────

/**
 * Build a timestamped URL for a YouTube (or generic) video URL.
 * YouTube: appends &t=<sec>. Other URLs: appends #t=<sec>.
 */
function timestampedUrl(baseUrl, timeSec) {
  if (!baseUrl || timeSec == null) return baseUrl ?? null;
  const sec = Math.round(timeSec);
  if (!baseUrl) return null;
  try {
    const u = new URL(baseUrl);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      u.searchParams.set('t', String(sec));
      return u.toString();
    }
  } catch { /* fall through */ }
  return `${baseUrl}#t=${sec}`;
}

/**
 * Convert a scene object into a resilience-ready article {title, body}.
 */
function sceneToArticle(scene, index, station, program, sourceUrl) {
  const speakerList = (scene.speakers ?? []).join(', ') || 'unknown';
  const sceneType = scene.scene_type ?? 'unknown';
  const tSec = typeof scene.time_start_sec === 'number' ? scene.time_start_sec : null;
  const url = timestampedUrl(sourceUrl, tSec);

  const lines = [
    `[Scene type: ${sceneType} | Speakers: ${speakerList}]`,
    '',
    scene.narrative ?? '',
  ];

  if (scene.key_quotes?.length) {
    lines.push('', 'Key quotes:');
    for (const q of scene.key_quotes) {
      lines.push(`- "${q}"`);
    }
  }

  return {
    title: `${station} — ${program} — scene ${index + 1}: ${scene.headline ?? 'untitled'}`,
    body: lines.join('\n'),
    quality: scene.quality ?? 'medium',
    scene_type: scene.scene_type ?? 'unknown',
    url,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point. Takes raw diarized segments, returns resilience-ready articles.
 *
 * @param {Array<{speaker: string, text: string, start?: number, end?: number}>} segments
 * @param {{ station: string, program: string, sourceUrl?: string, onUsage?: Function }} opts
 * @returns {Promise<Array<{title: string, body: string, url: string|null}>>}
 */
export async function contextualizeTranscript(segments, {
  station,
  program,
  sourceUrl,
  onUsage,
  locality = null,
  retrievalService = null,
} = {}) {
  // Stage 1: clean
  const merged = cleanAndMergeSegments(segments);
  if (merged.length === 0) return [];

  let ragBlock = '';
  const retrieval = retrievalService?.retrieval ?? retrievalService;
  if (retrieval) {
    const audioCtx = await retrieveAudioSceneContext(
      { station, program, locality },
      retrieval,
    );
    ragBlock = formatAudioSceneContextBlock(audioCtx);
  }

  // Stage 2: LLM segmentation per chunk
  const chunks = chunkTurns(merged);
  const allScenes = [];

  for (let i = 0; i < chunks.length; i++) {
    process.stderr.write(`  [contextualize chunk ${i + 1}/${chunks.length}] `);
    const scenes = await segmentChunk(chunks[i], ragBlock);
    process.stderr.write(`${scenes.length} scene(s)\n`);

    if (onUsage) {
      // Rough token estimate: ~4 chars/token, Haiku pricing
      const inputTokens = Math.ceil(formatTranscriptForLlm(chunks[i]).length / 4);
      onUsage({
        label: `Contextualize chunk ${i + 1}/${chunks.length}`,
        model: MODEL,
        inputTokens,
        outputTokens: 800,
      });
    }

    allScenes.push(...scenes);
  }

  // Stage 3: filter noise + format all scenes as articles
  const DROP_TYPES = new Set(['advertisement', 'music', 'station_promo']);
  const filteredScenes = allScenes.filter((s) => {
    const t = String(s?.scene_type ?? '').trim();
    const q = String(s?.quality ?? '').trim();
    if (DROP_TYPES.has(t)) return false;
    if (q === 'low') return false;
    return true;
  });

  const articles = filteredScenes
    .map((scene, i) => sceneToArticle(scene, i, station ?? 'Audio', program ?? 'Recording', sourceUrl));

  return articles;
}
