import { evaluateOptionForGroup } from "./evaluate";
import { rankOptions, TOP_N } from "./ranking";
import type {
  EngineOption,
  EngineParticipant,
  OptionGroupEvaluation,
  RankedOption,
} from "./types";

export interface CoreResult {
  options: OptionGroupEvaluation[];
  ranked: RankedOption[];
  top: RankedOption[];
  feasibleCount: number;
  recommendationOptionId: string | null;
}

/** Canonical ordering so that input order can never change the output. */
export function canonicalise(
  participants: EngineParticipant[],
  options: EngineOption[],
): { participants: EngineParticipant[]; options: EngineOption[] } {
  return {
    participants: [...participants].sort(
      (a, b) => a.joinOrder - b.joinOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    ),
    options: [...options].sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** Hard constraints → factors → tiers → group feasibility → ranking. */
export function computeCore(
  participants: EngineParticipant[],
  options: EngineOption[],
): CoreResult {
  const c = canonicalise(participants, options);
  const groups = c.options.map((o) => evaluateOptionForGroup(c.participants, o));
  const ranked = rankOptions(groups, c.options);
  return {
    options: groups,
    ranked,
    // Never padded: fewer than 3 feasible options → fewer cards (§40.10).
    top: ranked.slice(0, TOP_N),
    feasibleCount: ranked.length,
    recommendationOptionId: ranked[0]?.optionId ?? null,
  };
}
