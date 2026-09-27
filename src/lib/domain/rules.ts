import { MAX_PARTICIPANTS } from "./taxonomy";

/**
 * Pure mirrors of the state-transition rules enforced atomically in Postgres
 * (supabase/migrations). They exist so the rules are documented and unit
 * tested in one obvious place; the database remains the enforcement point.
 */

/** Reveal fires exactly when submitted participants == participant_limit. */
export function revealEligible(submittedCount: number, participantLimit: number): boolean {
  return submittedCount === participantLimit;
}

/** Joining is capped at participant_limit; the organizer counts (§36A.3). */
export function canJoin(joinedCount: number, participantLimit: number): boolean {
  return joinedCount < participantLimit;
}

export type LimitChange =
  | { ok: true; limit: number }
  | { ok: false; reason: "limit_must_increase" | "limit_out_of_range" };

/**
 * D12: participant_limit may only INCREASE (up to 8) while collecting.
 * Decreases are rejected outright — lowering the limit to the joined count
 * could trigger an instant reveal and let the organizer probe who has
 * submitted. The result deliberately depends only on the two limit values,
 * never on joined/submitted counts, so it leaks nothing.
 *
 * Because new > old ≥ joined ≥ submitted, an increase can never make
 * revealEligible() true on its own.
 */
export function applyLimitIncrease(currentLimit: number, newLimit: number): LimitChange {
  if (!Number.isInteger(newLimit) || newLimit > MAX_PARTICIPANTS) {
    return { ok: false, reason: "limit_out_of_range" };
  }
  if (newLimit <= currentLimit) return { ok: false, reason: "limit_must_increase" };
  return { ok: true, limit: newLimit };
}
