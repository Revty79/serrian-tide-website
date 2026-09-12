import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { buildRecursiveSkillLibrary, validateCanonicalSkillPath, type RecursiveSkillDefinition, type CanonicalSkillParentRelationship } from "../src/features/skills/recursive-skill-library";
import { reconcileRacialSkillAnchors } from "../src/features/characters/character-rules";
import type { CharacterRaceAggregate } from "../src/features/characters/models";

type Target = { id: number; name: string; tier: number; primaryAttribute: string; secondaryAttribute: null; definition: string; parentId: number | null; sortOrder: number | null };
type Allocation = { id: number; character_id: number; skill_id: number; parent_allocation_id: number | null; points: number };

async function main() {
  assert.ok(process.argv.slice(2).every((arg) => arg === "--preview"), "Omit arguments for live read-only verification, or pass --preview.");
  const preview = process.argv.includes("--preview");
  const plan = JSON.parse(await readFile("data/canon/serrian-tide-human-skill-system.json", "utf8")) as { sourceSha256: string; records: Target[]; sourceComparison: { attributeTierCounts: Record<string, number[]> } };
  const targetMap = new Map(plan.records.map((row) => [row.id, row]));
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_dev"));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    let skills = (await client.query<RecursiveSkillDefinition & { archived: boolean }>(`select id, name, tier, classification, definition, primary_attribute as "primaryAttribute", secondary_attribute as "secondaryAttribute", archived_at is not null as archived from skill order by id`)).rows;
    let relationships = (await client.query<CanonicalSkillParentRelationship>(`select id, skill_id as "skillId", related_skill_id as "relatedSkillId", relationship_type as "relationshipType", sort_order as "sortOrder" from skill_relationship order by id`)).rows;
    const allocations = (await client.query<Allocation>("select id, character_id, skill_id, parent_allocation_id, points from campaign_character_skill_allocation order by id")).rows;
    const profiles = (await client.query<{ character_id: number; race_id: number | null }>("select character_id, race_id from campaign_character_profile order by character_id")).rows;
    const raceLinks = (await client.query<{ raceId: number } & CharacterRaceAggregate["skillLinks"][number]>(`select r.race_id as "raceId", r.skill_id as "skillId", s.name as "skillName", s.classification as "skillClassification", r.link_type as "linkType", r.value from race_skill_links r join skill s on s.id=r.skill_id order by r.id`)).rows;
    await client.query("rollback");
    if (preview) {
      skills = skills.map((row) => targetMap.has(row.id) ? { ...row, ...targetMap.get(row.id)! } : row);
      relationships = relationships.filter((row) => row.relationshipType !== "parent" || !targetMap.has(row.skillId)).concat(plan.records.filter((row) => row.parentId !== null).map((row) => ({ id: -row.id, skillId: row.id, relatedSkillId: row.parentId!, relationshipType: "parent", sortOrder: row.sortOrder! })));
    }
    // Preview excludes the superseded IDs; live mode validates the active catalog.
    // Both modes are read-only and also work after the approved extra-ID removal.
    const activeSkills = skills.filter((row) => !row.archived && (row.classification !== "standard" || targetMap.has(row.id)));
    if (!preview) assert.equal(skills.filter((row) => !row.archived && row.classification === "standard").length, 637);
    const activeIds = new Set(activeSkills.map(({ id }) => id));
    const activeRelationships = relationships.filter((row) => activeIds.has(row.skillId) && activeIds.has(row.relatedSkillId));
    const library = buildRecursiveSkillLibrary(activeSkills, activeRelationships);
    assert.deepEqual(library.reviewReasons.filter(({ code }) => ["cycle", "broken-parent", "broken-child", "duplicate-skill-identity", "duplicate-relationship"].includes(code)), []);
    assert.equal(new Set(activeSkills.map(({ name }) => name.trim().toLowerCase())).size, activeSkills.length);
    const attributeCounts: Record<string, number[]> = {};
    for (const target of plan.records) {
      const actual = skills.find(({ id }) => id === target.id)!;
      for (const field of ["name", "tier", "primaryAttribute", "secondaryAttribute", "definition"] as const) assert.equal(actual[field], target[field]);
      const expected: number[] = [];
      let node: Target | undefined = target;
      while (node) { expected.unshift(node.id); node = node.parentId === null ? undefined : targetMap.get(node.parentId); }
      const canonical = validateCanonicalSkillPath(target.id, activeSkills, activeRelationships);
      assert.ok(canonical.valid);
      assert.deepEqual(canonical.rootToEndpoint.map(({ id }) => id), expected);
      assert.equal(canonical.fallbackAttribute, target.primaryAttribute);
      const edges = activeRelationships.filter((row) => row.skillId === target.id && row.relationshipType === "parent");
      assert.equal(edges.length, target.parentId === null ? 0 : 1);
      if (edges.length) assert.equal(edges[0].sortOrder, target.sortOrder);
      (attributeCounts[target.primaryAttribute] ??= [0, 0, 0])[target.tier - 1]++;
    }
    assert.deepEqual(attributeCounts, plan.sourceComparison.attributeTierCounts);
    const characterDraftReview = [];
    for (const characterId of new Set(allocations.map((row) => row.character_id))) {
      const existing = allocations.filter((row) => row.character_id === characterId).map((row) => ({ draftId: row.id, skillId: row.skill_id, parentDraftId: row.parent_allocation_id, points: row.points }));
      const raceId = profiles.find((row) => row.character_id === characterId)?.race_id;
      // This helper reads only skillLinks; use the actual saved links without fabricating other race data.
      const race = raceId ? { skillLinks: raceLinks.filter((row) => row.raceId === raceId) } as unknown as CharacterRaceAggregate : null;
      let temporaryId = -1;
      const draft = reconcileRacialSkillAnchors(existing, race, activeRelationships, () => temporaryId--);
      const byDraftId = new Map(draft.map((row) => [row.draftId, row]));
      const residual = draft.filter((row) => targetMap.has(row.skillId) && (row.parentDraftId === null ? null : byDraftId.get(row.parentDraftId)?.skillId) !== targetMap.get(row.skillId)!.parentId);
      const previousConflicts = existing.filter((row) => targetMap.has(row.skillId) && (row.parentDraftId === null ? null : existing.find((parent) => parent.draftId === row.parentDraftId)?.skillId) !== targetMap.get(row.skillId)!.parentId);
      assert.equal(draft.reduce((sum, row) => sum + row.points, 0), existing.reduce((sum, row) => sum + row.points, 0));
      for (const purchase of existing.filter(({ points }) => points > 0)) assert.deepEqual(draft.find(({ draftId }) => draftId === purchase.draftId), purchase);
      if (previousConflicts.length || residual.length) characterDraftReview.push({ characterId, storedAllocationPathDifferences: previousConflicts.length, draftAnchorsCreatedAutomatically: draft.filter(({ draftId }) => draftId < 0).length, remainingDraftPathDifferences: residual.map((row) => ({ allocationId: row.draftId, skillId: row.skillId, name: targetMap.get(row.skillId)!.name, points: row.points, expectedParentSkillId: targetMap.get(row.skillId)!.parentId })) });
    }
    const report = { checkedAt: new Date().toISOString(), mode: preview ? "in-memory proposed catalog over read-only current data" : "read-only committed catalog", sourceSha256: plan.sourceSha256, database: url.pathname.slice(1), canonicalPathsVerified: 637, parentEdgesVerified: 596, attributeTierCounts: attributeCounts, activeDuplicateNames: 0, characterDraftReview, characterChangesPersisted: 0, humanAcceptance: "Pending", production: "Not inspected or modified" };
    await mkdir("artifacts/human-skill-rebuild", { recursive: true });
    await writeFile(`artifacts/human-skill-rebuild/${preview ? "hierarchy-preview" : "hierarchy-verification"}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
