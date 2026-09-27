# Curated option dataset (V1)

The dataset lives in `supabase/migrations/20260927000002_seed_options.sql`. It
is part of the product's trust surface (§40.15), so this file records what each
field means and where its values come from.

## Definitions

- **Region / currency**: Indian domestic trips, priced in INR.
- **`cost_per_person`**: an *estimate* of the on-ground cost per person for the
  typical duration. It assumes a mid-range stay on twin sharing, food, local
  transport and the core activities. It **excludes travel to and from the
  destination**, because that depends entirely on the departure city. It is not
  live pricing (live pricing is out of scope), and every card says so.
- **`availability_windows`**: the commonly published *recommended season*
  (monsoon closures, road openings, park-zone dates), with explicit dates from
  Oct 2026 to Dec 2027. It is not a booking calendar and not a guarantee.
- **`typical_duration_days`**: a common trip length.
- **`sort_order`**: the curated deterministic order, used only as ranking
  tie-break rule 5.

Reviewed: **2026-09**. Review again before any season beyond Dec 2027.

## Per-destination notes

| Destination | Type | Season used | Basis | Cost estimate reasoning |
|---|---|---|---|---|
| Goa | beach | 15 Oct–31 May; 15 Oct–31 Dec | Monsoon Jun–Sep closes most shacks and water sports | 2026 guides quote roughly ₹18k–35k for a 3–4 day mid-range trip excluding flights. We used the low end of mid-range (₹18,000 for 4 days). |
| Gokarna | beach | 1 Oct–31 Mar | Post-monsoon to pre-summer | Guesthouses and cafés are cheaper than Goa. ~₹9,000 for 3 days. |
| Coorg | hills | 1 Oct–31 May | Very heavy rain Jun–Sep | Estate homestays. ~₹12,000 for 3 days. |
| Munnar | hills | 1 Oct–31 May; from 15 Sep 2027 | Monsoon Jun–Aug | ~₹11,000 for 3 days. |
| Rishikesh | adventure | 1 Oct–30 Jun; from 16 Sep 2027 | Commercial rafting is officially closed **1 Jul–15 Sep** (monsoon) | Riverside camp plus rafting. ~₹10,000 for 3 days. |
| Jim Corbett | wildlife | 15 Oct–15 Jun | Dhikala zone opens 15 Nov–15 Jun, Bijrani 1 Oct–30 Jun, Jhirna year-round. We used the window when **all** zones are open. | Resort plus shared jeep safaris. ~₹16,000 for 3 days. |
| Jaipur | heritage | 1 Oct–15 Mar | Very hot Apr–Jun | ~₹12,000 for 3 days. |
| Udaipur | heritage | 1 Oct–31 Mar | Hot summers | ~₹14,000 for 3 days. |
| Hampi | heritage | 15 Oct–28 Feb | Hot from March | Budget-friendly. ~₹8,000 for 3 days. |
| Alleppey | backwaters | 1 Oct–31 Mar; from 15 Sep 2027 | Post-monsoon | 2026 rates for a 1-bedroom deluxe houseboat overnight (meals included) start around ₹7,000–10,000 per couple. ~₹9,000 per person for 2 days, including one land night. |
| Spiti Valley | high_mountains | 15 Jun–10 Oct 2027 | The Manali–Kaza road via Kunzum Pass typically opens mid-June and closes around mid-October | Long shared-SUV circuit plus homestays. ~₹30,000 for 7 days. |

Sources consulted (2026) for season windows and indicative prices:

- Rishikesh rafting season: raftingcamprishikesh.com, whiteworldexpeditions.com
- Corbett zone dates: corbett-national-park.com, jimcorbettnationalpark.com
- Spiti road window: thrillophilia.com, discoverwithdheeraj.com, travelcoffee.in
- Goa trip cost: incrediblegoa.org, goaoriginals.com
- Alleppey houseboat rates: beautifulalleppey.com, alleppeygt.com

## Known limitations

- Costs are single-number estimates of a real range. Peak dates (Christmas and
  New Year) can be much higher.
- Some seasons are "recommended", not hard closures. For example, you can visit
  Jaipur in May, but it is very hot.
- The dataset is small by design. Don't add a destination unless every field
  can be supported like the rows above.
