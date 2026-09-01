import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCharacterHp } from "@/features/characters/character-rules";

import {
  CREATURE_SIZE_ATTRIBUTE_MULTIPLIERS,
  getCreatureHpPercentageStatus,
  normalizeCreatureHpSnapshot,
  resolveCreatureHitLocationMaximumHp,
  resolveCreatureHpModel,
  resolveCreatureHpPoolMaximum,
  resolveCreatureTotalMaximumHp,
  resolveEffectiveCreatureStatistics,
  type CreatureStatisticsSource,
} from "./creature-size-rules";

function source(
  size = "Medium",
  overrides: Partial<CreatureStatisticsSource["core"]> = {},
): CreatureStatisticsSource {
  return {
    core: {
      size,
      hpMultiplierSteps: 0,
      baseMovementSteps: 0,
      baseMagicSteps: 0,
      ...overrides,
    },
    attributes: [
      { attributeKey: "Strength", value: 40 },
      { attributeKey: "Dexterity", value: 35 },
      { attributeKey: "Constitution", value: 40 },
      { attributeKey: "Intelligence", value: 30 },
      { attributeKey: "Wisdom", value: 25 },
      { attributeKey: "Charisma", value: 20 },
    ],
    movement: [{ movementMode: "Land", movementValue: 6 }],
  };
}

test("the canonical Creature Size table uses Medium as the baseline", () => {
  assert.deepEqual(CREATURE_SIZE_ATTRIBUTE_MULTIPLIERS, {
    Minuscule: 0.25,
    Tiny: 0.5,
    Small: 0.75,
    Medium: 1,
    Large: 1.25,
    Huge: 1.5,
    Gargantuan: 1.75,
    Colossal: 2,
  });
});

test("all effective Attributes scale without premature rounding", () => {
  const huge = resolveEffectiveCreatureStatistics(source("Huge"));
  const small = resolveEffectiveCreatureStatistics(source("Small"));
  const medium = resolveEffectiveCreatureStatistics(source());

  assert.equal(huge.attributeValues.Strength, 60);
  assert.equal(small.attributeValues.Constitution, 30);
  assert.equal(small.attributeValues.Dexterity, 26.25);
  assert.deepEqual(
    medium.attributes.map(({ baseValue, effectiveValue }) => [baseValue, effectiveValue]),
    medium.attributes.map(({ baseValue }) => [baseValue, baseValue]),
  );
});

test("effective-stat resolution never mutates authored Creature values", () => {
  const authored = source("Huge");
  const before = structuredClone(authored);
  resolveEffectiveCreatureStatistics(authored);
  assert.deepEqual(authored, before);
});

test("Creature Total HP delegates effective CON and steps to Character HP rules", () => {
  const creature = source("Huge", { hpMultiplierSteps: 3 });
  const result = resolveEffectiveCreatureStatistics(creature);
  assert.equal(result.effectiveConstitution, 60);
  assert.equal(result.hpMultiplier, 2.75);
  assert.equal(result.calculatedTotalMaximumHp, getCharacterHp(60, 3));
});

test("custom Creature HP Pools use final Total HP percentages", () => {
  assert.equal(resolveCreatureHpPoolMaximum(100, 10), 10);
  assert.equal(resolveCreatureHpPoolMaximum(82, 40), 33);
  assert.equal(resolveCreatureHpPoolMaximum(100, 50), 50);
});

test("the authoritative HP model calculates persisted master totals and Pool maxima", () => {
  const authoredPools = [
    { canonicalId: "BODY", hpPercentage: 70, poolName: "Body" },
    { canonicalId: "TAIL", hpPercentage: 30, poolName: "Tail" },
  ];
  const before = structuredClone(authoredPools);
  const model = resolveCreatureHpModel(source("Large", { hpMultiplierSteps: 2 }), authoredPools);

  assert.equal(model.calculatedTotalHp, getCharacterHp(50, 2));
  assert.equal(model.finalTotalHp, model.calculatedTotalHp);
  assert.deepEqual(
    model.pools.map(({ maximumHp }) => maximumHp),
    [
      resolveCreatureHpPoolMaximum(model.finalTotalHp, 70),
      resolveCreatureHpPoolMaximum(model.finalTotalHp, 30),
    ],
  );
  assert.deepEqual(authoredPools, before);
});

test("NPC HP Adjustment changes only final total and recalculated Pool maxima", () => {
  const master = resolveCreatureHpModel(source(), [{ canonicalId: "BODY", hpPercentage: 100 }]);
  const npc = resolveCreatureHpModel(source(), [{ canonicalId: "BODY", hpPercentage: 100 }], 9);

  assert.equal(npc.calculatedTotalHp, master.calculatedTotalHp);
  assert.equal(npc.finalTotalHp, (master.finalTotalHp ?? 0) + 9);
  assert.equal(npc.pools[0]?.maximumHp, npc.finalTotalHp);
  assert.equal(master.pools[0]?.maximumHp, master.finalTotalHp);
});

test("missing Constitution leaves total and Pool maxima unset", () => {
  const creature = source();
  creature.attributes = creature.attributes.filter(({ attributeKey }) => attributeKey !== "Constitution");
  const model = resolveCreatureHpModel(creature, [{ canonicalId: "BODY", hpPercentage: 100 }]);
  assert.equal(model.calculatedTotalHp, null);
  assert.equal(model.pools[0]?.maximumHp, null);
});

test("an old NPC snapshot without calculated HP fields normalizes without rejection", () => {
  const oldSnapshot = {
    ...source("Huge", { hpMultiplierSteps: 1 }),
    core: { ...source("Huge", { hpMultiplierSteps: 1 }).core },
    hpPools: [{ canonicalId: "BODY", hpPercentage: 100 }],
    snapshotName: "legacy",
  };
  const normalized = normalizeCreatureHpSnapshot(oldSnapshot, 4);

  assert.equal(Object.hasOwn(oldSnapshot.core, "totalHp"), false);
  assert.equal(Object.hasOwn(oldSnapshot.hpPools[0]!, "maximumHp"), false);
  assert.equal(normalized.core.totalHp, getCharacterHp(60, 1));
  assert.equal(normalized.hpPools[0]?.maximumHp, normalized.core.totalHp + 4);
  assert.equal(normalized.snapshotName, "legacy");
});

test("calculated HP normalization overwrites stale client or snapshot values", () => {
  const stale = {
    ...source(),
    core: { ...source().core, totalHp: 9999 },
    hpPools: [{ canonicalId: "BODY", hpPercentage: 15, maximumHp: 9999 }],
  };
  const normalized = normalizeCreatureHpSnapshot(stale);

  assert.equal(normalized.core.totalHp, getCharacterHp(40, 0));
  assert.equal(
    normalized.hpPools[0]?.maximumHp,
    resolveCreatureHpPoolMaximum(normalized.core.totalHp, 15),
  );
  assert.equal(stale.core.totalHp, 9999);
  assert.equal(stale.hpPools[0]?.maximumHp, 9999);
});

test("HP allocation status warns without blocking incomplete authoring", () => {
  assert.deepEqual(getCreatureHpPercentageStatus([
    { hpPercentage: 60 },
    { hpPercentage: 30 },
  ]), { totalPercentage: 90, complete: false });
  assert.deepEqual(getCreatureHpPercentageStatus([
    { hpPercentage: 60 },
    { hpPercentage: 40 },
  ]), { totalPercentage: 100, complete: true });
  assert.equal(getCreatureHpPercentageStatus([{ hpPercentage: null }]).complete, false);
});

test("shared Hit Locations display the same assigned persisted Pool maximum", () => {
  const model = resolveCreatureHpModel(source(), [
    { canonicalId: "RIGHT-LEG", hpPercentage: 20 },
    { canonicalId: "LEFT-LEG", hpPercentage: 20 },
  ]);
  const first = resolveCreatureHitLocationMaximumHp("RIGHT-LEG", model.pools);
  const second = resolveCreatureHitLocationMaximumHp("right-leg", model.pools);
  assert.equal(first, second);
  assert.equal(first, model.pools[0]?.maximumHp);
  assert.equal(resolveCreatureHitLocationMaximumHp(null, model.pools), null);
});

test("individual HP Adjustment is final, additive, and cannot produce negative HP", () => {
  const creature = source();
  const calculated = getCharacterHp(40, 0);
  assert.equal(resolveCreatureTotalMaximumHp(creature, 8), calculated + 8);
  assert.equal(resolveCreatureTotalMaximumHp(creature, -7), calculated - 7);
  assert.equal(resolveCreatureTotalMaximumHp(creature, -10_000), 0);
});

test("an NPC Size override changes only its cloned snapshot statistics", () => {
  const master = source("Medium");
  const npc = structuredClone(master);
  npc.core.size = "Colossal";

  assert.equal(resolveEffectiveCreatureStatistics(master).attributeValues.Constitution, 40);
  assert.equal(resolveEffectiveCreatureStatistics(npc).attributeValues.Constitution, 80);
  assert.equal(master.core.size, "Medium");
});

test("Creature movement and Base Magic reuse the Character quarter-step scale", () => {
  const result = resolveEffectiveCreatureStatistics(source("Medium", {
    baseMovementSteps: 3,
    baseMagicSteps: 2,
  }));
  assert.equal(result.baseMovementBonus, 0.75);
  assert.equal(result.movement[0]?.baseValue, 6);
  assert.equal(result.movement[0]?.effectiveValue, 6.75);
  assert.equal(result.baseMagicBonus, 0.5);
});

test("Creature modifier steps reject negative and fractional values", () => {
  assert.throws(
    () => resolveEffectiveCreatureStatistics(source("Medium", { hpMultiplierSteps: -1 })),
    /whole number zero or greater/,
  );
  assert.throws(
    () => resolveEffectiveCreatureStatistics(source("Medium", { baseMovementSteps: 0.5 })),
    /whole number zero or greater/,
  );
  assert.throws(
    () => resolveEffectiveCreatureStatistics(source("Medium", { baseMagicSteps: -2 })),
    /whole number zero or greater/,
  );
});

test("an existing Medium zero-step Creature remains mechanically compatible", () => {
  const result = resolveEffectiveCreatureStatistics(source());
  assert.equal(result.sizeMultiplier, 1);
  assert.equal(result.hpMultiplier, 2);
  assert.equal(result.movement[0]?.effectiveValue, 6);
  assert.equal(result.calculatedTotalMaximumHp, getCharacterHp(40, 0));
});

test("the forward migration only adds safe zero-default Creature modifier fields", () => {
  const migration = readFileSync("drizzle/0003_creature_effective_statistics.sql", "utf8");
  for (const column of ["hp_multiplier_steps", "base_movement_steps", "base_magic_steps"]) {
    assert.match(migration, new RegExp(`ADD COLUMN "${column}" integer DEFAULT 0 NOT NULL`));
  }
  assert.equal(/DROP|DELETE|TRUNCATE|UPDATE/i.test(migration), false);
  assert.equal(migration.includes("campaign_character_active_health"), false);
  assert.equal(migration.includes("campaign_character_injury"), false);
});

test("the additive persisted HP migration is nullable and contains no data rewrite", () => {
  const migration = readFileSync("drizzle/0004_persisted_creature_hp.sql", "utf8");
  assert.match(migration, /ADD COLUMN "total_hp" integer/);
  assert.match(migration, /ADD COLUMN "maximum_hp" integer/);
  assert.match(migration, /total_hp" IS NULL OR/);
  assert.match(migration, /maximum_hp" IS NULL OR/);
  assert.equal(/DROP|DELETE|TRUNCATE|UPDATE/i.test(migration), false);
});

test("the controlled HP backfill imports the canonical model and is dry-run by default", () => {
  const backfill = readFileSync("scripts/backfill-creature-hp.ts", "utf8");
  assert.match(backfill, /import \{ resolveCreatureHpModel \}/);
  assert.match(backfill, /process\.argv\.includes\("--apply"\)/);
  assert.match(backfill, /await client\.query\("rollback"\)/);
  assert.equal(backfill.includes("Math.ceil"), false);
  assert.equal(backfill.includes("getCharacterHp"), false);
});

test("master save/load, lineage, and NPC snapshots carry all modifier steps", () => {
  const masterActions = readFileSync("src/app/heavens/creatures/actions.ts", "utf8");
  const npcActions = readFileSync("src/app/heavens/npcs/actions.ts", "utf8");
  const constructor = readFileSync("src/features/creatures/creature-npc-constructor-service.ts", "utf8");

  for (const field of ["hpMultiplierSteps", "baseMovementSteps", "baseMagicSteps"]) {
    assert.match(masterActions, new RegExp(`${field}: wholeNumber\\(input\\.core\\.${field} \\?\\? 0`));
    assert.match(masterActions, new RegExp(`${field}: creature\\.${field}`));
    assert.match(masterActions, new RegExp(`${field}: parent\\.${field}`));
    assert.match(constructor, new RegExp(`${field}: nonnegativeSteps\\(core\\.${field}`));
  }
  assert.match(constructor, /core: \{ \.\.\.template\.core \}/);
  assert.match(constructor, /baselineSnapshotJson: JSON\.stringify\(snapshot\)/);
  assert.match(constructor, /currentSnapshotJson: JSON\.stringify\(snapshot\)/);
  assert.match(npcActions, /createCreatureNpcInTransaction/);
});

test("master, derived, and NPC persistence remain server-authoritative for HP", () => {
  const schema = readFileSync("src/db/creature-schema.ts", "utf8");
  const masterActions = readFileSync("src/app/heavens/creatures/actions.ts", "utf8");
  const npcActions = readFileSync("src/app/heavens/npcs/actions.ts", "utf8");
  const constructor = readFileSync("src/features/creatures/creature-npc-constructor-service.ts", "utf8");
  const anatomy = readFileSync("src/features/active-state/anatomy.ts", "utf8");

  assert.match(schema, /totalHp: integer\("total_hp"\)/);
  assert.match(schema, /maximumHp: integer\("maximum_hp"\)/);
  assert.match(masterActions, /const hpModel = resolveCreatureHpModel\(normalized, normalized\.hpPools\)/);
  assert.match(masterActions, /normalized\.core\.totalHp = hpModel\.calculatedTotalHp/);
  assert.match(masterActions, /normalized\.hpPools = hpModel\.pools/);
  assert.match(masterActions, /const parentHpModel = resolveCreatureHpModel/);
  assert.match(masterActions, /totalHp: parentHpModel\.calculatedTotalHp/);
  assert.match(constructor, /normalizeCreatureNpcSnapshot/);
  assert.match(constructor, /normalizeCreatureHpSnapshot/);
  assert.match(npcActions, /currentSnapshot: parseSnapshot[\s\S]*profile\.hpAdjustment/);
  assert.match(anatomy, /resolveCreatureTotalMaximumHp/);
  assert.match(anatomy, /resolveCreatureHpPoolMaximum/);
});

test("canon import leaves authored Attributes unscaled and relies on schema defaults", () => {
  const importer = readFileSync("scripts/import-ststandalone-canon.mjs", "utf8");
  assert.match(importer, /INSERT INTO creature_attributes \(creature_id, variant_id, attribute_key, value/);
  assert.match(importer, /row\.value/);
  assert.equal(importer.includes("CREATURE_SIZE_ATTRIBUTE_MULTIPLIERS"), false);
  assert.equal(importer.includes("hp_multiplier_steps"), false);
  assert.equal(importer.includes("base_movement_steps"), false);
  assert.equal(importer.includes("base_magic_steps"), false);
});

test("master and NPC authoring expose base/effective statistics and HP clarity", () => {
  const masterWorkspace = readFileSync("src/app/heavens/creatures/creature-workspace.tsx", "utf8");
  const npcWorkspace = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");

  for (const label of ["HP Multiplier Steps", "Base Movement Steps", "Base Magic Steps"]) {
    assert.equal(masterWorkspace.includes(label), true);
    assert.equal(npcWorkspace.includes(label), true);
  }
  assert.match(masterWorkspace, /Base \{formatCreatureNumber\(attribute\.value\)\} · Effective/);
  assert.match(masterWorkspace, /<span>Total HP<\/span>/);
  assert.match(masterWorkspace, /HP Pool percentages should total 100%/);
  assert.match(masterWorkspace, /resolveCreatureHitLocationMaximumHp/);
  assert.match(npcWorkspace, /Final Total HP/);
  assert.match(npcWorkspace, /HP Pool percentages should total 100%/);
  assert.match(npcWorkspace, /Individual adjustment/);
  assert.match(npcWorkspace, /The .* master Creature was not changed/);
});
