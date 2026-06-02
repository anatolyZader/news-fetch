/** Shared boundary types for ports and events. */

export interface LlmPort {
  createMessage(opts: Record<string, unknown>): Promise<unknown>;
  stream(opts: Record<string, unknown>): unknown;
  runToolLoop(opts: Record<string, unknown>): Promise<unknown>;
  defaultModel?: string;
}

export interface GeoEnvelope {
  kind: 'resolved' | 'unknown' | string;
  usableForMetrics?: boolean;
  resolution?: Record<string, unknown>;
}

export interface AssessmentJson {
  overall_score?: number;
  components?: Record<string, { score?: number; narrative?: string }>;
  methodology?: Record<string, unknown>;
}

export type PipelineStage =
  | 'INGEST'
  | 'NORMALIZE'
  | 'EXTRACT'
  | 'SCORE'
  | 'NARRATE'
  | 'PERSIST';

export interface DomainEventPayload {
  eventVersion: number;
  [key: string]: unknown;
}
