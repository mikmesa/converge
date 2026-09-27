# Deterministic scoring rules

Converge never produces a blended numeric score. Everything below is
implemented as pure TypeScript in `src/lib/engine/` and unit tested in
`src/lib/engine/__tests__/`. The same inputs (in any order) always produce the
same output.

Only **explicitly submitted structured fields** affect the mathematics. Free-text
notes and activities never do (§16, §40.4).

## 1. Hard constraints (`evaluate.ts → evaluateHardConstraints`)

An option is excluded for a participant if either:

1. `option.cost_per_person > participant.max_budget` (equal is allowed), or
2. `option.type ∈ participant.dealbreaker_types` ("Never" in the form).

A missing maximum budget imposes no budget constraint (unknown ≠ no).

**Group-feasible** = no participant is hard-excluded. Infeasible options never
appear among the recommendations; they can appear in the sensitivity section,
labelled "Infeasible as submitted".

## 2. Soft factors

Each factor is `met`, `partial`, `unmet` — or **unknown**, which is skipped
entirely (never a neutral number, never a penalty, never a reward).

| Factor | met | partial | unmet | unknown |
|---|---|---|---|---|
| Cost | cost ≤ ideal | ideal < cost ≤ max ("stretch") | cost > max (only on infeasible options) | budgets not given |
| Type | type ∈ preferred | neither preferred nor avoided | type ∈ avoided ("Rather not") | no preferred and no avoided types |
| Dates | a submitted range is **fully contained** in an availability window | some overlap, no containment | zero overlap | no dates given |

Notes:

- **D6** — the form and the database require both budgets or neither, with
  ideal ≤ max, so "cost unknown if either budget is missing" never silently
  ignores an ideal budget.
- **D7** — a participant who gives only avoided types gets `partial` on every
  non-avoided type. Silence about a type never implies a preference. The form
  says "Only Prefer counts as a match".
- Dealbreakers are hard constraints and are not part of the type factor.
- With several participant ranges and/or several option windows, the best
  result across all pairs is used.
- Because MET means containment, a participant range means *the trip itself*,
  not "I'm free during this span". The form copy says so.

## 3. Individual tiers (`evaluate.ts → tierFor`)

Counted over submitted (non-unknown) factors only:

| Tier | Rule |
|---|---|
| Insufficient Input | zero scorable factors |
| Strong Fit | ≥1 scorable factor, all met |
| Acceptable Compromise | exactly one partial/unmet |
| Conflict | two or more partial/unmet |

A participant who submitted only their name (or only dealbreakers or activities)
is Insufficient Input. Their dealbreakers still apply as hard constraints.

**Insufficient Input is not a tier count** (§36A.5, §40.9). It is excluded from
the Strong, Compromise and Conflict counts, the overshoot sum and the overlap
sum, and is shown separately ("1 Insufficient Input").

## 4. Group ranking (`ranking.ts`) — exact lexicographic order

Only group-feasible options are ranked:

1. Fewest participants in Conflict.
2. Most participants in Strong Fit.
3. Lowest total budget overshoot: Σ `max(0, cost − ideal)` over participants
   with an ideal budget.
4. Highest total date overlap (§40.3). For each participant, take the
   **maximum inclusive** overlap (in calendar days) across every
   (participant range × option window) pair, then sum across participants.
   Unknown dates contribute 0. For example, 2026‑06‑10→15 against 2026‑06‑12→20
   overlaps on the 12th, 13th, 14th and 15th, which is 4 days.
5. `options.sort_order` ascending (the curated order, §36A.7).

The top 3 are shown. If fewer are feasible, fewer are shown; they are never
padded (§40.10). The UI states which rule separated each option from the one
above it. When rule 5 decides, it says the order follows the curated list, not
preference.

The highest-ranked option is labelled **engine recommendation** ("best fit by
the rules"). It is not the group's decision (§40.7).

## 5. Compromise sensitivity (`sensitivity.ts`)

**When it runs:** there are zero feasible options, or no feasible option is
**All-Strong**. All-Strong (D10) means at least one participant is Strong and
every participant with sufficient input is Strong.

**What it tries:** exactly one relaxation, for one participant, at a time:

| Lever | Operation | Size |
|---|---|---|
| A — remove dealbreaker | drop one "Never" type | none |
| B — raise max budget | raise the max by exactly `cost − max`, only where that participant's budget is the **only** hard exclusion across the whole group for that option (§36A.8) | ₹ increase |
| C — shift dates (D8) | move one submitted range, keeping its length, by the minimum number of days that puts it fully inside an availability window of a feasible option | days |
| D — relax avoided type | drop one "Rather not" type | none |

**Why C is a shift, not a widening.** Widening a range can never create
containment: a wider range is harder to contain. So widening can only move
dates from UNMET to PARTIAL, and tiers count those two the same. A test proves
this null result (`sensitivity.test.ts`).

**Why D rarely fires.** Removing an avoided type moves the type factor from
UNMET to PARTIAL, which changes no tier. The one exception is when that avoided
type was the participant's only type input. Then the factor becomes unknown and
is skipped, which can improve their tier. Both cases are tested and documented.

**Useful** (§40.2): a lever is kept only if it makes an option newly
group-feasible, makes a feasible option newly All-Strong, or improves the
relaxing participant's tier on a feasible option.

**Large (D9).** There is no arbitrary multiplier. A change is large when it is
large relative to the participant's *own* input:

- **B** is large when the increase is bigger than their own (max − ideal) spread.
- **C** is large when the shift is longer than the range being shifted.
- **A and D** have no size.

Large levers are ranked below non-large ones.

**Deterministic order** (top 3 surfaced):

1. Non-large first.
2. More newly-feasible options.
3. More newly All-Strong options.
4. More tier improvements.
5. Fewer tier regressions.
6. Kind: A, B, C, D.
7. Smaller size.
8. Participant join order.
9. Target (option `sort_order`, or type name).

**Privacy.** The group sees "A budget relaxation for one participant would…",
with no name and no amount. The participant a lever concerns sees their own
exact change privately under **"Just for you"** (D16). That is a permanent
rule: it uses only their own data.

## 6. Final vote (`vote.ts`)

Voting is blind. No counts, no tallies and no "who has voted" until the last
vote is in. Each participant votes for one of the current top (≤3) options,
and never for an option that hard-excludes them. This is checked in the server
transaction and again by a database trigger.

Resolution:

1. Most votes wins.
2. Tie → more Strong Fit participants.
3. Still tied → fewer Conflict participants.
4. Still tied → **No decision — final vote remained tied.**

There is no randomness and no array-order winner. A post-reveal response
edit clears all votes (D5), because the options may have changed.

**Organizer early close.** This was a product decision after the 10-person
test. A seat that can never vote, such as a lost session, would otherwise
block the decision forever. The organizer may therefore close voting, subject
to these rules:

- It is only allowed while voting is open.
- **More than half** of the participants must already have voted.
- It is irreversible.

Non-voters are not counted, and the same tie-break rules apply. The outcome
states that voting was closed early and how many people voted, but never who.
The control is always visible to the organizer, so it reveals nothing. A
refused attempt only tells them "fewer than half have voted".
