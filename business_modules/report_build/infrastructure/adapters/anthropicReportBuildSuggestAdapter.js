import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT =
  `You help an Israeli field officer write a short structured field report.\n` +
  `Given ONE draft text (free typing), return ONLY a JSON object with two keys:\n` +
  `  - "_structured": a minimal structured summary\n` +
  `  - "_assessment": up to 3 concise Hebrew follow-up questions (no parentheses)\n\n` +
  `STRICT RULES:\n` +
  `- Do NOT invent facts. If the officer didn't state something, use null.\n` +
  `- Keep questions short (one sentence each) and aimed at missing evidence.\n` +
  `- Do NOT include any explanations in parentheses.\n` +
  `- Output MUST be valid JSON, nothing else.\n\n` +
  `Allowed values:\n` +
  `- spread: "isolated" | "noticeable" | "widespread" | null\n` +
  `- sourceBasis: "direct" | "staff" | "residents" | "mixed" | null\n`;

function emptyOutput() {
  return {
    structured: { observation: { locality: null, behavior: null, spread: null, sourceBasis: null }, componentLinks: [] },
    assessment: { sufficient: false, topQuestions: [] },
  };
}

function safeJsonParse(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // best-effort: extract first {...} block
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeStructured(raw) {
  const obs = raw?.observation ?? {};
  return {
    observation: {
      locality: typeof obs.locality === 'string' && obs.locality.trim() ? obs.locality.trim() : null,
      behavior: typeof obs.behavior === 'string' && obs.behavior.trim() ? obs.behavior.trim() : null,
      spread: ['isolated', 'noticeable', 'widespread'].includes(obs.spread) ? obs.spread : null,
      sourceBasis: ['direct', 'staff', 'residents', 'mixed'].includes(obs.sourceBasis) ? obs.sourceBasis : null,
    },
    componentLinks: Array.isArray(raw?.componentLinks)
      ? raw.componentLinks
          .filter((l) => l && typeof l.componentId === 'string')
          .map((l) => ({
            componentId: l.componentId,
            direction: typeof l.direction === 'string' ? l.direction : 'mixed',
            rationale: typeof l.rationale === 'string' ? l.rationale.slice(0, 200) : '',
          }))
          .slice(0, 4)
      : [],
  };
}

function normalizeAssessment(raw) {
  return {
    sufficient: !!raw?.sufficient,
    topQuestions: Array.isArray(raw?.topQuestions)
      ? raw.topQuestions
          .filter((q) => typeof q === 'string' && q.trim())
          .map((q) => q.trim().slice(0, 220))
          .slice(0, 3)
      : [],
  };
}

/**
 * @param {{ anthropicApiKey: string }} deps
 */
export function createAnthropicReportBuildSuggestAdapter({ anthropicApiKey }) {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  return {
    /**
     * Duck-type compatible with analyzerPort: analyzeTurnHistory(turnHistory, senderName)
     * We only care about the latest officer text for suggestions.
     */
    async analyzeTurnHistory(turnHistory) {
      const turns = Array.isArray(turnHistory) ? turnHistory : [];
      const last = turns[turns.length - 1];
      const text = String(last?.text ?? '').trim();
      if (!text) return emptyOutput();

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 450,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              `Draft text:\n` +
              `${text}\n\n` +
              `Return JSON with keys "_structured" and "_assessment".`,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      const parsed = safeJsonParse(textBlock?.text ?? '');
      if (!parsed || typeof parsed !== 'object') return emptyOutput();

      const structured = normalizeStructured(parsed._structured ?? parsed.structured ?? null);
      const assessment = normalizeAssessment(parsed._assessment ?? parsed.assessment ?? null);
      return { structured, assessment, signals: [] };
    },
  };
}

