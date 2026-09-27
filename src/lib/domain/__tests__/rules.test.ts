import { describe, expect, it } from "vitest";
import { applyLimitIncrease, canJoin, closeQuorumMet, revealEligible } from "../rules";
import { ACTIVITIES, OPTION_TYPES } from "../taxonomy";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

describe("participant_limit increases (D12)", () => {
  it("rejects every decrease and every non-increase", () => {
    for (let cur = 3; cur <= 8; cur++) {
      for (let next = 1; next <= cur; next++) {
        expect(applyLimitIncrease(cur, next).ok).toBe(false);
      }
    }
  });
  it("rejects values above 8", () => {
    expect(applyLimitIncrease(5, 9)).toEqual({ ok: false, reason: "limit_out_of_range" });
  });

  /**
   * An increase can never trigger reveal on its own, nor rescue a decision
   * stuck on a silent participant: for every reachable state
   * (old ≥ joined ≥ submitted) and every valid new limit, reveal stays false.
   */
  it("raising the limit never makes reveal eligible and never un-sticks a stuck decision", () => {
    for (let oldLimit = 3; oldLimit <= 8; oldLimit++) {
      for (let joined = 0; joined <= oldLimit; joined++) {
        for (let submitted = 0; submitted <= joined; submitted++) {
          if (revealEligible(submitted, oldLimit)) continue; // would already be revealed
          for (let newLimit = 1; newLimit <= 10; newLimit++) {
            const r = applyLimitIncrease(oldLimit, newLimit);
            if (!r.ok) continue;
            expect(revealEligible(submitted, r.limit)).toBe(false);
            // A stuck decision (someone joined but never submits) stays stuck
            // even if every new seat fills and submits: the silent seat keeps
            // submitted strictly below the limit.
            if (joined === oldLimit && submitted < joined) {
              const newcomers = r.limit - joined;
              expect(revealEligible(submitted + newcomers, r.limit)).toBe(false);
            }
          }
        }
      }
    }
  });
});

describe("join cap (§36A.3)", () => {
  it("allows joins below the limit and rejects at the limit", () => {
    expect(canJoin(4, 5)).toBe(true);
    expect(canJoin(5, 5)).toBe(false);
  });
});

describe("taxonomy is in sync with the database CHECK constraints", () => {
  const dir = path.resolve(import.meta.dirname, "../../../../supabase/migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  it("every option type appears in the migration type list", () => {
    const m = /converge_option_types\(\)[\s\S]*?array\[([^\]]+)\]/.exec(sql);
    expect(m).not.toBeNull();
    const dbTypes = m![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect(dbTypes).toEqual([...OPTION_TYPES]);
  });
  it("every activity appears in the migration activity list", () => {
    const m = /converge_activities\(\)[\s\S]*?array\[([^\]]+)\]/.exec(sql);
    expect(m).not.toBeNull();
    const dbActs = m![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect(dbActs).toEqual([...ACTIVITIES]);
  });
});

describe("organizer early close quorum", () => {
  it("needs MORE than half of the participants to have voted", () => {
    expect(closeQuorumMet(1, 3)).toBe(false);
    expect(closeQuorumMet(2, 3)).toBe(true);
    expect(closeQuorumMet(4, 8)).toBe(false);
    expect(closeQuorumMet(5, 8)).toBe(true);
    expect(closeQuorumMet(7, 8)).toBe(true);
  });
  it("an organizer's lone vote can never close voting (groups are 3–8)", () => {
    for (let n = 3; n <= 8; n++) expect(closeQuorumMet(1, n)).toBe(false);
  });
});
