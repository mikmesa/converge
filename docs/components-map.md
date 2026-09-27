# Components Map

Rendered: [`public/components-map.svg`](../public/components-map.svg). The
deployed app also serves it at `/components-map.svg`. The SVG is generated
from this table, so edit here first and keep the two in sync.

Structure: **Actor → Trigger → Input → Context → Processing → AI → Output**

| Actor | Trigger | Input | Context | Processing | AI | Output |
|---|---|---|---|---|---|---|
| Organizer | Creates Decision | Group size + decision setup | Decision configuration | `create_decision` RPC creates the decision and the organizer participant atomically | None | Shareable link |
| Participant | Opens link | Preferences (dates, budget, types, activities, notes) | Decision public metadata (no options, no counts) | `join_decision` + `submit_response` RPCs; every edit is a new private row | None — notes are private and never sent to AI (D11 retires §23's "interpret free-text notes") | Saved private response |
| Decision Engine | All participants submitted (atomic reveal) | Structured responses + curated options (server only) | Group constraints | Hard filtering → fit tiering → lexicographic ranking → compromise sensitivity → sanitize | None | Top ≤3 group-feasible options + categorical fit matrix |
| AI Explanation Layer | Deterministic results ready | Sanitized result object (names + categories) | Fit tiers + trade-offs | Explanation generation; schema/content validated; never blocks | LLM | Plain-English compromise explanation (optional) |
| Group | Results revealed | Top options + per-person fit | Comparison context | Review + blind final vote; atomic finalize; deterministic tie-breaks | None | Selected option / no decision |

Privacy boundary: cross-participant data flows only through the server-side
engine (the `converge_server` role) and leaves as sanitized categories. See
[`security.md`](security.md).
