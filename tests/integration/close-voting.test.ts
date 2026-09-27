import { afterAll, describe, expect, it } from "vitest";
import { castVote, closeVoting, getResults } from "@/lib/server/decision-service";
import { adminSql, decisionRow, group, submit } from "./helpers";

/**
 * Organizer early close (product decision after the 10-person test): rescues
 * a group stuck on a seat that can never vote (e.g. a lost session).
 */

afterAll(async () => {
  await adminSql().end();
});

async function revealedGroup(size: number) {
  const g = await group(size);
  for (const p of g.people) await submit(p, g.decisionId, { preferred_types: ["hills"] });
  const r = await getResults(g.decisionId, g.people[0].userId);
  return { ...g, top: r.top.map((t) => t.optionId) };
}

describe("organizer closes voting early", () => {
  it("rescues a group stuck on a seat that will never vote", async () => {
    const { decisionId, people, top } = await revealedGroup(3);
    await castVote(decisionId, people[0].userId, top[0]);
    await castVote(decisionId, people[1].userId, top[0]);
    // people[2] is the "lost session" — never votes.
    expect((await decisionRow(decisionId)).status).toBe("revealed");
    await closeVoting(decisionId, people[0].userId);
    const row = await decisionRow(decisionId);
    expect(row.status).toBe("decided");
    expect(row.closed_early).toBe(true);
    expect(row.votes_cast).toBe(2);
    expect(row.final_choice_option_id).toBe(top[0]);
    const r = await getResults(decisionId, people[2].userId);
    expect(r.outcome).toMatchObject({ closedEarly: true, votesCast: 2, participantCount: 3 });
  });

  it("only the organizer can close", async () => {
    const { decisionId, people, top } = await revealedGroup(3);
    await castVote(decisionId, people[0].userId, top[0]);
    await castVote(decisionId, people[1].userId, top[0]);
    await expect(closeVoting(decisionId, people[1].userId)).rejects.toMatchObject({ code: "not_organizer" });
    expect((await decisionRow(decisionId)).status).toBe("revealed");
  });

  it("needs more than half the group to have voted (organizer can't vote and close)", async () => {
    const { decisionId, people, top } = await revealedGroup(4);
    await castVote(decisionId, people[0].userId, top[0]);
    await expect(closeVoting(decisionId, people[0].userId)).rejects.toMatchObject({ code: "quorum_not_met" });
    await castVote(decisionId, people[1].userId, top[1]);
    // 2 of 4 is exactly half — still not enough.
    await expect(closeVoting(decisionId, people[0].userId)).rejects.toMatchObject({ code: "quorum_not_met" });
    expect((await decisionRow(decisionId)).status).toBe("revealed");
    await castVote(decisionId, people[2].userId, top[1]);
    await closeVoting(decisionId, people[0].userId);
    const row = await decisionRow(decisionId);
    expect(row.final_choice_option_id).toBe(top[1]);
    expect(row.vote_tally.tally[top[1]]).toBe(2);
  });

  it("is irreversible and can't be used before reveal", async () => {
    const g = await group(3);
    await submit(g.people[0], g.decisionId, {});
    await expect(closeVoting(g.decisionId, g.people[0].userId)).rejects.toMatchObject({ code: "voting_closed" });
    const { decisionId, people, top } = await revealedGroup(3);
    await castVote(decisionId, people[0].userId, top[0]);
    await castVote(decisionId, people[1].userId, top[0]);
    await closeVoting(decisionId, people[0].userId);
    await expect(closeVoting(decisionId, people[0].userId)).rejects.toMatchObject({ code: "voting_closed" });
    await expect(castVote(decisionId, people[2].userId, top[0])).rejects.toMatchObject({ code: "voting_closed" });
  });

  it("a post-reveal edit clears votes, so a stale quorum can't be used", async () => {
    const { decisionId, people, top } = await revealedGroup(3);
    await castVote(decisionId, people[0].userId, top[0]);
    await castVote(decisionId, people[1].userId, top[0]);
    await submit(people[2], decisionId, { preferred_types: ["hills", "beach"] });
    await expect(closeVoting(decisionId, people[0].userId)).rejects.toMatchObject({ code: "quorum_not_met" });
  });

  it("racing the last vote finalizes exactly once, consistently", async () => {
    for (let round = 0; round < 4; round++) {
      const { decisionId, people, top } = await revealedGroup(3);
      await castVote(decisionId, people[0].userId, top[0]);
      await castVote(decisionId, people[1].userId, top[1]);
      const [close, vote] = await Promise.allSettled([
        closeVoting(decisionId, people[0].userId),
        castVote(decisionId, people[2].userId, top[1]),
      ]);
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("decided");
      const votes = await adminSql()`select count(*)::int as n from public.votes where decision_id = ${decisionId}`;
      expect(row.votes_cast).toBe(votes[0].n);
      const sum = Object.values(row.vote_tally.tally as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(sum).toBe(votes[0].n);
      // Exactly one of the two paths finalized; the other saw it closed.
      const finalizedByClose = close.status === "fulfilled";
      const finalizedByVote = vote.status === "fulfilled" && vote.value.decided;
      expect(Number(finalizedByClose) + Number(finalizedByVote)).toBe(1);
      expect(row.closed_early).toBe(finalizedByClose);
    }
  });
});
