import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function defaultAuditLogPath() {
  return join(resolve(moduleRoot, '../../log/data'), 'audit.jsonl');
}

/**
 * @param {string} [rootDir]
 */
export function resolveAuditLogPath(rootDir = process.cwd()) {
  const env = process.env.AUDIT_LOG_PATH?.trim();
  if (!env) return defaultAuditLogPath();
  return env.startsWith('/') ? env : join(rootDir, env);
}

/**
 * @param {{
 *   action: string,
 *   resource?: string,
 *   userEmail?: string | null,
 *   uid?: string | null,
 *   ip?: string | null,
 *   meta?: object,
 * }} entry
 * @param {string} [logPath]
 */
export function appendAuditEvent(entry, logPath = resolveAuditLogPath()) {
  const row = {
    ts: new Date().toISOString(),
    action: entry.action,
    resource: entry.resource ?? null,
    userEmail: entry.userEmail ?? null,
    uid: entry.uid ?? null,
    ip: entry.ip ?? null,
    meta: entry.meta ?? null,
  };
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(row)}\n`, 'utf8');
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @returns {string | null}
 */
export function clientIpFromRequest(request) {
  return request.ip ?? request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? null;
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {string} action
 * @param {string} [resource]
 * @param {object} [meta]
 */
export function auditFromRequest(request, action, resource, meta) {
  appendAuditEvent({
    action,
    resource,
    userEmail: request.user?.email ?? null,
    uid: request.user?.uid ?? null,
    ip: clientIpFromRequest(request),
    meta,
  });
}
