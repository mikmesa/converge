import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { castVote, getResults } from "@/lib/server/decision-service";
import {
  adminSql,
  anonymousNoSession,
  createDecision,
  decisionRow,
  expectRpcError,
  group,
  join,
  optionId,
  person,
  rpc,
  submit,
} from "./helpers";

afterAll(async () => {
  await adminSql().end();
});

const BUDGET_A = { ideal_budget: 13579, max_budget: 24681 };

describe("RLS: responses", () => {
  it("participant can read own response and history; never another's (before and after reveal)", async () => {
    const { decisionId, people } = await group(3);
    const [a, b, c] = people;
    await submit(a, decisionId, { ...BUDGET_A, notes: "private note A" });
    await submit(a, decisionId, { ...BUDGET_A, notes: "edited A" }); // edit = new row
    await submit(b, decisionId, { notes: "private note B" });

    const own = await a.client.from("responses").select("*");
    expect(own.error).toBeNull();
    expect(own.data!.length).toBe(2);
    expect(own.data!.every((r) => r.notes?.includes("A"))).toBe(true);

    const bView = await b.client.from("responses").select("*");
    expect(bView.data!.map((r) => r.notes)).toEqual(["private note B"]);
    // Explicit attempt to read A's rows by participant id returns nothing.
    const aPid = (await a.client.from("participants").select("id")).data![0].id;
    const direct = await b.client.from("responses").select("*").eq("participant_id", aPid);
    expect(direct.data).toEqual([]);

    // Reveal, then check again.
    await submit(c, decisionId, {});
    expect((await decisionRow(decisionId)).status).toBe("revealed");
    const after = await b.client.from("responses").select("*").eq("participant_id", aPid);
    expect(after.data).toEqual([]);
    const cView = await c.client.from("responses").select("notes");
    expect(cView.data!.map((r) => r.notes)).toEqual([null]);
  });

  it("every edit creates a new row; old rows are never overwritten", async () => {
    const { decisionId, people } = await group(3);
    await submit(people[0], decisionId, { preferred_types: ["beach"] });
    await submit(people[0], decisionId, { preferred_types: ["hills"] });
    const rows = (await people[0].client.from("responses").select("preferred_types").order("submitted_at")).data!;
    expect(rows.map((r) => r.preferred_types)).toEqual([["beach"], ["hills"]]);
  });

  it("direct INSERT/UPDATE/DELETE on responses is denied for clients", async () => {
    const { decisionId, people } = await group(3);
    const [a, b] = people;
    await submit(a, decisionId, { notes: "x" });
    const bPid = (await b.client.from("participants").select("id")).data![0].id;
    // Try to forge a response for another participant.
    const forged = await a.client.from("responses").insert({ participant_id: bPid, notes: "forged" });
    expect(forged.error).not.toBeNull();
    const upd = await a.client.from("responses").update({ notes: "changed" }).neq("id", "00000000-0000-0000-0000-000000000000");
    expect(upd.error).not.toBeNull();
    const del = await a.client.from("responses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    expect(del.error).not.toBeNull();
    const count = await adminSql()`select count(*)::int as n from public.responses r join public.participants p on p.id = r.participant_id where p.decision_id = ${decisionId}`;
    expect(count[0].n).toBe(1);
  });

  it("submit_response ignores any participant_id in the payload (no impersonation)", async () => {
    const { decisionId, people } = await group(3);
    const [a, b] = people;
    const bPid = (await b.client.from("participants").select("id")).data![0].id;
    await submit(a, decisionId, { notes: "mine", participant_id: bPid } as never);
    const rows = await adminSql()`
      select p.auth_user_id from public.responses r join public.participants p on p.id = r.participant_id
      where p.decision_id = ${decisionId}`;
    expect(rows.map((r) => r.auth_user_id)).toEqual([a.userId]);
  });

  it("a non-member cannot submit to a decision", async () => {
    const { decisionId } = await group(3);
    const outsider = await person("Outsider");
    await expectRpcError(submit(outsider, decisionId, {}), "not_a_participant");
  });
});

describe("RLS: other tables", () => {
  it("clients cannot read decisions, options, other participants or the explanation cache", async () => {
    const { people } = await group(3);
    const a = people[0];
    for (const table of ["decisions", "options", "explanation_cache"]) {
      const r = await a.client.from(table).select("*");
      expect(r.error, table).not.toBeNull();
    }
    const parts = await a.client.from("participants").select("*");
    expect(parts.data!.length).toBe(1);
    expect(parts.data![0].auth_user_id).toBe(a.userId);
  });

  it("clients cannot modify participants or decisions", async () => {
    const { decisionId, people } = await group(3);
    const [, b] = people;
    const r1 = await b.client.from("participants").update({ is_organizer: true }).eq("decision_id", decisionId);
    expect(r1.error).not.toBeNull();
    const r2 = await b.client.from("decisions").update({ status: "revealed" }).eq("id", decisionId);
    expect(r2.error).not.toBeNull();
    const r3 = await b.client.from("participants").insert({ decision_id: decisionId, auth_user_id: b.userId, name: "dup" });
    expect(r3.error).not.toBeNull();
  });

  it("clients can read only their own vote, and cannot write votes directly", async () => {
    const { decisionId, people } = await group(3);
    for (const p of people) await submit(p, decisionId, {});
    const goa = await optionId("goa");
    await castVote(decisionId, people[0].userId, goa);
    const own = await people[0].client.from("votes").select("*");
    expect(own.data!.length).toBe(1);
    const other = await people[1].client.from("votes").select("*");
    expect(other.data).toEqual([]);
    const pid = (await people[1].client.from("participants").select("id")).data![0].id;
    const direct = await people[1].client.from("votes").insert({ decision_id: decisionId, participant_id: pid, option_id: goa });
    expect(direct.error).not.toBeNull();
  });

  it("requests without a session are rejected", async () => {
    const noSession = anonymousNoSession();
    const r = await noSession.rpc("create_decision", { p_name: "x", p_participant_limit: 3, p_organizer_name: "x" });
    expect(r.error).not.toBeNull();
    const s = await noSession.from("responses").select("*");
    expect(s.data ?? []).toEqual([]);
  });

  it("the server role cannot read auth tables or escalate", async () => {
    const server = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      await expect(server`select * from auth.users limit 1`).rejects.toThrow();
      await expect(server`insert into public.responses (participant_id) values (gen_random_uuid())`).rejects.toThrow();
      await expect(server`update public.decisions set name = 'x'`).rejects.toThrow();
    } finally {
      await server.end();
    }
  });
});

describe("pre-reveal privacy", () => {
  it("get_decision_public exposes no joined/submitted counts to members", async () => {
    const { decisionId, people } = await group(4, 5);
    await submit(people[1], decisionId, {});
    const view = await rpc<Record<string, unknown>>(people[0], "get_decision_public", { p_decision_id: decisionId });
    expect(view.is_full).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/count|submitted_count|joined/);
    expect((view.member as Record<string, unknown>).has_submitted).toBe(false);
    // The organizer's view is byte-identical whether 0 or 1 others submitted.
    const { decisionId: d2, people: p2 } = await group(4, 5);
    const v2 = await rpc<Record<string, unknown>>(p2[0], "get_decision_public", { p_decision_id: d2 });
    const strip = (v: Record<string, unknown>) =>
      JSON.stringify({ ...v, id: null, member: { ...(v.member as object), participant_id: null } });
    expect(strip(view)).toBe(strip(v2));
  });

  it("results are unavailable to everyone before reveal", async () => {
    const { decisionId, people } = await group(3);
    await submit(people[0], decisionId, {});
    await submit(people[1], decisionId, {});
    await expect(getResults(decisionId, people[0].userId)).rejects.toMatchObject({ code: "not_revealed" });
  });

  it("non-members never get results, even after reveal", async () => {
    const { decisionId, people } = await group(3);
    for (const p of people) await submit(p, decisionId, {});
    const outsider = await person("Outsider");
    await expect(getResults(decisionId, outsider.userId)).rejects.toMatchObject({ code: "not_a_participant" });
  });
});

describe("post-reveal visibility", () => {
  it("results contain names and categories but never raw budgets or notes", async () => {
    const { decisionId, people } = await group(3);
    await submit(people[0], decisionId, { ...BUDGET_A, notes: "secret-note-xyz", preferred_types: ["beach"] });
    await submit(people[1], decisionId, { ideal_budget: 11213, max_budget: 17319 });
    await submit(people[2], decisionId, {});
    const r = await getResults(decisionId, people[1].userId);
    const json = JSON.stringify(r);
    expect(json).not.toContain("13579");
    expect(json).not.toContain("24681");
    expect(json).not.toContain("secret-note-xyz");
    expect(r.participants.map((p) => p.name)).toEqual(["P1", "P2", "P3"]);
  });

  it("D13: the activity indicator only reflects edits made after reveal", async () => {
    const { decisionId, people } = await group(3);
    await submit(people[0], decisionId, {});
    await submit(people[0], decisionId, { preferred_types: ["beach"] }); // pre-reveal edit
    await submit(people[1], decisionId, {});
    await submit(people[2], decisionId, {}); // triggers reveal
    let r = await getResults(decisionId, people[1].userId);
    expect(r.participants.every((p) => p.updatedAfterRevealAt === null)).toBe(true);
    await submit(people[0], decisionId, { preferred_types: ["hills"] });
    r = await getResults(decisionId, people[1].userId);
    expect(r.participants[0].updatedAfterRevealAt).not.toBeNull();
    expect(r.participants[1].updatedAfterRevealAt).toBeNull();
  });
});

describe("roster and join rules", () => {
  it("join is capped at participant_limit (organizer counts)", async () => {
    const { decisionId } = await group(3);
    const late = await person("Late");
    await expectRpcError(join(late, decisionId), "roster_full");
  });

  it("joining after reveal is rejected and the roster is frozen", async () => {
    const organizer = await person("Org");
    const decisionId = await createDecision(organizer, 3);
    const b = await person("B");
    const c = await person("C");
    await join(b, decisionId);
    await join(c, decisionId);
    for (const p of [organizer, b, c]) await submit(p, decisionId, {});
    const late = await person("Late");
    await expectRpcError(join(late, decisionId), "decision_closed");
  });

  it("join is idempotent for an existing member", async () => {
    const { decisionId, people } = await group(3);
    const again = await join(people[1], decisionId);
    const pid = (await people[1].client.from("participants").select("id")).data![0].id;
    expect(again).toBe(pid);
  });

  it("exactly one organizer; names need not be unique", async () => {
    const organizer = await person("Sam");
    const decisionId = await createDecision(organizer, 3);
    const other = await person("Sam");
    await join(other, decisionId);
    const rows = await adminSql()`select name, is_organizer from public.participants where decision_id = ${decisionId} order by join_seq`;
    expect(rows.map((r) => [r.name, r.is_organizer])).toEqual([["Sam", true], ["Sam", false]]);
    await expect(
      adminSql()`insert into public.participants (decision_id, auth_user_id, name, is_organizer) values (${decisionId}, ${other.userId}, 'x', true)`,
    ).rejects.toThrow();
  });
});

describe("invalid input", () => {
  it("rejects malformed responses", async () => {
    const { decisionId, people } = await group(3);
    const p = people[0];
    const bad = [
      { ideal_budget: 20000, max_budget: 10000 }, // ideal > max
      { ideal_budget: 20000 }, // D6: one budget only
      { preferred_types: ["beach"], avoided_types: ["beach"] }, // overlap
      { preferred_types: ["moon"] }, // unknown type
      { wanted_activities: ["skydiving"] },
      { preferred_date_ranges: [{ start: "2026-12-10", end: "2026-12-01" }] },
      { preferred_date_ranges: [{ start: "2026-02-30", end: "2026-03-02" }] },
      { preferred_date_ranges: [{ start: "tomorrow", end: "2026-03-02" }] },
      { ideal_budget: "lots", max_budget: 5 },
      { notes: "x".repeat(1001) },
    ];
    for (const b of bad) {
      await expectRpcError(submit(p, decisionId, b as never), "invalid_response");
    }
    expect((await p.client.from("responses").select("id")).data).toEqual([]);
  });

  it("rejects invalid decision setup", async () => {
    const a = await person("A");
    await expectRpcError(createDecision(a, 2), "check");
    await expectRpcError(createDecision(a, 9), "check");
    await expectRpcError(createDecision(a, 4, ""), "check");
  });
});

describe("hard-excluded votes and frozen decisions", () => {
  it("a hard-excluded option cannot be voted for — at the service and database layers", async () => {
    const { decisionId, people } = await group(3);
    await submit(people[0], decisionId, { dealbreaker_types: ["beach"] });
    await submit(people[1], decisionId, {});
    await submit(people[2], decisionId, {});
    const goa = await optionId("goa");
    await expect(castVote(decisionId, people[0].userId, goa)).rejects.toMatchObject({ code: "not_a_top_option" });

    // Even the server role writing directly is stopped by the guard trigger.
    const server = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const pid = (await people[0].client.from("participants").select("id")).data![0].id;
    try {
      await expect(
        server`insert into public.votes (decision_id, participant_id, option_id) values (${decisionId}, ${pid}, ${goa})`,
      ).rejects.toThrow(/hard_excluded_option/);
    } finally {
      await server.end();
    }
  });

  it("responses are immutable after decided", async () => {
    const { decisionId, people } = await group(3);
    for (const p of people) await submit(p, decisionId, { preferred_types: ["hills"] });
    const r = await getResults(decisionId, people[0].userId);
    const pick = r.top[0].optionId;
    for (const p of people) await castVote(decisionId, p.userId, pick);
    expect((await decisionRow(decisionId)).status).toBe("decided");
    await expectRpcError(submit(people[0], decisionId, {}), "decision_frozen");
    await expect(castVote(decisionId, people[0].userId, pick)).rejects.toMatchObject({ code: "voting_closed" });
  });
});

describe("server role limits", () => {
  it("the server role can finalize but can never force a reveal", async () => {
    const { decisionId, people } = await group(3);
    await submit(people[0], decisionId, {});
    const server = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      await server`update public.decisions set status = 'revealed' where id = ${decisionId}`.catch(() => null);
      expect((await decisionRow(decisionId)).status).toBe("collecting");
    } finally {
      await server.end();
    }
  });
});
