"use client";

import type { ExplanationPayload } from "../domain/explanation";
import type { SanitizedResult } from "../domain/result-types";
import { ensureSession, supabase } from "./supabase";

export type DecisionStatus = "collecting" | "revealed" | "decided";

export interface DecisionPublic {
  id: string;
  name: string;
  status: DecisionStatus;
  participant_limit: number | null;
  travel_year: number | null;
  member: {
    participant_id: string;
    name: string;
    is_organizer: boolean;
    has_submitted: boolean;
  } | null;
  is_full: boolean | null;
}

export interface ResponsePayload {
  preferred_date_ranges: { start: string; end: string }[] | null;
  ideal_budget: number | null;
  max_budget: number | null;
  preferred_types: string[];
  avoided_types: string[];
  dealbreaker_types: string[];
  wanted_activities: string[];
  avoided_activities: string[];
  notes: string | null;
}

export interface OwnResponse extends ResponsePayload {
  id: string;
  submitted_at: string;
}

/** Known, user-presentable error codes raised by RPCs and API routes. */
export const KNOWN_ERRORS = [
  "roster_full",
  "decision_closed",
  "decision_not_found",
  "decision_frozen",
  "not_a_participant",
  "invalid_response",
  "not_organizer",
  "decision_not_collecting",
  "limit_must_increase",
  "limit_out_of_range",
  "not_revealed",
  "voting_closed",
  "voting_unavailable",
  "not_a_top_option",
  "hard_excluded",
  "quorum_not_met",
  "unauthenticated",
  "server_misconfigured",
  "not_found",
] as const;
export type KnownError = (typeof KNOWN_ERRORS)[number];

export class AppError extends Error {
  constructor(
    public code: KnownError | "network" | "unknown",
    message?: string,
  ) {
    super(message ?? code);
  }
}

function toAppError(message: string | undefined): AppError {
  const m = message ?? "";
  const known = KNOWN_ERRORS.find((k) => m.includes(k));
  if (known) return new AppError(known);
  if (/violates check constraint|invalid input/i.test(m)) return new AppError("invalid_response", m);
  if (/fetch|network|Failed to fetch|timeout/i.test(m)) return new AppError("network", m);
  return new AppError("unknown", m);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  await ensureSession();
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw toAppError(error.message);
  return data as T;
}

export const api = {
  createDecision(input: { name: string; limit: number; organizerName: string; travelYear: number | null }) {
    return rpc<string>("create_decision", {
      p_name: input.name,
      p_participant_limit: input.limit,
      p_organizer_name: input.organizerName,
      p_travel_year: input.travelYear,
    });
  },
  getDecision(id: string) {
    return rpc<DecisionPublic | null>("get_decision_public", { p_decision_id: id });
  },
  join(id: string, name: string) {
    return rpc<string>("join_decision", { p_decision_id: id, p_name: name });
  },
  submit(id: string, response: ResponsePayload) {
    return rpc<{ response_id: string; status: DecisionStatus }>("submit_response", {
      p_decision_id: id,
      p_response: response,
    });
  },
  setLimit(id: string, limit: number) {
    return rpc<void>("set_participant_limit", { p_decision_id: id, p_new_limit: limit });
  },
  /** Own response history only — RLS returns nothing else. */
  async myResponses(participantId: string): Promise<OwnResponse[]> {
    await ensureSession();
    const { data, error } = await supabase()
      .from("responses")
      .select(
        "id, submitted_at, preferred_date_ranges, ideal_budget, max_budget, preferred_types, avoided_types, dealbreaker_types, wanted_activities, avoided_activities, notes",
      )
      .eq("participant_id", participantId)
      .order("seq", { ascending: false });
    if (error) throw toAppError(error.message);
    return data as OwnResponse[];
  },
  async results(id: string): Promise<SanitizedResult> {
    return serverFetch<SanitizedResult>(`/api/decisions/${id}/results`);
  },
  async explanation(id: string, signal?: AbortSignal): Promise<ExplanationPayload> {
    return serverFetch<ExplanationPayload>(`/api/decisions/${id}/explanation`, { signal });
  },
  async closeVoting(id: string) {
    return serverFetch<{ decided: true }>(`/api/decisions/${id}/close-voting`, { method: "POST", body: "{}" });
  },
  async vote(id: string, optionId: string) {
    return serverFetch<{ recorded: true; decided: boolean }>(`/api/decisions/${id}/vote`, {
      method: "POST",
      body: JSON.stringify({ optionId }),
    });
  },
};

async function serverFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await ensureSession();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new AppError("network");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw toAppError(body.error ?? `http_${res.status}`);
  return body as T;
}
