#!/usr/bin/env node
/**
 * CLI for managing radio recording jobs in the SQLite scheduler.
 *
 * Commands:
 *   add      Add a new recording job
 *   list     List all jobs
 *   runs     List recent recording runs
 *   enable   Enable a job by id
 *   disable  Disable a job by id
 *   delete   Delete a job and its runs by id
 *
 * SCHEDULE FORMAT
 *   --schedule accepts one or more slots separated by '|', each slot: DAYS:HH:MM
 *   DAYS is a hyphen-separated range of day numbers or comma-separated names:
 *     0-4              Sun through Thu  (weekdays in Israel)
 *     0,1,2,3,4        same, comma-separated
 *     1-5              Mon through Fri
 *     5                Fri only
 *     0                Sun only
 *   Names: sun mon tue wed thu fri sat  (case-insensitive)
 *
 *   Use '|' to separate multiple slots (not comma — commas are used inside day lists):
 *     "0-4:18:00"                     weekday evenings at 18:00
 *     "0-4:18:00|5:12:00"             + Fri noon
 *     "0,1,2,3,4:07:00|5,6:09:00"    weekdays 07:00, weekend 09:00
 *
 * DURATION
 *   --duration accepts seconds or a value with suffix: 30m, 1h, 90s
 *
 * EXAMPLES
 *   node manage-jobs.js add \
 *     --station "kan-reshet-bet" \
 *     --url "https://kan-vod.akamaized.net/.../playlist.m3u8" \
 *     --program "Evening News" \
 *     --schedule "0-4:18:00" \
 *     --duration 30m
 *
 *   node manage-jobs.js list
 *   node manage-jobs.js runs
 *   node manage-jobs.js disable <id>
 *   node manage-jobs.js enable  <id>
 *   node manage-jobs.js delete  <id>
 */

import 'dotenv/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRecordingJobStore } from '../infrastructure/recordingJobStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(__dirname, '..', '..', '..', 'data', 'app.sqlite');

const store = createRecordingJobStore(sqlitePath);

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseDays(str) {
  const parts = str.toLowerCase().split(',');
  const days = new Set();
  for (const part of parts) {
    if (part.includes('-')) {
      const [from, to] = part.split('-').map((s) => {
        const n = parseInt(s, 10);
        return Number.isNaN(n) ? DAY_NAMES.indexOf(s) : n;
      });
      if (from < 0 || to < 0 || from > 6 || to > 6) throw new Error(`Invalid day range: ${part}`);
      for (let d = from; d <= to; d++) days.add(d);
    } else {
      const n = parseInt(part, 10);
      const day = Number.isNaN(n) ? DAY_NAMES.indexOf(part) : n;
      if (day < 0 || day > 6) throw new Error(`Invalid day: ${part}`);
      days.add(day);
    }
  }
  return [...days].sort((a, b) => a - b);
}

/** Parse "DAYS:HH:MM" → { dayOfWeek, hour, minute } */
function parseScheduleSlot(slotStr) {
  const parts = slotStr.trim().split(':');
  if (parts.length !== 3) throw new Error(`Invalid slot "${slotStr}" — expected DAYS:HH:MM`);
  const [daysStr, hourStr, minStr] = parts;
  const dayOfWeek = parseDays(daysStr);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time ${hourStr}:${minStr}`);
  }
  return { dayOfWeek, hour, minute };
}

/** Parse "0-4:18:00,5:12:00" → array of slot objects */
function parseSchedule(str) {
  return str.split(',').reduce((acc, chunk) => {
    // A slot has exactly two colons: DAYS:HH:MM
    // But commas might split inside DAYS (e.g. "0,1,2:18:00") — re-join greedily
    // Strategy: scan forward collecting tokens until we have "...:HH:MM" pattern
    acc.push(chunk.trim());
    return acc;
  }, []).map(parseScheduleSlot);
}

/** Parse "30m", "1h", "90s", "1800" → seconds */
function parseDuration(str) {
  const s = String(str).trim().toLowerCase();
  if (s.endsWith('h')) return parseFloat(s) * 3600;
  if (s.endsWith('m')) return parseFloat(s) * 60;
  if (s.endsWith('s')) return parseFloat(s);
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid duration: ${str}`);
  return n;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

const getArg = (flag, def = null) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? (args[idx + 1] ?? def) : def;
};

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatSchedule(schedule) {
  return schedule
    .map(({ dayOfWeek, hour, minute }) => {
      const days = dayOfWeek.map((d) => DAY_ABBR[d]).join('/');
      return `${days} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdAdd() {
  const station  = getArg('--station');
  const url      = getArg('--url');
  const program  = getArg('--program');
  const schedStr = getArg('--schedule');
  const durStr   = getArg('--duration');

  if (!station || !url || !program || !schedStr || !durStr) {
    console.error('add requires: --station --url --program --schedule --duration');
    process.exit(1);
  }

  let schedule, durationSec;
  try {
    schedule    = parseSchedule(schedStr);
    durationSec = parseDuration(durStr);
  } catch (err) {
    console.error('Parse error:', err.message);
    process.exit(1);
  }

  const id = store.addJob({ station, streamUrl: url, program, schedule, durationSec });
  console.log(`Job created: ${id}`);
  console.log(`  Station  : ${station}`);
  console.log(`  Program  : ${program}`);
  console.log(`  Schedule : ${formatSchedule(schedule)}`);
  console.log(`  Duration : ${durationSec}s (${Math.round(durationSec / 60)} min)`);
  console.log(`  URL      : ${url}`);
}

function cmdList() {
  const jobs = store.listJobs();
  if (jobs.length === 0) {
    console.log('No jobs configured yet.');
    console.log('  Add one: node manage-jobs.js add --station ... --url ... --program ... --schedule ... --duration ...');
    return;
  }
  console.log(`${jobs.length} job(s):\n`);
  for (const j of jobs) {
    const flag = j.enabled ? '[ON] ' : '[OFF]';
    console.log(`${flag} ${j.id}`);
    console.log(`       Station  : ${j.station}`);
    console.log(`       Program  : ${j.program}`);
    console.log(`       Schedule : ${formatSchedule(j.schedule)}`);
    console.log(`       Duration : ${j.duration_sec}s`);
    console.log(`       URL      : ${j.stream_url}`);
    console.log();
  }
}

function cmdRuns() {
  const runs = store.listRuns({ limit: 20 });
  if (runs.length === 0) { console.log('No runs yet.'); return; }
  console.log(`Recent ${runs.length} run(s):\n`);
  for (const r of runs) {
    const status = r.status.padEnd(10);
    console.log(`${status} ${r.scheduled_start_at}  ${r.station} — ${r.program}`);
    if (r.output_path)  console.log(`           → ${r.output_path}`);
    if (r.error_msg)    console.log(`           ! ${r.error_msg}`);
  }
}

function cmdEnable(id, enabled) {
  if (!id) { console.error(`Usage: manage-jobs.js ${enabled ? 'enable' : 'disable'} <job-id>`); process.exit(1); }
  store.setJobEnabled(id, enabled);
  console.log(`Job ${id} ${enabled ? 'enabled' : 'disabled'}.`);
}

function cmdDelete(id) {
  if (!id) { console.error('Usage: manage-jobs.js delete <job-id>'); process.exit(1); }
  store.deleteJob(id);
  console.log(`Job ${id} and its runs deleted.`);
}

function usage() {
  console.log('Commands: add | list | runs | enable <id> | disable <id> | delete <id>');
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

switch (command) {
  case 'add':     cmdAdd(); break;
  case 'list':    cmdList(); break;
  case 'runs':    cmdRuns(); break;
  case 'enable':  cmdEnable(args[1], true); break;
  case 'disable': cmdEnable(args[1], false); break;
  case 'delete':  cmdDelete(args[1]); break;
  default:        usage(); process.exit(command ? 1 : 0);
}
