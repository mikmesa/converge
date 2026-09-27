import { afterAll, describe, expect, it } from "vitest";
import { adminSql, decisionRow, expectRpcError, group, join, person, rpc, submit } from "./helpers";

/**
 * D12 + the follow-up check: raising participant_limit never triggers reveal
 * on its own, never rescues a decision stuck on a silent participant, and
 * leaks nothing about submission progress.
 */

afterAll(async () => {
  await adminSql().end();
});

const setLimit = (p: Awaited<ReturnType<typeof person>>, id: string, n: number) =>
  rpc(p, "set_participant_limit", { p_decision_id: id, p_new_limit: n });

describe("participant_limit changes", () => {
  it("stuck decision: raising the limit does not reveal and does not change the outcome", async () => {
    // limit 3, all 3 joined, only 2 submitted — the third never will.
    const { decisionId, people } = await group(3);
    const [org, b] = people;
    await submit(org, decisionId, {});
    await submit(b, decisionId, {});
    const before = await decisionRow(decisionId);

    await setLimit(org, decisionId, 4);
    const after = await decisionRow(decisionId);
    expect(after.status).toBe("collecting");
    expect(after.revealed_at).toBeNull();
    expect({ ...after, participant_limit: 3 }).toEqual(before); // nothing else changed

    // A 4th person joins and submits: 3 of 4 submitted — still stuck.
    const d = await person("D");
    await join(d, decisionId);
    await submit(d, decisionId, {});
    expect((await decisionRow(decisionId)).status).toBe("collecting");
  });

  it("returns an identical result regardless of how many have submitted (no probe signal)", async () => {
    const g1 = await group(3, 5);
    const g2 = await group(3, 5);
    await submit(g2.people[1], g2.decisionId, {});
    await submit(g2.people[2], g2.decisionId, {});
    const r1 = await g1.people[0].client.rpc("set_participant_limit", { p_decision_id: g1.decisionId, p_new_limit: 6 });
    const r2 = await g2.people[0].client.rpc("set_participant_limit", { p_decision_id: g2.decisionId, p_new_limit: 6 });
    expect(JSON.stringify({ data: r1.data, error: r1.error, status: r1.status })).toBe(
      JSON.stringify({ data: r2.data, error: r2.error, status: r2.status }),
    );
    // And the rejection for a decrease is also identical.
    const e1 = await g1.people[0].client.rpc("set_participant_limit", { p_decision_id: g1.decisionId, p_new_limit: 4 });
    const e2 = await g2.people[0].client.rpc("set_participant_limit", { p_decision_id: g2.decisionId, p_new_limit: 4 });
    expect(e1.error?.message).toBe("limit_must_increase");
    expect(e2.error?.message).toBe(e1.error?.message);
  });

  it("increase while responses exist: existing responses stay, reveal waits for the new count", async () => {
    const { decisionId, people } = await group(3);
    await submit(people[0], decisionId, {});
    await submit(people[1], decisionId, {});
    await setLimit(people[0], decisionId, 4);
    await submit(people[2], decisionId, {});
    expect((await decisionRow(decisionId)).status).toBe("collecting");
    const late = await person("Late");
    await join(late, decisionId);
    await submit(late, decisionId, {});
    expect((await decisionRow(decisionId)).status).toBe("revealed");
    const own = await people[0].client.from("responses").select("id");
    expect(own.data!.length).toBe(1); // earlier response untouched, no resubmit needed
  });

  it("rejects decreases (even to exactly the joined count), values over 8, and non-organizers", async () => {
    const { decisionId, people } = await group(3, 5);
    await expectRpcError(setLimit(people[0], decisionId, 3), "limit_must_increase");
    await expectRpcError(setLimit(people[0], decisionId, 5), "limit_must_increase");
    await expectRpcError(setLimit(people[0], decisionId, 9), "limit_out_of_range");
    await expectRpcError(setLimit(people[1], decisionId, 6), "not_organizer");
  });

  it("the limit is frozen once revealed", async () => {
    const { decisionId, people } = await group(3);
    for (const p of people) await submit(p, decisionId, {});
    await expectRpcError(setLimit(people[0], decisionId, 4), "decision_not_collecting");
  });
});
