/**
 * Parses a PBO Incident Event Log in pipe-delimited format:
 *
 *   PBO INCIDENT EVENT LOG
 *   Format
 *   time | actor | behavior | category | context | source
 *   EVENT LIST
 *   06:00 | alert system | missile alert siren activated | alert activation | citywide | siren network
 *   ...
 *
 * Returns a structured object ready for LLM analysis.
 */

const EXPECTED_COLUMNS = ['time', 'actor', 'behavior', 'category', 'context', 'source'];

/**
 * Parse raw text of an event log.
 * Accepts text from a file or from stdin.
 *
 * @param {string} text
 * @param {string} [sourceName]
 * @returns {{ title, columns, events, rawText, sourceName }}
 */
export function parseEventLog(text, sourceName = 'stdin') {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let title = 'PBO Incident Event Log';
  let columns = EXPECTED_COLUMNS;
  const events = [];
  let inEvents = false;

  for (const line of lines) {
    // Header title (first non-empty line that isn't a separator)
    if (!inEvents && line.toUpperCase().includes('INCIDENT EVENT LOG')) {
      title = line;
      continue;
    }

    // Column header row: contains pipe-separated column names
    if (!inEvents && line.toLowerCase().includes('time') && line.includes('|')) {
      columns = line.split('|').map((c) => c.trim().toLowerCase());
      continue;
    }

    // "EVENT LIST" marker
    if (!inEvents && line.toUpperCase().replaceAll(/\s+/g, ' ').includes('EVENT LIST')) {
      inEvents = true;
      continue;
    }

    // Separator lines like "---" or "==="
    if (/^[-=]+$/.test(line)) continue;

    // Skip "Format" label line
    if (line.toLowerCase() === 'format') continue;

    if (!inEvents) continue;

    // Parse event row
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;

    const event = {};
    columns.forEach((col, i) => {
      event[col] = parts[i] ?? '';
    });

    // Skip rows that look like header repetitions
    if (event.time?.toLowerCase() === 'time') continue;

    events.push(event);
  }

  return { title, columns, events, rawText: text, sourceName };
}

/**
 * Format events as a compact markdown table for LLM consumption.
 */
export function formatEventsAsTable(parsedLog) {
  const { columns, events } = parsedLog;
  const header = `| ${columns.join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const rows = events.map(
    (e) => `| ${columns.map((c) => e[c] ?? '').join(' | ')} |`,
  );
  return [header, sep, ...rows].join('\n');
}

/**
 * Derive a report date from the events or source filename.
 * Priority: events 'date' column → YYYY-MM-DD in filename → fallback (today).
 */
export function inferDate(parsedLog, fallback) {
  // 1. If events have a 'date' column, use first non-empty value
  const first = parsedLog.events[0];
  if (first?.date && /\d{4}-\d{2}-\d{2}/.test(first.date)) return first.date;

  // 2. Extract YYYY-MM-DD from the source filename (e.g. event-log-2026-03-14.txt)
  if (parsedLog.sourceName) {
    const m = parsedLog.sourceName.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }

  return fallback ?? new Date().toISOString().slice(0, 10);
}

/**
 * Category → resilience component rough pre-mapping (used in prompts for grounding).
 */
export const CATEGORY_COMPONENT_HINTS = {
  'alert activation': ['lifesaving_behavior'],
  'protective behavior': ['lifesaving_behavior'],
  'protective compliance': ['lifesaving_behavior'],
  'compliance uncertainty': ['lifesaving_behavior', 'narrative'],
  'risk behavior': ['lifesaving_behavior'],
  'information seeking': ['information_communication'],
  'information consumption': ['information_communication'],
  'information uncertainty': ['information_communication', 'narrative'],
  'information verification': ['information_communication'],
  'information dissemination': ['information_communication', 'belonging_solidarity'],
  'official communication': ['information_communication', 'leadership'],
  'community support': ['community_capital', 'belonging_solidarity'],
  'emergency response': ['leadership', 'community_capital', 'lifesaving_behavior'],
  'emotional response': ['wellbeing_at_risk', 'narrative'],
  'family coping': ['wellbeing_at_risk', 'belonging_solidarity'],
  'narrative formation': ['narrative'],
  'rumor propagation': ['narrative', 'information_communication'],
  'situational awareness': ['information_communication', 'lifesaving_behavior'],
  'functional disruption': ['functional_continuity'],
  'functional continuity': ['functional_continuity'],
  'recovery behavior': ['functional_continuity'],
  'post-alert movement': ['functional_continuity', 'lifesaving_behavior'],
  'anticipation behavior': ['narrative', 'wellbeing_at_risk'],
};
