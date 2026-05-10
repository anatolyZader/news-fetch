export function dot(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function norm(a) {
  return Math.sqrt(dot(a, a)) || 1;
}

export function cosineSim(a, b) {
  return dot(a, b) / (norm(a) * norm(b));
}

/**
 * Encode Float32Array to Buffer for SQLite BLOB.
 * @param {Float32Array} v
 */
export function float32ToBuffer(v) {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

/**
 * Decode SQLite BLOB Buffer into Float32Array (copy-free view).
 * @param {Buffer} buf
 */
export function bufferToFloat32(buf) {
  if (!buf || buf.length === 0) return new Float32Array();
  // Node buffers are backed by ArrayBuffer; create a view.
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

