import { existsSync, readFileSync, readdirSync } from 'fs';
import { basename, resolve } from 'path';
import { IVisitsRepositoryPort } from '../../domain/ports/IVisitsRepositoryPort.js';

const FIELD_REPORT_FILE_RE = /^articles-field-reports-(\d{4}-\d{2}-\d{2})\.md$/;
const FIELD_SIGNAL_FILE_RE = /^signals-field-(\d{4}-\d{2}-\d{2})\.json$/;
const INVALID_PLACEHOLDER_DATES = new Set(['1970-01-01']);

function parseMarkdownVisits(fileName, content) {
  const visits = [];
  const blocks = content.split(/\n---\s*(?:\n|$)/);

  for (const block of blocks) {
    const heading = block.match(/^##\s+(\d+)\.\s+(.+)$/m);
    if (!heading) continue;

    const articleIndex = Number(heading[1]);
    const rawTitle = heading[2].trim();
    const title = rawTitle.replace(/\s*\(ביקור שטח\)\s*$/u, '').trim();
    const published = block.match(/^- \*\*Published:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null;
    const source = block.match(/^- \*\*Source:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null;
    const bodyStart = block.search(/^- \*\*Source:\*\*.*$/m);
    const body = bodyStart >= 0
      ? block.slice(bodyStart).replace(/^- \*\*Source:\*\*.*$/m, '').trim()
      : '';
    const stakeholdersMatch = body.match(/^גורמים שנפגשו:\s*(.+)$/m);
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

/** Prefer module data dir; fall back to repo root `signals/` for older deployments or copies left after migration. */
function collectFieldSignalPaths(primaryDir, rootDir) {
  const byFile = new Map();
  const legacyDir = resolve(rootDir, 'signals');
  const tryDir = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (!FIELD_SIGNAL_FILE_RE.test(name) || byFile.has(name)) continue;
      byFile.set(name, resolve(dir, name));
    }
  };
  tryDir(primaryDir);
  if (legacyDir !== primaryDir) tryDir(legacyDir);
  return byFile;
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
    const signalPathByName = collectFieldSignalPaths(this.signalsDir, this.rootDir);
    const daysByDate = new Map();

    for (const file of reportFiles) {
      const match = file.match(FIELD_REPORT_FILE_RE);
      if (!match) continue;
      const date = match[1];
      if (INVALID_PLACEHOLDER_DATES.has(date)) continue;
      const visits = parseMarkdownVisits(file, readFileSync(resolve(this.reportsDir, file), 'utf8'));
      daysByDate.set(date, { date, file, visits, signalCount: 0 });
    }

    for (const [file, filePath] of [...signalPathByName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const match = file.match(FIELD_SIGNAL_FILE_RE);
      if (!match) continue;
      const date = match[1];
      if (INVALID_PLACEHOLDER_DATES.has(date)) continue;
      const signalDoc = readJson(filePath);
      const signals = Array.isArray(signalDoc?.signals) ? signalDoc.signals : [];
      const day = daysByDate.get(date) ?? { date, file: null, visits: [], signalCount: 0 };
      const visitsByIndex = new Map(day.visits.map((visit) => [visit.articleIndex, visit]));

      for (const signal of signals) {
        const articleIndex = Number(signal.article_index);
        const visit = visitsByIndex.get(articleIndex);
        if (!visit) continue;
        visit.signals.push(signal);
      }

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

      day.signalFile = file;
      day.signalCount = signals.length;
      day.totalArticles = signalDoc?.total_articles ?? day.visits.length;
      daysByDate.set(date, day);
    }

    return Array.from(daysByDate.values())
      .filter((day) => day.visits.length > 0)
      .map((day) => ({
        ...day,
        file: day.file ? basename(day.file) : null,
        visitCount: day.visits.length,
        municipalities: [...new Set(day.visits.map((visit) => visit.municipality).filter(Boolean))].sort(),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

export function createVisitsFsAdapter(options) {
  return new VisitsFsAdapter(options);
}
