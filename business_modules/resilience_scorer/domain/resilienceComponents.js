/**
 * Domain-root re-export of the eight-component resilience framework catalogue.
 *
 * Pipeline position: convenience barrel — callers import RESILIENCE_COMPONENTS from
 * domain/ root without reaching into contracts/ directly.
 *
 * Owns: re-export surface only; authoritative definitions live in contracts/.
 * Does NOT: duplicate component metadata or define routing/evidence rules.
 *
 * Key collaborators: domain/contracts/resilienceComponents.js (source of truth),
 * signalRouting, componentEvidence, client component display, extraction prompts.
 */

export { RESILIENCE_COMPONENTS } from './contracts/resilienceComponents.js';
