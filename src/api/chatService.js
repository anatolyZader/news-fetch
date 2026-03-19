/**
 * Chat service — answers questions about the current resilience report using Haiku.
 * Streams response tokens via SSE.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getCachedReport } from './analysisService.js';

const client = new Anthropic();

function buildReportContext(reportData) {
  if (!reportData) return 'No resilience report is available for today yet.';
  const a = reportData.assessment;
  const scores = (a.components ?? [])
    .map((c) => `- ${c.component_id}: ${c.score}/10 (${c.confidence})`)
    .join('\n');
  return (
    `Today's resilience assessment (${a.date})\n` +
    `Overall score: ${a.overall_resilience_score}/10\n\n` +
    `Component scores:\n${scores}\n\n` +
    `Executive summary:\n${a.cross_component_synthesis ?? ''}\n\n` +
    `Components detail:\n` +
    (a.components ?? [])
      .map((c) => `### ${c.component_id} (${c.score}/10)\n${c.narrative ?? ''}`)
      .join('\n\n')
  );
}

/**
 * Stream a Haiku chat response to the raw reply.
 * history: [{ role: 'user'|'assistant', content: string }, ...]
 */
export async function streamChat(message, history, rawReply) {
  const reportData = getCachedReport();
  const system =
    `You are an expert in Israeli community resilience (Home Front Command framework). ` +
    `Help the user understand today's population resilience assessment.\n\n` +
    `CONTEXT:\n${buildReportContext(reportData)}`;

  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  const send = (data) => rawReply.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        send({ type: 'text', text: event.delta.text });
      }
    }
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }
}
