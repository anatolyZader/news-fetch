import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { IVisitsRepositoryPort } from '../../domain/ports/IVisitsRepositoryPort.js';

/** Dual-read: canonical `visits` stem + legacy `field` stem (pre rewrite). */
const VISIT_REPORT_FILE_RE = /^articles-(?:visits|field)-reports-(\d{4}-\d{2}-\d{2})\.md$/;
const VISIT_SIGNAL_FILE_RE = /^signals-(?:visits|field)-(\d{4}-\d{2}-\d{2})\.json$/;
const VISIT_HEADING_RE = /^##\s+(\d+)\.\s+(.+)$/m;
const VISIT_PUBLISHED_RE = /^- \*\*Published:\*\*\s*(.+)$/m;
const VISIT_SOURCE_RE = /^- \*\*Source:\*\*\s*(.+)$/m;
const VISIT_STAKEHOLDERS_RE = /^גורמים שנפגשו:\s*(.+)$/m;
const INVALID_PLACEHOLDER_DATES = new Set(['1970-01-01']);

function parseMarkdownVisits(fileName, content) {
  const visits = [];
  const blocks = content.split(/\n---\s*(?:\n|$)/);

  for (const block of blocks) {
    const heading = VISIT_HEADING_RE.exec(block);
    if (!heading) continue;

    const articleIndex = Number(heading[1]);
    const rawTitle = heading[2].trim();
    const title = rawTitle.replace(/\s*\(ביקור שטח\)\s*$/u, '').trim();
    const published = VISIT_PUBLISHED_RE.exec(block)?.[1]?.trim() ?? null;
    const source = VISIT_SOURCE_RE.exec(block)?.[1]?.trim() ?? null;
    const bodyStart = block.search(/^- \*\*Source:\*\*.*$/m);
    const body = bodyStart >= 0
      ? block.slice(bodyStart).replace(/^- \*\*Source:\*\*.*$/m, '').trim()
      : '';
    const stakeholdersMatch = VISIT_STAKEHOLDERS_RE.exec(body);
    const notes = body.replace(/^גורמים שנפגשו:\s*.+\n*/m, '').trim();
    const [municipalityPart, regionPart] = title.split(/\s+—\s+/);

    visits.push({
      id: `${fileName}#${articleIndex}`,
      articleIndex,
      title,
      municipality: municipalityPart?.trim() || title,
      region: regionPart?.trim() || null,
      published,
      visitDate: published ? published.slice(0, 10) : null,
      source,
      stakeholders: stakeholdersMatch?.[1]?.trim() ?? null,
      notes,
      notePoints: splitVisitNotes(notes),
      signalCount: 0,
      signalTypes: [],
      signals: [],
    });
  }

  return visits;
}

function splitVisitNotes(notes) {
  return String(notes ?? '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?:[.;]|,\s+)/))
    .map((point) => point.trim())
    .filter((point) => point.length > 1);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Prefer module data dir; fall back to resilience_scorer closed-signals dir for older deployments.
 * When both `signals-visits-DATE` and `signals-field-DATE` exist, prefer visits.
 */
function collectVisitSignalPaths(primaryDir, rootDir) {
  const byDate = new Map();
  const legacyDir = resolve(rootDir, 'business_modules', 'resilience_scorer', 'data', 'signals');
  const tryDir = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const match = VISIT_SIGNAL_FILE_RE.exec(name);
      if (!match) continue;
      const date = match[1];
      const isCanonical = name.startsWith('signals-visits-');
      const prev = byDate.get(date);
      if (prev && prev.canonical && !isCanonical) continue;
      byDate.set(date, { name, path: resolve(dir, name), canonical: isCanonical });
    }
  };
  tryDir(primaryDir);
  if (legacyDir !== primaryDir) tryDir(legacyDir);
  return new Map([...byDate.values()].map((e) => [e.name, e.path]));
}

function attachSignalsToVisits(day, signals) {
  const visitsByIndex = new Map(day.visits.map((visit) => [visit.articleIndex, visit]));
  for (const signal of signals) {
    const visit = visitsByIndex.get(Number(signal.article_index));
    if (visit) visit.signals.push(signal);
  }
}

function summarizeVisitSignals(day) {
  for (const visit of day.visits) {
    const signalTypes = new Map();
    for (const signal of visit.signals) {
      const type = signal.signal_type || 'unknown';
      signalTypes.set(type, (signalTypes.get(type) ?? 0) + 1);
    }
    visit.signalCount = visit.signals.length;
    visit.signalTypes = Array.from(signalTypes, ([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }
}

function mergeSignalFileIntoDays(daysByDate, file, filePath) {
  const match = VISIT_SIGNAL_FILE_RE.exec(file);
  if (!match) return;
  const date = match[1];
  if (INVALID_PLACEHOLDER_DATES.has(date)) return;
  const signalDoc = readJson(filePath);
  const signals = Array.isArray(signalDoc?.signals) ? signalDoc.signals : [];
  const day = daysByDate.get(date) ?? { date, file: null, visits: [], signalCount: 0 };
  attachSignalsToVisits(day, signals);
  summarizeVisitSignals(day);
  day.signalFile = file;
  day.signalCount = signals.length;
  day.totalArticles = signalDoc?.total_articles ?? day.visits.length;
  daysByDate.set(date, day);
}

export class VisitsFsAdapter extends IVisitsRepositoryPort {
  constructor({
    rootDir = resolve('.'),
    reportsDir = null,
    signalsDir = null,
  } = {}) {
    super();
    this.rootDir = rootDir;
    this.reportsDir = reportsDir ?? rootDir;
    this.signalsDir =
      signalsDir ?? resolve(rootDir, 'business_modules', 'visits', 'data', 'signals');
  }

  listVisitDays() {
    const reportFiles = existsSync(this.reportsDir) ? readdirSync(this.reportsDir) : [];
    const signalPathByName = collectVisitSignalPaths(this.signalsDir, this.rootDir);
    const daysByDate = new Map();

    for (const file of reportFiles) {
      const match = VISIT_REPORT_FILE_RE.exec(file);
      if (!match) continue;
      const date = match[1];
      if (INVALID_PLACEHOLDER_DATES.has(date)) continue;
      const visits = parseMarkdownVisits(file, readFileSync(resolve(this.reportsDir, file), 'utf8'));
      daysByDate.set(date, { date, file, visits, signalCount: 0 });
    }

    for (const [file, filePath] of [...signalPathByName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      mergeSignalFileIntoDays(daysByDate, file, filePath);
    }

    return Array.from(daysByDate.values())
      .filter((day) => day.visits.length > 0)
      .map((day) => ({
        ...day,
        file: day.file ? basename(day.file) : null,
        visitCount: day.visits.length,
        municipalities: [...new Set(day.visits.map((visit) => visit.municipality).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

export function createVisitsFsAdapter(options) {
  return new VisitsFsAdapter(options);
}
