import type {
  CostCategory,
  InfeasibleOption,
  MatrixCell,
  OptionCard,
  PrivateLever,
  PublicLever,
  PublicParticipant,
  SanitizedResult,
  VoteOutcomeView,
} from "../domain/result-types";
import { allUsefulLevers } from "./sensitivity";
import type {
  EngineOption,
  EngineParticipant,
  EngineResult,
  FactorResult,
  Lever,
} from "./types";

/**
 * THE PRIVACY BOUNDARY for cross-participant data (§36A.2).
 *
 * Turns the full engine result (which was computed from raw private
 * responses) into the viewer-specific, categorical object in
 * `SanitizedResult`. Raw budgets, notes and response history never pass
 * through here. The only exact amounts in the output are the VIEWER'S OWN
 * relaxations in `myLevers` (D16).
 */

export const MAX_PRIVATE_LEVERS = 2;

export function costCategory(f: FactorResult): CostCategory {
  switch (f) {
    case "met":
      return "within_budget";
    case "partial":
      return "stretch";
    case "unmet":
      return "over_budget";
    default:
      return "unknown";
  }
}

function publicLever(l: Lever, viewerId: string): PublicLever {
  return {
    kind: l.kind,
    large: l.large,
    isViewers: l.participantId === viewerId,
    newlyFeasibleOptionIds: [...l.effects.newlyFeasibleOptionIds],
    newlyAllStrongOptionIds: [...l.effects.newlyAllStrongOptionIds],
    improvedOptionIds: [...l.effects.improvedOptionIds],
    regressedOptionIds: [...l.effects.regressedOptionIds],
  };
}

function privateLever(l: Lever, viewerId: string): PrivateLever {
  const base = publicLever(l, viewerId);
  const d = l.detail;
  switch (d.kind) {
    case "remove_dealbreaker":
      return { ...base, kind: d.kind, type: d.type };
    case "relax_avoided_type":
      return { ...base, kind: d.kind, type: d.type };
    case "raise_max_budget":
      return { ...base, kind: d.kind, fromMax: d.fromMax, toMax: d.toMax, increase: d.increase };
    case "shift_dates":
      return {
        ...base,
        kind: d.kind,
        original: d.original,
        shifted: d.shifted,
        shiftDays: d.shiftDays,
      };
  }
}

export interface SanitizeInput {
  decision: SanitizedResult["decision"];
  viewerParticipantId: string;
  participants: (EngineParticipant & {
    isOrganizer: boolean;
    updatedAfterRevealAt: string | null;
  })[];
  engineOptions: EngineOption[];
  cards: OptionCard[];
  result: EngineResult;
  myVoteOptionId: string | null;
  outcome: VoteOutcomeView | null;
}

export function sanitizeResult(input: SanitizeInput): SanitizedResult {
  const { result, viewerParticipantId: viewerId } = input;
  const viewer = input.participants.find((p) => p.id === viewerId);
  if (!viewer) throw new Error("Viewer is not a participant");

  const participants: PublicParticipant[] = [...input.participants]
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .map((p) => ({
      id: p.id,
      name: p.name,
      isOrganizer: p.isOrganizer,
      isViewer: p.id === viewerId,
      updatedAfterRevealAt: p.updatedAfterRevealAt,
    }));

  const cardById = new Map(input.cards.map((c) => [c.id, c]));
  const groupById = new Map(result.options.map((g) => [g.optionId, g]));
  const referenced = new Set<string>();

  const top = result.top.map((t) => {
    referenced.add(t.optionId);
    const g = groupById.get(t.optionId)!;
    return {
      optionId: t.optionId,
      rank: t.rank,
      separatedFromPreviousBy: t.separatedFromPreviousBy,
      counts: { ...g.counts },
      allStrong: g.allStrong,
    };
  });

  const matrix: SanitizedResult["matrix"] = {};
  const optionActivities = new Map(input.engineOptions.map((o) => [o.id, o.activities]));
  const byParticipant = new Map(input.participants.map((p) => [p.id, p]));
  for (const t of result.top) {
    const g = groupById.get(t.optionId)!;
    const acts = optionActivities.get(t.optionId) ?? [];
    const row: Record<string, MatrixCell> = {};
    for (const e of g.evaluations) {
      const r = byParticipant.get(e.participantId)!.response;
      row[e.participantId] = {
        tier: e.tier,
        cost: costCategory(e.factors.cost),
        type: e.factors.type,
        dates: e.factors.dates,
        wantedActivitiesHere: r.wantedActivities.filter((a) => acts.includes(a)),
        avoidedActivitiesHere: r.avoidedActivities.filter((a) => acts.includes(a)),
      };
    }
    matrix[t.optionId] = row;
  }

  const levers = result.sensitivity.levers.map((l) => publicLever(l, viewerId));
  const infeasibleIds = new Set<string>();
  for (const l of result.sensitivity.levers) {
    for (const id of l.effects.newlyFeasibleOptionIds) infeasibleIds.add(id);
    for (const id of [
      ...l.effects.newlyAllStrongOptionIds,
      ...l.effects.improvedOptionIds,
      ...l.effects.regressedOptionIds,
    ]) {
      referenced.add(id);
    }
  }
  const infeasible: InfeasibleOption[] = result.options
    .filter((g) => infeasibleIds.has(g.optionId))
    .map((g) => {
      referenced.add(g.optionId);
      return {
        optionId: g.optionId,
        maxBudgetExclusions: g.exclusions.filter((x) => x.reasons.includes("max_budget"))
          .length,
        dealbreakerExclusions: g.exclusions.filter((x) => x.reasons.includes("dealbreaker"))
          .length,
      };
    });

  let myLevers: PrivateLever[] = [];
  if (result.sensitivity.shown) {
    myLevers = allUsefulLevers(input.participants, input.engineOptions)
      .filter((l) => l.participantId === viewerId)
      .slice(0, MAX_PRIVATE_LEVERS)
      .map((l) => privateLever(l, viewerId));
    for (const l of myLevers) {
      for (const id of [
        ...l.newlyFeasibleOptionIds,
        ...l.newlyAllStrongOptionIds,
        ...l.improvedOptionIds,
        ...l.regressedOptionIds,
      ]) {
        referenced.add(id);
      }
    }
  }

  // Only options that appear in the result are sent — the full curated list
  // is never needed by the client.
  const options: Record<string, OptionCard> = {};
  for (const id of referenced) {
    const c = cardById.get(id);
    if (c) options[id] = c;
  }

  const decided = input.decision.status === "decided";
  return {
    decision: input.decision,
    viewer: { participantId: viewerId, isOrganizer: viewer.isOrganizer },
    participants,
    options,
    feasibleCount: result.feasibleCount,
    top,
    matrix,
    recommendationOptionId: result.recommendationOptionId,
    sensitivity: {
      shown: result.sensitivity.shown,
      noUsefulRelaxation: result.sensitivity.noUsefulRelaxation,
      levers,
      infeasible,
    },
    myLevers,
    voting: {
      open: !decided && result.feasibleCount > 0,
      closedReason: decided
        ? "decided"
        : result.feasibleCount === 0
          ? "no_feasible_options"
          : null,
      myVoteOptionId: input.myVoteOptionId,
    },
    outcome: input.outcome,
  };
}
