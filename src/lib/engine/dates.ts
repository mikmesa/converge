import type { DateRange, FactorResult, ISODate } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Parse YYYY-MM-DD into a UTC day number. Throws on malformed input. */
export function dayNumber(date: ISODate): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new Error(`Invalid date: ${date}`);
  }
  return Math.round(ms / MS_PER_DAY);
}

export function fromDayNumber(n: number): ISODate {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isValidISODate(date: unknown): date is ISODate {
  if (typeof date !== "string") return false;
  try {
    dayNumber(date);
    return true;
  } catch {
    return false;
  }
}

/** Inclusive length in calendar days (a same-day range has length 1). */
export function rangeLengthDays(r: DateRange): number {
  return dayNumber(r.end) - dayNumber(r.start) + 1;
}

/**
 * Number of overlapping calendar days between two ranges, INCLUSIVE of both
 * the start and end date (§40.3).
 *
 * Example: participant 2026-06-10→2026-06-15 vs option 2026-06-12→2026-06-20
 * overlap on 12, 13, 14, 15 → 4 days.
 */
export function overlapDays(a: DateRange, b: DateRange): number {
  const start = Math.max(dayNumber(a.start), dayNumber(b.start));
  const end = Math.min(dayNumber(a.end), dayNumber(b.end));
  return end >= start ? end - start + 1 : 0;
}

/** True when `inner` lies entirely within `outer` (inclusive). */
export function isContained(inner: DateRange, outer: DateRange): boolean {
  return (
    dayNumber(inner.start) >= dayNumber(outer.start) &&
    dayNumber(inner.end) <= dayNumber(outer.end)
  );
}

/**
 * Date factor (§7, §10):
 *  - unknown: participant submitted no date preference
 *  - met:     at least one participant range is fully contained in at least
 *             one option availability window
 *  - partial: some overlap exists, but no full containment
 *  - unmet:   zero overlap across every pair
 * With several ranges/windows, the best applicable result is used.
 */
export function evaluateDates(
  participantRanges: DateRange[] | null,
  optionWindows: DateRange[],
): FactorResult {
  if (!participantRanges || participantRanges.length === 0) return "unknown";
  let anyOverlap = false;
  for (const r of participantRanges) {
    for (const w of optionWindows) {
      if (isContained(r, w)) return "met";
      if (overlapDays(r, w) > 0) anyOverlap = true;
    }
  }
  return anyOverlap ? "partial" : "unmet";
}

/**
 * Ranking tie-break input (§40.3): for one participant, the MAXIMUM inclusive
 * overlap found across every (participant range × option window) pair.
 * Returns null when the participant submitted no dates (contributes zero to
 * the group sum).
 */
export function maxOverlapDays(
  participantRanges: DateRange[] | null,
  optionWindows: DateRange[],
): number | null {
  if (!participantRanges || participantRanges.length === 0) return null;
  let best = 0;
  for (const r of participantRanges) {
    for (const w of optionWindows) {
      best = Math.max(best, overlapDays(r, w));
    }
  }
  return best;
}

/**
 * Minimum shift (in days, same length) that moves `range` fully inside
 * `window`. Returns null when the range is longer than the window.
 * Positive = later, negative = earlier, 0 = already contained.
 */
export function minimalShiftIntoWindow(
  range: DateRange,
  window: DateRange,
): number | null {
  const rs = dayNumber(range.start);
  const re = dayNumber(range.end);
  const ws = dayNumber(window.start);
  const we = dayNumber(window.end);
  if (re - rs > we - ws) return null;
  if (rs < ws) return ws - rs;
  if (re > we) return -(re - we);
  return 0;
}

export function shiftRange(range: DateRange, days: number): DateRange {
  return {
    start: fromDayNumber(dayNumber(range.start) + days),
    end: fromDayNumber(dayNumber(range.end) + days),
  };
}
