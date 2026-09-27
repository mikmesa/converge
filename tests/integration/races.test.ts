import { afterAll, describe, expect, it } from "vitest";
import { castVote, getResults } from "@/lib/server/decision-service";
import { adminSql, createDecision, decisionRow, group, join, person, submit } from "./helpers";

/**
 * Concurrency at the atomic-transition boundary (§40.14, D2). Every
 * multi-condition transition takes a row lock on the decision, so these
 * scenarios must resolve to exactly one consistent outcome.
 */

afterAll(async () => {
  await adminSql().end();
});

describe("simultaneous final submissions", () => {
  it("N people submitting at once as the Nth response → exactly one reveal", async () => {
    for (let round = 0; round < 3; round++) {
      const { decisionId, people } = await group(6);
      const results = await Promise.all(people.map((p) => submit(p, decisionId, {})));
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("revealed");
      // Exactly one submission observed the transition.
      const observers = results.filter((r) => r.status === "revealed");
      expect(observers.length).toBe(1);
      // revealed_at is set once and is not after the last submission.
      const lastSubmit = await adminSql()`
        select max(r.submitted_at) as at from public.responses r
        join public.participants p on p.id = r.participant_id where p.decision_id = ${decisionId}`;
      expect(row.revealed_at.getTime()).toBeGreaterThanOrEqual(lastSubmit[0].at.getTime() - 1);
    }
  });

  it("concurrent submissions short of the limit never reveal early", async () => {
    const { decisionId, people } = await group(5, 6);
    await Promise.all(people.map((p) => submit(p, decisionId, {})));
    expect((await decisionRow(decisionId)).status).toBe("collecting");
  });

  it("concurrent edits by the same person never cause an early reveal", async () => {
    const { decisionId, people } = await group(3);
    await Promise.all(Array.from({ length: 6 }, () => submit(people[0], decisionId, {})));
    await submit(people[1], decisionId, {});
    expect((await decisionRow(decisionId)).status).toBe("collecting");
  });
});

describe("simultaneous joins", () => {
  it("several people racing for the last seat → exactly one gets it", async () => {
    const organizer = await person("Org");
    const decisionId = await createDecision(organizer, 3);
    await join(await person("B"), decisionId);
    const racers = await Promise.all(Array.from({ length: 5 }, (_, i) => person(`R${i}`)));
    const outcomes = await Promise.allSettled(racers.map((r) => join(r, decisionId)));
    expect(outcomes.filter((o) => o.status === "fulfilled").length).toBe(1);
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === "rejected");
    expect(rejected.every((o) => /roster_full/.test(o.reason.message))).toBe(true);
    const n = await adminSql()`select count(*)::int as n from public.participants where decision_id = ${decisionId}`;
    expect(n[0].n).toBe(3);
  });
});

describe("simultaneous final votes", () => {
  it("everyone voting at once as the last vote → finalized exactly once, consistent tally", async () => {
    for (let round = 0; round < 3; round++) {
      const { decisionId, people } = await group(5);
      for (const p of people) await submit(p, decisionId, { preferred_types: ["hills"] });
      const r = await getResults(decisionId, people[0].userId);
      const choices = r.top.map((t) => t.optionId);
      const outcomes = await Promise.all(
        people.map((p, i) => castVote(decisionId, p.userId, choices[i % choices.length])),
      );
      expect(outcomes.filter((o) => o.decided).length).toBe(1);
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("decided");
      const votes = await adminSql()`select option_id from public.votes where decision_id = ${decisionId}`;
      const tallySum = Object.values(row.vote_tally.tally as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(tallySum).toBe(votes.length);
      expect(votes.length).toBe(5);
    }
  });

  it("a post-reveal edit racing the last vote resolves to one consistent state", async () => {
    let sawDecided = 0;
    let sawCleared = 0;
    for (let round = 0; round < 6; round++) {
      const { decisionId, people } = await group(3);
      for (const p of people) await submit(p, decisionId, { preferred_types: ["hills"] });
      const r = await getResults(decisionId, people[0].userId);
      const pick = r.top[0].optionId;
      await castVote(decisionId, people[0].userId, pick);
      await castVote(decisionId, people[1].userId, pick);

      const [edit, vote] = await Promise.allSettled([
        submit(people[0], decisionId, { preferred_types: ["hills", "beach"] }),
        castVote(decisionId, people[2].userId, pick),
      ]);
      const row = await decisionRow(decisionId);
      const votes = await adminSql()`select participant_id from public.votes where decision_id = ${decisionId}`;

      if (row.status === "decided") {
        // Vote won the lock: the edit must have been rejected, tally = 3 votes.
        sawDecided++;
        expect(edit.status).toBe("rejected");
        expect(String((edit as PromiseRejectedResult).reason.message)).toMatch(/decision_frozen/);
        expect(votes.length).toBe(3);
        expect(Object.values(row.vote_tally.tally as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(3);
      } else {
        // Edit won the lock: all votes cleared (D5); the late vote may land after.
        sawCleared++;
        expect(row.status).toBe("revealed");
        expect(edit.status).toBe("fulfilled");
        expect(votes.length).toBeLessThanOrEqual(1);
        if (vote.status === "fulfilled") expect(vote.value.decided).toBe(false);
      }
    }
    expect(sawDecided + sawCleared).toBe(6);
  });
});
