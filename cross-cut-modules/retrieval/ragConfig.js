/**
 * RAG pipeline configuration from environment.
 */
import { embeddingsEnabled } from '../vector_index/index.js';

export function ragPipelineEnabled() {
  return process.env.RAG_PIPELINE_ENABLED !== '0';
}

export function chatRagHintsEnabled() {
  return process.env.CHAT_RAG_ENABLED !== '0';
}

export function chatArchiveRagEnabled() {
  return process.env.CHAT_ARCHIVE_RAG_ENABLED !== '0';
}

export function ragQueryRewriteEnabled() {
  return process.env.RAG_QUERY_REWRITE_ENABLED !== '0';
}

export function ragRetrievalDays() {
  return Math.max(1, Number.parseInt(process.env.RAG_RETRIEVAL_DAYS ?? '14', 10) || 14);
}

export function ragChunkTargetChars() {
  return Math.max(400, Number.parseInt(process.env.RAG_CHUNK_TARGET_CHARS ?? '2000', 10) || 2000);
}

export function ragChunkOverlapRatio() {
  const v = Number.parseFloat(process.env.RAG_CHUNK_OVERLAP_RATIO ?? '0.15');
  return Number.isFinite(v) ? Math.min(0.5, Math.max(0, v)) : 0.15;
}

export function ragHybridCandidates() {
  return Math.max(10, Math.min(100, Number.parseInt(process.env.RAG_HYBRID_CANDIDATES ?? '50', 10) || 50));
}

export function ragFinalTopK() {
  return Math.max(4, Math.min(20, Number.parseInt(process.env.RAG_FINAL_TOPK ?? '8', 10) || 8));
}

export function ragRrfK() {
  return Math.max(1, Number.parseInt(process.env.RAG_RRF_K ?? '60', 10) || 60);
}

export function ragContextSnippetChars() {
  return Math.max(200, Math.min(1200, Number.parseInt(process.env.RAG_CONTEXT_SNIPPET_CHARS ?? '800', 10) || 800));
}

export function cohereApiKey() {
  return process.env.COHERE_API_KEY ?? '';
}

export function cohereRerankEnabled() {
  return Boolean(cohereApiKey());
}

export function cohereRerankModel() {
  return process.env.RAG_COHERE_RERANK_MODEL ?? 'rerank-v3.5';
}

export function resilienceExtractRagEnabled() {
  if (process.env.RESILIENCE_EXTRACT_RAG_ENABLED === '0') return false;
  if (process.env.RESILIENCE_EXTRACT_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function resilienceExtractRagDays() {
  const v = Number.parseInt(process.env.RESILIENCE_EXTRACT_RAG_DAYS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : ragRetrievalDays();
}

export function resilienceExtractSpansPerArticle() {
  return Math.max(1, Math.min(12, Number.parseInt(process.env.RESILIENCE_EXTRACT_SPANS_PER_ARTICLE ?? '6', 10) || 6));
}

export function resiliencePipelineRerankEnabled() {
  return process.env.RESILIENCE_PIPELINE_RERANK === '1';
}

export function resilienceDedupClusterEnabled() {
  if (process.env.RESILIENCE_DEDUP_CLUSTER_ENABLED === '0') return false;
  if (process.env.RESILIENCE_DEDUP_CLUSTER_ENABLED === '1') return true;
  return embeddingsEnabled();
}

export function resilienceDedupClusterThreshold() {
  const thr = Number.parseFloat(process.env.RESILIENCE_DEDUP_CLUSTER_THRESHOLD ?? '0.93');
  return Number.isFinite(thr) ? Math.min(0.999, Math.max(0.5, thr)) : 0.93;
}

export function resilienceNarrativeRagEnabled() {
  if (process.env.RESILIENCE_NARRATIVE_RAG_ENABLED === '0') return false;
  if (process.env.RESILIENCE_NARRATIVE_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function resilienceNarrativeRagTopK() {
  return Math.max(1, Math.min(10, Number.parseInt(process.env.RESILIENCE_NARRATIVE_RAG_TOPK ?? '4', 10) || 4));
}

export function validationReviewRagEnabled() {
  if (process.env.VALIDATION_REVIEW_RAG_ENABLED === '0') return false;
  if (process.env.VALIDATION_REVIEW_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function validationExplainEnabled() {
  if (process.env.VALIDATION_EXPLAIN_ENABLED === '0') return false;
  return validationReviewRagEnabled();
}

export function catalogLearningRagEnabled() {
  if (process.env.CATALOG_LEARNING_RAG_ENABLED === '0') return false;
  if (process.env.CATALOG_LEARNING_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function catalogRagTopK() {
  return Math.max(1, Math.min(10, Number.parseInt(process.env.CATALOG_RAG_TOPK ?? '5', 10) || 5));
}

export function pboReviewRagEnabled() {
  if (process.env.PBO_REVIEW_RAG_ENABLED === '0') return false;
  if (process.env.PBO_REVIEW_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function pboRagRetentionDays() {
  const v = Number.parseInt(process.env.PBO_RAG_RETENTION_DAYS ?? '30', 10);
  return Number.isFinite(v) && v > 0 ? v : 30;
}

export function reportBuildRagEnabled() {
  if (process.env.REPORT_BUILD_RAG_ENABLED === '0') return false;
  if (process.env.REPORT_BUILD_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function reportBuildRagDays() {
  const v = Number.parseInt(process.env.REPORT_BUILD_RAG_DAYS ?? '30', 10);
  return Number.isFinite(v) && v > 0 ? v : 30;
}

export function reportBuildRagTopK() {
  return Math.max(1, Math.min(10, Number.parseInt(process.env.REPORT_BUILD_RAG_TOPK ?? '4', 10) || 4));
}

export function audioContextualizerRagEnabled() {
  if (process.env.AUDIO_CONTEXTUALIZER_RAG_ENABLED === '0') return false;
  if (process.env.AUDIO_CONTEXTUALIZER_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function audioSceneRagTopK() {
  return Math.max(1, Math.min(12, Number.parseInt(process.env.AUDIO_SCENE_RAG_TOPK ?? '5', 10) || 5));
}

export function socialClassifyRagEnabled() {
  if (process.env.SOCIAL_CLASSIFY_RAG_ENABLED === '0') return false;
  if (process.env.SOCIAL_CLASSIFY_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function socialClassifyRagTopK() {
  return Math.max(2, Math.min(12, Number.parseInt(process.env.SOCIAL_CLASSIFY_RAG_TOPK ?? '6', 10) || 6));
}

export function docsRagEnabled() {
  if (process.env.DOCS_RAG_ENABLED === '0') return false;
  if (process.env.DOCS_RAG_ENABLED === '1') return true;
  return ragPipelineEnabled();
}

export function docsRagTopK() {
  return Math.max(1, Math.min(15, Number.parseInt(process.env.DOCS_RAG_TOPK ?? '6', 10) || 6));
}

export function geoUnknownReviewReadEnabled() {
  return process.env.GEO_UNKNOWN_REVIEW_READ_ENABLED !== '0';
}

export function validationAgentEnabledFlag() {
  return process.env.VALIDATION_AGENT_ENABLED !== '0';
}

export function catalogProposalLlmEnabled() {
  return process.env.CATALOG_PROPOSAL_LLM_ENABLED !== '0';
}

export function chatAnalystToolsEnabledFlag() {
  return process.env.CHAT_ANALYST_TOOLS_ENABLED !== '0';
}

export function chatConfirmActionsEnabledFlag() {
  return process.env.CHAT_CONFIRM_ACTIONS_ENABLED !== '0';
}

export function translationTermRagEnabled() {
  if (process.env.TRANSLATION_TERM_RAG_ENABLED === '0') return false;
  if (process.env.TRANSLATION_TERM_RAG_ENABLED === '1') return true;
  return false;
}
