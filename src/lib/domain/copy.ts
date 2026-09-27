import type { FactorResult, RankingRule, Tier } from "../engine/types";
import type {
  CostCategory,
  OptionCard,
  PrivateLever,
  PublicLever,
  VoteOutcomeView,
} from "./result-types";
import { OPTION_TYPE_LABELS, type OptionType } from "./taxonomy";

/**
 * User-facing wording derived from engine output. Pure functions so the
 * privacy properties (no names, no amounts in group-visible lever text) are
 * unit tested.
 */

export const TIER_LABEL: Record<Tier, string> = {
  strong: "Strong fit",
  compromise: "Compromise",
  conflict: "Conflict",
  insufficient: "Insufficient input",
};

export const TIER_SHORT: Record<Tier, string> = {
  strong: "Strong",
  compromise: "Compromise",
  conflict: "Conflict",
  insufficient: "Not enough input",
};

export const COST_LABEL: Record<CostCategory, string> = {
  within_budget: "Within budget",
  stretch: "Stretch",
  over_budget: "Over budget",
  unknown: "Budget not given",
};

export const TYPE_FACTOR_LABEL: Record<FactorResult, string> = {
  met: "Preferred type",
  partial: "Neutral on type",
  unmet: "Would rather avoid type",
  unknown: "Type not given",
};

export const DATE_FACTOR_LABEL: Record<FactorResult, string> = {
  met: "Dates fit",
  partial: "Dates partly fit",
  unmet: "No date overlap",
  unknown: "Dates not given",
};

export const RANKING_RULE_LABEL: Record<RankingRule, string> = {
  fewest_conflict: "Ranked below the option above: more people in Conflict.",
  most_strong: "Tied on Conflict; ranked below because fewer people are a Strong fit.",
  lowest_overshoot: "Tied on tiers; ranked below because it stretches budgets more in total.",
  most_date_overlap: "Tied on tiers and budget stretch; ranked below because it overlaps less with people's dates.",
  curated_order:
    "Tied with the option above on every rule — the order here follows the curated list, not preference.",
};

export function tierDistribution(c: {
  strong: number;
  compromise: number;
  conflict: number;
  insufficient: number;
}): string {
  const parts = [
    `${c.strong} Strong Fit`,
    `${c.compromise} Acceptable Compromise`,
    `${c.conflict} Conflict`,
  ];
  if (c.insufficient > 0) parts.push(`${c.insufficient} Insufficient Input`);
  return parts.join(" · ");
}

function names(ids: string[], options: Record<string, OptionCard>): string {
  const n = ids.map((id) => options[id]?.name ?? "an option");
  if (n.length <= 1) return n.join("");
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

function effectPhrase(l: PublicLever, options: Record<string, OptionCard>, forViewer: boolean): string {
  const whose = forViewer ? "your" : "that person's";
  if (l.newlyFeasibleOptionIds.length > 0) {
    const n = l.newlyFeasibleOptionIds.length;
    return `make ${n === 1 ? "1 more option" : `${n} more options`} work for everyone (${names(l.newlyFeasibleOptionIds, options)})`;
  }
  if (l.newlyAllStrongOptionIds.length > 0) {
    return `make ${names(l.newlyAllStrongOptionIds, options)} a strong fit for everyone`;
  }
  return `improve ${whose} fit on ${names(l.improvedOptionIds, options)}`;
}

/**
 * Group-visible lever text. Never names the participant and never states an
 * amount (§17, §15).
 */
export function publicLeverText(l: PublicLever, options: Record<string, OptionCard>): string {
  const effect = effectPhrase(l, options, false);
  const size = l.large ? "large " : "";
  switch (l.kind) {
    case "remove_dealbreaker":
      return `Relaxing one participant's destination-type dealbreaker would ${effect}.`;
    case "raise_max_budget":
      return `A ${size}budget relaxation for one participant would ${effect}.`;
    case "shift_dates":
      return `A ${size}shift in one participant's travel dates would ${effect}.`;
    case "relax_avoided_type":
      return `If one participant were open to a destination type they'd rather avoid, it would ${effect}.`;
  }
}

function typeName(t: string) {
  return OPTION_TYPE_LABELS[t as OptionType] ?? t;
}

/** D16 — the viewer's own lever with exact values. Shown only to them. */
export function privateLeverText(
  l: PrivateLever,
  options: Record<string, OptionCard>,
  fmt: { inr: (n: number) => string; range: (r: { start: string; end: string }) => string },
): string {
  const effect = effectPhrase(l, options, true);
  switch (l.kind) {
    case "remove_dealbreaker":
      return `If you changed “Never” to “Rather not” for ${typeName(l.type)}, it would ${effect}.`;
    case "relax_avoided_type":
      return `If you were fine with ${typeName(l.type)} instead of “Rather not”, it would ${effect}.`;
    case "raise_max_budget":
      return `Raising your maximum budget from ${fmt.inr(l.fromMax)} to ${fmt.inr(l.toMax)} (+${fmt.inr(l.increase)}) would ${effect}.${l.large ? " That's more than the gap between your own ideal and maximum." : ""}`;
    case "shift_dates": {
      const days = Math.abs(l.shiftDays);
      const dir = l.shiftDays > 0 ? "later" : "earlier";
      return `Moving your dates ${fmt.range(l.original)} to ${fmt.range(l.shifted)} (${days} day${days === 1 ? "" : "s"} ${dir}) would ${effect}.${l.regressedOptionIds.length > 0 ? ` It would make ${names(l.regressedOptionIds, options)} fit you less well.` : ""}`;
    }
  }
}

/** Plain explanation of how the final decision was reached (§21). */
export function outcomeText(o: VoteOutcomeView, options: Record<string, OptionCard>): string[] {
  const lines = outcomeLines(o, options);
  if (!o.closedEarly) return lines;
  const didnt = o.participantCount - o.votesCast;
  return [
    ...lines,
    `The organizer closed voting early: ${o.votesCast} of ${o.participantCount} people voted, and the ${didnt === 1 ? "person" : `${didnt} people`} who didn't vote ${didnt === 1 ? "isn't" : "aren't"} counted.`,
  ];
}

function outcomeLines(o: VoteOutcomeView, options: Record<string, OptionCard>): string[] {
  const name = (id: string | null) => (id ? (options[id]?.name ?? "The option") : "The option");
  const sorted = Object.entries(o.tally).sort((a, b) => b[1] - a[1]);
  const score = sorted.filter(([, v]) => v > 0).map(([, v]) => v).join("–");
  const tied = o.tiedOptionIds.map((id) => name(id));
  const tiedList = tied.length === 2 ? `${tied[0]} and ${tied[1]}` : tied.join(", ");
  const tiedScore = o.tiedOptionIds.map((id) => o.tally[id]).join("–");

  if (o.outcome === "tied_no_decision") {
    return [
      "No decision — final vote remained tied.",
      `${tiedList} tied ${tiedScore}, with the same number of Strong Fit and Conflict participants. Converge does not pick a winner at random.`,
    ];
  }
  switch (o.reason) {
    case "majority":
      return [`${name(o.optionId)} was selected ${score}.`, "No tie-break was required."];
    case "strong_fit":
      return [
        `${tiedList} tied ${tiedScore}.`,
        `${name(o.optionId)} was selected because it had more Strong Fit participants.`,
      ];
    case "fewest_conflict":
      return [
        `${tiedList} tied ${tiedScore} and had the same number of Strong Fit participants.`,
        `${name(o.optionId)} was selected because it had fewer participants in Conflict.`,
      ];
    default:
      return [`${name(o.optionId)} was selected.`];
  }
}
