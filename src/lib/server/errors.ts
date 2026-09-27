export type ApiErrorCode =
  | "unauthenticated"
  | "invalid_request"
  | "not_found"
  | "not_a_participant"
  | "not_revealed"
  | "voting_closed"
  | "voting_unavailable"
  | "not_a_top_option"
  | "hard_excluded"
  | "not_organizer"
  | "quorum_not_met"
  | "server_misconfigured"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  invalid_request: 400,
  not_found: 404,
  not_a_participant: 403,
  not_revealed: 403,
  voting_closed: 409,
  voting_unavailable: 409,
  not_a_top_option: 409,
  hard_excluded: 409,
  not_organizer: 403,
  quorum_not_met: 409,
  server_misconfigured: 503,
  internal: 500,
};

export class ApiError extends Error {
  constructor(public code: ApiErrorCode) {
    super(code);
  }
  get status() {
    return STATUS[this.code];
  }
}
