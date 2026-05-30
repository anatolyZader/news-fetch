/**
 * Ingest-time chunk indexer for archive rows and report artifacts.
 */
import { createHash } from 'node:crypto';
import { chunkText, buildChunkId } from './chunkText.js';
import { ragChunkTargetChars, ragChunkOverlapRatio } from './ragConfig.js';
import { embeddingsEnabled, embedTexts, embeddingModelId } from '../vector_index/index.js';

function textHash(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

/**
 * @param {ReturnType<import('./chunkStore.js').createChunkStore>} chunkStore
 */
export function createIndexWriter(chunkStore) {
  const reportFingerprints = new Map();

  async function indexChunksForParent({
    namespace,
    parentId,
    date,
    body,
    sourceType,
    title,
    sourceUrl,
    kind,
    scopeId,
  }) {
    const pid = String(parentId ?? '').trim();
    const d = String(date ?? '').trim();
    if (!pid || !d) return { chunks: 0 };

    chunkStore.deleteByParentId(pid);

    const segments = chunkText(body, {
      targetChars: ragChunkTargetChars(),
      overlapRatio: ragChunkOverlapRatio(),
    });
    if (!segments.length) return { chunks: 0 };

    const model = embeddingModelId();
    let embeddings = [];
    if (embeddingsEnabled()) {
      try {
        embeddings = await embedTexts(segments.map((s) => s.text), { model });
      } catch (err) {
        console.error(`rag indexWriter: embed failed for ${pid}:`, err.message);
      }
    }

    let n = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const chunkId = buildChunkId(pid, seg.chunkIndex);
      const emb = embeddings[i];
      chunkStore.upsertChunk(
        {
          chunk_id: chunkId,
          namespace,
          parent_id: pid,
          chunk_index: seg.chunkIndex,
          date: d,
          source_type: sourceType ?? null,
          title: title ?? null,
          source_url: sourceUrl ?? null,
          kind: kind ?? 'original',
          scope_id: scopeId ?? null,
          chunk_text: seg.text,
          char_start: seg.charStart,
          char_end: seg.charEnd,
          text_hash: textHash(seg.text),
        },
        { vector: emb?.vector, model: emb?.model },
      );
      n++;
    }
    return { chunks: n };
  }

  return {
    /**
     * Index a source_archive row after upsert.
     * @param {object} row
     */
    async indexArchiveRow(row) {
      const sourceId = String(row?.source_id ?? '').trim();
      const date = String(row?.date ?? '').trim();
      const body = `${row?.title ?? ''}\n${row?.body ?? ''}`.trim();
      if (!sourceId || !date || !body) return { chunks: 0 };

      return indexChunksForParent({
        namespace: 'archive',
        parentId: sourceId,
        date,
        body,
        sourceType: row.source_type,
        title: row.title,
        sourceUrl: row.source_url,
        kind: 'original',
        scopeId: row.scope_id ?? row.district_id ?? null,
      });
    },

    /**
     * Index report-derived documents (signals, components, synthesis).
     * @param {object} reportData
     * @param {object} helpers - signalToDoc, componentToDoc, fingerprintReport
     */
    async indexReport(reportData, helpers) {
      if (!reportData?.assessment) return { chunks: 0 };
      const a = reportData.assessment;
      const date = a.date ?? reportData.reportDate ?? '';
      const scope = a?.report_scope?.id ?? 'national';
      const fpKey = `report:${date}:${scope}`;
      const fp = helpers.fingerprintReport(reportData);
      if (reportFingerprints.get(fpKey) === fp) return { chunks: 0 };

      const docs = [];
      const synth = String(a.cross_component_synthesis ?? '').trim();
      docs.push({
        parentId: `report:${date}:${scope}:assessment:summary`,
        text:
          `Assessment date: ${a.date}\n` +
          `Scope: ${a?.report_scope?.label ?? scope}\n\n` +
          `${synth}\n\n` +
          `Evidence quality: ${String(a.evidence_quality_note ?? '').trim()}`,
        kind: 'assessment',
      });

      for (const c of a.components ?? []) {
        const d = helpers.componentToDoc(c);
        if (d) {
          docs.push({
            parentId: `report:${date}:${scope}:${d.docId}`,
            text: d.text,
            kind: 'component',
          });
        }
      }

      const signals = helpers.signalsFromReport(reportData, a);
      for (let i = 0; i < signals.length; i++) {
        const d = helpers.signalToDoc(signals[i], i);
        docs.push({
          parentId: `report:${date}:${scope}:${d.docId}`,
          text: d.text,
          kind: 'signal',
        });
      }

      let total = 0;
      for (const doc of docs) {
        const r = await indexChunksForParent({
          namespace: 'report',
          parentId: doc.parentId,
          date,
          body: doc.text,
          sourceType: null,
          title: doc.kind,
          sourceUrl: null,
          kind: doc.kind,
          scopeId: scope,
        });
        total += r.chunks;
      }
      reportFingerprints.set(fpKey, fp);
      return { chunks: total };
    },

    async reindexArchiveRows(rows) {
      let total = 0;
      for (const row of rows ?? []) {
        const r = await this.indexArchiveRow(row);
        total += r.chunks;
      }
      return { chunks: total };
    },

    indexChunksForParent,
  };
}
