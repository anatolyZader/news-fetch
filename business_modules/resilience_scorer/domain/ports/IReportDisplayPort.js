/**
 * Report display port — shapes a cached report payload before it is served
 * (attaches per-component instrument state; single view, no redaction).
 *
 * Implemented by infrastructure/adapters/reportDisplayPortAdapter.js.
 *
 * @typedef {object} IReportDisplayPort
 * @property {(payload: object, displayView?: string) => object} redactReportPayload
 */
export {};
