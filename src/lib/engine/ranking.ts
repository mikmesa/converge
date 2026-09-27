import type {
  EngineOption,
  OptionGroupEvaluation,
  RankedOption,
  RankingRule,
} from "./types";

/**
 * GROUP RANKING (§13) — exact lexicographic order, no numeric score, no
 * weights. Only group-feasible options are ranked.
 *
 *   1. Fewest participants in Conflict tier
 *   2. Most participants in Strong Fit tier
 *   3. Lowest total budget overshoot:
 *        Σ max(0, cost_per_person − ideal_budget) over participants with an
 *        ideal budget (Insufficient Input participants excluded, §36A.5)
 *   4. Highest total date overlap (§40.3): Σ over participants of their
 *        maximum inclusive overlap days; unknown dates contribute 0
 *   5. Curated dataset order: options.sort_order ascending (§36A.7)
 *
 * Do not modify this order without product sign-off.
 */
const RULES: { rule: RankingRule; compare: (a: Row, b: Row) => number }[] = [
  { rule: "fewest_conflict", compare: (a, b) => a.g.counts.conflict - b.g.counts.conflict },
  { rule: "most_strong", compare: (a, b) => b.g.counts.strong - a.g.counts.strong },
  {
    rule: "lowest_overshoot",
    compare: (a, b) => a.g.totalBudgetOvershoot - b.g.totalBudgetOvershoot,
  },
  {
    rule: "most_date_overlap",
    compare: (a, b) => b.g.totalDateOverlapDays - a.g.totalDateOverlapDays,
  },
  { rule: "curated_order", compare: (a, b) => a.o.sortOrder - b.o.sortOrder },
];

interface Row {
  g: OptionGroupEvaluation;
  o: EngineOption;
}

export function compareOptions(a: Row, b: Row): number {
  for (const { compare } of RULES) {
    const c = compare(a, b);
    if (c !== 0) return c;
  }
  return 0;
}

/** First rule that distinguishes a from b (null if identical — impossible
 * for distinct options because sort_order is unique). */
export function separatingRule(a: Row, b: Row): RankingRule | null {
  for (const { rule, compare } of RULES) {
    if (compare(a, b) !== 0) return rule;
  }
  return null;
}

export function rankOptions(
  groups: OptionGroupEvaluation[],
  options: EngineOption[],
): RankedOption[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const rows: Row[] = groups
    .filter((g) => g.feasible)
    .map((g) => {
      const o = byId.get(g.optionId);
      if (!o) throw new Error(`Unknown option ${g.optionId}`);
      return { g, o };
    });
  rows.sort(compareOptions);
  return rows.map((row, i) => ({
    optionId: row.g.optionId,
    rank: i + 1,
    separatedFromPreviousBy: i === 0 ? null : separatingRule(rows[i - 1], row),
  }));
}

export const TOP_N = 3;
