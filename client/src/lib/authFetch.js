/**
 * Attach Firebase Auth JWT and optional App Check token to API requests.
 */

/**
 * @param {{
 *   getIdToken?: () => Promise<string|null>,
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
 * @param {string} url
 * @param {{
 *   getIdToken?: () => Promise<string|null>,
 *   getAppCheckToken?: () => Promise<string|null>,
 *   method?: string,
 *   body?: unknown,
 *   headers?: HeadersInit,
 * }} opts
 */
export async function authFetch(url, opts = {}) {
  const headers = await buildAuthHeaders(opts);
  if (opts.headers) {
    const extra = new Headers(opts.headers);
    extra.forEach((value, key) => headers.set(key, value));
  }
  if (opts.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
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
 *   getIdToken?: () => Promise<string|null>,
 *   getAppCheckToken?: () => Promise<string|null>,
 * }} auth
 */
export async function authFetchFormData(url, formData, auth = {}) {
  const headers = await buildAuthHeaders(auth);
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}
