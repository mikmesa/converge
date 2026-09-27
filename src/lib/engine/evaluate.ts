import { evaluateDates, maxOverlapDays } from "./dates";
import type {
  EngineOption,
  EngineParticipant,
  EngineResponse,
  FactorResult,
  FactorSet,
  HardExclusionReason,
  OptionGroupEvaluation,
  ParticipantOptionEvaluation,
  Tier,
  TierCounts,
} from "./types";

/**
 * HARD CONSTRAINTS (§8). Either one makes the option infeasible for this
 * participant — and therefore not group-feasible (§12).
 *  1. option.cost_per_person > participant.max_budget  (equal is allowed)
 *  2. option.type ∈ participant.dealbreaker_types
 * A missing max budget imposes no budget constraint (unknown ≠ no).
 */
export function evaluateHardConstraints(
  response: EngineResponse,
  option: EngineOption,
): HardExclusionReason[] {
  const reasons: HardExclusionReason[] = [];
  if (response.maxBudget !== null && option.costPerPerson > response.maxBudget) {
    reasons.push("max_budget");
  }
  if (response.dealbreakerTypes.includes(option.type)) {
    reasons.push("dealbreaker");
  }
  return reasons;
}

/**
 * COST factor (§10):
 *  unknown  ideal OR max missing (the form requires both-or-neither, D6)
 *  met      cost ≤ ideal
 *  partial  ideal < cost ≤ max   ("stretch")
 *  unmet    cost > max           (only reachable for hard-excluded options)
 */
export function evaluateCost(
  response: EngineResponse,
  option: EngineOption,
): FactorResult {
  const { idealBudget, maxBudget } = response;
  if (idealBudget === null || maxBudget === null) return "unknown";
  if (option.costPerPerson <= idealBudget) return "met";
  if (option.costPerPerson <= maxBudget) return "partial";
  return "unmet";
}

/**
 * TYPE factor (§10). Dealbreakers are NOT part of this — they are hard.
 *  unknown  no preferred and no avoided types submitted
 *  met      type ∈ preferred
 *  unmet    type ∈ avoided
 *  partial  neither preferred nor avoided (D7: kept as specified — silence
 *           about a type never implies a preference for it)
 */
export function evaluateType(
  response: EngineResponse,
  option: EngineOption,
): FactorResult {
  const { preferredTypes, avoidedTypes } = response;
  if (preferredTypes.length === 0 && avoidedTypes.length === 0) return "unknown";
  if (preferredTypes.includes(option.type)) return "met";
  if (avoidedTypes.includes(option.type)) return "unmet";
  return "partial";
}

export function evaluateFactors(
  response: EngineResponse,
  option: EngineOption,
): FactorSet {
  return {
    cost: evaluateCost(response, option),
    type: evaluateType(response, option),
    dates: evaluateDates(response.preferredDateRanges, option.availabilityWindows),
  };
}

/**
 * INDIVIDUAL TIER (§11). Unknown factors are skipped entirely — they never
 * count as met, partial, unmet or neutral.
 *  insufficient  zero scorable (non-unknown) factors
 *  strong        ≥1 scorable factor and all scorable factors met
 *  compromise    exactly one scorable factor is partial or unmet
 *  conflict      two or more scorable factors are partial or unmet
 * No numeric score and no weights exist anywhere.
 */
export function tierFor(factors: FactorSet): Tier {
  const scorable = [factors.cost, factors.type, factors.dates].filter(
    (f) => f !== "unknown",
  );
  if (scorable.length === 0) return "insufficient";
  const nonMet = scorable.filter((f) => f !== "met").length;
  if (nonMet === 0) return "strong";
  if (nonMet === 1) return "compromise";
  return "conflict";
}

export function evaluateParticipantOption(
  participant: EngineParticipant,
  option: EngineOption,
): ParticipantOptionEvaluation {
  const r = participant.response;
  const factors = evaluateFactors(r, option);
  return {
    participantId: participant.id,
    optionId: option.id,
    hardExclusions: evaluateHardConstraints(r, option),
    factors,
    tier: tierFor(factors),
    budgetOvershoot:
      r.idealBudget === null ? null : Math.max(0, option.costPerPerson - r.idealBudget),
    dateOverlapDays: maxOverlapDays(r.preferredDateRanges, option.availabilityWindows),
  };
}

/**
 * GROUP evaluation for one option.
 *
 * Group-feasible (§12): NO participant is hard-excluded.
 *
 * Counts (§36A.5 / §40.9): an "insufficient" participant is excluded from the
 * strong/compromise/conflict counts, the overshoot sum AND the overlap sum,
 * and is only counted in the separate `insufficient` bucket.
 */
export function evaluateOptionForGroup(
  participants: EngineParticipant[],
  option: EngineOption,
): OptionGroupEvaluation {
  const evaluations = participants.map((p) => evaluateParticipantOption(p, option));
  const exclusions = evaluations
    .filter((e) => e.hardExclusions.length > 0)
    .map((e) => ({ participantId: e.participantId, reasons: e.hardExclusions }));

  const counts: TierCounts = { strong: 0, compromise: 0, conflict: 0, insufficient: 0 };
  let totalBudgetOvershoot = 0;
  let totalDateOverlapDays = 0;
  for (const e of evaluations) {
    counts[e.tier] += 1;
    if (e.tier === "insufficient") continue;
    totalBudgetOvershoot += e.budgetOvershoot ?? 0;
    // Participants with UNKNOWN dates contribute zero (§40.3 step 6).
    totalDateOverlapDays += e.dateOverlapDays ?? 0;
  }

  const feasible = exclusions.length === 0;
  const sufficient = counts.strong + counts.compromise + counts.conflict;
  return {
    optionId: option.id,
    feasible,
    exclusions,
    counts,
    totalBudgetOvershoot,
    totalDateOverlapDays,
    allStrong: feasible && counts.strong >= 1 && counts.strong === sufficient,
    evaluations,
  };
}
