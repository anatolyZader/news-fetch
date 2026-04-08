/**
 * Chat service — answers questions about the current resilience report using Haiku.
 * Streams response tokens via SSE.  PBO detail is served on-demand via tool use.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getCachedReport } from './analysisService.js';

const client = new Anthropic();

/**
 * Build a one-line-per-municipality PBO index (name + overall avg) for the system prompt,
 * and a full lookup map for the tool.
 */
function buildPboIndex(signals) {
  if (!signals || signals.length === 0) return { index: '', lookup: {} };
  const pbo = signals.filter((s) => s.source_type === 'pbo');
  if (pbo.length === 0) return { index: '', lookup: {} };

  const byMuni = {};
  for (const s of pbo) {
    const name = s.article_source?.replace(/^pbo-/, '') ?? 'unknown';
    if (!byMuni[name]) byMuni[name] = [];
    byMuni[name].push(s);
  }

  // Build compact index: one line per municipality with overall avg
  const indexLines = [];
  const lookup = {};

  for (const [muni, sigs] of Object.entries(byMuni)) {
    const avgs = [];
    const parts = [];
    for (const s of sigs) {
      const m = s.evidence?.match(/\] (.+?): avg=(\d+)%(.*)/);
      if (m) {
        avgs.push(parseInt(m[1], 10));
        const freeText = m[3]?.replace(/^[^—]*— ?/, '').trim();
        parts.push(`${m[1]}: ${m[2]}%${freeText ? ' — ' + freeText : ''}`);
      } else {
        parts.push(s.evidence);
      }
    }
    // Store full detail for tool lookup
    lookup[muni] = parts.join('\n');

    // Extract per-signal avg percentages for overall computation
    const pctMatches = sigs
      .map((s) => s.evidence?.match(/avg=(\d+)%/))
      .filter(Boolean)
      .map((m) => parseInt(m[1], 10));
    const overallAvg = pctMatches.length > 0
      ? Math.round(pctMatches.reduce((a, b) => a + b, 0) / pctMatches.length)
      : null;

    indexLines.push(`${muni}: ${overallAvg != null ? overallAvg + '%' : 'N/A'}`);
  }

  // Sort by avg ascending so outliers are visible at top/bottom
  indexLines.sort();

  const index =
    `\n\nPBO MUNICIPALITY INDEX (${Object.keys(byMuni).length} municipalities, overall avg score):\n` +
    indexLines.join('\n') +
    `\n\nUse the lookup_pbo tool to get detailed per-component data for a specific municipality.`;

  return { index, lookup };
}

function buildReportContext(reportData) {
  if (!reportData) return { context: 'No resilience report is available for today yet.', pboLookup: {} };
  const a = reportData.assessment;
  const scores = (a.components ?? [])
    .map((c) => `- ${c.component_id}: ${c.score}/10 (${c.confidence})`)
    .join('\n');
  const { index: pboIndex, lookup: pboLookup } = buildPboIndex(reportData.signals ?? a.signals);
  const context =
    `Today's resilience assessment (${a.date})\n` +
    `Overall score: ${a.overall_resilience_score}/10\n\n` +
    `Component scores:\n${scores}\n\n` +
    `Executive summary:\n${a.cross_component_synthesis ?? ''}\n\n` +
    `Components detail:\n` +
    (a.components ?? [])
      .map((c) => `### ${c.component_id} (${c.score}/10)\n${c.narrative ?? ''}`)
      .join('\n\n') +
    pboIndex;
  return { context, pboLookup };
}

const LOOKUP_PBO_TOOL = {
  name: 'lookup_pbo',
  description:
    'Look up detailed PBO (Population Behavior Officer) data for a specific municipality. ' +
    'Returns per-component scores and free-text field observations.',
  input_schema: {
    type: 'object',
    properties: {
      municipality: {
        type: 'string',
        description: 'Municipality name (Hebrew), as it appears in the PBO index.',
      },
    },
    required: ['municipality'],
  },
};

/**
 * Stream a Haiku chat response to the raw reply.
 * history: [{ role: 'user'|'assistant', content: string }, ...]
 */
export async function streamChat(message, history, rawReply) {
  const reportData = getCachedReport();
  const { context, pboLookup } = buildReportContext(reportData);

  const system =
    `You are an expert in Israeli community resilience (Home Front Command framework). ` +
    `Help the user understand today's population resilience assessment.\n` +
    `When the user asks about a specific municipality or PBO data, use the lookup_pbo tool to fetch ` +
    `detailed per-component scores and free-text observations. Be specific — cite the municipality name, ` +
    `scores, and observer notes. If the user asks about the source of a finding, explain which data source ` +
    `(news, field reports, radio, PBO) contributed to it.\n` +
    `Answer in the same language the user writes in.\n\n` +
    `CONTEXT:\n${context}`;

  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  const send = (data) => rawReply.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Agentic loop: keep calling the LLM until it produces a final text response
    let currentMessages = messages;
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system,
        messages: currentMessages,
        tools: [LOOKUP_PBO_TOOL],
      });

      // Check if there are tool_use blocks to handle
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      const textBlocks = response.content.filter((b) => b.type === 'text');

      // Stream any text produced so far
      for (const tb of textBlocks) {
        if (tb.text) send({ type: 'text', text: tb.text });
      }

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        break;
      }

      // Process tool calls and build tool_result messages
      const toolResults = toolUseBlocks.map((tu) => {
        if (tu.name === 'lookup_pbo') {
          const muniName = tu.input?.municipality ?? '';
          // Try exact match first, then case-insensitive/partial
          let result = pboLookup[muniName];
          if (!result) {
            const key = Object.keys(pboLookup).find(
              (k) => k.includes(muniName) || muniName.includes(k),
            );
            result = key ? pboLookup[key] : null;
          }
          return {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: result ?? `No PBO data found for "${muniName}". Available: ${Object.keys(pboLookup).join(', ')}`,
          };
        }
        return {
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'Unknown tool',
        };
      });

      // Append assistant response + tool results for next round
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
    }

    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }
}
