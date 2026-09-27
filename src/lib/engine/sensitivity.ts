import { canonicalise, computeCore, type CoreResult } from "./core";
import { minimalShiftIntoWindow, rangeLengthDays, shiftRange } from "./dates";
import type {
  EngineOption,
  EngineParticipant,
  EngineResponse,
  Lever,
  LeverEffects,
  LeverKind,
  SensitivityResult,
  Tier,
} from "./types";

/**
 * COMPROMISE-SENSITIVITY ENGINE (§17, §36A.8, §40.2, D8, D9, D10)
 *
 * When it runs
 *   - zero group-feasible options, OR
 *   - no feasible option is All-Strong (D10: ≥1 Strong and every participant
 *     with sufficient input is Strong).
 *
 * What it tries — exactly ONE relaxation for ONE participant at a time,
 * never several at once:
 *   A remove_dealbreaker   drop one of the participant's dealbreaker types
 *   B raise_max_budget     raise max budget by exactly (cost − max) for an
 *                          option where that participant's budget is the ONLY
 *                          hard exclusion in the whole group (§36A.8). No
 *                          arbitrary "+10%" steps.
 *   C shift_dates          move ONE submitted range, keeping its length, by the
 *                          minimum number of days that makes it fully contained
 *                          in an availability window of a feasible option
 *                          (D8: widening can never create containment, so the
 *                          spec's "expand" is implemented as a same-length
 *                          shift — the only form that can change a tier).
 *   D relax_avoided_type   drop one avoided type (implemented literally). This
 *                          moves the type factor unmet→partial, which never
 *                          changes a tier — UNLESS it was the participant's
 *                          only type input, in which case the factor becomes
 *                          unknown and is skipped. Only then can D surface.
 *
 * A relaxation is surfaced only if it is useful (§40.2): it makes ≥1 option
 * newly group-feasible, makes ≥1 feasible option newly All-Strong, or
 * improves the relaxing participant's tier on a feasible option.
 *
 * "Large" (D9) is measured against the participant's OWN input, never an
 * arbitrary constant:
 *   B is large when the increase exceeds their own (max − ideal) spread
 *   C is large when the shift exceeds the length of the range being shifted
 *   A and D have no size and are never large.
 *
 * Deterministic lever order (top 3 surfaced):
 *   1. not large before large
 *   2. more newly group-feasible options
 *   3. more newly All-Strong options
 *   4. more tier improvements
 *   5. fewer tier regressions
 *   6. kind: A, B, C, D
 *   7. smaller size (B: ₹ increase, C: |days|)
 *   8. participant join order
 *   9. target (option sort_order for B/C, type name for A/D)
 */

export const MAX_LEVERS = 3;

const KIND_ORDER: Record<LeverKind, number> = {
  remove_dealbreaker: 0,
  raise_max_budget: 1,
  shift_dates: 2,
  relax_avoided_type: 3,
};

const TIER_RANK: Record<Exclude<Tier, "insufficient">, number> = {
  conflict: 0,
  compromise: 1,
  strong: 2,
};

export function shouldRunSensitivity(core: CoreResult): boolean {
  if (core.feasibleCount === 0) return true;
  return !core.options.some((g) => g.allStrong);
}

interface Candidate {
  participant: EngineParticipant;
  modified: EngineResponse;
  detail: Lever["detail"];
  size: number;
  large: boolean;
  targetKey: string | number;
}

function withResponse(
  participants: EngineParticipant[],
  id: string,
  response: EngineResponse,
): EngineParticipant[] {
  return participants.map((p) => (p.id === id ? { ...p, response } : p));
}

function generateCandidates(
  participants: EngineParticipant[],
  options: EngineOption[],
  core: CoreResult,
): Candidate[] {
  const out: Candidate[] = [];
  const groupById = new Map(core.options.map((g) => [g.optionId, g]));

  for (const p of participants) {
    const r = p.response;

    // A — remove one dealbreaker type.
    for (const t of [...r.dealbreakerTypes].sort()) {
      out.push({
        participant: p,
        modified: { ...r, dealbreakerTypes: r.dealbreakerTypes.filter((x) => x !== t) },
        detail: { kind: "remove_dealbreaker", type: t },
        size: 0,
        large: false,
        targetKey: t,
      });
    }

    // B — raise max budget by the exact minimum for an option where this
    // participant's budget is the sole blocker for the whole group.
    if (r.maxBudget !== null) {
      const seen = new Set<number>();
      for (const o of options) {
        const g = groupById.get(o.id)!;
        if (g.feasible || g.exclusions.length !== 1) continue;
        const ex = g.exclusions[0];
        if (ex.participantId !== p.id) continue;
        if (ex.reasons.length !== 1 || ex.reasons[0] !== "max_budget") continue;
        const toMax = o.costPerPerson;
        if (seen.has(toMax)) continue;
        seen.add(toMax);
        const increase = toMax - r.maxBudget;
        const spread = r.idealBudget === null ? 0 : r.maxBudget - r.idealBudget;
        out.push({
          participant: p,
          modified: { ...r, maxBudget: toMax },
          detail: {
            kind: "raise_max_budget",
            fromMax: r.maxBudget,
            toMax,
            increase,
            targetOptionId: o.id,
          },
          size: increase,
          large: increase > spread,
          targetKey: o.sortOrder,
        });
      }
    }

    // C — shift one date range (same length) into a feasible option's window.
    const ranges = r.preferredDateRanges;
    if (ranges && ranges.length > 0) {
      const seen = new Set<string>();
      for (const o of options) {
        const g = groupById.get(o.id)!;
        if (!g.feasible) continue;
        const ev = g.evaluations.find((e) => e.participantId === p.id)!;
        if (ev.factors.dates === "met") continue;
        let best: { i: number; shift: number } | null = null;
        ranges.forEach((range, i) => {
          for (const w of o.availabilityWindows) {
            const s = minimalShiftIntoWindow(range, w);
            if (s === null || s === 0) continue;
            if (
              best === null ||
              Math.abs(s) < Math.abs(best.shift) ||
              (Math.abs(s) === Math.abs(best.shift) && s > best.shift)
            ) {
              best = { i, shift: s };
            }
          }
        });
        if (best === null) continue;
        const { i, shift } = best as { i: number; shift: number };
        const key = `${i}:${shift}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const original = ranges[i];
        const shifted = shiftRange(original, shift);
        out.push({
          participant: p,
          modified: {
            ...r,
            preferredDateRanges: ranges.map((x, j) => (j === i ? shifted : x)),
          },
          detail: {
            kind: "shift_dates",
            original,
            shifted,
            shiftDays: shift,
            targetOptionId: o.id,
          },
          size: Math.abs(shift),
          large: Math.abs(shift) > rangeLengthDays(original),
          targetKey: o.sortOrder,
        });
      }
    }

    // D — relax one avoided type.
    for (const t of [...r.avoidedTypes].sort()) {
      out.push({
        participant: p,
        modified: { ...r, avoidedTypes: r.avoidedTypes.filter((x) => x !== t) },
        detail: { kind: "relax_avoided_type", type: t },
        size: 0,
        large: false,
        targetKey: t,
      });
    }
  }
  return out;
}

export function leverEffects(
  before: CoreResult,
  after: CoreResult,
  participantId: string,
): LeverEffects {
  const afterById = new Map(after.options.map((g) => [g.optionId, g]));
  const effects: LeverEffects = {
    newlyFeasibleOptionIds: [],
    newlyAllStrongOptionIds: [],
    improvedOptionIds: [],
    regressedOptionIds: [],
  };
  for (const b of before.options) {
    const a = afterById.get(b.optionId)!;
    if (a.feasible && !b.feasible) effects.newlyFeasibleOptionIds.push(b.optionId);
    if (a.allStrong && !b.allStrong) effects.newlyAllStrongOptionIds.push(b.optionId);
    if (a.feasible && b.feasible) {
      const tb = b.evaluations.find((e) => e.participantId === participantId)!.tier;
      const ta = a.evaluations.find((e) => e.participantId === participantId)!.tier;
      if (tb === "insufficient" || ta === "insufficient") continue;
      if (TIER_RANK[ta] > TIER_RANK[tb]) effects.improvedOptionIds.push(b.optionId);
      if (TIER_RANK[ta] < TIER_RANK[tb]) effects.regressedOptionIds.push(b.optionId);
    }
  }
  return effects;
}

export function isUseful(e: LeverEffects): boolean {
  return (
    e.newlyFeasibleOptionIds.length > 0 ||
    e.newlyAllStrongOptionIds.length > 0 ||
    e.improvedOptionIds.length > 0
  );
}

interface Scored {
  lever: Lever;
  size: number;
  joinOrder: number;
  targetKey: string | number;
}

function compareLevers(a: Scored, b: Scored): number {
  const ea = a.lever.effects;
  const eb = b.lever.effects;
  const cmpKey = (x: string | number, y: string | number) =>
    typeof x === "number" && typeof y === "number"
      ? x - y
      : String(x) < String(y)
        ? -1
        : String(x) > String(y)
          ? 1
          : 0;
  return (
    Number(a.lever.large) - Number(b.lever.large) ||
    eb.newlyFeasibleOptionIds.length - ea.newlyFeasibleOptionIds.length ||
    eb.newlyAllStrongOptionIds.length - ea.newlyAllStrongOptionIds.length ||
    eb.improvedOptionIds.length - ea.improvedOptionIds.length ||
    ea.regressedOptionIds.length - eb.regressedOptionIds.length ||
    KIND_ORDER[a.lever.kind] - KIND_ORDER[b.lever.kind] ||
    a.size - b.size ||
    a.joinOrder - b.joinOrder ||
    cmpKey(a.targetKey, b.targetKey)
  );
}

/** All useful single relaxations, deterministically ordered. */
export function allUsefulLevers(
  participantsIn: EngineParticipant[],
  optionsIn: EngineOption[],
  core?: CoreResult,
): Lever[] {
  const { participants, options } = canonicalise(participantsIn, optionsIn);
  const before = core ?? computeCore(participants, options);
  const scored: Scored[] = [];
  for (const c of generateCandidates(participants, options, before)) {
    const after = computeCore(
      withResponse(participants, c.participant.id, c.modified),
      options,
    );
    const effects = leverEffects(before, after, c.participant.id);
    if (!isUseful(effects)) continue;
    scored.push({
      lever: {
        kind: c.detail.kind,
        participantId: c.participant.id,
        large: c.large,
        effects,
        detail: c.detail,
      },
      size: c.size,
      joinOrder: c.participant.joinOrder,
      targetKey: c.targetKey,
    });
  }
  scored.sort(compareLevers);
  return scored.map((s) => s.lever);
}

export function computeSensitivity(
  participants: EngineParticipant[],
  options: EngineOption[],
  core: CoreResult,
): SensitivityResult {
  if (!shouldRunSensitivity(core)) {
    return { shown: false, levers: [], noUsefulRelaxation: false };
  }
  const levers = allUsefulLevers(participants, options, core).slice(0, MAX_LEVERS);
  return { shown: true, levers, noUsefulRelaxation: levers.length === 0 };
}
