---
allowed-tools: Bash(node -e *), Bash(find *), Bash(ls *), Bash(cd /home/eventstorm1/news && *), Read, Write
description: Doc-drift audit — find dead path citations, broken links, and index staleness across docs/, commands, and root docs; report only (no API credits — analysis runs inline)
---

## Your task

Audit developer-facing docs for drift: repo paths cited in prose/code-blocks that no longer exist, broken relative links, contradictions between doc generations, and `docs/INDEX.md` staleness. **Report-only: never edit any audited file.** Fixes happen as a separate user-approved action after reading the report (same propose→approve split as `/harvest-signals` → `/apply-signal-batch`). No pipeline runs, no API calls. Do NOT ask for confirmation — just go.

Scope: `docs/**/*.md`, `.claude/commands/*.md`, `AGENTS.md`, `CLAUDE.md`, `memory.md`.

**Step 1 — Citation extraction (deterministic)**

Run this node script from `/home/eventstorm1/news`:

```
node -e "
const fs = require('fs');
const path = require('path');
const root = '/home/eventstorm1/news';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return p.endsWith('.md') ? [p] : [];
  });
}

const targets = [
  ...walk(path.join(root, 'docs')),
  ...fs.readdirSync(path.join(root, '.claude/commands')).filter(f => f.endsWith('.md')).map(f => path.join(root, '.claude/commands', f)),
  path.join(root, 'AGENTS.md'), path.join(root, 'CLAUDE.md'), path.join(root, 'memory.md'),
].filter(p => fs.existsSync(p));

const topDirs = new Set(fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name));
const prefixes = [root, path.join(root, 'business_modules/resilience_scorer')];
const pathish = /^\.{0,2}\/?[\w@.-]+(\/[\w@.<>*!-]+)+\/?$/;
const results = [];

for (const file of targets) {
  const relFile = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  const seen = new Set();
  const candidates = [];
  for (const m of text.matchAll(/\`([^\`\n]+)\`/g)) candidates.push(m[1]);
  for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) candidates.push(m[1]);
  for (const m of text.matchAll(/require\(\s*['\"]([^'\"]+)['\"]\s*\)/g)) candidates.push(m[1]);

  for (let c of candidates) {
    c = c.trim().replace(/[.,;:]+$/, '');
    if (!c.includes('/') || /^https?:|^mailto:/.test(c) || /[<>*{}$|\\\\]/.test(c)) continue;
    if (/^@[\w-]+\//.test(c) || /^npm /.test(c)) continue;
    if (!pathish.test(c)) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    const clean = c.replace(/\/$/, '');
    const bases = [path.dirname(file), ...prefixes];
    let exists = false, resolvedVia = null;
    for (const b of bases) {
      const abs = path.resolve(b, clean);
      if (fs.existsSync(abs)) { exists = true; resolvedVia = path.relative(root, b) || '(root)'; break; }
    }
    const firstSeg = clean.replace(/^\.\/|^\//, '').split('/')[0];
    const rootAnchored = topDirs.has(firstSeg) || firstSeg === '.claude' || firstSeg === '.github';
    results.push({ file: relFile, citation: c, exists, resolvedVia, rootAnchored });
  }
}

const dead = results.filter(r => !r.exists && r.rootAnchored);
const unresolved = results.filter(r => !r.exists && !r.rootAnchored);
console.log(JSON.stringify({
  scannedFiles: targets.length,
  totalCitations: results.length,
  deadRootAnchored: dead,
  unresolvedRelative: unresolved,
}, null, 2));
"
```

Interpretation: `deadRootAnchored` = high-confidence drift (path starts with a real top-level dir but resolves against nothing). `unresolvedRelative` = low confidence (likely module-relative shorthand, example paths, or CLI args — judge each; do NOT bulk-flag these).

**Step 2 — Analysis**

- For each `deadRootAnchored` citation, classify **moved** vs **deleted**: search for the basename elsewhere (`find /home/eventstorm1/news -name "<basename>" -not -path "*/node_modules/*"`) and/or `cd /home/eventstorm1/news && git log --oneline -3 --follow -- <old-path>` to see the removing/moving commit. Moved → propose the replacement path. Deleted → propose rewording or removal of the citation.
- Group repeat offenders: the same dead path cited across many files is one root cause, one fix proposal.
- **Index freshness**: compare `docs/INDEX.md` (if it exists) against `find /home/eventstorm1/news/docs -type f` — list files missing from the index and index entries whose files are gone. If no INDEX.md, recommend running `/compile-docs`.
- **Cross-generation contradictions**: where a dead citation was fixed in `main_docu_files/` but persists in `updated_main_docs/` (or vice versa), or the two generations state conflicting facts about the same subsystem, note it — spot-check, not exhaustive.
- Skim `unresolvedRelative` for anything that is clearly a genuine dead reference (not shorthand); promote those individually with a note.

**Step 3 — Write the report**

Write to `docs/reviews/doc-drift-<YYYY-MM-DD>.md` (today's date):

```markdown
# Doc-drift audit — <YYYY-MM-DD>

Scanned: <N> files | Citations checked: <N> | Dead (high-confidence): <N> | Judged from unresolved-relative: <N>

## Executive Summary
[3–5 sentences: overall drift level, dominant root cause(s), most urgent fix]

## Dead-path citations
| Doc | Cited path | Verdict | Proposed fix |
|---|---|---|---|
| ... | `...` | moved → `<new path>` / deleted (<commit>) | ... |

## Index freshness
[INDEX.md vs actual tree: missing entries, ghost entries, or "run /compile-docs"]

## Contradictions & generation drift
[live vs legacy generation disagreements; superseded content still presented as current]

## Recommended fixes
1. **[Title]** — [specific edit: which file(s), old → new path or rewording]. Impact: [what breaks/misleads today].
2. ...
[ranked by impact; group same-root-cause items into one entry]
```

**Never apply the fixes in this command** — the report is the deliverable.

After writing, report the file path, the dead-citation count, and the top 2–3 recommended fixes as a summary.
