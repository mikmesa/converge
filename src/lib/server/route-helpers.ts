import "server-only";
import { isUuid } from "./auth";
import { ConfigError } from "./db";
import { ApiError } from "./errors";

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function requireDecisionId(id: string): string {
  if (!isUuid(id)) throw new ApiError("not_found");
  return id.toLowerCase();
}

/** Maps errors to calm, non-leaky responses. Never echoes internals. */
export function handleError(err: unknown) {
  if (err instanceof ApiError) return json({ error: err.code }, err.status);
  if (err instanceof ConfigError) return json({ error: "server_misconfigured" }, 503);
  const message = (err as { message?: string })?.message ?? "";
  // Guard-trigger errors raised inside the vote transaction.
  if (/hard_excluded_option/.test(message)) return json({ error: "hard_excluded" }, 409);
  if (/voting_closed|decision_frozen/.test(message)) return json({ error: "voting_closed" }, 409);
  console.error("[converge] unexpected error", err);
  return json({ error: "internal" }, 500);
}
