/**
 * Canonical resilience component id list derived from the framework taxonomy.
 *
 * Pipeline position: client-safe isomorphic — used across extract routing,
 * assess partitioning, epistemic gates, and UI component keys.
 *
 * Owns: COMPONENT_IDS ordering aligned with RESILIENCE_COMPONENTS.
 * Does NOT: component definitions (resilienceComponents.js) or routing weights
 * (signalRouting.js).
 *
 * Key collaborators: resilienceComponents.js, componentEvidence.js,
 * signalRouting.js, epistemic profile builders.
 */
import { RESILIENCE_COMPONENTS } from './resilienceComponents.js';

/** Canonical Home Front Command component ids, in framework order. */
export const COMPONENT_IDS = RESILIENCE_COMPONENTS.map((c) => c.id);
