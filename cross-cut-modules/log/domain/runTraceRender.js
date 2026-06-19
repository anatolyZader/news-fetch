/**
 * Pure renderer: run-trace events[] -> readable Markdown.
 *
 * Handles two layouts for the per-signal table:
 *   - B-off: columns are # | type | quote | conf | self-check | status
 *   - B-on:  adds a "rationale" column when any signal carries a model rationale.
 * The "self-check" column is shown only when at least one signal has self-check info.
 */

const RAW_TEXT_PREVIEW_CHARS = 800;

function collapseWs(s) {
  return String(s ?? '').replaceAll(/\s+/g, ' ').trim();
}

function truncate(s, n) {
  const str = collapseWs(s);
  return str.length <= n ? str : `${str.slice(0, n)}…`;
}

const ESCAPED_PIPE = String.raw`\|`;

function cell(s) {
  return collapseWs(s).replaceAll('|', ESCAPED_PIPE);
}

function itemEvents(events) {
  return (events ?? []).filter((e) => e?.type === 'item');
}

function rejectedEvents(events) {
  return (events ?? []).filter((e) => e?.type === 'rejected');
}

function anySignal(items, predicate) {
  return items.some((it) => (it.signals ?? []).some(predicate));
}

function statusBadge(sig) {
  if (sig.status === 'kept') return 'kept';
  return `dropped (${sig.dropped_by ?? 'unknown'})`;
}

function selfCheckText(sig) {
  const sc = sig.self_check;
  if (!sc) return '';
  if (sc.verdict === 'no') return `no — ${truncate(sc.reason ?? 'rejected', 80)}`;
  if (sc.verdict === 'uncertain') return 'uncertain';
  return sc.verdict ?? '';
}

function renderSignalsTable(signals, { showRationale, showSelfCheck }) {
  const header = ['#', 'type', 'quote', 'conf'];
  if (showRationale) header.push('rationale');
  if (showSelfCheck) header.push('self-check');
  header.push('status');

  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  signals.forEach((sig, i) => {
    const row = [
      String(i + 1),
      cell(sig.signal_type ?? '?'),
      `"${truncate(sig.evidence ?? '', 90)}"`,
      sig.confidence == null ? '' : String(sig.confidence),
    ];
    if (showRationale) row.push(cell(truncate(sig.rationale ?? '', 90)));
    if (showSelfCheck) row.push(cell(selfCheckText(sig)));
    row.push(cell(statusBadge(sig)));
    lines.push(`| ${row.join(' | ')} |`);
  });
  return lines.join('\n');
}

function renderArticleSection(item, idx, flags) {
  const a = item.article ?? {};
  const titleBits = [`## [${idx}] ${a.title ?? '(untitled)'}`];
  if (a.source) titleBits.push(`— ${a.source}`);
  if (item.pass) titleBits.push(`· pass-${item.pass}`);
  if (item.from_cache) titleBits.push('· (from cache)');

  const meta = [
    a.url ? `url: ${a.url}` : null,
    a.source_id ? `source_id: ${a.source_id}` : null,
    item.batch ? `batch: ${item.batch}` : null,
  ].filter(Boolean).join(' · ');

  const trimNote = item.rag_trimmed
    ? ' (model saw RAG/semantic-selected spans, not full body)'
    : '';
  const rawText = item.raw_text
    ? `> ${truncate(item.raw_text, RAW_TEXT_PREVIEW_CHARS)}`
    : '> (no body text)';

  const signals = item.signals ?? [];
  const out = [
    titleBits.join(' '),
    meta,
    '',
    `### Raw text (${item.raw_text_len ?? (item.raw_text?.length ?? 0)} chars)${trimNote}`,
    rawText,
    '',
    `### Signals (${signals.length})`,
    signals.length ? renderSignalsTable(signals, flags) : '_no signals extracted_',
    '',
  ];
  return out.join('\n');
}

function renderRejectedSection(rejected) {
  const blocks = [];
  for (const ev of rejected) {
    const items = ev.items ?? [];
    if (!items.length) continue;
    blocks.push(`### Rejected candidates — ${ev.batch ?? 'batch'} (model considered, not emitted)`);
    for (const r of items) {
      blocks.push(`- "${truncate(r.text ?? '', 120)}" → ${truncate(r.why ?? r.reason ?? '', 100)}`);
    }
    blocks.push('');
  }
  return blocks.join('\n');
}

function renderSummary(items) {
  let kept = 0;
  let dropped = 0;
  for (const it of items) {
    for (const s of it.signals ?? []) {
      if (s.status === 'kept') kept += 1;
      else dropped += 1;
    }
  }
  return `Articles: ${items.length} · signals kept: ${kept} · dropped: ${dropped}`;
}

/**
 * @param {{ run?: string, sourceType?: string|null, date?: string|null, events: object[] }} params
 * @returns {string}
 */
export function renderRunTraceMarkdown({ run, sourceType, date, events } = {}) {
  const items = itemEvents(events);
  const rejected = rejectedEvents(events);

  const showRationale = anySignal(items, (s) => s.rationale != null && s.rationale !== '');
  const showSelfCheck = anySignal(items, (s) => s.self_check != null);
  const flags = { showRationale, showSelfCheck };

  const titleParts = [run ?? 'run', sourceType, date].filter(Boolean).join(' / ');
  const head = [
    `# Extraction decision trace — ${titleParts}`,
    renderSummary(items),
    '',
  ];

  const sections = items.map((it, i) => renderArticleSection(it, i + 1, flags));
  const rejectedBlock = renderRejectedSection(rejected);

  return [
    head.join('\n'),
    sections.join('\n'),
    rejectedBlock ? `\n${rejectedBlock}` : '',
  ].join('\n').replaceAll(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export default renderRunTraceMarkdown;
