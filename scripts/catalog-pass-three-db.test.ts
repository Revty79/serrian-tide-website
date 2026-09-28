import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { race } from "../src/db/race-schema";
import { creature } from "../src/db/creature-schema";
import { skill } from "../src/db/skill-schema";
import { derivedAbility } from "../src/db/derived-ability-schema";
import { classifySystemCanon } from "../src/features/catalog-visibility/canon-classification-service";
import { ACTIVATED_CATALOGS, CANON_MANIFEST_HASH, canonManifest } from "../src/features/catalog-visibility/canon-manifest";
import { catalogAncestorIds, catalogBrowseWhere, catalogSourceLabel, getCatalogBrowseState } from "../src/features/catalog-visibility/catalog-query";
import { bindCatalogPreferenceOperations } from "../src/features/catalog-visibility/catalog-preference-service";
import { loadVisibleRecursiveSkillLibrary } from "../src/features/catalog-visibility/skill-catalog-service";
import { loadRecursiveSkillLibrary } from "../src/features/skills/recursive-skill-library-service";
import { readCreatureNpcTemplateInTransaction } from "../src/features/creatures/creature-npc-constructor-service";
import { loadCharacterDerivedAbilitiesInTransaction } from "../src/features/derived-abilities/character-derived-ability-service";
import { seedClassificationFixtures } from "./catalog-visibility-fixtures";

assert.equal(process.env.SERRIAN_CATALOG_DISPOSABLE, "true");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/serrian_catalog_visibility_dev");
const roots = { race, creature, skill, derivedAbility };
const tables = { race: "races", creature: "creatures", skill: "skill", derivedAbility: "derived_ability" };
const actor = "visibility-owner";
const adminEmail = "visibility-admin@example.invalid";
const fixtures = new Map<string, number[]>();
const prefs = bindCatalogPreferenceOperations(async () => actor);
let characterId: number;
let creatureNpcId: number;

async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of [...Object.values(tables), "items", "skill_relationship", "catalog_visibility_activation"]) {
    result[table] = (await pool.query(`select to_jsonb(t) body from ${table} t order by to_jsonb(t)::text`)).rows;
  }
  return result;
}

before(async () => {
  for (const [id, role] of [[actor, "god"], ["visibility-foreign", "god"], ["visibility-admin", "admin"], ["visibility-player", "player"]]) {
    await pool.query('insert into "user" (id,name,email) values ($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
  await seedClassificationFixtures(pool);
  for (const key of ACTIVATED_CATALOGS) {
    const ids: number[] = [];
    for (const [index, creator, canon] of [[0, null, true], [1, actor, false], [2, actor, true], [3, "visibility-foreign", false], [4, "visibility-foreign", true], [5, null, false]] as const) {
      const name = `Visibility ${key} ${index}`;
      const shared = { createdByUserId: creator, isSystemCanon: canon, canonMarkedByUserId: canon ? "visibility-admin" : null, canonMarkedAt: canon ? new Date() : null,
        sourceSystem: index === 5 ? canonManifest[key][0].sourceSystem : null };
      const table = roots[key];
      const values = key === "creature" ? { canonicalId: name.toUpperCase(), canonicalName: name, size: "Medium", ...shared } : { name, ...shared };
      const row = await db.insert(table).values(values as typeof race.$inferInsert).returning({ id: table.id });
      ids.push(row[0].id);
    }
    fixtures.set(key, ids);
  }
  // Persist game references before changing any visibility setting.
  const campaign = (await pool.query(`insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id)
    values('Visibility Runtime',100,100,10,10,100,0,'Credits','Assigned',0,$1) returning id`, [actor])).rows[0].id;
  await pool.query("insert into campaign_player(campaign_id,user_id,is_npc_controller) values($1,$2,true)", [campaign, actor]);
  characterId = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Visibility Character') returning id", [campaign, actor])).rows[0].id;
  await pool.query("insert into campaign_character_profile(character_id,race_id) values($1,$2)", [characterId, fixtures.get("race")![3]]);
  await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) select $1,unnest(array['STR','DEX','CON','INT','WIS','CHR']),25", [characterId]);
  await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,12)", [characterId, fixtures.get("skill")![3]]);
  await pool.query("insert into character_derived_ability(character_id,derived_ability_id,acquisition_method,acquired_by_user_id) values($1,$2,'awarded',$3)", [characterId, fixtures.get("derivedAbility")![3], actor]);
  creatureNpcId = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values($1,$2,'Visibility NPC',true,'creature','detailed') returning id", [campaign, actor])).rows[0].id;
  const source = await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, fixtures.get("creature")![3]));
  await pool.query("insert into campaign_creature_npc_profile(character_id,creature_id,baseline_snapshot_json,current_snapshot_json) values($1,$2,$3,$3)", [creatureNpcId, fixtures.get("creature")![3], JSON.stringify(source)]);
});
after(() => pool.end());

test("plan is read-only and reports exact official, ambiguous, user-authored, and missing identities", async () => {
  const before = await snapshot();
  const report = await classifySystemCanon();
  assert.equal(report.ready, true);
  for (const key of ACTIVATED_CATALOGS) {
    assert.equal(report.catalogs[key].wouldPromote.length, canonManifest[key].length);
    assert.ok(report.catalogs[key].ambiguousUntouched.some((row) => row.id === fixtures.get(key)![5]));
    assert.ok(report.catalogs[key].userAuthoredUntouched.some((row) => row.id === fixtures.get(key)![3]));
  }
  assert.deepEqual(await snapshot(), before);
  await prefs.update({ catalog: "race", mode: "mine" });
  const state = await getCatalogBrowseState(actor, "race");
  assert.deepEqual(state, { mode: "mine", enabled: false });
  assert.equal((await db.select().from(race).where(catalogBrowseWhere(race, actor, state, eq(race.id, fixtures.get("race")![3])))).length, 1);
});

test("apply requires a database-resolved current Administrator; god, player, missing actor, and revoked role fail", async () => {
  const before = await snapshot();
  for (const email of [undefined, `${actor}@example.invalid`, "visibility-player@example.invalid", "absent@example.invalid"]) {
    await assert.rejects(classifySystemCanon({ apply: true, administratorEmail: email }), /Administrator/);
  }
  await assert.rejects(classifySystemCanon({ apply: true, administratorEmail: adminEmail, expectedDatabase: "wrong_target" }), /reviewed classification target/);
  await pool.query("delete from user_role where user_id='visibility-admin'");
  await assert.rejects(classifySystemCanon({ apply: true, administratorEmail: adminEmail }), /Administrator/);
  await pool.query("insert into user_role(user_id,role) values('visibility-admin','admin')");
  assert.deepEqual(await snapshot(), before);
});

test("missing and duplicate exact identities abort the whole apply without activation", async () => {
  const expected = canonManifest.race[0];
  await pool.query("update races set source_external_id='temporarily-missing' where source_external_id=$1", [expected.externalId]);
  const before = await snapshot();
  assert.equal((await classifySystemCanon()).catalogs.race.missing.length, 1);
  await assert.rejects(classifySystemCanon({ apply: true, administratorEmail: adminEmail }), /missing or duplicated/);
  assert.deepEqual(await snapshot(), before);
  await pool.query("update races set source_external_id=$1 where source_external_id='temporarily-missing'", [expected.externalId]);
  // Deliberately model a damaged deployment with a missing uniqueness index.
  await pool.query('drop index races_source_identity_uq');
  const duplicate = (await pool.query("insert into races(name,source_system,source_external_id) values('Duplicate identity',$1,$2) returning id", [expected.sourceSystem, expected.externalId])).rows[0].id;
  try {
    const duplicated = await snapshot();
    assert.equal((await classifySystemCanon()).catalogs.race.duplicates.length, 1);
    await assert.rejects(classifySystemCanon({ apply: true, administratorEmail: adminEmail }), /missing or duplicated/);
    assert.deepEqual(await snapshot(), duplicated);
  } finally {
    await pool.query("delete from races where id=$1", [duplicate]);
    await pool.query('create unique index races_source_identity_uq on races(source_system,source_external_id) where source_system is not null and source_external_id is not null');
  }
});

test("classification is exact, attributed, atomic, idempotent, and preserves all unrelated state including Items", async () => {
  const [first, second] = canonManifest.race;
  const parent = (await pool.query("select id from races where source_external_id=$1", [first.externalId])).rows[0].id;
  await pool.query("update races set parent_race_id=$1,created_by_user_id=$2,archived_at=now(),archived_by_user_id=$2,archive_reason='Keep' where source_external_id=$3", [parent, actor, second.externalId]);
  const before = await snapshot();
  const start = Date.now();
  const applied = await classifySystemCanon({ apply: true, administratorEmail: adminEmail });
  assert.deepEqual(applied.classified, { race: 56, creature: 90, skill: 1137, derivedAbility: 6 });
  const after = await snapshot();
  for (const key of ACTIVATED_CATALOGS) {
    const promoted = new Set(applied.catalogs[key].wouldPromote.map((row) => row.id));
    const prior = new Map((before[tables[key]] as { body: Record<string, unknown> }[]).map(({ body }) => [body.id, body]));
    for (const { body } of after[tables[key]] as { body: Record<string, unknown> }[]) {
      if (!promoted.has(body.id as number)) assert.deepEqual(body, prior.get(body.id));
      else {
        assert.equal(body.is_system_canon, true);
        assert.equal(body.canon_marked_by_user_id, "visibility-admin");
        assert.ok(new Date(String(body.canon_marked_at)).getTime() >= start);
        const original = prior.get(body.id)!;
        assert.deepEqual({ ...body, is_system_canon: original.is_system_canon, canon_marked_at: original.canon_marked_at, canon_marked_by_user_id: original.canon_marked_by_user_id, updated_at: original.updated_at }, original);
      }
    }
    assert.equal((await getCatalogBrowseState(actor, key)).enabled, true);
  }
  assert.deepEqual(after.items, before.items);
  assert.deepEqual(after.skill_relationship, before.skill_relationship);
  assert.equal((await pool.query("select manifest_hash from catalog_visibility_activation")).rows[0].manifest_hash, CANON_MANIFEST_HASH);
  assert.deepEqual((await classifySystemCanon({ apply: true, administratorEmail: adminEmail })).classified, { race: 0, creature: 0, skill: 0, derivedAbility: 0 });
  assert.deepEqual(await snapshot(), after);
});

for (const key of ACTIVATED_CATALOGS) test(`${key}: three persisted visibility modes use one SQL union; own promoted content remains Canon`, async () => {
  const table = roots[key], ids = fixtures.get(key)!;
  for (const [mode, indexes] of [["canon", [0, 2, 4]], ["mine", [1, 2]], ["canon-and-mine", [0, 1, 2, 4]]] as const) {
    await prefs.update({ catalog: key, mode });
    const state = await getCatalogBrowseState(actor, key);
    const rows = await db.select().from(table).where(catalogBrowseWhere(table, actor, state, inArray(table.id, ids)));
    assert.deepEqual(rows.map((row) => row.id).sort((a, b) => a - b), indexes.map((index) => ids[index]));
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
    const promoted = rows.find((row) => row.id === ids[2])!;
    assert.equal(catalogSourceLabel(promoted, actor), "canon");
  }
});

for (const key of ["race", "creature", "skill"] as const) test(`${key}: nested context keeps only the exact ancestor chain, without unrelated siblings`, async () => {
  const ids = fixtures.get(key)!;
  if (key === "skill") {
    await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type,sort_order) values($1,$2,'parent',0),($2,$3,'parent',0),($4,$3,'parent',1)", [ids[1], ids[3], ids[0], ids[4]]);
    await pool.query("update skill set primary_attribute='STR',tier=1 where id=any($1::int[])", [ids]);
  } else {
    const column = key === "race" ? "parent_race_id" : "parent_creature_id";
    await pool.query(`update ${tables[key]} set ${column}=$1 where id=$2`, [ids[0], ids[3]]);
    await pool.query(`update ${tables[key]} set ${column}=$1 where id=$2`, [ids[3], ids[1]]);
    await pool.query(`update ${tables[key]} set ${column}=$1 where id=$2`, [ids[0], ids[4]]);
  }
  await pool.query(`update ${tables[key]} set archived_at=now(),archived_by_user_id=$1,archive_reason='Ancestor context' where id=$2`, [actor, ids[0]]);
  await prefs.update({ catalog: key, mode: "mine" });
  assert.deepEqual((await catalogAncestorIds(key, [ids[1]])).sort((a, b) => a - b), [ids[0], ids[1], ids[3]].sort((a, b) => a - b));
  if (key === "skill") {
    const tree = await loadVisibleRecursiveSkillLibrary(actor);
    for (const index of [0, 3]) assert.equal(tree.skills.find((row) => row.id === ids[index])?.catalogSource, "context");
    assert.ok(!tree.skills.some((row) => row.id === ids[4]));
    assert.equal(tree.skills.find((row) => row.id === ids[0])?.archived, true);
    assert.deepEqual(tree.paths.find((row) => row.endpointSkillId === ids[1])?.rootToEndpointIds, [ids[0], ids[3], ids[1]]);
  }
});

test("persisted Character Race, Creature source, Skill allocation, and owned Derived Ability survive hiding", async () => {
  const read = async () => ({
    references: (await pool.query(`select p.race_id,r.name race,np.creature_id,cr.canonical_name creature,a.skill_id,s.name skill,a.points,o.derived_ability_id,d.name ability
      from campaign_character c join campaign_character_profile p on p.character_id=c.id join races r on r.id=p.race_id
      join campaign_creature_npc_profile np on np.character_id=$2 join creatures cr on cr.id=np.creature_id
      join campaign_character_skill_allocation a on a.character_id=c.id join skill s on s.id=a.skill_id
      join character_derived_ability o on o.character_id=c.id join derived_ability d on d.id=o.derived_ability_id where c.id=$1`, [characterId, creatureNpcId])).rows,
    creature: await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, fixtures.get("creature")![3])),
    abilities: await db.transaction((tx) => loadCharacterDerivedAbilitiesInTransaction(tx, characterId, actor, false)),
    skills: await loadRecursiveSkillLibrary(),
  });
  const before = await read();
  for (const key of ACTIVATED_CATALOGS) await prefs.update({ catalog: key, mode: "canon" });
  assert.deepEqual(await read(), before);
  assert.equal(before.references.length, 1);
  assert.equal(before.references[0].points, 12);
  assert.equal(before.creature?.core.canonicalName, "Visibility creature 3");
  for (const key of ACTIVATED_CATALOGS) {
    const table = roots[key];
    assert.equal((await db.select().from(table).where(and(eq(table.id, fixtures.get(key)![3]), catalogBrowseWhere(table, actor, await getCatalogBrowseState(actor, key))))).length, 0);
  }
});
