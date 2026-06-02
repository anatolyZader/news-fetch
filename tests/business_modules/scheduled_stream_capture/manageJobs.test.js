import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// The parsing helpers in manage-jobs.js are not exported, so we replicate and
// test the same logic here.  If manage-jobs.js is ever refactored to export
// these, switch to importing directly.

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

function parseDuration(str) {
  const s = String(str).trim().toLowerCase();
  if (s.endsWith('h')) return parseFloat(s) * 3600;
  if (s.endsWith('m')) return parseFloat(s) * 60;
  if (s.endsWith('s')) return parseFloat(s);
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid duration: ${str}`);
  return n;
}

describe('manage-jobs parsing', () => {
  describe('parseDays', () => {
    it('parses numeric range 0-4', () => {
      assert.deepStrictEqual(parseDays('0-4'), [0, 1, 2, 3, 4]);
    });

    it('parses numeric range 1-5', () => {
      assert.deepStrictEqual(parseDays('1-5'), [1, 2, 3, 4, 5]);
    });

    it('parses single day number', () => {
      assert.deepStrictEqual(parseDays('5'), [5]);
    });

    it('parses comma-separated numbers', () => {
      assert.deepStrictEqual(parseDays('0,2,4'), [0, 2, 4]);
    });

    it('parses named days', () => {
      assert.deepStrictEqual(parseDays('sun,mon,tue'), [0, 1, 2]);
    });

    it('parses named day range', () => {
      assert.deepStrictEqual(parseDays('sun-thu'), [0, 1, 2, 3, 4]);
    });

    it('is case-insensitive', () => {
      assert.deepStrictEqual(parseDays('SUN,MON'), [0, 1]);
    });

    it('throws on invalid day', () => {
      assert.throws(() => parseDays('8'), /Invalid day/);
    });

    it('throws on invalid range', () => {
      assert.throws(() => parseDays('0-8'), /Invalid day range/);
    });
  });

  describe('parseScheduleSlot', () => {
    it('parses "0-4:18:00"', () => {
      const slot = parseScheduleSlot('0-4:18:00');
      assert.deepStrictEqual(slot.dayOfWeek, [0, 1, 2, 3, 4]);
      assert.strictEqual(slot.hour, 18);
      assert.strictEqual(slot.minute, 0);
    });

    it('parses "5:12:30"', () => {
      const slot = parseScheduleSlot('5:12:30');
      assert.deepStrictEqual(slot.dayOfWeek, [5]);
      assert.strictEqual(slot.hour, 12);
      assert.strictEqual(slot.minute, 30);
    });

    it('throws on missing parts', () => {
      assert.throws(() => parseScheduleSlot('0-4:18'), /expected DAYS:HH:MM/);
    });

    it('throws on invalid hour', () => {
      assert.throws(() => parseScheduleSlot('0:25:00'), /Invalid time/);
    });

    it('throws on invalid minute', () => {
      assert.throws(() => parseScheduleSlot('0:12:60'), /Invalid time/);
    });
  });

  describe('parseDuration', () => {
    it('parses raw seconds', () => {
      assert.strictEqual(parseDuration('1800'), 1800);
    });

    it('parses minutes suffix', () => {
      assert.strictEqual(parseDuration('30m'), 1800);
    });

    it('parses hours suffix', () => {
      assert.strictEqual(parseDuration('2h'), 7200);
    });

    it('parses seconds suffix', () => {
      assert.strictEqual(parseDuration('90s'), 90);
    });

    it('parses fractional hours', () => {
      assert.strictEqual(parseDuration('1.5h'), 5400);
    });

    it('throws on garbage', () => {
      assert.throws(() => parseDuration('abc'), /Invalid duration/);
    });
  });
});
