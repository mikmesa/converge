import { describe, expect, it } from "vitest";
import {
  dayNumber,
  evaluateDates,
  isValidISODate,
  maxOverlapDays,
  minimalShiftIntoWindow,
  overlapDays,
  rangeLengthDays,
  shiftRange,
} from "../dates";
import { range } from "./fixtures";

describe("date parsing", () => {
  it("rejects malformed and impossible dates", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("26-01-01")).toBe(false);
    expect(isValidISODate(20260101)).toBe(false);
    expect(isValidISODate("2028-02-29")).toBe(true);
  });
  it("counts days across month and year boundaries", () => {
    expect(dayNumber("2027-01-01") - dayNumber("2026-12-31")).toBe(1);
    expect(rangeLengthDays(range("2026-12-30", "2027-01-02"))).toBe(4);
  });
});

describe("overlapDays (inclusive, §40.3)", () => {
  it("matches the spec example: Jun 10–15 vs Jun 12–20 = 4 days", () => {
    expect(overlapDays(range("2026-06-10", "2026-06-15"), range("2026-06-12", "2026-06-20"))).toBe(4);
  });
  it("counts a single shared boundary day as 1", () => {
    expect(overlapDays(range("2026-06-01", "2026-06-10"), range("2026-06-10", "2026-06-20"))).toBe(1);
  });
  it("is 0 for disjoint ranges", () => {
    expect(overlapDays(range("2026-06-01", "2026-06-09"), range("2026-06-10", "2026-06-20"))).toBe(0);
  });
  it("equals inner length for full containment", () => {
    expect(overlapDays(range("2026-06-12", "2026-06-14"), range("2026-06-01", "2026-06-30"))).toBe(3);
  });
});

describe("evaluateDates", () => {
  const windows = [range("2026-10-15", "2027-05-31")];
  it("met on full containment", () => {
    expect(evaluateDates([range("2026-12-20", "2026-12-24")], windows)).toBe("met");
  });
  it("met when range equals the window exactly", () => {
    expect(evaluateDates([range("2026-10-15", "2027-05-31")], windows)).toBe("met");
  });
  it("partial on overlap without containment", () => {
    expect(evaluateDates([range("2026-10-10", "2026-10-20")], windows)).toBe("partial");
  });
  it("unmet on zero overlap", () => {
    expect(evaluateDates([range("2027-07-01", "2027-07-05")], windows)).toBe("unmet");
  });
  it("unknown when no dates submitted (null or empty)", () => {
    expect(evaluateDates(null, windows)).toBe("unknown");
    expect(evaluateDates([], windows)).toBe("unknown");
  });
  it("uses the best result across multiple participant windows", () => {
    expect(
      evaluateDates(
        [range("2027-07-01", "2027-07-05"), range("2026-10-10", "2026-10-20")],
        windows,
      ),
    ).toBe("partial");
    expect(
      evaluateDates(
        [range("2027-07-01", "2027-07-05"), range("2026-11-01", "2026-11-04")],
        windows,
      ),
    ).toBe("met");
  });
  it("uses the best result across multiple option windows", () => {
    const two = [range("2026-10-01", "2026-10-15"), range("2027-06-01", "2027-06-30")];
    expect(evaluateDates([range("2027-06-10", "2027-06-14")], two)).toBe("met");
    expect(evaluateDates([range("2026-10-14", "2026-10-20")], two)).toBe("partial");
  });
  it("does not treat a range spanning two adjacent windows as contained", () => {
    const adjacent = [range("2026-10-01", "2026-10-15"), range("2026-10-16", "2026-10-31")];
    expect(evaluateDates([range("2026-10-14", "2026-10-17")], adjacent)).toBe("partial");
  });
});

describe("maxOverlapDays", () => {
  it("takes the maximum over every range × window pair", () => {
    const windows = [range("2026-06-01", "2026-06-05"), range("2026-06-10", "2026-06-20")];
    const ranges = [range("2026-06-03", "2026-06-12"), range("2026-06-15", "2026-06-25")];
    // pairs: (r1,w1)=3, (r1,w2)=3, (r2,w1)=0, (r2,w2)=6
    expect(maxOverlapDays(ranges, windows)).toBe(6);
  });
  it("is null when no dates were submitted", () => {
    expect(maxOverlapDays(null, [range("2026-06-01", "2026-06-05")])).toBeNull();
  });
  it("is 0 (not null) when dates were submitted but never overlap", () => {
    expect(maxOverlapDays([range("2027-01-01", "2027-01-02")], [range("2026-06-01", "2026-06-05")])).toBe(0);
  });
});

describe("minimalShiftIntoWindow", () => {
  const w = range("2026-10-15", "2026-10-31");
  it("shifts later when starting before the window", () => {
    expect(minimalShiftIntoWindow(range("2026-10-10", "2026-10-14"), w)).toBe(5);
  });
  it("shifts earlier when ending after the window", () => {
    expect(minimalShiftIntoWindow(range("2026-10-29", "2026-11-02"), w)).toBe(-2);
  });
  it("is 0 when already contained", () => {
    expect(minimalShiftIntoWindow(range("2026-10-20", "2026-10-22"), w)).toBe(0);
  });
  it("is null when the range is longer than the window", () => {
    expect(minimalShiftIntoWindow(range("2026-10-01", "2026-11-30"), w)).toBeNull();
  });
  it("shiftRange preserves length", () => {
    const r = range("2026-12-30", "2027-01-02");
    const s = shiftRange(r, 5);
    expect(s).toEqual(range("2027-01-04", "2027-01-07"));
    expect(rangeLengthDays(s)).toBe(rangeLengthDays(r));
  });
});
