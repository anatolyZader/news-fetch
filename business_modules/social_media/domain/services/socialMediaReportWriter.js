/**
 * Build a human-readable markdown summary from an OSINT citizen-voice bundle.
 * @param {object} bundle
 * @returns {string}
 */
export function buildSocialOsintMarkdown(bundle) {
  const date = String(bundle?.date ?? '');
  const lines = [
    `# Social OSINT report — ${date}`,
    '',
    `- **Window:** ${bundle?.window_start ?? '?'} → ${bundle?.window_end ?? '?'} (${bundle?.window_days ?? '?'} days)`,
    `- **Platforms:** ${(bundle?.platforms_searched ?? []).join(', ') || '—'}`,
    `- **Verified findings:** ${bundle?.verified_findings ?? bundle?.findings?.length ?? 0}`,
    `- **Pipeline signals:** ${(bundle?.signals ?? []).length}`,
    `- **Extracted at:** ${bundle?.extracted_at ?? '—'}`,
    bundle?.treated_at ? `- **Treated at:** ${bundle.treated_at}` : null,
    '',
  ].filter(Boolean);

  appendAccessLimitations(lines, bundle);
  appendSummarySection(lines, bundle?.summary);
  appendFindingsSection(lines, bundle?.findings);
  appendSignalsSection(lines, bundle?.signals);

  return `${lines.join('\n').trim()}\n`;
}

/**
 * @param {string[]} lines
 * @param {object} bundle
 */
function appendAccessLimitations(lines, bundle) {
  if (!Array.isArray(bundle?.access_limitations) || !bundle.access_limitations.length) return;
  lines.push('## Access limitations', '');
  for (const note of bundle.access_limitations) {
    lines.push(`- ${note}`);
  }
  lines.push('');
}

/**
 * @param {string} label
 * @param {string|undefined|null} value
 * @param {string|undefined|null} explanation
 */
function summaryFieldLine(label, value, explanation) {
  if (!value) return null;
  const suffix = explanation ? ` — ${explanation}` : '';
  return `- **${label}:** ${value}${suffix}`;
}

/**
 * @param {string[]} lines
 * @param {object|undefined|null} summary
 */
function appendSummarySection(lines, summary) {
  if (!summary || typeof summary !== 'object') return;

  lines.push('## Summary', '');
  const threatLine = summaryFieldLine(
    'Threat perception',
    summary.threat_perception,
    summary.threat_perception_explanation,
  );
  if (threatLine) lines.push(threatLine);
  const knowledgeLine = summaryFieldLine(
    'Knowledge of what to do',
    summary.knowledge_of_what_to_do,
    summary.knowledge_of_what_to_do_explanation,
  );
  if (knowledgeLine) lines.push(knowledgeLine);

  if (Array.isArray(summary.recurring_emotions) && summary.recurring_emotions.length) {
    lines.push('', '**Recurring emotions:**');
    for (const e of summary.recurring_emotions) lines.push(`- ${e}`);
  }
  if (Array.isArray(summary.resilience_signs) && summary.resilience_signs.length) {
    lines.push('', '**Resilience signs:**');
    for (const r of summary.resilience_signs) lines.push(`- ${r}`);
  }
  if (summary.evidence_gaps) {
    lines.push('', `**Evidence gaps:** ${summary.evidence_gaps}`);
  }
  lines.push('');
}

/**
 * @param {object} finding
 */
function findingHeaderLines(finding) {
  return [
    `### ${finding.id ?? 'finding'} — ${finding.location ?? 'unknown location'}`,
    '',
    `- **Platform:** ${finding.platform ?? '—'}`,
    `- **Date:** ${finding.date ?? '—'}`,
    `- **Confidence:** ${finding.confidence ?? '—'}`,
    `- **Component:** ${finding.resilience_component ?? '—'}`,
  ];
}

/**
 * @param {string[]} lines
 * @param {object} finding
 */
function appendFinding(lines, finding) {
  lines.push(...findingHeaderLines(finding));
  if (finding.url) lines.push(`- **URL:** ${finding.url}`);
  lines.push('');
  if (finding.quote_original) {
    lines.push('> ' + String(finding.quote_original).replaceAll('\n', '\n> '), '');
  }
  if (finding.behavior_or_emotion) {
    lines.push(`*Behavior / emotion:* ${finding.behavior_or_emotion}`, '');
  }
}

/**
 * @param {string[]} lines
 * @param {Array<object>|undefined|null} findings
 */
function appendFindingsSection(lines, findings) {
  const list = Array.isArray(findings) ? findings : [];
  if (!list.length) return;
  lines.push('## Findings', '');
  for (const finding of list) appendFinding(lines, finding);
}

/**
 * @param {string[]} lines
 * @param {Array<object>|undefined|null} signals
 */
function appendSignalsSection(lines, signals) {
  const list = Array.isArray(signals) ? signals : [];
  if (!list.length) return;
  lines.push('## Mapped signals (pipeline)', '');
  for (const sig of list) {
    lines.push(`- \`${sig.signal_type}\` (${sig.scope_level ?? 'single_case'}) — ${sig.evidence ?? ''}`);
  }
  lines.push('');
}

function reportFilename(date) {
  return `social-osint-report-${date}.md`;
}

export { reportFilename };
