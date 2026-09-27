import { describe, expect, it } from "vitest";
import { checkBudgets, parseRupees } from "../budget";

describe("parseRupees", () => {
  it.each([
    ["15000", 15000],
    ["15,000", 15000],
    ["₹15,000", 15000],
    [" 15000 ", 15000],
    ["15k", 15000],
    ["15K", 15000],
    ["15 k", 15000],
    ["12.5k", 12500],
    ["1.5L", 150000],
    ["1.5 lakh", 150000],
    ["2 lakhs", 200000],
    ["Rs. 8000", 8000],
    ["8000/-", 8000],
    ["1,50,000", 150000],
  ])("%s → %d", (input, expected) => {
    expect(parseRupees(input)).toBe(expected);
  });

  it.each(["", "abc", "15kk", "fifteen", "15-20k", "-500", "1e5"])("rejects %j", (input) => {
    expect(parseRupees(input)).toBeNull();
  });
});

describe("checkBudgets", () => {
  it("regression: '15k' / '20k' is ₹15,000 / ₹20,000, not ₹15 / ₹20", () => {
    expect(checkBudgets("15k", "20k")).toEqual({ ok: true, ideal: 15000, max: 20000 });
  });
  it("blocks implausibly small amounts instead of silently accepting them", () => {
    const r = checkBudgets("15", "20");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too low/);
  });
  it("both or neither (D6)", () => {
    expect(checkBudgets("", "")).toEqual({ ok: true, ideal: null, max: null });
    expect(checkBudgets("12000", "").ok).toBe(false);
  });
  it("ideal must not exceed max", () => {
    expect(checkBudgets("30k", "18k").ok).toBe(false);
  });
  it("unparseable input gets a helpful message", () => {
    const r = checkBudgets("around 10", "15000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/15k/);
  });
});
