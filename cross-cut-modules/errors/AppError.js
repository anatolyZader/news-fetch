/**
 * Shared application error types for HTTP and service boundaries.
 */

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, statusCode?: number, details?: unknown, cause?: Error }} [opts]
   */
  constructor(message, opts = {}) {
    super(message, { cause: opts.cause });
    this.name = 'AppError';
    this.code = opts.code ?? 'internal_error';
    this.statusCode = opts.statusCode ?? 500;
    this.details = opts.details;
  }
}

export class ValidationError extends AppError {
  /**
   * @param {string} message
   * @param {{ code?: string, details?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message, { code: opts.code ?? 'validation_error', statusCode: 400, details: opts.details });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  /**
   * @param {string} message
   * @param {{ code?: string, details?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message, { code: opts.code ?? 'not_found', statusCode: 404, details: opts.details });
    this.name = 'NotFoundError';
  }
}

export class PermissionDeniedError extends AppError {
  /**
   * @param {string} message
   * @param {{ code?: string, details?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message, { code: opts.code ?? 'permission_denied', statusCode: 403, details: opts.details });
    this.name = 'PermissionDeniedError';
  }
}

export class ExternalServiceError extends AppError {
  /**
   * @param {string} message
   * @param {{ code?: string, statusCode?: number, details?: unknown, cause?: Error }} [opts]
   */
  constructor(message, opts = {}) {
    super(message, {
      code: opts.code ?? 'external_service_error',
      statusCode: opts.statusCode ?? 502,
      details: opts.details,
      cause: opts.cause,
    });
    this.name = 'ExternalServiceError';
  }
}

/**
 * @param {unknown} err
 * @returns {err is AppError}
 */
export function isAppError(err) {
  return err instanceof AppError;
}
