/**
 * Lightweight validation for agent submit_* tool payloads.
 */

const SUBMIT_TOOL_PREFIX = 'submit_';

/**
 * @param {string} toolName
 * @param {unknown} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSubmitToolPayload(toolName, payload) {
  if (!String(toolName ?? '').startsWith(SUBMIT_TOOL_PREFIX)) {
    return { valid: true, errors: [] };
  }
  const errors = [];
  if (payload == null || typeof payload !== 'object') {
    return { valid: false, errors: ['payload must be an object'] };
  }

  if (toolName === 'submit_plan') {
    if (!Array.isArray(payload.focus_components)) errors.push('focus_components required');
    if (!Array.isArray(payload.investigation_tasks)) errors.push('investigation_tasks required');
  }

  if (toolName === 'submit_component_assessment') {
    if (!payload.component_id) errors.push('component_id required');
    if (!payload.severity) errors.push('severity required');
    if (!Array.isArray(payload.claims)) errors.push('claims array required');
    else {
      for (const [i, c] of payload.claims.entries()) {
        if (!c?.text) errors.push(`claims[${i}].text required`);
        if (!Array.isArray(c?.evidence_refs) || c.evidence_refs.length === 0) {
          errors.push(`claims[${i}].evidence_refs required`);
        }
      }
    }
  }

  if (toolName === 'submit_synthesis') {
    if (!payload.cross_component_synthesis) errors.push('cross_component_synthesis required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @param {string} toolName
 * @param {unknown} input
 */
export function parseToolInput(input) {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return input;
}
