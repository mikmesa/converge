# Security and privacy model

RLS is a real security boundary here. The database enforces the privacy
guarantees; the frontend does not filter anything.

## Identity

- Every visitor gets an invisible **Supabase anonymous auth** session, stored
  in the browser's localStorage. There are no accounts.
- A participant row links `(decision_id, auth_user_id)`, unique per decision.
- The organizer is the participant created with the decision (`is_organizer`).
  A partial unique index allows at most one per decision, and `create_decision`
  inserts both rows in one transaction.
- **No RPC accepts a `participant_id`.** Identity always comes from
  `auth.uid()`, so impersonation cannot even be expressed in a request.

## What clients can read (role `authenticated`)

| Table | Access |
|---|---|
| `participants` | own row only |
| `responses` | own rows only (full own history) |
| `votes` | own vote only |
| `decisions`, `options`, `explanation_cache` | **nothing** — no grant |

There is **no policy anywhere that lets a client SELECT another participant's
response**, before or after reveal (§36A.2, §40.11). Public decision metadata
comes from `get_decision_public()`, which returns:

- to members: the name, status and group size, plus their *own* submission
  flag. It deliberately returns no joined or submitted counts (§5, D17).
- to non-members: the name, status and an `is_full` boolean, so the join
  screen can explain itself.

## What clients can write

Nothing directly. There are no INSERT, UPDATE or DELETE grants. Every write is
a `SECURITY DEFINER` RPC:

| RPC | Rule |
|---|---|
| `create_decision` | decision + organizer participant, atomically |
| `join_decision` | only while collecting; capped at `participant_limit` (organizer counts); row-locked |
| `submit_response` | always inserts a **new** row. While collecting it can atomically trigger reveal. After reveal it clears all votes (D5). Once decided it is rejected. |
| `POST /api/decisions/:id/close-voting` (server) | organizer only, revealed with voting open, **more than half have voted**. It is irreversible and uses the same locked finalize step as the last vote. |
| `set_participant_limit` | organizer only, collecting only, **increase only** (D12). Its result never depends on joined or submitted counts. |

## The privacy boundary for cross-participant data

All cross-participant computation (tiers, ranking, sensitivity, the AI input)
runs in **one server-side path**. That is the Next.js route handlers in
`src/app/api/decisions/[id]/*`, backed by `src/lib/server/decision-service.ts`.
It:

1. verifies the caller's Supabase access token with Supabase Auth;
2. requires the caller to be a participant of that decision (non-members get
   403/404) and the decision to be revealed;
3. connects to Postgres as **`converge_server`**, a least-privilege login role:
   SELECT on the app tables, INSERT/UPDATE/DELETE on votes, UPDATE only on the
   finalize columns of `decisions`, no BYPASSRLS, and no access to `auth.*`;
4. runs the pure TypeScript engine;
5. returns only `sanitizeResult()` output: names, categories and counts. It
   contains no raw budgets, notes or history. The only exact amounts in it are
   the viewer's *own* relaxation amounts (D16).

This uses the "equivalent server-side RPC" clause of §36A.2 (decision D2). The
service-role key is not used anywhere, and nothing server-side is imported into
browser code (`import "server-only"`; `DATABASE_URL` has no `NEXT_PUBLIC_`
prefix). A build check greps the client bundle for secrets.

## Atomicity (§40.14)

Every multi-condition transition takes `SELECT … FOR UPDATE` on the decision row
inside a single transaction:

- **reveal**: in `submit_response`
- **join cap**: in `join_decision`
- **limit changes**: in `set_participant_limit`
- **voting and finalization**: in the server's vote transaction

Because they share one lock, they serialize with each other.
`tests/integration/races.test.ts` checks these under concurrency:

- simultaneous final submissions
- the last-seat join race
- simultaneous last votes
- an edit racing the last vote

## Defense in depth

Guard triggers apply to every writer, including the server role:

- responses are append-only (no UPDATE or DELETE);
- participants are immutable;
- decisions only move collecting → revealed → decided, and a decided decision
  is fully frozen;
- the limit only increases, and only while collecting;
- votes are accepted only while revealed, only from a participant of that
  decision, and **never for an option that hard-excludes the voter**;
- the server role's UPDATE policy on decisions only allows `status = 'decided'`,
  so it can finalize but can never force a reveal.

## AI

The explanation model receives `buildExplanationInput(sanitized result)`:

- option names;
- tier distributions;
- per-person categories: tier, cost, type, dates;
- activity matches, marked as context only.

It never receives budgets, notes or history (D11: notes are private to their
author and never sent to the AI). Its output is validated:

- schema-checked;
- the option set must match exactly;
- text containing currency, multi-digit numbers, percentages or scores is
  rejected.

If the output is rejected, the model call fails, or there is no API key, the
deterministic explanation still shows and nothing blocks (§40.6).

## Accepted limitations

- As §15 anticipates, anyone can loosely infer something about a budget from
  categorical fit plus the option's public cost.
- Links are bearer capabilities. Anyone with the link can join until the
  roster is full.
- There is no rate limiting beyond Supabase's anonymous sign-in limits.
  Enable CAPTCHA in Supabase Auth for public deployments.
