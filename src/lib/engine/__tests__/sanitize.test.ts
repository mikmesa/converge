import { describe, expect, it } from "vitest";
import type { OptionCard } from "../../domain/result-types";
import { computeEngine } from "../index";
import { sanitizeResult, type SanitizeInput } from "../sanitize";
import type { EngineOption } from "../types";
import { option, participant, range } from "./fixtures";

/** Budgets chosen to be distinctive so any leak is detectable by search. */
const BUDGETS = {
  a: [13_579, 24_681],
  b: [11_213, 17_319],
  c: [19_937, 23_209],
};

const opts: EngineOption[] = [
  option({ id: "goa", type: "beach", costPerPerson: 16_000, sortOrder: 1, activities: ["nightlife", "water_sports"] }),
  option({ id: "coorg", type: "hills", costPerPerson: 12_000, sortOrder: 2, activities: ["trekking"] }),
  option({ id: "jaipur", type: "heritage", costPerPerson: 18_000, sortOrder: 3 }),
  option({ id: "spiti", type: "high_mountains", costPerPerson: 30_000, sortOrder: 4 }),
];
const cards: OptionCard[] = opts.map((o) => ({
  id: o.id,
  name: o.name,
  type: o.type,
  costPerPerson: o.costPerPerson,
  availabilityWindows: o.availabilityWindows,
  description: `${o.name} description`,
  typicalDurationDays: 3,
  activities: o.activities,
  tags: [],
}));

function build(viewer = "a") {
  const people = [
    participant("a", 1, { preferredTypes: ["beach"], idealBudget: BUDGETS.a[0], maxBudget: BUDGETS.a[1], wantedActivities: ["nightlife"] }),
    participant("b", 2, { preferredTypes: ["hills"], idealBudget: BUDGETS.b[0], maxBudget: BUDGETS.b[1], preferredDateRanges: [range("2026-12-01", "2026-12-05")], avoidedActivities: ["nightlife"] }),
    participant("c", 3, { avoidedTypes: ["heritage"], idealBudget: BUDGETS.c[0], maxBudget: BUDGETS.c[1] }),
  ].map((p) => ({ ...p, isOrganizer: p.id === "a", updatedAfterRevealAt: null }));
  const result = computeEngine(people, opts);
  const input: SanitizeInput = {
    decision: { id: "d1", name: "Trip", status: "revealed", participantLimit: 3, revealedAt: "2026-09-27T10:00:00Z", decidedAt: null },
    viewerParticipantId: viewer,
    participants: people,
    engineOptions: opts,
    cards,
    result,
    myVoteOptionId: null,
    outcome: null,
  };
  return { input, sanitized: sanitizeResult(input) };
}

describe("sanitizeResult — privacy boundary", () => {
  it("never contains any participant's raw budget values", () => {
    for (const viewer of ["a", "b", "c"]) {
      const json = JSON.stringify(build(viewer).sanitized);
      for (const [pid, [ideal, max]] of Object.entries(BUDGETS)) {
        // The viewer's own relaxation amounts are allowed (D16) — but even
        // those are derived values, never the raw submitted number of others.
        if (pid === viewer) continue;
        expect(json).not.toContain(String(ideal));
        expect(json).not.toContain(String(max));
      }
    }
  });

  it("carries no raw response fields, notes or auth identifiers", () => {
    const json = JSON.stringify(build().sanitized);
    for (const key of ["idealBudget", "maxBudget", "preferredTypes", "avoidedTypes", "dealbreakerTypes", "notes", "preferredDateRanges", "authUserId", "auth_user_id", "budgetOvershoot"]) {
      expect(json).not.toContain(key);
    }
  });

  it("uses only categorical budget indicators for others", () => {
    const s = build().sanitized;
    for (const row of Object.values(s.matrix)) {
      for (const cell of Object.values(row)) {
        expect(["within_budget", "stretch", "over_budget", "unknown"]).toContain(cell.cost);
      }
    }
  });

  it("public levers contain no amounts and do not name the participant", () => {
    const { sanitized } = build("b");
    for (const l of sanitized.sensitivity.levers) {
      expect(Object.keys(l).sort()).toEqual(
        ["improvedOptionIds", "isViewers", "kind", "large", "newlyAllStrongOptionIds", "newlyFeasibleOptionIds", "regressedOptionIds"].sort(),
      );
    }
  });

  it("D16: private levers belong only to the viewer", () => {
    // c has max 23,209 → spiti (30,000) blocked solely by... a (24,681) and b too, so
    // construct a clean single-blocker case:
    const people = [
      participant("x", 1, { preferredTypes: ["beach"], idealBudget: 10_000, maxBudget: 15_000 }),
      participant("y", 2, { preferredTypes: ["beach"], idealBudget: 20_000, maxBudget: 40_000 }),
    ].map((p) => ({ ...p, isOrganizer: p.id === "x", updatedAfterRevealAt: null }));
    const result = computeEngine(people, opts);
    const base = { ...build().input, participants: people, result };
    const asX = sanitizeResult({ ...base, viewerParticipantId: "x" });
    const asY = sanitizeResult({ ...base, viewerParticipantId: "y" });
    expect(asX.myLevers.length).toBeGreaterThan(0);
    expect(asX.myLevers.every((l) => l.isViewers)).toBe(true);
    const budgetLever = asX.myLevers.find((l) => l.kind === "raise_max_budget");
    expect(budgetLever).toMatchObject({ fromMax: 15_000 });
    // y must not see x's amounts anywhere.
    expect(JSON.stringify(asY)).not.toContain("15000");
    expect(asY.myLevers.every((l) => l.isViewers)).toBe(true);
  });

  it("only sends cards for options referenced by the result", () => {
    const s = build().sanitized;
    const ids = new Set([...s.top.map((t) => t.optionId), ...s.sensitivity.infeasible.map((i) => i.optionId)]);
    for (const id of Object.keys(s.options)) {
      const referenced =
        ids.has(id) ||
        s.sensitivity.levers.some((l) => [...l.improvedOptionIds, ...l.newlyAllStrongOptionIds, ...l.regressedOptionIds].includes(id)) ||
        s.myLevers.some((l) => [...l.improvedOptionIds, ...l.newlyAllStrongOptionIds, ...l.regressedOptionIds, ...l.newlyFeasibleOptionIds].includes(id));
      expect(referenced).toBe(true);
    }
  });

  it("activity matches are context, attached per option", () => {
    const s = build().sanitized;
    expect(s.matrix.goa.a.wantedActivitiesHere).toEqual(["nightlife"]);
    expect(s.matrix.goa.b.avoidedActivitiesHere).toEqual(["nightlife"]);
  });

  it("voting is closed when zero options are feasible", () => {
    const people = [participant("z", 1, { dealbreakerTypes: ["beach", "hills", "heritage", "high_mountains"] })].map((p) => ({
      ...p,
      isOrganizer: true,
      updatedAfterRevealAt: null,
    }));
    const result = computeEngine(people, opts);
    const s = sanitizeResult({ ...build().input, participants: people, result, viewerParticipantId: "z" });
    expect(s.voting).toEqual({ open: false, closedReason: "no_feasible_options", myVoteOptionId: null });
    expect(s.top).toEqual([]);
  });
});
