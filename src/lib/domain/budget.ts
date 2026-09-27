import { MAX_BUDGET_VALUE } from "./taxonomy";

/**
 * Parses what people actually type into a rupee budget field:
 *   "15000", "15,000", "₹15,000", "15k", "15 K", "1.5L", "1.5 lakh", "2 lakhs"
 * Returns whole rupees, or null when the text isn't a recognisable amount.
 * (Previously non-digits were silently stripped, so "15k" became ₹15.)
 */
export function parseRupees(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[₹,\s]/g, "").replace(/^rs\.?/, "").replace(/\/-$/, "");
  if (s === "") return null;
  const m = /^(\d+(?:\.\d+)?)(k|thousand|l|lac|lacs|lakh|lakhs)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const mult = !unit ? 1 : unit === "k" || unit === "thousand" ? 1_000 : 100_000;
  const value = Math.round(n * mult);
  return Number.isFinite(value) ? value : null;
}

/** Anything below this is almost certainly a typo for a per-person trip budget. */
export const MIN_SENSIBLE_BUDGET = 500;

export type BudgetCheck =
  | { ok: true; ideal: number | null; max: number | null }
  | { ok: false; error: string };

export function checkBudgets(idealRaw: string, maxRaw: string): BudgetCheck {
  const hasIdeal = idealRaw.trim() !== "";
  const hasMax = maxRaw.trim() !== "";
  if (!hasIdeal && !hasMax) return { ok: true, ideal: null, max: null };
  if (hasIdeal !== hasMax) {
    return { ok: false, error: "Add both an ideal and a maximum budget, or leave both empty." };
  }
  const ideal = parseRupees(idealRaw);
  const max = parseRupees(maxRaw);
  if (ideal === null || max === null) {
    return { ok: false, error: "Use an amount like 15000, 15,000 or 15k." };
  }
  if (ideal < MIN_SENSIBLE_BUDGET || max < MIN_SENSIBLE_BUDGET) {
    const low = Math.min(ideal, max);
    return {
      ok: false,
      error: `₹${low.toLocaleString("en-IN")} looks too low for a trip budget — enter the full amount (for example 15000 or 15k).`,
    };
  }
  if (max > MAX_BUDGET_VALUE) return { ok: false, error: "That maximum is higher than this tool supports." };
  if (ideal > max) return { ok: false, error: "Your ideal budget can't be higher than your maximum." };
  return { ok: true, ideal, max };
}
