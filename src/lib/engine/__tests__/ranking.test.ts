import { describe, expect, it } from "vitest";
import { computeCore } from "../core";
import { computeEngine } from "../index";
import { option, participant, range } from "./fixtures";

describe("group ranking (§13 exact lexicographic order)", () => {
  it("rule 1: fewest Conflict wins even against more Strong", () => {
    // X: 2 strong, 1 conflict. Y: 0 strong, 3 compromise, 0 conflict.
    const X = option({ id: "X", type: "beach", costPerPerson: 10_000, sortOrder: 1 });
    const Y = option({ id: "Y", type: "hills", costPerPerson: 10_000, sortOrder: 2 });
    const people = [
      participant("a", 1, { preferredTypes: ["beach"], avoidedTypes: [], idealBudget: 10_000, maxBudget: 20_000 }),
      participant("b", 2, { preferredTypes: ["beach"], idealBudget: 10_000, maxBudget: 20_000 }),
      // c: beach avoided + stretch on budget → conflict on X; hills partial type only → compromise on Y
      participant("c", 3, { preferredTypes: ["heritage"], avoidedTypes: ["beach"], idealBudget: 5_000, maxBudget: 20_000 }),
    ];
    // Y for a,b: type partial (not preferred) → compromise; c: type partial + cost partial → conflict.
    // Make c's cost met on Y by giving Y a cheaper price.
    const Ycheap = { ...Y, costPerPerson: 5_000 };
    const core = computeCore(people, [X, Ycheap]);
    const gX = core.options.find((o) => o.optionId === "X")!;
    const gY = core.options.find((o) => o.optionId === "Y")!;
    expect(gX.counts).toMatchObject({ strong: 2, conflict: 1 });
    expect(gY.counts).toMatchObject({ strong: 0, compromise: 3, conflict: 0 });
    expect(core.ranked.map((r) => r.optionId)).toEqual(["Y", "X"]);
    expect(core.ranked[1].separatedFromPreviousBy).toBe("fewest_conflict");
  });

  it("rule 2: most Strong breaks a conflict tie", () => {
    const A = option({ id: "A", type: "beach", sortOrder: 2 });
    const B = option({ id: "B", type: "hills", sortOrder: 1 });
    const people = [
      participant("a", 1, { preferredTypes: ["beach"] }),
      participant("b", 2, { preferredTypes: ["beach", "hills"] }),
    ];
    const core = computeCore(people, [A, B]);
    expect(core.ranked.map((r) => r.optionId)).toEqual(["A", "B"]);
    expect(core.ranked[1].separatedFromPreviousBy).toBe("most_strong");
  });

  it("rule 3: lowest total budget overshoot", () => {
    const A = option({ id: "A", costPerPerson: 14_000, sortOrder: 1 });
    const B = option({ id: "B", costPerPerson: 12_000, sortOrder: 2 });
    // both stretch for both → equal tiers (compromise); overshoot A=8000, B=4000
    const people = [
      participant("a", 1, { idealBudget: 10_000, maxBudget: 20_000 }),
      participant("b", 2, { idealBudget: 10_000, maxBudget: 20_000 }),
    ];
    const core = computeCore(people, [A, B]);
    expect(core.ranked.map((r) => r.optionId)).toEqual(["B", "A"]);
    expect(core.ranked[1].separatedFromPreviousBy).toBe("lowest_overshoot");
  });

  it("rule 4: highest total date overlap", () => {
    const A = option({ id: "A", sortOrder: 1, availabilityWindows: [range("2026-12-01", "2026-12-03")] });
    const B = option({ id: "B", sortOrder: 2, availabilityWindows: [range("2026-12-01", "2026-12-06")] });
    const people = [participant("a", 1, { preferredDateRanges: [range("2026-12-01", "2026-12-10")] })];
    // both partial → compromise; overlap A=3, B=6
    const core = computeCore(people, [A, B]);
    expect(core.ranked.map((r) => r.optionId)).toEqual(["B", "A"]);
    expect(core.ranked[1].separatedFromPreviousBy).toBe("most_date_overlap");
  });

  it("rule 5: deterministic final tie uses sort_order", () => {
    const A = option({ id: "A", sortOrder: 7 });
    const B = option({ id: "B", sortOrder: 3 });
    const C = option({ id: "C", sortOrder: 5 });
    const people = [participant("a", 1), participant("b", 2)];
    const core = computeCore(people, [A, B, C]);
    expect(core.ranked.map((r) => r.optionId)).toEqual(["B", "C", "A"]);
    expect(core.ranked[1].separatedFromPreviousBy).toBe("curated_order");
  });

  it("excludes infeasible options from the ranking entirely", () => {
    const A = option({ id: "A", type: "beach", sortOrder: 1 });
    const B = option({ id: "B", type: "hills", sortOrder: 2 });
    const people = [participant("a", 1, { dealbreakerTypes: ["beach"] })];
    const core = computeCore(people, [A, B]);
    expect(core.ranked.map((r) => r.optionId)).toEqual(["B"]);
  });

  it("never pads: 2 feasible → 2 top; 0 feasible → 0 top and no recommendation", () => {
    const opts = [
      option({ id: "A", type: "beach", sortOrder: 1 }),
      option({ id: "B", type: "hills", sortOrder: 2 }),
      option({ id: "C", type: "heritage", sortOrder: 3 }),
    ];
    const two = computeCore([participant("a", 1, { dealbreakerTypes: ["heritage"] })], opts);
    expect(two.top).toHaveLength(2);
    const none = computeCore(
      [participant("a", 1, { dealbreakerTypes: ["beach", "hills", "heritage"] })],
      opts,
    );
    expect(none.top).toHaveLength(0);
    expect(none.feasibleCount).toBe(0);
    expect(none.recommendationOptionId).toBeNull();
  });

  it("top is capped at 3", () => {
    const opts = [1, 2, 3, 4, 5].map((n) => option({ id: `O${n}`, sortOrder: n }));
    expect(computeCore([participant("a", 1)], opts).top).toHaveLength(3);
  });

  it("is deterministic regardless of input order", () => {
    const opts = [
      option({ id: "A", type: "beach", costPerPerson: 9_000, sortOrder: 1 }),
      option({ id: "B", type: "hills", costPerPerson: 12_000, sortOrder: 2 }),
      option({ id: "C", type: "heritage", costPerPerson: 15_000, sortOrder: 3 }),
      option({ id: "D", type: "wildlife", costPerPerson: 11_000, sortOrder: 4 }),
    ];
    const people = [
      participant("p1", 1, { preferredTypes: ["hills"], idealBudget: 10_000, maxBudget: 16_000 }),
      participant("p2", 2, { avoidedTypes: ["beach"], preferredDateRanges: [range("2026-12-01", "2026-12-05")] }),
      participant("p3", 3, { preferredTypes: ["wildlife", "heritage"], idealBudget: 12_000, maxBudget: 14_000 }),
    ];
    const baseline = JSON.stringify(computeEngine(people, opts));
    for (let i = 0; i < 10; i++) {
      const shuffledP = [...people].sort(() => (i % 2 ? 1 : -1));
      const shuffledO = [...opts].reverse();
      expect(JSON.stringify(computeEngine(shuffledP, i % 3 ? shuffledO : opts))).toBe(baseline);
    }
  });
});
