import { readFile, readdir } from 'fs/promises';
import { resolve, relative, sep } from 'path';
import Ajv from 'ajv/dist/2020.js';
import YAML from 'yaml';

const ENGINEERING_SKELETON_SECTIONS = [
  '## Purpose',
  '## Prerequisites',
  '## Inputs',
  '## Outputs',
  '## Constraints',
  '## Examples',
  '## Troubleshooting',
];

const WORKFLOW_INTENTS = new Set(['getting-started', 'guides', 'operations']);
const ENGINEERING_INTENTS = new Set(['concepts', 'architecture', 'api', 'playbooks']);

function toPosixPath(p) {
  return p.split(sep).join('/');
}

async function walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkDir(full)));
    else if (entry.isFile() && full.endsWith('.md')) out.push(full);
  }
  return out;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) {
    return { meta: null, body: markdown };
  }
  const lines = markdown.split('\n');
  if (lines[0].trim() !== '---') return { meta: null, body: markdown };
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return { meta: null, body: markdown };

  const raw = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  try {
    return { meta: YAML.parse(raw) ?? null, body };
  } catch {
    return { meta: null, body: markdown };
  }
}

function extractRelativeMarkdownLinks(markdown) {
  const links = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(markdown))) {
    const href = String(m[1] ?? '').trim();
    if (!href) continue;
    if (href.startsWith('#')) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) continue; // scheme (http, mailto, etc.)
    if (href.startsWith('/')) continue; // site-absolute handled by site
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) continue;
    links.push(clean);
  }
  return links;
}

function hasRunnableSnippet(body) {
  return /```[a-zA-Z0-9_-]+\s+runnable[\s\S]*?```/g.test(body);
}

function isUserOrientedPage(meta) {
  const tags = Array.isArray(meta?.tags) ? meta.tags.map(String) : [];
  return tags.includes('user');
}

function hasAtLeastNh2Headings(body, n) {
  const matches = body.match(/^##\s+/gm);
  return (matches?.length ?? 0) >= n;
}

async function main() {
  const repoRoot = resolve(process.cwd());
  const docsRoot = resolve(repoRoot, 'product_docs');
  const schemaPath = resolve(docsRoot, 'frontmatter.schema.json');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const files = await walkDir(docsRoot);
  const mdFiles = files.filter((f) => {
    const rel = toPosixPath(relative(docsRoot, f));
    if (rel === 'README.md') return false;
    if (rel.startsWith('_template')) return false;
    if (rel.startsWith('_')) return false;
    return true;
  });

  const errors = [];
  const knownFiles = new Set(mdFiles.map((f) => toPosixPath(relative(docsRoot, f))));

  for (const abs of mdFiles) {
    const rel = toPosixPath(relative(docsRoot, abs));
    const raw = await readFile(abs, 'utf8');
    const { meta, body } = parseFrontmatter(raw);

    if (!meta) {
      errors.push(`${rel}: missing or invalid frontmatter`);
    } else if (!validate(meta)) {
      errors.push(`${rel}: frontmatter schema invalid: ${ajv.errorsText(validate.errors)}`);
    }

    const intent = String(meta?.intent ?? '');
    const isEngineering = ENGINEERING_INTENTS.has(intent) && !isUserOrientedPage(meta);
    const isUserPage = isUserOrientedPage(meta);

    if (isEngineering) {
      for (const section of ENGINEERING_SKELETON_SECTIONS) {
        if (!body.includes(section)) {
          errors.push(`${rel}: missing required section heading: ${section}`);
        }
      }
    } else if (isUserPage) {
      // User docs should read naturally (not as a filled template) but still be actionable.
      if (!body.includes('## Troubleshooting')) {
        errors.push(`${rel}: user doc must include a '## Troubleshooting' section`);
      }
      if (!hasAtLeastNh2Headings(body, 3)) {
        errors.push(`${rel}: user doc must include at least 3 H2 sections (## ...) for readability`);
      }
    } else {
      // Default: keep the full skeleton for non-user docs unless they are explicitly user-tagged.
      for (const section of ENGINEERING_SKELETON_SECTIONS) {
        if (!body.includes(section)) {
          errors.push(`${rel}: missing required section heading: ${section}`);
        }
      }
    }

    // Workflow pages must include at least one runnable snippet and expected output.
    if (WORKFLOW_INTENTS.has(intent) && !isUserPage) {
      if (!hasRunnableSnippet(body)) {
        errors.push(`${rel}: workflow page missing a runnable code block (add \`\`\`bash runnable\` etc.)`);
      }
      if (hasRunnableSnippet(body) && !body.includes('Expected:')) {
        errors.push(`${rel}: runnable code block present but no 'Expected:' output described`);
      }
    }

    // Basic relative link integrity (within product_docs).
    const links = extractRelativeMarkdownLinks(body);
    for (const href of links) {
      if (!href.endsWith('.md')) continue;
      const target = toPosixPath(resolve('/', toPosixPath(resolve('/', toPosixPath(rel))).replace(/\/[^/]+$/, ''), href).slice(1));
      // The resolution above is intentionally conservative; we just ensure the path exists as written or as normalized.
      if (!knownFiles.has(href) && !knownFiles.has(target)) {
        errors.push(`${rel}: broken relative link: ${href}`);
      }
    }
  }

  // Runnable snippets (lightweight contract):
  // - Any fenced block annotated with "runnable" must be followed somewhere by "Expected:".
  // (Handled above for workflow pages; still enforce for any page that contains runnable snippets.)
  for (const abs of mdFiles) {
    const rel = toPosixPath(relative(docsRoot, abs));
    const raw = await readFile(abs, 'utf8');
    const body = parseFrontmatter(raw).body;
    if (hasRunnableSnippet(body) && !body.includes('Expected:')) {
      errors.push(`${rel}: runnable code block present but no 'Expected:' output described`);
    }
  }

  if (errors.length > 0) {
    console.error(`Docs validation failed (${errors.length} issue(s)):\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }

  console.log(`Docs validation OK (${mdFiles.length} pages).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

