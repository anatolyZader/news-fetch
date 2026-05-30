/**
 * Index field-report taxonomy examples for draft-time RAG.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_REQUIREMENTS } from '../../business_modules/report_build/domain/evidenceRequirements.js';

const FIELD_EXAMPLES_INDEX_DATE = '2099-01-01';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function formatRequirementEntry(componentId, req) {
  const lines = [
    `example_type: good_observation_framing`,
    `componentId: ${componentId}`,
    `label: ${componentId}`,
  ];
  if (req.fallbackQuestions?.length) {
    lines.push(`good_questions: ${req.fallbackQuestions.join(' | ')}`);
  }
  if (req.disambiguation?.length) {
    for (const d of req.disambiguation) {
      lines.push(`disambiguation_${d.dimension}: ${(d.values ?? []).join(', ')}`);
    }
  }
  if (req.confounders?.length) {
    lines.push(`confounders: ${req.confounders.join(', ')}`);
  }
  return lines.join('\n');
}

function loadCuratedExamples() {
  const path = resolve(REPO_ROOT, 'config/field-report-rag-examples.json');
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * @param {ReturnType<import('./indexWriter.js').createIndexWriter>} indexWriter
 */
export function createFieldExamplesIndexWriter(indexWriter) {
  return {
    async reindexFieldExamples() {
      let total = 0;

      for (const [componentId, req] of Object.entries(EVIDENCE_REQUIREMENTS)) {
        const body = formatRequirementEntry(componentId, req);
        const r = await indexWriter.indexChunksForParent({
          namespace: 'field_examples',
          parentId: `field_example:framing:${componentId}`,
          date: FIELD_EXAMPLES_INDEX_DATE,
          body,
          sourceType: 'field_examples',
          title: `Framing: ${componentId}`,
          sourceUrl: null,
          kind: 'field_framing',
        });
        total += r.chunks;
      }

      for (const ex of loadCuratedExamples()) {
        const type = ex.type ?? 'good_observation';
        const componentId = ex.componentId ?? 'general';
        const body = [
          `example_type: ${type}`,
          `componentId: ${componentId}`,
          `text: ${ex.hebrew_text ?? ''}`,
          `notes: ${ex.notes ?? ''}`,
        ].join('\n');
        const r = await indexWriter.indexChunksForParent({
          namespace: 'field_examples',
          parentId: `field_example:${type}:${componentId}:${total}`,
          date: FIELD_EXAMPLES_INDEX_DATE,
          body,
          sourceType: 'field_examples',
          title: `${type} — ${componentId}`,
          sourceUrl: null,
          kind: 'field_curated',
        });
        total += r.chunks;
      }

      return { chunks: total };
    },
  };
}

export { FIELD_EXAMPLES_INDEX_DATE };
