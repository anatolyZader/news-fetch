/**
 * Shapes a cached assessment report payload before it is served to HTTP/chat clients.
 *
 * Pipeline position: post-PERSIST read path — called when reportRoutes or chatRoutes
 * load a cached report for operator display.
 *
 * Owns: contract surface (methods/typedefs below).
 * Does NOT: implement adapters (those live in infrastructure/).
 *
 * Key collaborators: createApp composition (reportDisplayPort), chatRoutes,
 * reportDisplayPortAdapter → assessmentDisplayTier.redactReportPayload.
 */

/**
 * Port for attaching display metadata to a report JSON payload (single view; no redaction).
 *
 * @typedef {object} IReportDisplayPort
 * @property {(payload: object, displayView?: string) => object} redactReportPayload
 * Attach per-component instrument state to a cached report before serving.
 * The `displayView` parameter is retained for call-site compatibility only; min-math
 * serves a single operator view with no analyst/operator split.
 */

export {};
