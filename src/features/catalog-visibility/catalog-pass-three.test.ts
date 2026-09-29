import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonManifest } from "./canon-manifest";
import { orderCatalogLineage } from "./catalog-lineage";
import manifest from "../../../data/canon/catalog-classification-manifest.json";
import human from "../../../data/canon/serrian-tide-human-skill-system.json";

test("the pinned manifest covers exact roots, current Human Skill identities, and only six evidenced Derived Abilities", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(canonManifest).map(([key, rows]) => [key, rows.length])), { race: 56, creature: 90, skill: 1137, derivedAbility: 6 });
  for (const rows of Object.values(canonManifest)) assert.equal(new Set(rows.map((row) => `${row.sourceSystem}/${row.externalId}`)).size, rows.length);
  for (const row of human.records) {
    const identity = manifest.skill.find((entry) => "humanSkillId" in entry && entry.humanSkillId === row.id);
    assert.equal(identity?.name, row.name);
    assert.match(identity!.externalId, /^skill-[a-f0-9]{64}$/);
  }
  assert.equal(manifest.skill.filter((row) => "humanSkillId" in row).length, 637);
  const baseline = readFileSync("drizzle/0000_serrian_tide_baseline.sql", "utf8");
  for (const row of canonManifest.derivedAbility) assert.ok(baseline.includes(`'${row.name}', '', '', '${row.sourceSystem}', '${row.externalId}'`));
  for (const id of ["VAR-HORSE-DRAFT", "VAR-HORSE-LIGHT", "VAR-HORSE-PONY"]) assert.ok(canonManifest.creature.some((row) => row.externalId === id));
  assert.ok(!("item" in canonManifest));
});

test("nested lineage is ordered once, with bounded cycle handling and no inferred siblings", () => {
  const rows = [{ id: 3, parentId: 2, name: "Mine" }, { id: 1, parentId: null, name: "Root" }, { id: 2, parentId: 1, name: "Middle" }];
  const ordered = orderCatalogLineage(rows);
  assert.deepEqual(ordered.map((row) => [row.id, row.depth, row.parentName]), [[1, 0, null], [2, 1, "Root"], [3, 2, "Middle"]]);
  assert.deepEqual(rows.map((row) => row.id), [3, 1, 2]);
  assert.equal(orderCatalogLineage([{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }]).length, 2);
});

test("authoring filtering uses one server predicate while retained game references stay outside it", () => {
  for (const folder of ["races", "creatures", "skills", "derived-abilities"]) {
    const actions = readFileSync(`src/app/heavens/${folder}/actions.ts`, "utf8");
    assert.match(actions, /getCatalogManagementState\(session\.user\.id/);
    assert.match(actions, /catalogBrowseWhere/);
  }
  for (const file of ["src/app/characters/actions.ts", "src/features/creatures/creature-npc-constructor-service.ts", "src/features/derived-abilities/character-derived-ability-service.ts", "src/features/skills/recursive-skill-library-service.ts", "src/app/heavens/campaigns/actions.ts", "src/app/heavens/items/actions.ts"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /catalogBrowseWhere|catalogVisibilityPredicate|getCatalogBrowseState/, file);
  }
});
