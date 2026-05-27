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

  if (Array.isArray(bundle?.access_limitations) && bundle.access_limitations.length) {
    lines.push('## Access limitations', '');
    for (const note of bundle.access_limitations) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  if (bundle?.summary && typeof bundle.summary === 'object') {
    lines.push('## Summary', '');
    const s = bundle.summary;
    if (s.threat_perception) {
      lines.push(`- **Threat perception:** ${s.threat_perception}${s.threat_perception_explanation ? ` — ${s.threat_perception_explanation}` : ''}`);
    }
    if (s.knowledge_of_what_to_do) {
      lines.push(`- **Knowledge of what to do:** ${s.knowledge_of_what_to_do}${s.knowledge_of_what_to_do_explanation ? ` — ${s.knowledge_of_what_to_do_explanation}` : ''}`);
    }
    if (Array.isArray(s.recurring_emotions) && s.recurring_emotions.length) {
      lines.push('', '**Recurring emotions:**');
      for (const e of s.recurring_emotions) lines.push(`- ${e}`);
    }
    if (Array.isArray(s.resilience_signs) && s.resilience_signs.length) {
      lines.push('', '**Resilience signs:**');
      for (const r of s.resilience_signs) lines.push(`- ${r}`);
    }
    if (s.evidence_gaps) {
      lines.push('', `**Evidence gaps:** ${s.evidence_gaps}`);
    }
    lines.push('');
  }

  const findings = Array.isArray(bundle?.findings) ? bundle.findings : [];
  if (findings.length) {
    lines.push('## Findings', '');
    for (const f of findings) {
      lines.push(`### ${f.id ?? 'finding'} — ${f.location ?? 'unknown location'}`, '', `- **Platform:** ${f.platform ?? '—'}`, `- **Date:** ${f.date ?? '—'}`, `- **Confidence:** ${f.confidence ?? '—'}`, `- **Component:** ${f.resilience_component ?? '—'}`);
      if (f.url) lines.push(`- **URL:** ${f.url}`);
      lines.push('');
      if (f.quote_original) {
        lines.push('> ' + String(f.quote_original).replaceAll('\n', '\n> '), '');
      }
      if (f.behavior_or_emotion) {
        lines.push(`*Behavior / emotion:* ${f.behavior_or_emotion}`, '');
      }
    }
  }

  const signals = Array.isArray(bundle?.signals) ? bundle.signals : [];
  if (signals.length) {
    lines.push('## Mapped signals (pipeline)', '');
    for (const sig of signals) {
      lines.push(`- \`${sig.signal_type}\` (${sig.scope_level ?? 'single_case'}) — ${sig.evidence ?? ''}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function reportFilename(date) {
  return `social-osint-report-${date}.md`;
}

export { reportFilename };
