import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, extname, resolve, sep } from 'path';
import { IChatbotManualReportsPort } from '../../domain/ports/IChatbotManualReportsPort.js';

const SNIPPET_BYTES = 1200;
const ALLOWED_EXT = new Set(['.md', '.markdown', '.txt', '.json', '.html', '.htm']);

function safeFileInInbox(inboxDir, fileName) {
  const name = basename(String(fileName ?? ''));
  if (!name || name !== String(fileName ?? '').trim() || name.startsWith('.')) {
    throw new Error('invalid file name');
  }
  const resolved = resolve(inboxDir, name);
  if (!resolved.startsWith(inboxDir + sep) && resolved !== inboxDir) {
    throw new Error('invalid path');
  }
  return { name, resolved };
}

function textSnippet(buf) {
  const raw = buf.length > SNIPPET_BYTES ? buf.subarray(0, SNIPPET_BYTES) : buf;
  let s = raw.toString('utf8');
  if (buf.length > SNIPPET_BYTES) s = `${s.trimEnd()}\n…`;
  return s;
}

export class ChatbotManualReportsFsAdapter extends IChatbotManualReportsPort {
  /**
   * @param {{ rootDir: string }} opts — repo root; reads `rootDir/chatbot/`
   */
  constructor({ rootDir }) {
    super();
    this.inboxDir = resolve(rootDir, 'chatbot');
  }

  listReports() {
    if (!existsSync(this.inboxDir)) return [];
    const out = [];
    for (const ent of readdirSync(this.inboxDir, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      const fileName = ent.name;
      if (fileName.startsWith('.')) continue;
      const ext = extname(fileName).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const resolved = resolve(this.inboxDir, fileName);
      let st;
      try {
        st = statSync(resolved);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      let snippet = '';
      try {
        const buf = readFileSync(resolved);
        snippet = textSnippet(buf);
      } catch {
        snippet = '';
      }
      out.push({
        fileName,
        size: st.size,
        mtimeMs: st.mtimeMs,
        extension: ext,
        snippet,
      });
    }
    out.sort((a, b) => b.mtimeMs - a.mtimeMs || a.fileName.localeCompare(b.fileName));
    return out;
  }

  readReportText(fileName) {
    const { resolved, name } = safeFileInInbox(this.inboxDir, fileName);
    if (!existsSync(resolved)) throw new Error(`not found: ${name}`);
    const st = statSync(resolved);
    if (!st.isFile()) throw new Error(`not a file: ${name}`);
    const ext = extname(name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw new Error(`unsupported type: ${name}`);
    return readFileSync(resolved, 'utf8');
  }
}

export function createChatbotManualReportsFsAdapter(opts) {
  return new ChatbotManualReportsFsAdapter(opts);
}
