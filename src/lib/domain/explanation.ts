import type { FactorResult, Tier } from "../engine/types";
import type { CostCategory, SanitizedResult } from "./result-types";

/**
 * AI INPUT CONTRACT (§24) and the deterministic fallback explanation.
 *
 * `buildExplanationInput` derives the ONLY data the explanation model ever
 * sees, from the already-sanitized result: option names, tier distributions
 * and categorical per-person factors. No budgets, no notes, no history.
 *
 * `templateExplanation` produces a plain factual sentence per option from the
 * same data. It is always shown, so the product never depends on the AI.
 */

export interface ExplanationParticipant {
  name: string;
  tier: Tier;
  cost: CostCategory;
  type: FactorResult;
  dates: FactorResult;
  /** Context only: wanted activities this option offers. */
  wanted_activities_available: string[];
  /** Context only: activities they'd rather avoid that this option features. */
  avoided_activities_present: string[];
}

export interface ExplanationOptionInput {
  option_id: string;
  option: string;
  destination_type: string;
  rank: number;
  group_tier_distribution: {
    strong: number;
    compromise: number;
    conflict: number;
    insufficient_input: number;
  };
  participants: ExplanationParticipant[];
}

export interface ExplanationInput {
  options: ExplanationOptionInput[];
}

export function buildExplanationInput(r: SanitizedResult): ExplanationInput {
  return {
    options: r.top.map((t) => {
      const card = r.options[t.optionId];
      return {
        option_id: t.optionId,
        option: card.name,
        destination_type: card.type,
        rank: t.rank,
        group_tier_distribution: {
          strong: t.counts.strong,
          compromise: t.counts.compromise,
          conflict: t.counts.conflict,
          insufficient_input: t.counts.insufficient,
        },
        participants: r.participants.map((p) => {
          const c = r.matrix[t.optionId][p.id];
          return {
            name: p.name,
            tier: c.tier,
            cost: c.cost,
            type: c.type,
            dates: c.dates,
            wanted_activities_available: c.wantedActivitiesHere,
            avoided_activities_present: c.avoidedActivitiesHere,
          };
        }),
      };
    }),
  };
}

function frictionPhrases(p: ExplanationParticipant): string[] {
  const out: string[] = [];
  if (p.cost === "stretch") out.push("is stretching on budget");
  if (p.cost === "over_budget") out.push("is over budget");
  if (p.type === "partial") out.push("is neutral on this kind of destination");
  if (p.type === "unmet") out.push("would rather avoid this kind of destination");
  if (p.dates === "partial") out.push("only partly overlaps on dates");
  if (p.dates === "unmet") out.push("has no date overlap");
  return out;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Deterministic, factual explanation for one option. */
export function templateExplanation(o: ExplanationOptionInput): string {
  const strong = o.participants.filter((p) => p.tier === "strong");
  const insufficient = o.participants.filter((p) => p.tier === "insufficient");
  const others = o.participants.filter((p) => p.tier === "compromise" || p.tier === "conflict");

  const sentences: string[] = [];
  if (strong.length === o.participants.length - insufficient.length && strong.length > 0) {
    sentences.push(`${o.option} is a strong fit for everyone who gave preferences.`);
  } else if (strong.length > 0) {
    sentences.push(`${o.option} works strongly for ${plural(strong.length, "person", "people")}.`);
  } else {
    sentences.push(`${o.option} is not a strong fit for anyone yet.`);
  }
  const parts = others.map((p) => `${p.name} ${joinList(frictionPhrases(p))}`);
  if (parts.length > 0) sentences.push(`${joinList(parts)}.`);
  if (insufficient.length > 0) {
    sentences.push(
      `${joinList(insufficient.map((p) => p.name))} didn't give enough input to evaluate.`,
    );
  }
  return sentences.join(" ");
}

export interface ExplanationPayload {
  status: "ok" | "unavailable";
  /** option_id → AI prose. Empty when unavailable. */
  explanations: Record<string, string>;
}
