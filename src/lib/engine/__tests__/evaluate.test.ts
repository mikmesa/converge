import { describe, expect, it } from "vitest";
import {
  evaluateCost,
  evaluateHardConstraints,
  evaluateOptionForGroup,
  evaluateType,
  tierFor,
} from "../evaluate";
import { emptyResponse, option, participant, range } from "./fixtures";

const goa = option({ id: "goa", type: "beach", costPerPerson: 16_000 });

describe("hard constraints", () => {
  it("excludes when cost exceeds max budget", () => {
    expect(evaluateHardConstraints({ ...emptyResponse(), idealBudget: 10_000, maxBudget: 15_999 }, goa)).toEqual(["max_budget"]);
  });
  it("does NOT exclude when cost exactly equals max budget", () => {
    expect(evaluateHardConstraints({ ...emptyResponse(), idealBudget: 10_000, maxBudget: 16_000 }, goa)).toEqual([]);
  });
  it("excludes on dealbreaker type match", () => {
    expect(evaluateHardConstraints({ ...emptyResponse(), dealbreakerTypes: ["beach"] }, goa)).toEqual(["dealbreaker"]);
  });
  it("does not exclude with no matching dealbreaker", () => {
    expect(evaluateHardConstraints({ ...emptyResponse(), dealbreakerTypes: ["heritage"] }, goa)).toEqual([]);
  });
  it("reports both reasons together", () => {
    expect(
      evaluateHardConstraints(
        { ...emptyResponse(), idealBudget: 1_000, maxBudget: 2_000, dealbreakerTypes: ["beach"] },
        goa,
      ),
    ).toEqual(["max_budget", "dealbreaker"]);
  });
  it("missing budget imposes no hard constraint (unknown ≠ no)", () => {
    expect(evaluateHardConstraints(emptyResponse(), goa)).toEqual([]);
  });
});

describe("cost factor", () => {
  it("met when cost ≤ ideal", () => {
    expect(evaluateCost({ ...emptyResponse(), idealBudget: 16_000, maxBudget: 20_000 }, goa)).toBe("met");
  });
  it("partial when ideal < cost ≤ max", () => {
    expect(evaluateCost({ ...emptyResponse(), idealBudget: 12_000, maxBudget: 16_000 }, goa)).toBe("partial");
  });
  it("unmet when cost > max (hard-excluded case)", () => {
    expect(evaluateCost({ ...emptyResponse(), idealBudget: 12_000, maxBudget: 15_000 }, goa)).toBe("unmet");
  });
  it("unknown when either budget is missing", () => {
    expect(evaluateCost(emptyResponse(), goa)).toBe("unknown");
    expect(evaluateCost({ ...emptyResponse(), idealBudget: 12_000 }, goa)).toBe("unknown");
    expect(evaluateCost({ ...emptyResponse(), maxBudget: 20_000 }, goa)).toBe("unknown");
  });
});

describe("type factor", () => {
  it("met when preferred", () => {
    expect(evaluateType({ ...emptyResponse(), preferredTypes: ["beach"] }, goa)).toBe("met");
  });
  it("unmet when avoided", () => {
    expect(evaluateType({ ...emptyResponse(), avoidedTypes: ["beach"] }, goa)).toBe("unmet");
  });
  it("partial when neither preferred nor avoided", () => {
    expect(evaluateType({ ...emptyResponse(), preferredTypes: ["hills"] }, goa)).toBe("partial");
  });
  it("D7: avoided-only participant is PARTIAL (not met) on non-avoided types", () => {
    expect(evaluateType({ ...emptyResponse(), avoidedTypes: ["heritage"] }, goa)).toBe("partial");
  });
  it("unknown with no type info; dealbreakers are not soft type info", () => {
    expect(evaluateType(emptyResponse(), goa)).toBe("unknown");
    expect(evaluateType({ ...emptyResponse(), dealbreakerTypes: ["heritage"] }, goa)).toBe("unknown");
  });
});

describe("tiers", () => {
  it("strong when all submitted factors met", () => {
    expect(tierFor({ cost: "met", type: "met", dates: "met" })).toBe("strong");
  });
  it("compromise with one partial", () => {
    expect(tierFor({ cost: "partial", type: "met", dates: "met" })).toBe("compromise");
  });
  it("compromise with one unmet", () => {
    expect(tierFor({ cost: "met", type: "unmet", dates: "met" })).toBe("compromise");
  });
  it("conflict with two partial/unmet", () => {
    expect(tierFor({ cost: "partial", type: "unmet", dates: "met" })).toBe("conflict");
    expect(tierFor({ cost: "partial", type: "partial", dates: "partial" })).toBe("conflict");
  });
  it("unknown factors are excluded from the count", () => {
    expect(tierFor({ cost: "unknown", type: "met", dates: "unknown" })).toBe("strong");
    expect(tierFor({ cost: "unknown", type: "partial", dates: "unknown" })).toBe("compromise");
    expect(tierFor({ cost: "partial", type: "unknown", dates: "unmet" })).toBe("conflict");
  });
  it("insufficient input when zero scorable factors (never Strong)", () => {
    expect(tierFor({ cost: "unknown", type: "unknown", dates: "unknown" })).toBe("insufficient");
  });
});

describe("group evaluation", () => {
  const people = [
    participant("a", 1, { preferredTypes: ["beach"], idealBudget: 20_000, maxBudget: 25_000 }),
    participant("b", 2, { preferredTypes: ["hills"], idealBudget: 10_000, maxBudget: 20_000, preferredDateRanges: [range("2026-12-01", "2026-12-05")] }),
    participant("c", 3), // name only → insufficient
    participant("d", 4, { dealbreakerTypes: ["heritage"] }), // dealbreaker only → insufficient, still hard-constraining
  ];

  it("is feasible when nobody is hard-excluded", () => {
    const g = evaluateOptionForGroup(people, goa);
    expect(g.feasible).toBe(true);
    expect(g.exclusions).toEqual([]);
  });

  it("counts insufficient separately and excludes them from every ranking count (§36A.5)", () => {
    const g = evaluateOptionForGroup(people, goa);
    expect(g.counts).toEqual({ strong: 1, compromise: 0, conflict: 1, insufficient: 2 });
    // overshoot: a=0, b=6000; c,d excluded
    expect(g.totalBudgetOvershoot).toBe(6_000);
    // overlap: only b submitted dates → 5 days
    expect(g.totalDateOverlapDays).toBe(5);
  });

  it("is infeasible if even one participant is hard-excluded", () => {
    const fort = option({ id: "fort", type: "heritage", costPerPerson: 5_000 });
    const g = evaluateOptionForGroup(people, fort);
    expect(g.feasible).toBe(false);
    expect(g.exclusions).toEqual([{ participantId: "d", reasons: ["dealbreaker"] }]);
    expect(g.allStrong).toBe(false);
  });

  it("D10: allStrong ignores insufficient participants but requires ≥1 Strong", () => {
    const g = evaluateOptionForGroup(
      [participant("a", 1, { preferredTypes: ["beach"] }), participant("c", 2)],
      goa,
    );
    expect(g.allStrong).toBe(true);
    const none = evaluateOptionForGroup([participant("c", 1), participant("e", 2)], goa);
    expect(none.counts.insufficient).toBe(2);
    expect(none.allStrong).toBe(false);
  });
});
