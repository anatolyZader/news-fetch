import Ajv from 'ajv';
import { EVENT_TYPES } from './eventTypes.js';

const ajv = new Ajv({ allErrors: true, strict: false });

const baseEvent = {
  type: 'object',
  required: ['eventVersion'],
  properties: {
    eventVersion: { type: 'integer', const: 1 },
  },
  additionalProperties: true,
};

/** @type {Record<string, object>} */
export const EVENT_SCHEMAS = {
  [EVENT_TYPES.RESILIENCE_REPORT_WRITTEN]: {
    ...baseEvent,
    required: ['eventVersion', 'date', 'scope', 'jsonPath'],
    properties: {
      eventVersion: { type: 'integer', const: 1 },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      scope: { type: 'string', minLength: 1 },
      jsonPath: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  [EVENT_TYPES.EVIDENCE_SUBMISSION_COMPLETED]: {
    ...baseEvent,
    required: ['eventVersion', 'submissionId', 'ownerKey', 'status'],
    properties: {
      eventVersion: { type: 'integer', const: 1 },
      submissionId: { type: 'string', minLength: 1 },
      ownerKey: { type: 'string', minLength: 1 },
      status: { type: 'string', enum: ['completed', 'failed'] },
    },
    additionalProperties: false,
  },
  [EVENT_TYPES.PBO_REVIEW_INBOUND_RECEIVED]: {
    ...baseEvent,
    required: ['eventVersion', 'reviewId', 'district'],
    properties: {
      eventVersion: { type: 'integer', const: 1 },
      reviewId: { type: 'string', minLength: 1 },
      district: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  [EVENT_TYPES.MAILING_DIGEST_REQUESTED]: {
    ...baseEvent,
    required: ['eventVersion', 'userUid', 'email', 'products', 'language'],
    properties: {
      eventVersion: { type: 'integer', const: 1 },
      userUid: { type: 'string', minLength: 1 },
      email: { type: 'string', minLength: 3 },
      products: { type: 'array', items: { type: 'string' } },
      language: { type: 'string', minLength: 2 },
    },
    additionalProperties: false,
  },
};

/** @type {Map<string, import('ajv').ValidateFunction>} */
const validators = new Map();

/**
 * @param {string} eventType
 * @param {unknown} payload
 */
export function validateEventPayload(eventType, payload) {
  if (!EVENT_SCHEMAS[eventType]) {
    throw new Error(`Unknown event type: ${eventType}`);
  }
  let validate = validators.get(eventType);
  if (!validate) {
    validate = ajv.compile(EVENT_SCHEMAS[eventType]);
    validators.set(eventType, validate);
  }
  if (!validate(payload)) {
    const msg = ajv.errorsText(validate.errors, { separator: '; ' });
    throw new Error(`Invalid event payload for ${eventType}: ${msg}`);
  }
}
