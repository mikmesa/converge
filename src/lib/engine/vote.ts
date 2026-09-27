/**
 * FINAL VOTE RESOLUTION (§21) — deterministic, no randomness, no organizer
 * override, never array order.
 *
 *   1. Most votes wins.
 *   2. Tied → most Strong Fit participants wins.
 *   3. Still tied → fewest Conflict-tier participants wins.
 *   4. Still tied → NO DECISION ("final vote remained tied").
 */

export interface VoteCandidate {
  optionId: string;
  strong: number;
  conflict: number;
}

export interface CastVote {
  participantId: string;
  optionId: string;
}

export type VoteResolutionReason = "majority" | "strong_fit" | "fewest_conflict";

export type VoteOutcome =
  | {
      outcome: "selected";
      optionId: string;
      tally: Record<string, number>;
      reason: VoteResolutionReason;
      /** Options that shared the top vote count (length 1 for "majority"). */
      tiedOptionIds: string[];
    }
  | {
      outcome: "tied_no_decision";
      tally: Record<string, number>;
      tiedOptionIds: string[];
    };

export function tallyVotes(
  votes: CastVote[],
  candidates: VoteCandidate[],
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const c of candidates) tally[c.optionId] = 0;
  for (const v of votes) {
    if (!(v.optionId in tally)) {
      throw new Error(`Vote for non-candidate option ${v.optionId}`);
    }
    tally[v.optionId] += 1;
  }
  return tally;
}

export function resolveVote(votes: CastVote[], candidates: VoteCandidate[]): VoteOutcome {
  if (candidates.length === 0) throw new Error("No candidates to vote on");
  const tally = tallyVotes(votes, candidates);

  const maxVotes = Math.max(...candidates.map((c) => tally[c.optionId]));
  const topByVotes = candidates.filter((c) => tally[c.optionId] === maxVotes);
  const tiedOptionIds = topByVotes.map((c) => c.optionId);
  if (topByVotes.length === 1) {
    return {
      outcome: "selected",
      optionId: topByVotes[0].optionId,
      tally,
      reason: "majority",
      tiedOptionIds,
    };
  }

  const maxStrong = Math.max(...topByVotes.map((c) => c.strong));
  const byStrong = topByVotes.filter((c) => c.strong === maxStrong);
  if (byStrong.length === 1) {
    return {
      outcome: "selected",
      optionId: byStrong[0].optionId,
      tally,
      reason: "strong_fit",
      tiedOptionIds,
    };
  }

  const minConflict = Math.min(...byStrong.map((c) => c.conflict));
  const byConflict = byStrong.filter((c) => c.conflict === minConflict);
  if (byConflict.length === 1) {
    return {
      outcome: "selected",
      optionId: byConflict[0].optionId,
      tally,
      reason: "fewest_conflict",
      tiedOptionIds,
    };
  }

  return { outcome: "tied_no_decision", tally, tiedOptionIds };
}
