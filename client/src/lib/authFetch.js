/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} ms
 * @param {T} fallback
 * @returns {Promise<T>}
 */
export function withTimeout(fn, ms, fallback) {
  return Promise.race([
    fn().catch(() => fallback),
    new Promise((resolve) => { setTimeout(() => resolve(fallback), ms); }),
  ]);
}

/**
 * Headers for bootstrap GET reads (e.g. /api/report/today) under soft App Check.
 * JWT only — never waits on App Check so reCAPTCHA cannot block the dashboard.
 *
 * @param {{
 *   getIdToken?: (opts?: { forceRefresh?: boolean }) => Promise<string|null>,
 * }} auth
 * @param {{ idTokenWaitMs?: number }} [opts]
 * @returns {Promise<Headers>}
 */
export async function buildBootstrapReadHeaders(auth = {}, opts = {}) {
  const idTokenWaitMs = opts.idTokenWaitMs ?? 15_000;
  const headers = new Headers();
  if (auth.getIdToken) {
    const token = await withTimeout(
      () => auth.getIdToken(),
      idTokenWaitMs,
      null,
    );
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

/**
 * @param {{
 *   getIdToken?: (opts?: { forceRefresh?: boolean }) => Promise<string|null>,
 *   getAppCheckToken?: () => Promise<string|null>,
 * }} auth
 * @returns {Promise<Headers>}
 */
export async function buildAuthHeaders(auth = {}) {
  const headers = new Headers();
  const token = await auth.getIdToken?.();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const appCheck = await auth.getAppCheckToken?.();
  if (appCheck) headers.set('X-Firebase-AppCheck', appCheck);
  return headers;
}

/**
 * @param {Response} res
 */
async function parseJsonResponse(res) {
  return res.json().catch(() => ({}));
}

/**
 * @param {string} url
 * @param {Headers} headers
 * @param {string} method
 * @param {unknown} [body]
 */
async function fetchWithHeaders(url, headers, method, body) {
  return fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
}

const RETRY_AUTH_CODES = new Set([
  'invalid_token',
  'token_revoked',
  'missing_token',
]);

/**
 * @param {string} url
 * @param {{
 *   getIdToken?: (opts?: { forceRefresh?: boolean }) => Promise<string|null>,
 *   getAppCheckToken?: () => Promise<string|null>,
 *   method?: string,
 *   body?: unknown,
 *   headers?: HeadersInit,
 * }} opts
 */
export async function authFetch(url, opts = {}) {
  const method = opts.method ?? 'GET';

  async function attempt(forceRefresh) {
    const headers = await buildAuthHeaders({
      getIdToken: () => opts.getIdToken?.({ forceRefresh }),
      getAppCheckToken: opts.getAppCheckToken,
    });
    if (opts.headers) {
      const extra = new Headers(opts.headers);
      extra.forEach((value, key) => headers.set(key, value));
    }
    if (opts.body != null && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetchWithHeaders(url, headers, method, opts.body);
    const data = await parseJsonResponse(res);
    return { res, data };
  }

  let { res, data } = await attempt(false);
  if (
    res.status === 401
    && RETRY_AUTH_CODES.has(data?.code)
    && opts.getIdToken
  ) {
    ({ res, data } = await attempt(true));
  }

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/**
 * Multipart POST with auth headers (no Content-Type — browser sets boundary).
 * @param {string} url
 * @param {FormData} formData
 * @param {{
 *   getIdToken?: (opts?: { forceRefresh?: boolean }) => Promise<string|null>,
 *   getAppCheckToken?: () => Promise<string|null>,
 * }} auth
 */
export async function authFetchFormData(url, formData, auth = {}) {
  async function attempt(forceRefresh) {
    const headers = await buildAuthHeaders({
      getIdToken: () => auth.getIdToken?.({ forceRefresh }),
      getAppCheckToken: auth.getAppCheckToken,
    });
    const res = await fetch(url, { method: 'POST', headers, body: formData });
    const data = await parseJsonResponse(res);
    return { res, data };
  }

  let { res, data } = await attempt(false);
  if (res.status === 401 && RETRY_AUTH_CODES.has(data?.code) && auth.getIdToken) {
    ({ res, data } = await attempt(true));
  }

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}
