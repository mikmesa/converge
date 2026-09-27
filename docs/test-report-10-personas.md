# 10-person exploratory test — 2026-09-27

**Build under test:** commit `db4ddd6` (the one deployed to converge-pi.vercel.app),
run on a local copy with the same code and migrations. The production database's
functions were checksummed against the local copy: identical apart from comments.
**Script:** `scripts/ten-people.mjs`. Each person is a separate browser (their own
anonymous identity) with their own device, habits and typing style.

## The people

| Person | Device | How they behaved |
|---|---|---|
| Riya | desktop | Organizer. Careful, types slowly, first clicks Create with the form empty, raises the group size 6 → 8 |
| Siddharth | Pixel 7 | Terse. Types budgets as "₹8,000" / "12,000"; heritage lover; "Never" high mountains |
| Karan | iPhone SE | Sloppy. Name with spaces ("  karan  "), types budgets as "15k" / "20k"; edits after reveal |
| Aisha | iPad | Submits only her name; tries to submit while offline |
| Preethi | Galaxy S9+ | Indecisive. End-before-start dates, one budget only, ideal > max, refreshes mid-form, 3 edits, 3 date ranges |
| Arjun | Pixel 5 | Submits, then clears browser data and opens the link again |
| Meera | desktop, dark mode | 46-character emoji name, pastes an 1,100-character note, "Never" beach |
| Dev | desktop | Keyboard only; later organizes a second decision using the name "Riya" (duplicate) |
| Zoya | 320 px phone | Late joiner; later part of a 4-way tie test |
| Kabir | Moto G4 | Pastes mangled links; joins after results are out |

Three decisions were run:

- **A:** 8 people, the main scenario.
- **B:** 4 people, set up to produce a vote tie.
- **C:** 3 people, a clean decision that picks a plan.

## What worked

- **Blind until everyone answers.** No destinations, costs, counts, names or
  timestamps are shown before reveal, for any person.
- **Reveal.** It fired exactly when the 8th seat submitted; two people submitted
  at the same moment.
- **Privacy after reveal.** No private budget or note appeared anywhere on 7
  results pages: only "within budget / stretch", never numbers.
- **Validation.** Every invalid input got a clear message:
  - dates that end before they start
  - one budget only
  - ideal budget above the maximum
  - notes over 1,000 characters
  - an empty create form
- **Offline.** Offline submit gave "We couldn't reach the server. Your answers
  are still here". Retrying worked.
- **Roster rules.**
  - Raising the group size worked, and it can't be lowered.
  - Late joiners saw "closed to new people".
  - Mangled links saw "This link doesn't look right" or "doesn't exist".
- **Editing after reveal.** Others saw "karan’s response was updated just now"
  with no details, the results recomputed, and votes restarted.
- **Blind voting.** No counts or leader were shown while voting; changing a
  vote worked.
- **Outcomes.**
  - The tie produced "No decision — final vote remained tied."
  - Decision C produced "Hampi was selected 2–1. No tie-break was required." It
    showed the engine recommendation separately from the group's decision.
- **Frozen once decided.** "Edit my response" disappears once the group has
  decided.
- **Layout.** No horizontal scrolling on any device, down to 320 px. Dark mode
  renders correctly.
- **Errors.** There were no console or server errors apart from the expected
  offline and 404 cases.

## Bugs found

| # | Severity | Bug | Status |
|---|---|---|---|
| 1 | **High** | Typing "15k" silently saved **₹15** (letters were stripped). Karan's ₹20 maximum made *every* destination infeasible for the whole group, and his private suggestion read "raise your max from ₹20 to ₹12,000". | **Fixed.** Amounts like "15k", "1.5L", "₹15,000" and "Rs. 8000/-" are now understood. Anything under ₹500 is blocked as a likely typo. A live "Saved as ₹15,000 ideal · ₹20,000 maximum" preview is shown. |
| 2 | Medium | Refreshing mid-form wiped every half-filled answer. | **Fixed.** Unsubmitted answers are kept on the device, with a "We kept your unsaved answers — Discard them" notice. |
| 3 | **High (design limit)** | Clearing browser data, or opening the link in a different browser or app (for example WhatsApp's built-in browser, then Chrome), makes you a **new person**. Arjun ended up in two seats. The ghost seat can never vote, so **decision A can never finish voting.** | **Mitigated.** The join screen and waiting page now say to use the same browser every time. **Not fixable within the agreed V1 rules** (no recovery, no organizer override). Needs a product decision; see below. |
| 4 | Low | Names were cut at 40 characters without warning. | **Fixed.** A "characters left" hint appears near the limit. |
| 5 | Low (a11y) | The group-size and place-type buttons had no arrow-key support, so keyboard users picked the wrong size. | **Fixed.** They're now native radio groups: Tab reaches the group, arrow keys choose. |
| 6 | Low | The "Travel year" hint promised to set the date pickers' starting year, but it did nothing. | **Fixed.** The hint is now accurate, and the year is shown on the form. |
| 7 | Low | A budget error stayed on screen after the amount was corrected. | **Fixed.** It clears as you type. |

## Observations (not bugs)

- Names are shown exactly as typed ("karan", or "Riya" twice in one group).
  Duplicate names are allowed by design. Consider showing an initial or colour
  to tell them apart.
- When one person's typo blocks everything, all three group suggestions are
  about that one person. That is correct, but the page gets long, with 6
  "Infeasible as submitted" cards.
- AI explanations weren't exercised: the local copy has no API key, so it
  showed "Explanation unavailable right now" as designed.
- The option detail page reloads results on each visit, so it shows a brief
  "Loading…".

## Follow-up decision (resolved)

For bug 3 you chose **option 2**: the organizer can close voting early. As
built:

- It works only once **more than half** the group has voted.
- It is irreversible.
- Non-voters aren't counted.
- The outcome says "The organizer closed voting early: N of M people voted".

It is covered by integration tests (quorum, organizer-only, irreversibility,
edit-clears-votes, racing the last vote) and by an end-to-end test.
