import { describe, expect, it } from "vitest";
import { computeCore } from "../core";
import { computeEngine } from "../index";
import { allUsefulLevers, computeSensitivity, shouldRunSensitivity } from "../sensitivity";
import { option, participant, range } from "./fixtures";

describe("when sensitivity runs", () => {
  it("does not run when a feasible option is All-Strong", () => {
    const opts = [option({ id: "A", type: "beach" })];
    const people = [participant("a", 1, { preferredTypes: ["beach"] }), participant("b", 2, { preferredTypes: ["beach"] })];
    const r = computeEngine(people, opts);
    expect(r.sensitivity).toEqual({ shown: false, levers: [], noUsefulRelaxation: false });
  });
  it("runs when feasible options exist but none is All-Strong", () => {
    const opts = [option({ id: "A", type: "beach" })];
    const people = [participant("a", 1, { preferredTypes: ["beach"] }), participant("b", 2, { preferredTypes: ["hills"] })];
    expect(shouldRunSensitivity(computeCore(people, opts))).toBe(true);
  });
  it("must run when zero options are group-feasible", () => {
    const opts = [option({ id: "A", type: "beach" })];
    const people = [participant("a", 1, { dealbreakerTypes: ["beach"] })];
    expect(computeEngine(people, opts).sensitivity.shown).toBe(true);
  });
});

describe("lever A — dealbreaker relaxation", () => {
  it("finds that dropping one dealbreaker makes 2 options group-feasible", () => {
    const opts = [
      option({ id: "goa", type: "beach", sortOrder: 1 }),
      option({ id: "gokarna", type: "beach", sortOrder: 2 }),
      option({ id: "jaipur", type: "heritage", sortOrder: 3 }),
    ];
    const people = [
      participant("a", 1, { preferredTypes: ["beach"], dealbreakerTypes: [] }),
      participant("b", 2, { preferredTypes: ["hills"], dealbreakerTypes: ["beach"] }),
      participant("c", 3, { dealbreakerTypes: ["heritage"] }),
    ];
    const r = computeEngine(people, opts);
    expect(r.feasibleCount).toBe(0);
    const top = r.sensitivity.levers[0];
    expect(top.kind).toBe("remove_dealbreaker");
    expect(top.participantId).toBe("b");
    expect(top.effects.newlyFeasibleOptionIds).toEqual(["goa", "gokarna"]);
  });

  it("§36A.8: does not claim to unlock an option blocked by someone else too", () => {
    const opts = [option({ id: "goa", type: "beach", costPerPerson: 30_000 })];
    const people = [
      participant("a", 1, { dealbreakerTypes: ["beach"] }),
      participant("b", 2, { idealBudget: 10_000, maxBudget: 20_000 }),
    ];
    expect(computeEngine(people, opts).sensitivity).toMatchObject({ shown: true, levers: [], noUsefulRelaxation: true });
  });
});

describe("lever B — minimum max-budget relaxation", () => {
  const opts = [
    option({ id: "cheap", type: "hills", costPerPerson: 9_000, sortOrder: 1 }),
    option({ id: "mid", type: "beach", costPerPerson: 16_500, sortOrder: 2 }),
    option({ id: "dear", type: "beach", costPerPerson: 40_000, sortOrder: 3 }),
  ];
  const people = [
    participant("a", 1, { preferredTypes: ["beach"], idealBudget: 12_000, maxBudget: 30_000 }),
    participant("b", 2, { preferredTypes: ["beach"], idealBudget: 10_000, maxBudget: 15_000 }),
  ];

  it("computes the exact minimum increase, not a percentage step", () => {
    const levers = allUsefulLevers(people, opts);
    const b = levers.find((l) => l.kind === "raise_max_budget" && l.detail.kind === "raise_max_budget" && l.detail.targetOptionId === "mid")!;
    expect(b.participantId).toBe("b");
    expect(b.detail).toMatchObject({ fromMax: 15_000, toMax: 16_500, increase: 1_500 });
    expect(b.effects.newlyFeasibleOptionIds).toEqual(["mid"]);
    expect(b.large).toBe(false); // 1,500 ≤ own spread of 5,000
  });

  it("D9: labels an increase larger than the participant's own ideal→max spread as large, and ranks it below", () => {
    // `dear` is also blocked by a (30,000 max) → two exclusions → no lever for it at all (§36A.8).
    const levers = allUsefulLevers(people, opts);
    expect(levers.some((l) => l.detail.kind === "raise_max_budget" && l.detail.targetOptionId === "dear")).toBe(false);

    const solo = [participant("b", 1, { preferredTypes: ["beach"], idealBudget: 10_000, maxBudget: 15_000 })];
    const soloLevers = allUsefulLevers(solo, opts);
    const dear = soloLevers.find((l) => l.detail.kind === "raise_max_budget" && l.detail.targetOptionId === "dear")!;
    const mid = soloLevers.find((l) => l.detail.kind === "raise_max_budget" && l.detail.targetOptionId === "mid")!;
    expect(dear.large).toBe(true); // 25,000 > 5,000
    // Raising to 40,000 unlocks both mid and dear, yet the large one ranks below.
    expect(dear.effects.newlyFeasibleOptionIds.length).toBeGreaterThan(mid.effects.newlyFeasibleOptionIds.length);
    expect(soloLevers.indexOf(mid)).toBeLessThan(soloLevers.indexOf(dear));
  });

  it("does not apply when the participant is excluded for two reasons", () => {
    const p = [participant("b", 1, { idealBudget: 10_000, maxBudget: 15_000, dealbreakerTypes: ["beach"] })];
    const levers = allUsefulLevers(p, opts);
    expect(levers.some((l) => l.kind === "raise_max_budget")).toBe(false);
  });
});

describe("lever C — date shift (D8)", () => {
  it("shifts one range by the minimum days to reach containment and improves a tier", () => {
    const opts = [option({ id: "goa", type: "beach", availabilityWindows: [range("2026-10-15", "2027-05-31")] })];
    const people = [
      participant("a", 1, { preferredTypes: ["beach"], preferredDateRanges: [range("2026-10-10", "2026-10-14")] }),
      participant("b", 2, { preferredTypes: ["beach"] }),
    ];
    const levers = allUsefulLevers(people, opts);
    const c = levers.find((l) => l.kind === "shift_dates")!;
    expect(c.detail).toMatchObject({
      original: range("2026-10-10", "2026-10-14"),
      shifted: range("2026-10-15", "2026-10-19"),
      shiftDays: 5,
    });
    expect(c.effects.improvedOptionIds).toEqual(["goa"]);
    expect(c.effects.newlyAllStrongOptionIds).toEqual(["goa"]);
    expect(c.large).toBe(false); // 5 ≤ range length 5
  });

  it("labels a shift longer than the range itself as large", () => {
    const opts = [option({ id: "goa", availabilityWindows: [range("2027-01-01", "2027-01-31")] })];
    const people = [participant("a", 1, { preferredTypes: ["beach"], preferredDateRanges: [range("2026-12-01", "2026-12-03")] })];
    const c = allUsefulLevers(people, opts).find((l) => l.kind === "shift_dates")!;
    expect(c.detail).toMatchObject({ shiftDays: 31 });
    expect(c.large).toBe(true);
  });

  it("proves 'widening' is inert: a wider range never becomes contained", () => {
    // Documented null result behind D8 — widening only increases overlap.
    const opts = [option({ id: "goa", availabilityWindows: [range("2026-10-15", "2027-05-31")] })];
    const narrow = computeCore([participant("a", 1, { preferredDateRanges: [range("2026-10-10", "2026-10-20")] })], opts);
    const wide = computeCore([participant("a", 1, { preferredDateRanges: [range("2026-10-01", "2026-10-31")] })], opts);
    expect(narrow.options[0].evaluations[0].factors.dates).toBe("partial");
    expect(wide.options[0].evaluations[0].factors.dates).toBe("partial");
  });

  it("does not suggest a shift when the range is longer than every window", () => {
    const opts = [option({ id: "goa", availabilityWindows: [range("2027-01-01", "2027-01-05")] })];
    const people = [participant("a", 1, { preferredTypes: ["beach"], preferredDateRanges: [range("2026-12-01", "2026-12-31")] })];
    expect(allUsefulLevers(people, opts).some((l) => l.kind === "shift_dates")).toBe(false);
  });
});

describe("lever D — avoided-type relaxation (implemented literally)", () => {
  it("is inert when the participant has other type input (unmet → partial changes no tier)", () => {
    const opts = [option({ id: "goa", type: "beach" }), option({ id: "coorg", type: "hills", sortOrder: 99 })];
    const people = [
      participant("a", 1, { preferredTypes: ["hills"], avoidedTypes: ["beach"], idealBudget: 10_000, maxBudget: 20_000 }),
      participant("b", 2, { preferredTypes: ["beach"] }),
    ];
    const levers = allUsefulLevers(people, opts);
    expect(levers.some((l) => l.kind === "relax_avoided_type")).toBe(false);
  });

  it("surfaces only when the avoided type was the participant's sole type input (factor becomes unknown)", () => {
    const opts = [option({ id: "goa", type: "beach" })];
    const people = [
      participant("a", 1, { avoidedTypes: ["beach"], preferredDateRanges: [range("2026-12-01", "2026-12-05")] }),
      participant("b", 2, { preferredTypes: ["beach"] }),
    ];
    const d = allUsefulLevers(people, opts).find((l) => l.kind === "relax_avoided_type")!;
    expect(d.detail).toEqual({ kind: "relax_avoided_type", type: "beach" });
    expect(d.effects.improvedOptionIds).toEqual(["goa"]);
  });
});

describe("no useful relaxation", () => {
  it("reports noUsefulRelaxation when nothing single-handedly helps", () => {
    const opts = [option({ id: "goa", type: "beach", costPerPerson: 30_000 })];
    const people = [
      participant("a", 1, { idealBudget: 5_000, maxBudget: 10_000 }),
      participant("b", 2, { idealBudget: 5_000, maxBudget: 10_000 }),
    ];
    const s = computeSensitivity(people, opts, computeCore(people, opts));
    expect(s).toEqual({ shown: true, levers: [], noUsefulRelaxation: true });
  });
});

describe("ordering and limits", () => {
  it("surfaces at most 3 levers, deterministically", () => {
    const opts = ["beach", "hills", "heritage", "wildlife", "backwaters"].map((t, i) =>
      option({ id: t, type: t, sortOrder: i + 1 }),
    );
    const people = [
      participant("a", 1, { dealbreakerTypes: ["beach", "hills"] }),
      participant("b", 2, { dealbreakerTypes: ["heritage", "wildlife", "backwaters"] }),
    ];
    const r1 = computeEngine(people, opts);
    const r2 = computeEngine([...people].reverse(), [...opts].reverse());
    expect(r1.sensitivity.levers).toHaveLength(3);
    expect(JSON.stringify(r1.sensitivity)).toBe(JSON.stringify(r2.sensitivity));
    // kind A, equal effects → participant join order, then type name
    expect(r1.sensitivity.levers.map((l) => [l.participantId, l.detail.kind === "remove_dealbreaker" && l.detail.type])).toEqual([
      ["a", "beach"],
      ["a", "hills"],
      ["b", "backwaters"],
    ]);
  });

  it("only ever relaxes ONE participant per lever", () => {
    const opts = [option({ id: "goa", type: "beach", costPerPerson: 20_000 })];
    const people = [
      participant("a", 1, { idealBudget: 10_000, maxBudget: 15_000 }),
      participant("b", 2, { dealbreakerTypes: ["beach"] }),
    ];
    // Needs two people to change → no single lever may claim goa.
    const levers = allUsefulLevers(people, opts);
    expect(levers.every((l) => !l.effects.newlyFeasibleOptionIds.includes("goa"))).toBe(true);
  });
});
