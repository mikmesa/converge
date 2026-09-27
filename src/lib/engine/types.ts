/**
 * Plain-data types for the deterministic decision engine.
 *
 * The engine is domain-neutral: it knows about "options", "participants" and
 * "responses". Nothing here reads React state, the network, Supabase or
 * browser APIs.
 */

/** Calendar date as YYYY-MM-DD. */
export type ISODate = string;

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

export interface EngineOption {
  id: string;
  name: string;
  type: string;
  costPerPerson: number;
  availabilityWindows: DateRange[];
  /** Curated deterministic order — ranking tie-break step 5. */
  sortOrder: number;
  activities: string[];
}

/**
 * A participant's current (latest) structured response.
 * `null` / empty means "not submitted" — it is never replaced by a number.
 */
export interface EngineResponse {
  preferredDateRanges: DateRange[] | null;
  idealBudget: number | null;
  maxBudget: number | null;
  preferredTypes: string[];
  avoidedTypes: string[];
  dealbreakerTypes: string[];
  wantedActivities: string[];
  avoidedActivities: string[];
}

export interface EngineParticipant {
  id: string;
  name: string;
  /** Deterministic participant order (join order). */
  joinOrder: number;
  response: EngineResponse;
}

export type FactorResult = "met" | "partial" | "unmet" | "unknown";

export type Tier = "strong" | "compromise" | "conflict" | "insufficient";

export type HardExclusionReason = "max_budget" | "dealbreaker";

export interface FactorSet {
  cost: FactorResult;
  type: FactorResult;
  dates: FactorResult;
}

export interface ParticipantOptionEvaluation {
  participantId: string;
  optionId: string;
  hardExclusions: HardExclusionReason[];
  factors: FactorSet;
  tier: Tier;
  /** max(0, cost - ideal) — null when no ideal budget was submitted. */
  budgetOvershoot: number | null;
  /** Max inclusive overlap days — null when no dates were submitted. */
  dateOverlapDays: number | null;
}

export interface TierCounts {
  strong: number;
  compromise: number;
  conflict: number;
  insufficient: number;
}

export interface OptionGroupEvaluation {
  optionId: string;
  feasible: boolean;
  /** Per-participant hard exclusions (empty when feasible). */
  exclusions: { participantId: string; reasons: HardExclusionReason[] }[];
  counts: TierCounts;
  /** Σ overshoot over non-insufficient participants with an ideal budget. */
  totalBudgetOvershoot: number;
  /** Σ per-participant max overlap days over non-insufficient participants. */
  totalDateOverlapDays: number;
  /** D10: ≥1 Strong and every non-insufficient participant is Strong. */
  allStrong: boolean;
  evaluations: ParticipantOptionEvaluation[];
}

/** Which ranking rule separated an option from the one ranked above it. */
export type RankingRule =
  | "fewest_conflict"
  | "most_strong"
  | "lowest_overshoot"
  | "most_date_overlap"
  | "curated_order";

export interface RankedOption {
  optionId: string;
  rank: number;
  /** null for rank 1. */
  separatedFromPreviousBy: RankingRule | null;
}

export type LeverKind =
  | "remove_dealbreaker"
  | "raise_max_budget"
  | "shift_dates"
  | "relax_avoided_type";

export interface LeverEffects {
  newlyFeasibleOptionIds: string[];
  newlyAllStrongOptionIds: string[];
  /** Feasible before & after, and the relaxing participant's tier improved. */
  improvedOptionIds: string[];
  /** Feasible before & after, and the relaxing participant's tier got worse. */
  regressedOptionIds: string[];
}

/** Full lever — contains private data; never sent to other participants. */
export interface Lever {
  kind: LeverKind;
  participantId: string;
  large: boolean;
  effects: LeverEffects;
  detail:
    | { kind: "remove_dealbreaker"; type: string }
    | { kind: "relax_avoided_type"; type: string }
    | {
        kind: "raise_max_budget";
        fromMax: number;
        toMax: number;
        increase: number;
        targetOptionId: string;
      }
    | {
        kind: "shift_dates";
        original: DateRange;
        shifted: DateRange;
        /** Positive = later, negative = earlier. */
        shiftDays: number;
        targetOptionId: string;
      };
}

export interface SensitivityResult {
  /** Whether the section should be shown (§17 + D10). */
  shown: boolean;
  /** Top ≤3 levers, deterministically ordered. */
  levers: Lever[];
  /** True when the analysis ran but found no useful single relaxation. */
  noUsefulRelaxation: boolean;
}

export interface EngineResult {
  options: OptionGroupEvaluation[];
  ranked: RankedOption[];
  /** First ≤3 of `ranked` — never padded. */
  top: RankedOption[];
  feasibleCount: number;
  /** Highest-ranked feasible option (engine recommendation, §40.7). */
  recommendationOptionId: string | null;
  sensitivity: SensitivityResult;
}
