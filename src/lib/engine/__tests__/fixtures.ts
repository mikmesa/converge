import type { DateRange, EngineOption, EngineParticipant, EngineResponse } from "../types";

export function emptyResponse(): EngineResponse {
  return {
    preferredDateRanges: null,
    idealBudget: null,
    maxBudget: null,
    preferredTypes: [],
    avoidedTypes: [],
    dealbreakerTypes: [],
    wantedActivities: [],
    avoidedActivities: [],
  };
}

let optionSeq = 0;
export function option(
  partial: Partial<EngineOption> & { id: string },
): EngineOption {
  optionSeq += 1;
  return {
    name: partial.id,
    type: "beach",
    costPerPerson: 10_000,
    availabilityWindows: [{ start: "2026-10-01", end: "2027-03-31" }],
    sortOrder: partial.sortOrder ?? optionSeq,
    activities: [],
    ...partial,
  };
}

export function participant(
  id: string,
  joinOrder: number,
  response: Partial<EngineResponse> = {},
): EngineParticipant {
  return { id, name: id, joinOrder, response: { ...emptyResponse(), ...response } };
}

export const range = (start: string, end: string): DateRange => ({ start, end });
