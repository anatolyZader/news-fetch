/**
 * Lightweight validation for agent submit_* tool payloads.
 */

const SUBMIT_TOOL_PREFIX = 'submit_';

/** @type {Record<string, (key: string, value: unknown, errors: string[]) => void>} */
const PRIMITIVE_TYPE_VALIDATORS = {
  string(key, value, errors) {
    if (typeof value !== 'string') errors.push(`"${key}" must be a string`);
  },
  number(key, value, errors) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`"${key}" must be a finite number`);
    }
  },
  integer(key, value, errors) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push(`"${key}" must be an integer`);
    }
  },
  boolean(key, value, errors) {
    if (typeof value !== 'boolean') errors.push(`"${key}" must be a boolean`);
  },
  array(key, value, errors) {
    if (!Array.isArray(value)) errors.push(`"${key}" must be an array`);
  },
  object(key, value, errors) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`"${key}" must be an object`);
    }
  },
};

/**
 * @param {string[]} errors
 * @param {string} key
 * @param {unknown} value
 * @param {{ type?: string, enum?: unknown[] }} propSchema
 */
function validatePropertySchema(errors, key, value, propSchema) {
  if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
    errors.push(`"${key}" must be one of: ${propSchema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  }
  const expectedType = propSchema?.type;
  if (!expectedType) return;
  const validate = PRIMITIVE_TYPE_VALIDATORS[expectedType];
  if (validate) {
    validate(key, value, errors);
    return;
  }
  errors.push(`"${key}" has unsupported type "${expectedType}"`);
}

/**
 * Validate a subset of JSON Schema against an unknown payload.
 * This is intentionally small: it covers the tool schema shapes we ship today
 * (object inputs with primitive typed properties + enums + required fields).
 *
 * @param {unknown} payload
 * @param {{ type?: string, required?: Array<string>, properties?: Record<string, any> }} inputSchema
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateToolInputAgainstInputSchema(payload, inputSchema) {
  const errors = [];
  const schema = inputSchema ?? null;
  if (!schema) return { valid: true, errors: [] };

  // We only support object-shaped tool inputs for now.
  if (schema.type != null && schema.type !== 'object') {
    // If a tool schema declares a non-object input, fail closed but explicitly.
    errors.push(`unsupported input_schema type "${schema.type}"`);
    return { valid: false, errors };
  }

  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    errors.push('payload must be an object');
    return { valid: false, errors };
  }

  const obj = /** @type {Record<string, unknown>} */ (payload);
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = (schema.properties && typeof schema.properties === 'object')
    ? schema.properties
    : {};

  for (const key of required) {
    if (!(key in obj)) errors.push(`"${key}" is required`);
  }

  for (const [key, value] of Object.entries(obj)) {
    const propSchema = properties[key];
    if (!propSchema) continue; // allow extra keys by default
    validatePropertySchema(errors, key, value, propSchema);
  }

  return { valid: errors.length === 0, errors };
}

function validateSubmitPlan(payload, errors) {
  if (!Array.isArray(payload.focus_components)) errors.push('focus_components required');
  if (!Array.isArray(payload.investigation_tasks)) errors.push('investigation_tasks required');
}

function validateSubmitComponentAssessment(payload, errors) {
  if (!payload.component_id) errors.push('component_id required');
  if (!payload.severity) errors.push('severity required');
  if (!Array.isArray(payload.claims)) {
    errors.push('claims array required');
    return;
  }
  for (const [i, c] of payload.claims.entries()) {
    if (!c?.text) errors.push(`claims[${i}].text required`);
    if (!Array.isArray(c?.evidence_refs) || c.evidence_refs.length === 0) {
      errors.push(`claims[${i}].evidence_refs required`);
    }
  }
}

function validateSubmitSynthesis(payload, errors) {
  if (!payload.cross_component_synthesis) errors.push('cross_component_synthesis required');
}

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

  if (toolName === 'submit_plan') validateSubmitPlan(payload, errors);
  if (toolName === 'submit_component_assessment') validateSubmitComponentAssessment(payload, errors);
  if (toolName === 'submit_synthesis') validateSubmitSynthesis(payload, errors);

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
