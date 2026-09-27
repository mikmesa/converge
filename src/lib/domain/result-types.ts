/**
 * The SANITIZED result contract — the only cross-participant data that ever
 * leaves the server (§36A.2, §40.11).
 *
 * Deliberately contains NO participant budget values, NO notes, NO response
 * history and NO pre-reveal timestamps. Numbers present are limited to:
 * tier counts, ranks, option (public) costs/durations, and — in `myLevers`
 * only — the viewer's OWN relaxation amounts (D16).
 */

import type { DateRange, FactorResult, LeverKind, RankingRule, Tier } from "../engine/types";

export type CostCategory = "within_budget" | "stretch" | "over_budget" | "unknown";

export interface OptionCard {
  id: string;
  name: string;
  type: string;
  costPerPerson: number;
  availabilityWindows: DateRange[];
  description: string;
  typicalDurationDays: number | null;
  activities: string[];
  tags: string[];
}

export interface PublicParticipant {
  id: string;
  name: string;
  isOrganizer: boolean;
  isViewer: boolean;
  /** Latest response edit made AFTER reveal (D13), else null. */
  updatedAfterRevealAt: string | null;
}

export interface MatrixCell {
  tier: Tier;
  cost: CostCategory;
  type: FactorResult;
  dates: FactorResult;
  /** Context only — activities never affect ranking (§16). */
  wantedActivitiesHere: string[];
  avoidedActivitiesHere: string[];
}

export interface TopOption {
  optionId: string;
  rank: number;
  separatedFromPreviousBy: RankingRule | null;
  counts: { strong: number; compromise: number; conflict: number; insufficient: number };
  allStrong: boolean;
}

export interface PublicLever {
  kind: LeverKind;
  large: boolean;
  /** True when the viewer is the participant who would relax (own data). */
  isViewers: boolean;
  newlyFeasibleOptionIds: string[];
  newlyAllStrongOptionIds: string[];
  improvedOptionIds: string[];
  regressedOptionIds: string[];
}

/** D16 — the viewer's own exact relaxation. Never shown to anyone else. */
export type PrivateLever = PublicLever &
  (
    | { kind: "remove_dealbreaker"; type: string }
    | { kind: "relax_avoided_type"; type: string }
    | { kind: "raise_max_budget"; fromMax: number; toMax: number; increase: number }
    | {
        kind: "shift_dates";
        original: DateRange;
        shifted: DateRange;
        shiftDays: number;
      }
  );

export interface InfeasibleOption {
  optionId: string;
  /** How many participants each hard constraint excludes — anonymous. */
  maxBudgetExclusions: number;
  dealbreakerExclusions: number;
}

export interface VoteOutcomeView {
  outcome: "selected" | "tied_no_decision";
  optionId: string | null;
  tally: Record<string, number>;
  reason: "majority" | "strong_fit" | "fewest_conflict" | null;
  tiedOptionIds: string[];
  /** True when the organizer closed voting before everyone had voted. */
  closedEarly: boolean;
  votesCast: number;
  participantCount: number;
}

export interface SanitizedResult {
  decision: {
    id: string;
    name: string;
    status: "revealed" | "decided";
    participantLimit: number;
    revealedAt: string;
    decidedAt: string | null;
  };
  viewer: { participantId: string; isOrganizer: boolean };
  participants: PublicParticipant[];
  options: Record<string, OptionCard>;
  feasibleCount: number;
  top: TopOption[];
  /** matrix[optionId][participantId] for every top option. */
  matrix: Record<string, Record<string, MatrixCell>>;
  recommendationOptionId: string | null;
  sensitivity: {
    shown: boolean;
    noUsefulRelaxation: boolean;
    levers: PublicLever[];
    infeasible: InfeasibleOption[];
  };
  myLevers: PrivateLever[];
  voting: {
    open: boolean;
    closedReason: "no_feasible_options" | "decided" | null;
    myVoteOptionId: string | null;
  };
  outcome: VoteOutcomeView | null;
}
