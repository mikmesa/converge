import { describe, expect, it } from "vitest";
import { checkVoteChoice, computeEngine } from "../index";
import { resolveVote } from "../vote";
import { option, participant } from "./fixtures";

const v = (participantId: string, optionId: string) => ({ participantId, optionId });

describe("resolveVote (§21)", () => {
  const candidates = [
    { optionId: "goa", strong: 3, conflict: 1 },
    { optionId: "coorg", strong: 2, conflict: 0 },
    { optionId: "jaipur", strong: 2, conflict: 1 },
  ];

  it("normal majority — no tie-break needed", () => {
    const out = resolveVote([v("a", "coorg"), v("b", "coorg"), v("c", "coorg"), v("d", "goa"), v("e", "goa")], candidates);
    expect(out).toMatchObject({ outcome: "selected", optionId: "coorg", reason: "majority" });
    expect(out.tally).toEqual({ goa: 2, coorg: 3, jaipur: 0 });
  });

  it("vote tie resolved by strong-fit count", () => {
    const out = resolveVote([v("a", "goa"), v("b", "goa"), v("c", "coorg"), v("d", "coorg")], candidates);
    expect(out).toMatchObject({ outcome: "selected", optionId: "goa", reason: "strong_fit", tiedOptionIds: ["goa", "coorg"] });
  });

  it("vote tie resolved by conflict count", () => {
    const out = resolveVote([v("a", "coorg"), v("b", "jaipur")], candidates);
    expect(out).toMatchObject({ outcome: "selected", optionId: "coorg", reason: "fewest_conflict" });
  });

  it("final unresolved tie → no decision (never random, never array order)", () => {
    const tied = [
      { optionId: "x", strong: 2, conflict: 1 },
      { optionId: "y", strong: 2, conflict: 1 },
    ];
    const out = resolveVote([v("a", "x"), v("b", "y")], tied);
    expect(out).toEqual({ outcome: "tied_no_decision", tally: { x: 1, y: 1 }, tiedOptionIds: ["x", "y"] });
    // Reversing candidate order must not change the outcome.
    expect(resolveVote([v("a", "x"), v("b", "y")], [...tied].reverse()).outcome).toBe("tied_no_decision");
  });

  it("zero-vote options still take part in the tally", () => {
    const out = resolveVote([v("a", "goa")], candidates);
    expect(out.tally.jaipur).toBe(0);
  });

  it("rejects votes for non-candidate options", () => {
    expect(() => resolveVote([v("a", "nowhere")], candidates)).toThrow();
  });
});

describe("checkVoteChoice", () => {
  const opts = [
    option({ id: "A", type: "beach", sortOrder: 1 }),
    option({ id: "B", type: "hills", sortOrder: 2 }),
    option({ id: "C", type: "heritage", sortOrder: 3 }),
    option({ id: "D", type: "wildlife", sortOrder: 4 }),
    option({ id: "E", type: "backwaters", sortOrder: 5, costPerPerson: 50_000 }),
  ];
  const people = [
    participant("a", 1, { idealBudget: 10_000, maxBudget: 20_000 }),
    participant("b", 2, { dealbreakerTypes: ["beach"] }),
  ];
  const result = computeEngine(people, opts);

  it("accepts a top option", () => {
    expect(checkVoteChoice(result, "a", "B")).toEqual({ ok: true });
  });
  it("rejects an option hard-excluded for the group (and so not in the top)", () => {
    expect(checkVoteChoice(result, "a", "A")).toMatchObject({ ok: false });
    expect(checkVoteChoice(result, "b", "E")).toMatchObject({ ok: false });
  });
  it("rejects a feasible option outside the top 3", () => {
    expect(result.top.map((t) => t.optionId)).toEqual(["B", "C", "D"]);
    expect(checkVoteChoice(result, "a", "E")).toMatchObject({ ok: false });
  });
  it("hard-excluded option cannot be selected even if it were offered", () => {
    const forged = { ...result, top: [...result.top, { optionId: "A", rank: 4, separatedFromPreviousBy: null }] };
    expect(checkVoteChoice(forged, "b", "A")).toEqual({ ok: false, reason: "hard_excluded" });
  });
  it("voting unavailable when zero feasible options", () => {
    const none = computeEngine([participant("a", 1, { dealbreakerTypes: ["beach", "hills", "heritage", "wildlife", "backwaters"] })], opts);
    expect(checkVoteChoice(none, "a", "A")).toEqual({ ok: false, reason: "voting_unavailable" });
  });
});
