/**
 * Hebrew-friendly text chunking for RAG (paragraph-aware, char-based overlap).
 */

/**
 * @param {string} body
 * @returns {string[]}
 */
export function splitParagraphs(body) {
  return String(body ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Chunk text into overlapping segments.
 * @param {string} text
 * @param {{ targetChars?: number, overlapRatio?: number }} [opts]
 * @returns {Array<{ chunkIndex: number, text: string, charStart: number, charEnd: number }>}
 */
export function chunkText(text, opts = {}) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];

  const targetChars = opts.targetChars ?? 2000;
  const overlapRatio = opts.overlapRatio ?? 0.15;
  const overlapChars = Math.floor(targetChars * overlapRatio);

  const paragraphs = splitParagraphs(raw);
  if (paragraphs.length === 0) {
    return sliceWithOverlap(raw, targetChars, overlapChars);
  }

  let state = { buf: '', bufStart: 0, cursor: 0, chunks: [] };
  for (const p of paragraphs) {
    state = processParagraph(p, state, targetChars, overlapChars);
  }
  if (state.buf.trim()) {
    state.chunks.push(...emitBuffer(state.buf, state.bufStart, targetChars, overlapChars));
  }

  return reindexChunks(state.chunks.length ? state.chunks : sliceWithOverlap(raw, targetChars, overlapChars));
}

function processParagraph(p, state, targetChars, overlapChars) {
  const { buf, bufStart, cursor, chunks } = state;
  const sep = buf ? '\n\n' : '';
  const piece = sep + p;

  if (buf.length + piece.length <= targetChars) {
    return {
      buf: buf + piece,
      bufStart: buf ? bufStart : cursor,
      cursor: cursor + piece.length,
      chunks,
    };
  }

  if (buf) {
    return extendExistingBuffer(piece, buf, bufStart, cursor, targetChars, overlapChars, chunks);
  }

  if (p.length <= targetChars) {
    return { buf: p, bufStart: cursor, cursor: cursor + p.length, chunks };
  }

  return {
    buf: '',
    bufStart: cursor,
    cursor: cursor + p.length,
    chunks: [...chunks, ...sliceWithOverlap(p, targetChars, overlapChars)],
  };
}

function extendExistingBuffer(piece, buf, bufStart, cursor, targetChars, overlapChars, chunks) {
  const newChunks = [...chunks, ...emitBuffer(buf, bufStart, targetChars, overlapChars)];
  const tail = buf.length > overlapChars ? buf.slice(-overlapChars) : buf;
  let newBufStart = cursor - tail.length;
  let newBuf = tail + piece;
  let newCursor = cursor + piece.length;

  if (newBuf.length > targetChars) {
    newChunks.push(...emitBuffer(newBuf, newBufStart, targetChars, overlapChars));
    const t2 = newBuf.length > overlapChars ? newBuf.slice(-overlapChars) : newBuf;
    newBufStart = newCursor - t2.length;
    newBuf = t2;
  }

  return { buf: newBuf, bufStart: newBufStart, cursor: newCursor, chunks: newChunks };
}

function emitBuffer(buf, bufStart, targetChars, overlapChars) {
  if (buf.length <= targetChars) {
    return [{ chunkIndex: 0, text: buf.trim(), charStart: bufStart, charEnd: bufStart + buf.length }];
  }
  return sliceWithOverlap(buf, targetChars, overlapChars, bufStart);
}

function sliceWithOverlap(text, targetChars, overlapChars, baseOffset = 0) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + targetChars);
    const slice = text.slice(start, end).trim();
    if (slice) {
      out.push({
        chunkIndex: out.length,
        text: slice,
        charStart: baseOffset + start,
        charEnd: baseOffset + end,
      });
    }
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }
  return reindexChunks(out);
}

function reindexChunks(chunks) {
  return chunks.map((c, i) => ({ ...c, chunkIndex: i }));
}

/**
 * @param {string} parentId
 * @param {number} chunkIndex
 */
export function buildChunkId(parentId, chunkIndex) {
  return `${String(parentId ?? '').trim()}#c${chunkIndex}`;
}

/**
 * @param {string} chunkId
 * @returns {{ parentId: string, chunkIndex: number }|null}
 */
export function parseChunkId(chunkId) {
  const m = /^(.+)#c(\d+)$/.exec(String(chunkId ?? ''));
  if (!m) return null;
  return { parentId: m[1], chunkIndex: Number.parseInt(m[2], 10) };
}
