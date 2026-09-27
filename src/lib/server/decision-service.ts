import "server-only";
import type postgres from "postgres";
import type { OptionCard, SanitizedResult, VoteOutcomeView } from "../domain/result-types";
import {
  checkVoteChoice,
  computeEngine,
  resolveVote,
  voteCandidates,
  type EngineOption,
  type EngineParticipant,
  type EngineResponse,
  type EngineResult,
} from "../engine";
import { sanitizeResult } from "../engine/sanitize";
import { getSql } from "./db";
import { closeQuorumMet } from "../domain/rules";
import { ApiError } from "./errors";

/**
 * Server-side orchestration of the deterministic engine.
 *
 * Every function here runs inside ONE database transaction. Reads use a
 * consistent snapshot; votes take `SELECT … FOR UPDATE` on the decision row,
 * which serialises them against submissions (submit_response takes the same
 * lock), joins and limit changes. This is what makes "last vote" and
 * "post-reveal edit racing a vote" safe (§40.14).
 *
 * Raw response rows are loaded here and never returned: callers only ever get
 * the output of sanitizeResult().
 */

type Tx = postgres.TransactionSql;

interface DecisionRow {
  id: string;
  name: string;
  status: "collecting" | "revealed" | "decided";
  participant_limit: number;
  revealed_at: Date | null;
  decided_at: Date | null;
  outcome: "selected" | "tied_no_decision" | null;
  final_choice_option_id: string | null;
  vote_tally: { tally: Record<string, number>; tiedOptionIds: string[] } | null;
  tiebreak_reason: "majority" | "strong_fit" | "fewest_conflict" | null;
  closed_early: boolean;
  votes_cast: number | null;
}

interface ParticipantRow {
  id: string;
  auth_user_id: string;
  name: string;
  is_organizer: boolean;
  join_seq: number;
}

interface ResponseRow {
  participant_id: string;
  preferred_date_ranges: { start: string; end: string }[] | null;
  ideal_budget: number | null;
  max_budget: number | null;
  preferred_types: string[];
  avoided_types: string[];
  dealbreaker_types: string[];
  wanted_activities: string[];
  avoided_activities: string[];
}

interface OptionRow {
  id: string;
  name: string;
  type: string;
  cost_per_person: number;
  availability_windows: { start: string; end: string }[];
  description: string;
  typical_duration_days: number | null;
  activities: string[];
  tags: string[];
  sort_order: number;
}

interface LoadedState {
  decision: DecisionRow;
  participants: ParticipantRow[];
  responses: Map<string, ResponseRow>;
  updatedAfterReveal: Map<string, string>;
  options: OptionRow[];
  votes: { participant_id: string; option_id: string }[];
}

async function loadState(tx: Tx, decisionId: string, lock: boolean): Promise<LoadedState | null> {
  const decisions = lock
    ? await tx<DecisionRow[]>`select * from public.decisions where id = ${decisionId} for update`
    : await tx<DecisionRow[]>`select * from public.decisions where id = ${decisionId}`;
  const decision = decisions[0];
  if (!decision) return null;

  const participants = await tx<ParticipantRow[]>`
    select id, auth_user_id, name, is_organizer, join_seq::int as join_seq
    from public.participants where decision_id = ${decisionId}
    order by join_seq`;

  // "Current response" = latest row per participant (§6).
  const latest = await tx<ResponseRow[]>`
    select distinct on (r.participant_id)
      r.participant_id, r.preferred_date_ranges, r.ideal_budget, r.max_budget,
      r.preferred_types, r.avoided_types, r.dealbreaker_types,
      r.wanted_activities, r.avoided_activities
    from public.responses r
    join public.participants p on p.id = r.participant_id
    where p.decision_id = ${decisionId}
    order by r.participant_id, r.seq desc`;

  // D13: only edits made AFTER reveal are surfaced as activity.
  const updated = decision.revealed_at
    ? await tx<{ participant_id: string; at: Date }[]>`
        select r.participant_id, max(r.submitted_at) as at
        from public.responses r
        join public.participants p on p.id = r.participant_id
        join public.decisions d on d.id = p.decision_id
        -- Compared in SQL: JS Dates would truncate microseconds.
        where p.decision_id = ${decisionId} and r.submitted_at > d.revealed_at
        group by r.participant_id`
    : [];

  const options = await tx<OptionRow[]>`
    select id, name, type, cost_per_person, availability_windows, description,
           typical_duration_days, activities, tags, sort_order
    from public.options order by sort_order`;

  const votes = await tx<{ participant_id: string; option_id: string }[]>`
    select participant_id, option_id from public.votes where decision_id = ${decisionId}`;

  return {
    decision,
    participants,
    responses: new Map(latest.map((r) => [r.participant_id, r])),
    updatedAfterReveal: new Map(updated.map((u) => [u.participant_id, u.at.toISOString()])),
    options,
    votes,
  };
}

const EMPTY_RESPONSE: EngineResponse = {
  preferredDateRanges: null,
  idealBudget: null,
  maxBudget: null,
  preferredTypes: [],
  avoidedTypes: [],
  dealbreakerTypes: [],
  wantedActivities: [],
  avoidedActivities: [],
};

function toEngineParticipants(s: LoadedState): EngineParticipant[] {
  return s.participants.map((p) => {
    const r = s.responses.get(p.id);
    const response: EngineResponse = r
      ? {
          preferredDateRanges: r.preferred_date_ranges,
          idealBudget: r.ideal_budget,
          maxBudget: r.max_budget,
          preferredTypes: r.preferred_types,
          avoidedTypes: r.avoided_types,
          dealbreakerTypes: r.dealbreaker_types,
          wantedActivities: r.wanted_activities,
          avoidedActivities: r.avoided_activities,
        }
      : EMPTY_RESPONSE;
    return { id: p.id, name: p.name, joinOrder: p.join_seq, response };
  });
}

function toEngineOptions(s: LoadedState): EngineOption[] {
  return s.options.map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    costPerPerson: o.cost_per_person,
    availabilityWindows: o.availability_windows,
    sortOrder: o.sort_order,
    activities: o.activities,
  }));
}

function toCards(s: LoadedState): OptionCard[] {
  return s.options.map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    costPerPerson: o.cost_per_person,
    availabilityWindows: o.availability_windows,
    description: o.description,
    typicalDurationDays: o.typical_duration_days,
    activities: o.activities,
    tags: o.tags,
  }));
}

function outcomeView(d: DecisionRow, participantCount: number): VoteOutcomeView | null {
  if (d.status !== "decided" || !d.outcome) return null;
  return {
    outcome: d.outcome,
    optionId: d.final_choice_option_id,
    tally: d.vote_tally?.tally ?? {},
    reason: d.tiebreak_reason,
    tiedOptionIds: d.vote_tally?.tiedOptionIds ?? [],
    closedEarly: d.closed_early,
    votesCast: d.votes_cast ?? participantCount,
    participantCount,
  };
}

function viewerOf(s: LoadedState, userId: string): ParticipantRow {
  const p = s.participants.find((x) => x.auth_user_id === userId);
  if (!p) throw new ApiError("not_a_participant");
  return p;
}

function buildSanitized(s: LoadedState, viewer: ParticipantRow, engine: EngineResult): SanitizedResult {
  const engineParticipants = toEngineParticipants(s);
  const byId = new Map(s.participants.map((p) => [p.id, p]));
  const myVote = s.votes.find((v) => v.participant_id === viewer.id)?.option_id ?? null;
  return sanitizeResult({
    decision: {
      id: s.decision.id,
      name: s.decision.name,
      status: s.decision.status as "revealed" | "decided",
      participantLimit: s.decision.participant_limit,
      revealedAt: s.decision.revealed_at!.toISOString(),
      decidedAt: s.decision.decided_at?.toISOString() ?? null,
    },
    viewerParticipantId: viewer.id,
    participants: engineParticipants.map((p) => ({
      ...p,
      isOrganizer: byId.get(p.id)!.is_organizer,
      updatedAfterRevealAt: s.updatedAfterReveal.get(p.id) ?? null,
    })),
    engineOptions: toEngineOptions(s),
    cards: toCards(s),
    result: engine,
    myVoteOptionId: myVote,
    outcome: outcomeView(s.decision, s.participants.length),
  });
}

export interface ResultsBundle {
  result: SanitizedResult;
}

/** Sanitized results for one viewer. 403 before reveal — no partial results. */
export async function getResults(decisionId: string, userId: string): Promise<SanitizedResult> {
  const sql = getSql();
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const s = await loadState(tx, decisionId, false);
    if (!s) throw new ApiError("not_found");
    const viewer = viewerOf(s, userId);
    if (s.decision.status === "collecting") throw new ApiError("not_revealed");
    const engine = computeEngine(toEngineParticipants(s), toEngineOptions(s));
    return buildSanitized(s, viewer, engine);
  });
}

/**
 * Cast or change the caller's own vote. Blind (§36A.4, §40.8): the response
 * says only whether the vote was recorded and whether the decision is now
 * decided — never counts, never other votes.
 *
 * When the last participant votes, the outcome is resolved with the pure
 * resolveVote() and the decision transitions to "decided" in the SAME locked
 * transaction.
 */
export async function castVote(
  decisionId: string,
  userId: string,
  optionId: string,
): Promise<{ recorded: true; decided: boolean }> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const s = await loadState(tx, decisionId, true);
    if (!s) throw new ApiError("not_found");
    const viewer = viewerOf(s, userId);
    if (s.decision.status !== "revealed") throw new ApiError("voting_closed");

    const engine = computeEngine(toEngineParticipants(s), toEngineOptions(s));
    const check = checkVoteChoice(engine, viewer.id, optionId);
    if (!check.ok) throw new ApiError(check.reason);

    await tx`
      insert into public.votes (decision_id, participant_id, option_id)
      values (${decisionId}, ${viewer.id}, ${optionId})
      on conflict (decision_id, participant_id)
      do update set option_id = excluded.option_id`;

    const votes = await tx<{ participant_id: string; option_id: string }[]>`
      select participant_id, option_id from public.votes where decision_id = ${decisionId}`;

    if (votes.length < s.participants.length) return { recorded: true, decided: false };

    await finalize(tx, decisionId, votes, engine, { closedEarly: false });
    return { recorded: true, decided: true };
  });
}

/**
 * Resolve the vote with the pure resolveVote() and move the decision to
 * "decided" — inside the caller's locked transaction. Used both when the last
 * participant votes and when the organizer closes voting early.
 */
async function finalize(
  tx: Tx,
  decisionId: string,
  votes: { participant_id: string; option_id: string }[],
  engine: EngineResult,
  opts: { closedEarly: boolean },
) {
  const outcome = resolveVote(
    votes.map((v) => ({ participantId: v.participant_id, optionId: v.option_id })),
    voteCandidates(engine),
  );
  const tally = { tally: outcome.tally, tiedOptionIds: outcome.tiedOptionIds };
  await tx`
    update public.decisions set
      status = 'decided',
      decided_at = clock_timestamp(),
      outcome = ${outcome.outcome},
      final_choice_option_id = ${outcome.outcome === "selected" ? outcome.optionId : null},
      tiebreak_reason = ${outcome.outcome === "selected" ? outcome.reason : null},
      vote_tally = ${tx.json(tally)},
      closed_early = ${opts.closedEarly},
      votes_cast = ${votes.length}
    where id = ${decisionId} and status = 'revealed'`;
}

/**
 * Organizer closes voting early (product decision: rescues a group stuck on a
 * lost-session seat). Organizer only; voting must be open; more than half of
 * the participants must have voted. Irreversible. The only signal a refused
 * attempt gives is "fewer than half have voted" — never counts or names.
 */
export async function closeVoting(decisionId: string, userId: string): Promise<{ decided: true }> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const s = await loadState(tx, decisionId, true);
    if (!s) throw new ApiError("not_found");
    const viewer = viewerOf(s, userId);
    if (!viewer.is_organizer) throw new ApiError("not_organizer");
    if (s.decision.status !== "revealed") throw new ApiError("voting_closed");
    const engine = computeEngine(toEngineParticipants(s), toEngineOptions(s));
    if (engine.feasibleCount === 0) throw new ApiError("voting_unavailable");
    if (!closeQuorumMet(s.votes.length, s.participants.length)) throw new ApiError("quorum_not_met");
    await finalize(tx, decisionId, s.votes, engine, { closedEarly: true });
    return { decided: true };
  });
}
