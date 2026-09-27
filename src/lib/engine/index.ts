import { computeCore } from "./core";
import { computeSensitivity } from "./sensitivity";
import type { EngineOption, EngineParticipant, EngineResult } from "./types";
import type { VoteCandidate } from "./vote";

export * from "./types";
export { computeCore } from "./core";
export { allUsefulLevers, computeSensitivity, shouldRunSensitivity } from "./sensitivity";
export { resolveVote, tallyVotes } from "./vote";
export type { VoteCandidate, VoteOutcome, CastVote } from "./vote";

/**
 * Full deterministic pipeline:
 *   hard constraints → soft factors → individual tiers → group feasibility
 *   → lexicographic ranking → compromise sensitivity.
 * Same inputs (in any order) always produce the same output.
 */
export function computeEngine(
  participants: EngineParticipant[],
  options: EngineOption[],
): EngineResult {
  const core = computeCore(participants, options);
  return { ...core, sensitivity: computeSensitivity(participants, options, core) };
}

export type VoteCheck =
  | { ok: true }
  | { ok: false; reason: "voting_unavailable" | "not_a_top_option" | "hard_excluded" };

/**
 * A participant may vote only for one of the current top (≤3) group-feasible
 * options, and never for an option that hard-excludes them (§21). The second
 * check is redundant with group feasibility today, but is kept as defense in
 * depth (the database enforces it again in a trigger).
 */
export function checkVoteChoice(
  result: EngineResult,
  participantId: string,
  optionId: string,
): VoteCheck {
  if (result.feasibleCount === 0) return { ok: false, reason: "voting_unavailable" };
  if (!result.top.some((t) => t.optionId === optionId)) {
    return { ok: false, reason: "not_a_top_option" };
  }
  const g = result.options.find((o) => o.optionId === optionId)!;
  const ev = g.evaluations.find((e) => e.participantId === participantId);
  if (!ev || ev.hardExclusions.length > 0) return { ok: false, reason: "hard_excluded" };
  return { ok: true };
}

export function voteCandidates(result: EngineResult): VoteCandidate[] {
  return result.top.map((t) => {
    const g = result.options.find((o) => o.optionId === t.optionId)!;
    return { optionId: t.optionId, strong: g.counts.strong, conflict: g.counts.conflict };
  });
}
