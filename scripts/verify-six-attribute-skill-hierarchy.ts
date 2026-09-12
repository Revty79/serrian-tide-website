import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import {
  buildRecursiveSkillLibrary,
  validateCanonicalSkillPath,
  type RecursiveSkillDefinition,
  type CanonicalSkillParentRelationship,
} from "../src/features/skills/recursive-skill-library";

type PlanRecord = { id: number; attribute: string; name: string; tier: number; definition: string; parentId: number | null };
async function main() {
  const plan = JSON.parse(await readFile("data/canon/serrian-tide-six-attribute-skill-rebuild.json", "utf8")) as {
    sourceSha256: string;
    records: PlanRecord[];
    reviewedDevelopmentBaseline: { database: string; preservedNameCollisions: { targetId: number; otherId: number; finalName: string }[] };
  };
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname));
  assert.equal(databaseUrl.pathname.slice(1), plan.reviewedDevelopmentBaseline.database);
  assert.ok(databaseUrl.pathname.endsWith("_dev"));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const skills = (await client.query<RecursiveSkillDefinition>(`select id, name, tier, classification, definition,
      primary_attribute as "primaryAttribute", secondary_attribute as "secondaryAttribute",
      source_system as "sourceSystem", source_external_id as "sourceExternalId" from skill order by id`)).rows;
    const relationships = (await client.query<CanonicalSkillParentRelationship>(`select id, skill_id as "skillId", related_skill_id as "relatedSkillId",
      relationship_type as "relationshipType", sort_order as "sortOrder" from skill_relationship order by id`)).rows;
    const library = buildRecursiveSkillLibrary(skills, relationships);
    const brokenGraphReasons = library.reviewReasons.filter(({ code }) => ["cycle", "broken-parent", "broken-child", "duplicate-skill-identity", "duplicate-relationship"].includes(code));
    assert.deepEqual(brokenGraphReasons, []);
    const targetById = new Map(plan.records.map((row) => [row.id, row]));
    const attributeCounts: Record<string, number[]> = {};
    for (const target of plan.records) {
      const actual = skills.find(({ id }) => id === target.id)!;
      assert.equal(actual.name, target.name);
      assert.equal(actual.definition, target.definition);
      assert.equal(actual.tier, target.tier);
      const expectedIds: number[] = [];
      let ancestor: PlanRecord | undefined = target;
      while (ancestor) {
        expectedIds.unshift(ancestor.id);
        ancestor = ancestor.parentId === null ? undefined : targetById.get(ancestor.parentId);
      }
      const result = validateCanonicalSkillPath(target.id, skills, relationships);
      assert.equal(result.valid, true, `Invalid canonical Skill path #${target.id}`);
      assert.deepEqual(result.rootToEndpoint.map(({ id }) => id), expectedIds);
      assert.equal(result.fallbackAttribute, target.attribute);
      const counts = attributeCounts[target.attribute] ??= [0, 0, 0];
      counts[target.tier - 1]++;
    }
    assert.deepEqual(attributeCounts, { STR: [6, 18, 54], DEX: [10, 34, 99], CON: [7, 21, 63], INT: [8, 24, 72], WIS: [9, 27, 81], CHA: [8, 24, 72] });
    const names = new Map<string, number[]>();
    for (const row of skills) names.set(row.name.trim().toLowerCase(), [...names.get(row.name.trim().toLowerCase()) ?? [], row.id]);
    const actualCollisions = [...names].filter(([, ids]) => ids.length > 1).map(([name, ids]) => ({ name, ids })).sort((a, b) => a.name.localeCompare(b.name));
    const expectedCollisions = plan.reviewedDevelopmentBaseline.preservedNameCollisions.map(({ targetId, otherId, finalName }) => ({ name: finalName.toLowerCase(), ids: [targetId, otherId].sort((a, b) => a - b) })).sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(actualCollisions, expectedCollisions);
    const report = { checkedAt: new Date().toISOString(), database: databaseUrl.pathname.slice(1), transaction: "read only", sourceSha256: plan.sourceSha256, matchedWorkbookRecords: plan.records.length, verifiedCanonicalPaths: plan.records.length, attributeTierCounts: attributeCounts, brokenGraphReasons, duplicateNamesStillForHumanReview: actualCollisions, humanAcceptance: "Not performed", production: "Not inspected or modified" };
    await client.query("rollback");
    await writeFile("artifacts/skill-rebuild/hierarchy-verification.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
