/**
 * Markdown formatter for catalog gap reports.
 */

/**
 * @param {string[]} types
 */
function formatRelatedTypes(types) {
  return types.map((t) => '`' + t + '`').join(', ');
}

/**
 * @param {object} report
 */
export function formatGapReportMarkdown(report) {
  const lines = [
    '# Catalog Gap Report',
    '',
    `Generated: ${report.generated_at}`,
    `Capture files: ${report.file_count}`,
    `Total records: ${report.total_records}`,
    `Clustering: ${report.clustering_method}`,
    '',
    '## Summary by capture kind',
    '',
    '| Kind | Count |',
    '|------|------:|',
  ];

  for (const [kind, count] of Object.entries(report.kind_counts ?? {}).sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${kind}\` | ${count} |`);
  }

  lines.push('', '## Top clusters (analyst review queue)', '');

  if (report.clusters?.length) {
    for (const [i, cluster] of report.clusters.entries()) {
      lines.push(`### ${i + 1}. ${cluster.key} (priority ${cluster.priority_score}, n=${cluster.count})`, '');
      lines.push(`- Kinds: ${formatKinds(cluster.kinds)}`, `- Distinct sources: ${cluster.distinct_sources}`);
      if (cluster.related_types?.length) {
        lines.push(`- Related types: ${formatRelatedTypes(cluster.related_types)}`);
      }
      if (cluster.high_novelty_count || cluster.medium_novelty_count) {
        lines.push(`- Novelty: ${cluster.high_novelty_count} high, ${cluster.medium_novelty_count} medium`);
      }
      lines.push('', 'Sample evidence:');
      for (const sample of cluster.sample_evidence ?? []) {
        lines.push(`> ${sample.replaceAll('\n', ' ').slice(0, 280)}`);
      }
      lines.push('');
    }
  } else {
    lines.push('_No clusters met the minimum threshold._', '');
  }

  lines.push(
    '## Next steps',
    '',
    '1. Review high-priority clusters for new `signal_type` proposals or disambiguation updates.',
    '2. Merge into existing catalog entries when `nearest_existing_types` fit well.',
    '3. On approval: edit `signalCatalog.js`, bump `CATALOG_VERSION`, regenerate prompts, run golden corpus.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

/**
 * @param {Record<string, number>} kinds
 */
function formatKinds(kinds) {
  return Object.entries(kinds)
    .map(([k, n]) => `\`${k}\`×${n}`)
    .join(', ') || '—';
}
