import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import YAML from 'yaml';

const FRONTMATTER_BOUNDARY = '---';

function isDocMarkdownFile(filePath) {
  return filePath.endsWith('.md');
}

function toPosixPath(p) {
  return p.split(sep).join('/');
}

function parseFrontmatter(markdown) {
  if (typeof markdown !== 'string') return { meta: null, body: '' };
  const trimmed = markdown.startsWith(FRONTMATTER_BOUNDARY) ? markdown : null;
  if (!trimmed) return { meta: null, body: markdown };

  const lines = markdown.split('\n');
  if (lines[0].trim() !== FRONTMATTER_BOUNDARY) return { meta: null, body: markdown };

  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === FRONTMATTER_BOUNDARY) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return { meta: null, body: markdown };

  const fmRaw = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n').replace(/^\s+/, '');
  try {
    const meta = YAML.parse(fmRaw) ?? null;
    return { meta, body };
  } catch {
    return { meta: null, body: markdown };
  }
}

async function walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    if (entry.name === 'README.md') continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkDir(full)));
    } else if (entry.isFile() && isDocMarkdownFile(full)) {
      out.push(full);
    }
  }
  return out;
}

function safeSlugToRelativePath(slug) {
  const raw = String(slug ?? '').trim();
  if (!raw) return null;
  if (raw.includes('\\')) return null;
  if (raw.startsWith('/')) return null;
  if (raw.includes('..')) return null;
  return `${raw}.md`;
}

export function isGatedDocPage(meta, relativePathPosix) {
  const intent = typeof meta?.intent === 'string' ? meta.intent : null;
  if (intent === 'playbooks') return true;
  return relativePathPosix.startsWith('playbooks/');
}

export async function buildProductDocsIndex({ docsRootDir }) {
  const root = resolve(docsRootDir);
  const files = await walkDir(root);
  const pages = [];

  for (const absPath of files) {
    const rel = toPosixPath(relative(root, absPath));
    const slug = rel.replace(/\.md$/i, '');

    const content = await readFile(absPath, 'utf8');
    const { meta } = parseFrontmatter(content);
    const gated = isGatedDocPage(meta, rel);
    const audience = Array.isArray(meta?.audience) ? meta.audience.map(String) : [];
    if (audience.includes('internal')) continue;

    const st = await stat(absPath);
    pages.push({
      slug,
      title: meta?.title ?? slug.split('/').slice(-1)[0],
      description: meta?.description ?? null,
      intent: meta?.intent ?? slug.split('/')[0] ?? null,
      audience: meta?.audience ?? null,
      stability: meta?.stability ?? null,
      canonical: meta?.canonical ?? null,
      version: meta?.version ?? null,
      tags: meta?.tags ?? [],
      gated,
      updatedAtMs: Number.isFinite(st.mtimeMs) ? st.mtimeMs : null,
    });
  }

  pages.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  return { pages };
}

export async function loadProductDocPage({ docsRootDir, slug }) {
  const root = resolve(docsRootDir);
  const relPath = safeSlugToRelativePath(slug);
  if (!relPath) return { ok: false, code: 400, error: 'invalid slug' };

  const absPath = resolve(root, relPath);
  if (!absPath.startsWith(root + sep) && absPath !== root) {
    return { ok: false, code: 400, error: 'invalid slug' };
  }

  try {
    const content = await readFile(absPath, 'utf8');
    const { meta, body } = parseFrontmatter(content);
    const relativePathPosix = toPosixPath(relative(root, absPath));
    return {
      ok: true,
      meta: meta ?? {},
      markdown: body,
      gated: isGatedDocPage(meta, relativePathPosix),
    };
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: false, code: 404, error: 'not found' };
    return { ok: false, code: 500, error: 'failed to load page' };
  }
}

