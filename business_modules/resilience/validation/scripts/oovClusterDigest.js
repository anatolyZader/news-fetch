#!/usr/bin/env node
/**
 * Weekly cluster digest of OOV capture records.
 * Delegates to catalogLearning gap report (stdout summary).
 */
import { CatalogLearningService } from '../../catalogLearning/app/catalogLearningService.js';
import { LearningCaptureFsAdapter } from '../../catalogLearning/infrastructure/adapters/learningCaptureFsAdapter.js';

const reportsDir = process.argv[2] ?? 'reports';

async function main() {
  const service = new CatalogLearningService({
    capturePort: new LearningCaptureFsAdapter({ reportsDir }),
  });
  const report = await service.buildGapReport({ maxDays: 14, topN: 20, minCount: 1 });

  console.log('OOV cluster digest:');
  console.log(`  records=${report.total_records}  files=${report.file_count}  method=${report.clustering_method}`);
  for (const cluster of report.clusters.slice(0, 20)) {
    console.log(`  ${cluster.count}x  ${cluster.key}  (priority=${cluster.priority_score})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
