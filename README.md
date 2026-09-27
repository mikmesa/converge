# Converge

**A deterministic group decision engine, demonstrated as a trip planner.**

Groups of 3–8 people often can't converge on a decision. The problem isn't a
lack of options: preferences live in chat, people anchor on whoever spoke
first, and nobody can see what compromise would actually unlock a decision.
Converge makes the disagreement legible:

1. Everyone answers a short form **privately**: dates, budget, kinds of places,
   activities.
2. Nobody sees anything until everyone has answered. That includes answers,
   submission counts, timestamps and who is still missing.
3. The **results reveal to everyone at once**. Fixed, published rules decide
   which options work for everyone, how each option fits each person, and
   which single change would unlock another option.
4. The group casts a **blind vote**. Ties are broken deterministically, or the
   outcome is honestly "No decision".

The engine never shows a blended score. Instead of "87/100" you see
"3 Strong Fit · 1 Acceptable Compromise · 1 Conflict". The AI only rephrases
facts the engine has already produced. It never ranks, never scores and never
sees anyone's budget.

The core is domain-neutral: *decisions, participants, responses, options,
votes*. The UI calls options "destinations".

---

## Architecture

```
Browser (Next.js client, publishable key only, anonymous Supabase session)
  ├─ Postgres RPCs (SECURITY DEFINER, identity = auth.uid())
  │    create_decision · get_decision_public · join_decision
  │    submit_response (atomic reveal) · set_participant_limit (increase only)
  ├─ RLS reads: own participant row, own responses, own vote — nothing else
  └─ Next.js route handlers (server only)
       GET  /api/decisions/:id/results      engine → sanitized result
       POST /api/decisions/:id/vote         blind vote + atomic finalize
       GET  /api/decisions/:id/explanation  optional AI prose (never blocks)
            │  verify JWT → require membership → Postgres as `converge_server`
            ▼
     src/lib/engine/*   (pure TypeScript: hard constraints → factors → tiers →
                         ranking → sensitivity → vote resolution → sanitize)
```

- **`src/lib/engine/`** is the deterministic engine. It is plain data in and
  plain data out, with no React, network or Supabase. It is exhaustively unit
  tested.
- **`src/lib/server/`** holds the only code that can read raw responses. It
  runs each request in one DB transaction (row-locked for votes) and returns
  only `sanitizeResult()` output.
- **`supabase/migrations/`** contains the schema, RLS, RPCs, guard triggers and
  the curated dataset.
- **`src/components/`** is the mobile-first UI.

Further reading:

- [`docs/scoring.md`](docs/scoring.md): the exact deterministic rules
- [`docs/security.md`](docs/security.md): the RLS and privacy model
- [`docs/dataset.md`](docs/dataset.md): the curated data and its sources
- [`docs/components-map.md`](docs/components-map.md) and [`public/components-map.svg`](public/components-map.svg): the Components Map

## Local setup

Requirements: Node 22+, Docker (for the local Supabase stack), `psql`.

```bash
cd converge
npm install
npm run db:start          # local Supabase (Postgres + Auth + REST) in Docker
npm run db:reset          # apply migrations + seed + set the local server-role password
cp .env.example .env.local
# fill .env.local with the values printed by `npx supabase status`
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
#   DATABASE_URL=postgresql://converge_server:converge-local-dev@127.0.0.1:54322/postgres
npm run dev
```

Anonymous sign-ins are enabled for local development in
`supabase/config.toml` (`enable_anonymous_sign_ins = true`).

## Supabase setup (hosted)

1. Create a project.
2. **Enable anonymous sign-ins:** Dashboard → Authentication → Sign In /
   Providers → *Allow anonymous sign-ins*. Consider enabling CAPTCHA (Auth →
   Attack protection) for a public deployment.
3. Apply the migrations in `supabase/migrations/` in order. Use
   `npx supabase link` then `npx supabase db push`, or paste them into the SQL
   editor.
4. Give the least-privilege server role a password. Use a long random value,
   and set it per environment, never in a migration:
   ```sql
   alter role converge_server with login password '<random>';
   ```
5. Build `DATABASE_URL` from the **Supavisor transaction pooler** string
   (Dashboard → Connect → Transaction pooler), replacing the user with
   `converge_server`:
   `postgresql://converge_server.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`

The app never uses the service-role key.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | publishable (anon) key |
| `DATABASE_URL` | **server only** | Postgres as `converge_server` via the pooler |
| `ANTHROPIC_API_KEY` | **server only**, optional | enables AI explanations; without it the app shows "Explanation unavailable right now." |
| `ANTHROPIC_MODEL` | server only, optional | defaults to `claude-opus-5` |

See [`.env.example`](.env.example). Never commit real values.

## Tests

```bash
npm test                  # unit tests: engine, copy, validation, rules (pure, fast)
npm run test:integration  # real Supabase: RLS, impersonation, blind reads, races, limit rules
npm run build && npm run test:e2e   # Playwright, mobile + desktop, multi-person flows
```

- **Unit tests** (`src/**/__tests__`) cover every deterministic function:
  hard constraints, unknowns, tiers, dates (the inclusive overlap example from
  §40.3), every ranking rule, every sensitivity lever (including the
  documented null result for "widening" dates), vote resolution, the
  sanitizer's privacy guarantees and the limit-increase invariants.
- **Integration tests** (`tests/integration`) need the local stack (or set
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `DATABASE_URL` and `TEST_ADMIN_DATABASE_URL`). They cover:
  - own vs. other reads before and after reveal
  - forged inserts and impersonation
  - join cap and closed roster
  - invalid input
  - hard-excluded votes, rejected even at the DB layer
  - immutability once decided
  - server-role limits
  - simultaneous final submissions, last-seat joins and last votes
  - an edit racing the last vote
  - the "raising the limit never reveals or un-sticks" check
- **End-to-end** (`e2e/`): create → join → blind submit → reveal → matrix →
  explanation → blind vote → outcome; zero-feasible → levers → edit → voting
  opens; invalid and unknown links; no horizontal scroll on mobile. If
  Playwright's bundled browser isn't installed, set `PW_CHROMIUM_PATH`.

## Deployment (Vercel)

The Next.js app lives in the `converge/` subdirectory of this repository.

1. Import the GitHub repository in Vercel.
2. Set **Root Directory = `converge`**. The framework preset is detected as
   Next.js.
3. Add the environment variables above (Production and Preview).
4. Deploy.

## Known V1 limitations

- **Lost sessions can't be recovered.** Identity is an anonymous session in
  this browser's storage. If it's cleared, or the person switches device, they
  come back as a new visitor: they can join again if there's room, or they see
  "roster full" / "closed". Their old response stays private and is never
  merged, and nobody is matched by name or device (§36A.10, §40.13).
- **A silent participant can stall a decision.** Someone who joins but never
  submits keeps the decision from revealing. Raising the limit doesn't help,
  because their seat still counts, and there is intentionally no "remove
  participant" feature: it would let the organizer probe who has submitted
  (D3). The same applies after reveal: final voting needs everyone (D4). The
  group can start a new decision.
- **A tied final vote is final.** "No decision" freezes the decision; start a
  new one to vote again.
- **Costs are estimates** of the on-ground cost excluding travel to the
  destination, and seasons are recommended windows. Neither is live data
  ([`docs/dataset.md`](docs/dataset.md)).
- **Notes are private to their author** and are never shown to anyone else or
  sent to the AI (D11). §23's "interpret free-text notes into structured
  fields" is intentionally not implemented.
- The per-person matrix is designed for 3–8 people.
- Anyone with the link can join until the roster is full.

## Potential future features (not built)

- AI summaries of notes, with the author's explicit consent.
- A personal "resume link" to restore a lost session on another device.
- Revealing who voted for what after a decision, as a per-group choice.
- An ideal-budget relaxation lever in the sensitivity engine.
