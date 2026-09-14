import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type pg from "pg";

import { isRaceSkillEligible } from "../src/features/races/race-skills";

export async function readRaceSkillCleanupPlan(client: pg.Client) {
  const { rows } = await client.query<{
    id: number; race_id: number; skill_id: number; link_type: string;
    value: number | null; sort_order: number; created_at: Date; updated_at: Date;
    raceName: string; name: string; classification: string; tier: number | null;
  }>(`select l.*, r.name as "raceName", s.name, s.classification, s.tier
      from race_skill_links l join races r on r.id=l.race_id join skill s on s.id=l.skill_id
      order by l.id`);
  return {
    digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    remove: rows.filter((row) => !isRaceSkillEligible(row)),
    keep: rows.filter(isRaceSkillEligible),
  };
}

// The caller owns the transaction, table locks, backup, and commit.
export async function applyRaceSkillCleanup(client: pg.Client, expectedDigest: string) {
  const plan = await readRaceSkillCleanupPlan(client);
  assert.equal(plan.digest, expectedDigest, "Race links changed since review; create a fresh plan.");
  const ids = plan.remove.map((row) => row.id);
  const deleted = await client.query<{ id: number }>(
    "delete from race_skill_links where id=any($1::int[]) returning id", [ids],
  );
  assert.deepEqual(deleted.rows.map((row) => row.id).sort((a, b) => a - b), ids);
  const after = await readRaceSkillCleanupPlan(client);
  assert.deepEqual(after.remove, [], "Ineligible race links remain.");
  assert.deepEqual(after.keep, plan.keep, "An eligible race link changed.");
  return plan;
}
