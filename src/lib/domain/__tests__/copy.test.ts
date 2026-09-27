import { describe, expect, it } from "vitest";
import { outcomeText, publicLeverText } from "../copy";
import type { OptionCard, PublicLever } from "../result-types";
import { buildExplanationInput, templateExplanation } from "../explanation";
import { isAcceptableExplanation, validateExplanationOutput } from "../explanation-validate";

const card = (id: string, name: string): OptionCard => ({
  id,
  name,
  type: "beach",
  costPerPerson: 18000,
  availabilityWindows: [],
  description: "",
  typicalDurationDays: 3,
  activities: [],
  tags: [],
});
const options = { goa: card("goa", "Goa"), coorg: card("coorg", "Coorg"), hampi: card("hampi", "Hampi") };

const lever = (p: Partial<PublicLever>): PublicLever => ({
  kind: "raise_max_budget",
  large: false,
  isViewers: false,
  newlyFeasibleOptionIds: [],
  newlyAllStrongOptionIds: [],
  improvedOptionIds: [],
  regressedOptionIds: [],
  ...p,
});

describe("publicLeverText — privacy-safe", () => {
  it("never contains digits other than option counts, nor currency", () => {
    const texts = [
      publicLeverText(lever({ newlyFeasibleOptionIds: ["goa"] }), options),
      publicLeverText(lever({ kind: "remove_dealbreaker", newlyFeasibleOptionIds: ["goa", "hampi"] }), options),
      publicLeverText(lever({ kind: "shift_dates", large: true, newlyAllStrongOptionIds: ["coorg"] }), options),
      publicLeverText(lever({ kind: "relax_avoided_type", improvedOptionIds: ["coorg"] }), options),
    ];
    for (const t of texts) {
      expect(t).not.toMatch(/₹|\d{2,}/);
      expect(t).toMatch(/one participant/);
    }
    expect(texts[0]).toBe("A budget relaxation for one participant would make 1 more option work for everyone (Goa).");
    expect(texts[1]).toContain("2 more options work for everyone (Goa and Hampi)");
    expect(texts[2]).toContain("large shift");
  });
});

describe("outcomeText", () => {
  it("majority without tie-break", () => {
    expect(
      outcomeText({ outcome: "selected", optionId: "coorg", tally: { coorg: 3, goa: 2, hampi: 0 }, reason: "majority", tiedOptionIds: ["coorg"] }, options),
    ).toEqual(["Coorg was selected 3–2.", "No tie-break was required."]);
  });
  it("tie resolved by strong fit", () => {
    expect(
      outcomeText({ outcome: "selected", optionId: "goa", tally: { goa: 2, coorg: 2, hampi: 0 }, reason: "strong_fit", tiedOptionIds: ["goa", "coorg"] }, options),
    ).toEqual(["Goa and Coorg tied 2–2.", "Goa was selected because it had more Strong Fit participants."]);
  });
  it("unresolved tie → no decision", () => {
    const t = outcomeText({ outcome: "tied_no_decision", optionId: null, tally: { goa: 1, coorg: 1 }, reason: null, tiedOptionIds: ["goa", "coorg"] }, options);
    expect(t[0]).toBe("No decision — final vote remained tied.");
  });
});

describe("explanation input + template", () => {
  const result = {
    top: [{ optionId: "goa", rank: 1, separatedFromPreviousBy: null, counts: { strong: 1, compromise: 1, conflict: 0, insufficient: 1 }, allStrong: false }],
    options,
    participants: [
      { id: "a", name: "Riya", isOrganizer: true, isViewer: true, updatedAfterRevealAt: null },
      { id: "b", name: "Sid", isOrganizer: false, isViewer: false, updatedAfterRevealAt: null },
      { id: "c", name: "Kay", isOrganizer: false, isViewer: false, updatedAfterRevealAt: null },
    ],
    matrix: {
      goa: {
        a: { tier: "strong", cost: "within_budget", type: "met", dates: "met", wantedActivitiesHere: ["water_sports"], avoidedActivitiesHere: [] },
        b: { tier: "compromise", cost: "stretch", type: "met", dates: "unknown", wantedActivitiesHere: [], avoidedActivitiesHere: [] },
        c: { tier: "insufficient", cost: "unknown", type: "unknown", dates: "unknown", wantedActivitiesHere: [], avoidedActivitiesHere: [] },
      },
    },
  } as never;

  it("AI input contains only names and categories", () => {
    const input = buildExplanationInput(result);
    expect(JSON.stringify(input)).not.toMatch(/budget"\s*:\s*\d|notes|ideal|max/);
    expect(input.options[0].participants[1]).toMatchObject({ name: "Sid", tier: "compromise", cost: "stretch" });
  });

  it("template states only engine facts", () => {
    const t = templateExplanation(buildExplanationInput(result).options[0]);
    expect(t).toBe("Goa works strongly for 1 person. Sid is stretching on budget. Kay didn't give enough input to evaluate.");
  });

  it("rejects AI prose with amounts, scores or mismatched options", () => {
    const input = buildExplanationInput(result);
    expect(isAcceptableExplanation("Goa costs ₹18,000.")).toBe(false);
    expect(isAcceptableExplanation("Goa scores 87/100.")).toBe(false);
    expect(isAcceptableExplanation("Goa is a 73% fit.")).toBe(false);
    expect(isAcceptableExplanation("Goa works strongly for Riya; Sid is stretching on budget.")).toBe(true);
    expect(validateExplanationOutput(input, { explanations: [{ option_id: "goa", text: "Fine." }] })).toEqual({ goa: "Fine." });
    expect(validateExplanationOutput(input, { explanations: [{ option_id: "nowhere", text: "Fine." }] })).toBeNull();
    expect(validateExplanationOutput(input, { explanations: [] })).toBeNull();
    expect(validateExplanationOutput(input, "not json")).toBeNull();
  });
});
