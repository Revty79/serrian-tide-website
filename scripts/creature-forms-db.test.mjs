import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.SERRIAN_DISPOSABLE_CREATURE_AUTHORING !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_authoring_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Creature authoring harness.");
const actor = { userId: "creature-forms-god" };
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: async () => ({ user: { id: actor.userId } }),
  requireGod: async () => ({ user: { id: actor.userId } }),
  requirePlayer: async () => ({ user: { id: actor.userId } }),
  requireGodOrAdminAccessContext: async () => ({ session: { user: { id: actor.userId } }, roles: ["god"] }),
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { db, pool } = await import("../src/db/index.ts");
const { getCreature, saveCreature, createDerivedCreature } = await import("../src/app/heavens/creatures/actions.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const { emptyCreatureFormMechanics } = await import("../src/features/creatures/creature-forms.ts");
const { availableCreatureForms, resolveCreatureFormPreview } = await import("../src/features/creatures/creature-form-preview.ts");
const { buildCreatureNpcSnapshot, parseCreatureNpcSnapshot, createCreatureNpcInTransaction, readCreatureNpcTemplateInTransaction } = await import("../src/features/creatures/creature-npc-constructor-service.ts");
const { getCreatureNpc, saveCreatureNpc } = await import("../src/app/heavens/npcs/actions.ts");
const { getActiveHealth } = await import("../src/features/active-state/active-health-service.ts");
const rows = async (sql, args = []) => (await pool.query(sql, args)).rows;
before(async () => {
  await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [actor.userId, `${actor.userId}@example.invalid`]);
  await pool.query("insert into user_role(user_id,role) values($1,'god')", [actor.userId]);
});
after(() => pool.end());
async function fixture() {
  const [skill] = await rows("insert into skill(name,classification,tier,primary_attribute) values('Form Awareness','standard',1,'WIS') returning id");
  return saveCreature({ ...creatureDraftFixture(), forms: [creatureFormFixture(skill.id)] });
}
async function npcFixture(template) {
  const [campaign] = await rows("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Creature Form Campaign',300,100,50,10,100,250,'Credits','Assigned',$1) returning id", [actor.userId]);
  const characterId = await db.transaction(tx => createCreatureNpcInTransaction(tx, { campaignId: campaign.id, controllerUserId: actor.userId, creatureId: template.id, name: "Creature Form NPC", roleLabel: "Form fixture", snapshot: buildCreatureNpcSnapshot(template) }));
  await getActiveHealth(characterId);
  await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,7) on conflict (character_id) do update set total_damage=7", [characterId]);
  return characterId;
}
async function runtimeRows() {
  const tables = await rows("select tablename from pg_tables where schemaname='public' and (tablename like 'campaign_%' or tablename like 'character_%' or tablename like 'inventory_%') order by tablename");
  return Object.fromEntries(await Promise.all(tables.map(async ({ tablename }) => [tablename, await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));
}

test("zero Forms: existing and new Creature Normal definitions remain unchanged", async () => {
  const saved = await saveCreature(creatureDraftFixture());
  assert.deepEqual(saved.forms, []);
  const before = await getCreature(saved.id);
  const oldCaller = structuredClone(before); delete oldCaller.forms;
  const after = await saveCreature(oldCaller);
  for (const key of ["core", "attributes", "movement", "hpPools", "hitLocations", "attacks", "abilities", "defenses", "skillLinks"]) assert.deepEqual(after[key], before[key]);
});
test("all native mechanics, transformation, capabilities and ordered children persist and reload", async () => {
  const saved = await fixture();
  const expected = creatureFormFixture(saved.forms[0].mechanics.skills.rows[0].skillId);
  assert.deepEqual(saved.forms[0].mechanics, expected.mechanics);
  assert.deepEqual(saved.forms[0].transformation, expected.transformation);
  assert.equal(saved.forms[0].creatureId, saved.id);
  assert.deepEqual((await getCreature(saved.id)).forms, saved.forms);
  const legacy = structuredClone(saved); delete legacy.forms;
  assert.deepEqual((await saveCreature(legacy)).forms, saved.forms);
});
test("unlimited Forms retain DB IDs through edits, reorder, sibling removal and child cleanup", async () => {
  let saved = await fixture();
  saved = await saveCreature({ ...saved, forms: Array.from({ length: 37 }, (_, index) => ({ ...saved.forms[0], key: `form-${index}`, name: `Form ${index}`, sortOrder: index })) });
  const ids = new Map(saved.forms.map(form => [form.key, form.id]));
  saved = await saveCreature({ ...saved, forms: saved.forms.toReversed().map(form => ({ ...form, name: `Edited ${form.name}` })) });
  assert.equal(saved.forms.length, 37);
  saved.forms.forEach((form, index) => { assert.equal(form.id, ids.get(form.key)); assert.equal(form.sortOrder, index); });
  const removed = saved.forms[8];
  saved = await saveCreature({ ...saved, forms: saved.forms.filter(form => form.id !== removed.id) });
  assert.equal(saved.forms.length, 36);
  saved.forms.forEach(form => assert.equal(form.id, ids.get(form.key)));
  assert.deepEqual(await rows("select * from creature_form_skill_links where form_id=$1", [removed.id]), []);
});
test("invalid anatomy references and malformed profiles reject atomically", async () => {
  const saved = await fixture();
  const invalid = structuredClone(saved);
  invalid.forms[0].mechanics.body.hitLocations[0].hpPoolCanonicalId = "MISSING";
  await assert.rejects(saveCreature(invalid), /missing HP Pool/);
  assert.deepEqual((await getCreature(saved.id)).forms, saved.forms);
  for (const field of ["mechanics_json", "transformation_json"]) for (const value of ['[]', '{}', '{"schemaVersion":2}']) await assert.rejects(pool.query(`update creature_forms set ${field}=$1 where id=$2`, [value, saved.forms[0].id]), /shape/);
  const duplicates = structuredClone(saved); duplicates.forms.push(structuredClone(duplicates.forms[0]));
  await assert.rejects(saveCreature(duplicates), /keys must be unique/);
  await assert.rejects(pool.query("delete from skill where id=$1", [saved.forms[0].mechanics.skills.rows[0].skillId]), /foreign key/);
});
test("Creature deletion cascades Form definitions and Skill children only", async () => {
  const saved = await fixture();
  await pool.query("delete from creatures where id=$1", [saved.id]);
  assert.deepEqual(await rows("select * from creature_forms where creature_id=$1", [saved.id]), []);
  assert.deepEqual(await rows("select * from creature_form_skill_links where form_id=$1", [saved.forms[0].id]), []);
  assert.equal((await rows("select id from skill where id=$1", [saved.forms[0].mechanics.skills.rows[0].skillId])).length, 1);
});
test("Variant copies are independent exact owners, without parent-chain merging", async () => {
  const parent = await fixture();
  let child = await createDerivedCreature(parent.id, "Independent Form Variant");
  assert.equal(child.core.parentCreatureId, parent.id);
  assert.notEqual(child.forms[0].id, parent.forms[0].id);
  assert.equal(child.forms[0].creatureId, child.id);
  assert.deepEqual(child.forms[0].mechanics, parent.forms[0].mechanics);
  assert.deepEqual(child.forms[0].transformation, parent.forms[0].transformation);
  child.forms[0].mechanics.attributes.rows[0].value = 87;
  child.forms[0].transformation.entryCosts.costs[0].amount = 8;
  child = await saveCreature(child);
  assert.equal((await getCreature(parent.id)).forms[0].mechanics.attributes.rows[0].value, 20);
  assert.equal((await getCreature(parent.id)).forms[0].transformation.entryCosts.costs[0].amount, 3);
  assert.equal((await saveCreature({ ...child, forms: [] })).forms.length, 0);
  assert.equal((await getCreature(parent.id)).forms.length, 1);
});
test("legacy snapshot normalization does not infer Forms or alter its old shape", async () => {
  const saved = await fixture();
  const old = buildCreatureNpcSnapshot(saved); delete old.forms;
  const normalized = parseCreatureNpcSnapshot(JSON.stringify(old), "Legacy");
  assert.deepEqual(normalized, old);
  assert.equal(Object.hasOwn(normalized, "forms"), false);
  assert.deepEqual(availableCreatureForms(normalized), []);
  const id = await npcFixture(old);
  const npc = await getCreatureNpc(id);
  npc.currentSnapshot.forms = saved.forms;
  await saveCreatureNpc(npc);
  assert.equal(Object.hasOwn((await getCreatureNpc(id)).currentSnapshot, "forms"), false);
});
test("new NPC freezes exact Form definitions and ignores subsequent library edits", async () => {
  const saved = await fixture();
  const template = await db.transaction(tx => readCreatureNpcTemplateInTransaction(tx, saved.id));
  assert.deepEqual(template.forms, saved.forms);
  const npcId = await npcFixture(template);
  const before = await getCreatureNpc(npcId);
  assert.deepEqual(before.currentSnapshot.forms, saved.forms);
  assert.deepEqual(before.baselineSnapshot.forms, saved.forms);
  saved.forms[0].name = "Library changed";
  saved.forms[0].mechanics.attributes.rows[0].value = 95;
  await saveCreature(saved);
  const after = await getCreatureNpc(npcId);
  assert.deepEqual(after.currentSnapshot.forms, before.currentSnapshot.forms);
  assert.deepEqual(after.baselineSnapshot, before.baselineSnapshot);
});
test("pure preview exposes every native subsystem and never mutates snapshots, health or runtime rows", async () => {
  const saved = await fixture();
  const npcId = await npcFixture(saved);
  const npc = await getCreatureNpc(npcId);
  const before = await runtimeRows();
  const original = structuredClone(npc);
  const preview = resolveCreatureFormPreview(npc.currentSnapshot, saved.forms[0].id, 5);
  assert.equal(preview.definition.core.size, "Small");
  assert.equal(preview.hp.statistics.attributes[0].baseValue, 20);
  assert.equal(preview.hp.statistics.attributes[0].effectiveValue, 15);
  assert.equal(preview.hp.finalTotalHp, preview.hp.calculatedTotalHp + 5);
  assert.equal(preview.hp.pools[0].maximumHp, preview.hp.finalTotalHp);
  for (const key of ["attributes", "movement", "attacks", "abilities", "defenses"]) assert.deepEqual(preview.definition[key], saved.forms[0].mechanics[key].rows);
  assert.deepEqual(preview.definition.hitLocations, saved.forms[0].mechanics.body.hitLocations);
  assert.deepEqual(preview.definition.skillLinks, saved.forms[0].mechanics.skills.rows);
  assert.deepEqual(preview.interactionRules, saved.forms[0].mechanics.interactionRules.rules);
  assert.equal(resolveCreatureFormPreview(npc.currentSnapshot, null), null);
  assert.equal(resolveCreatureFormPreview(npc.currentSnapshot, -1), null);
  preview.definition.attacks[0].attackName = "Detached";
  preview.form.transformation.notes = "Detached";
  assert.deepEqual(npc, original);
  assert.deepEqual(await runtimeRows(), before);
});
test("fallback, empty overrides, Add/Replace Skills and Interaction Rules have explicit semantics", async () => {
  const saved = await fixture();
  saved.skillLinks = [{ ...saved.forms[0].mechanics.skills.rows[0], skillId: 999001, skillName: "Unrelated knowledge" }];
  const p = () => resolveCreatureFormPreview(saved, saved.forms[0].id);
  assert.equal(p().definition.skillLinks.length, 2);
  saved.forms[0].mechanics.skills.mode = "replace";
  assert.equal(p().definition.skillLinks.length, 1);
  saved.forms[0].mechanics.skills.mode = "add";
  saved.skillLinks[0].skillId = saved.forms[0].mechanics.skills.rows[0].skillId;
  saved.skillLinks[0].rank = "1";
  assert.equal(p().definition.skillLinks.length, 1);
  assert.equal(p().definition.skillLinks[0].rank, "3");
  saved.forms[0].mechanics = emptyCreatureFormMechanics();
  for (const key of ["attributes", "movement", "attacks", "abilities", "defenses", "hitLocations", "skillLinks"]) assert.deepEqual(p().definition[key], saved[key]);
  saved.forms[0].mechanics.movement = { mode: "override", rows: [] };
  assert.deepEqual(p().definition.movement, []);
  saved.core.interactionRules = creatureFormFixture().mechanics.interactionRules;
  saved.forms[0].mechanics.interactionMode = "replace";
  assert.deepEqual(p().interactionRules, []);
  saved.forms[0].mechanics.interactionMode = "add";
  saved.forms[0].mechanics.interactionRules = creatureFormFixture().mechanics.interactionRules;
  assert.equal(p().interactionRules.length, 2);
  saved.forms[0].creatureId = -1;
  assert.equal(p(), null);
});
test("unrelated NPC save preserves frozen Forms and Normal mechanics while preview exists", async () => {
  const saved = await fixture();
  const npcId = await npcFixture(saved);
  const npc = await getCreatureNpc(npcId);
  const health = await rows("select to_jsonb(t) body from campaign_character_active_health t where character_id=$1", [npcId]);
  const attributes = await rows("select * from campaign_character_attribute where character_id=$1 order by attribute_key", [npcId]);
  const preview = resolveCreatureFormPreview(npc.currentSnapshot, saved.forms[0].id);
  assert.notEqual(preview.definition.core.size, npc.currentSnapshot.core.size);
  const original = structuredClone(npc.currentSnapshot);
  npc.personality = "An unrelated personality edit";
  npc.currentSnapshot.forms = []; // Client payload cannot replace frozen Form metadata.
  const after = await saveCreatureNpc(npc);
  assert.equal(after.personality, npc.personality);
  assert.deepEqual(after.currentSnapshot, original);
  assert.deepEqual(await rows("select to_jsonb(t) body from campaign_character_active_health t where character_id=$1", [npcId]), health);
  assert.deepEqual(await rows("select * from campaign_character_attribute where character_id=$1 order by attribute_key", [npcId]), attributes);
});


test("Form attack and ability effects plus Magic Construction survive persistence and independent cloning", async () => {
  const { createEmptySpell } = await import("../src/features/spell-construction/utilities/spellFactory.ts");
  let saved = await fixture();
  const m = saved.forms[0].mechanics;
  m.attacks.rows[0].authoring.magic = { document: createEmptySpell() };
  m.attacks.rows[0].authoring.onHitEffects = [{ effectKey: "rake", schemaVersion: 2, effect: { kind: "manual", title: "Raking consequence", description: "G.O.D. resolves the wound" }, sortOrder: 0 }];
  m.abilities.rows[0].authoring.magic = { document: createEmptySpell() };
  m.abilities.rows[0].effects = [{ effectKey: "sight", schemaVersion: 2, effect: { kind: "condition.apply", name: "Moon Sight", description: "Authored sight", duration: { kind: "scene", value: null } }, sortOrder: 0 }];
  saved = await saveCreature(saved);
  const child = await createDerivedCreature(saved.id, "Magic Form Variant");
  assert.deepEqual(child.forms[0].mechanics, saved.forms[0].mechanics);
  const snapshot = buildCreatureNpcSnapshot(saved);
  const preview = resolveCreatureFormPreview(snapshot, saved.forms[0].id);
  assert.deepEqual(preview.definition.attacks, saved.forms[0].mechanics.attacks.rows);
  assert.deepEqual(preview.definition.abilities, saved.forms[0].mechanics.abilities.rows);
  child.forms[0].mechanics.attacks.rows[0].authoring.onHitEffects[0].effect.description = "Variant-only ruling";
  await saveCreature(child);
  assert.equal((await getCreature(saved.id)).forms[0].mechanics.attacks.rows[0].authoring.onHitEffects[0].effect.description, "G.O.D. resolves the wound");
});
