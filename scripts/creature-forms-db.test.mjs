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


const { accessFixture: access, accessRequirement: requirement } = await import("./form-access-fixture.ts");
const { evaluateFormAccess } = await import("../src/features/forms/form-access.ts");
const { creatureFormAccessContext } = await import("../src/features/forms/form-access-context.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const lifecycleActor = { userId: actor.userId, roles: ["god"] };
async function accessCreatureFixture() {
  const [skill] = await rows("insert into skill(name,classification,tier,primary_attribute) values('Native Access Skill','standard',1,'WIS') returning id");
  const draft = creatureDraftFixture();
  draft.skillLinks = [{ skillId: skill.id, skillName: "Native Access Skill", skillClassification: "standard", rank: "Veteran 20+", notes: "Native rank", sortOrder: 0 }];
  draft.abilities = [{ ...creatureFormFixture().mechanics.abilities.rows[0], canonicalId: "DRAFT-ABL-ACCESS", abilityName: "Vaporous Body", authoring: undefined }];
  draft.forms = [{ ...creatureFormFixture(), access: access(requirement("skill", { skillId: skill.id }), requirement("creature-ability", { requiredCreatureAbilityCanonicalId: "DRAFT-ABL-ACCESS", sortOrder: 1 })) }];
  return saveCreature(draft);
}

test("Access: native Skill and stable Normal Ability prerequisites save/reload with system-assigned identities", async () => {
  const saved = await accessCreatureFixture();
  const requirements = saved.forms[0].access.requirements;
  assert.equal(requirements[1].requiredCreatureAbilityCanonicalId, saved.abilities[0].canonicalId);
  assert.equal(requirements[1].referenceName, "Vaporous Body");
  assert.equal(requirements[0].skillClassification, "standard");
  assert.equal(evaluateFormAccess(saved.forms[0].access, creatureFormAccessContext(saved)).status, "available");
  assert.deepEqual((await getCreature(saved.id)).forms, saved.forms);
  const legacy = structuredClone(saved); delete legacy.forms[0].access;
  assert.deepEqual((await saveCreature(legacy)).forms[0].access, saved.forms[0].access);
  await assert.rejects(saveCreature({ ...saved, abilities: [] }), /Normal definition/);
  assert.deepEqual((await getCreature(saved.id)).abilities, saved.abilities, "Rejected removal rolls back the whole Normal edit");
  const removed = await saveCreature({ ...saved, abilities: [], forms: [{ ...saved.forms[0], access: { mode: "unrestricted", requirements: [] } }] });
  assert.equal(removed.abilities.length, 0, "Can remove prerequisite and Ability atomically");
});

test("Access: a Creature cannot assign another Creature or Form-only Ability as its Normal prerequisite", async () => {
  const saved = await accessCreatureFixture(), other = await accessCreatureFixture();
  for (const canonicalId of [other.abilities[0].canonicalId, saved.forms[0].mechanics.abilities.rows[0].canonicalId, "MISSING"]) {
    const changed = structuredClone(saved); changed.forms[0].access.requirements[1].requiredCreatureAbilityCanonicalId = canonicalId;
    await assert.rejects(saveCreature(changed), /Normal definition/);
  }
  const numeric = structuredClone(saved); Object.assign(numeric.forms[0].access.requirements[0], { operator: "gte", requiredValue: 10 });
  await assert.rejects(saveCreature(numeric), /Creature Skill ranks/);
  await assert.rejects(pool.query("update creature_form_access_requirements set operator='gte',required_value=10 where form_id=$1 and requirement_type='skill'", [saved.forms[0].id]), /shape/);
});

test("Access: derived Creature clone deep-copies groups and remaps prerequisites to its own independent Normal Ability", async () => {
  const parent = await accessCreatureFixture(), child = await createDerivedCreature(parent.id, "Access Derived Creature");
  assert.notEqual(child.abilities[0].canonicalId, parent.abilities[0].canonicalId);
  assert.equal(child.forms[0].access.requirements[1].requiredCreatureAbilityCanonicalId, child.abilities[0].canonicalId);
  assert.equal(evaluateFormAccess(child.forms[0].access, creatureFormAccessContext(child)).status, "available");
  assert.equal(child.forms[0].access.requirements[0].skillId, parent.forms[0].access.requirements[0].skillId);
  await saveCreature({ ...child, forms: [{ ...child.forms[0], access: access(requirement("manual", { notes: "Child awakening" })) }] });
  assert.deepEqual((await getCreature(parent.id)).forms[0].access, parent.forms[0].access);
});
test("Derived Creature retains structured Normal attacks and abilities used by fallback Forms", async () => {
  // PostgreSQL lpad(text, 4, ...) truncates longer identities; clones must not.
  for (const table of ["creature_attacks", "creature_abilities"]) await pool.query(`select setval(pg_get_serial_sequence('${table}', 'id'), greatest((select coalesce(max(id), 0) + 1 from ${table}), 10000), false)`);
  const draft = creatureDraftFixture(), form = creatureFormFixture();
  draft.attacks = [{ ...form.mechanics.attacks.rows[0], canonicalId: "DRAFT-NORMAL-ATTACK" }];
  draft.abilities = [{ ...form.mechanics.abilities.rows[0], canonicalId: "DRAFT-NORMAL-ABILITY" }];
  draft.abilities[0].effects = [{ effectKey: "normal-rider", schemaVersion: 2, sortOrder: 0, effect: { kind: "manual", title: "Sight rider", description: "Independent copied effect" } }];
  draft.attacks.push({ ...draft.attacks[0], canonicalId: "DRAFT-SECOND-ATTACK", attackName: "Second attack" });
  draft.abilities.push({ ...draft.abilities[0], canonicalId: "DRAFT-SECOND-ABILITY", abilityName: "Second ability" });
  form.mechanics.attacks = { mode: "creature", rows: [] };
  form.mechanics.abilities = { mode: "creature", rows: [] };
  form.access = access(requirement("creature-ability", { requiredCreatureAbilityCanonicalId: "DRAFT-NORMAL-ABILITY" }));
  draft.forms = [form];
  const parent = await saveCreature(draft), child = await createDerivedCreature(parent.id, "Structured fallback clone");
  assert.deepEqual(child.attacks[0].authoring, parent.attacks[0].authoring);
  assert.deepEqual(child.abilities[0].authoring, parent.abilities[0].authoring);
  assert.deepEqual(child.abilities[0].effects, parent.abilities[0].effects);
  assert.notEqual(child.attacks[0].canonicalId, parent.attacks[0].canonicalId);
  assert.equal(new Set(child.attacks.map(row => row.canonicalId)).size, 2);
  assert.equal(new Set(child.abilities.map(row => row.canonicalId)).size, 2);
  assert.equal(child.forms[0].access.requirements[0].requiredCreatureAbilityCanonicalId, child.abilities[0].canonicalId);
  const preview = resolveCreatureFormPreview(buildCreatureNpcSnapshot(child), child.forms[0].id);
  assert.deepEqual(preview.definition.attacks[0].authoring, parent.attacks[0].authoring);
  assert.deepEqual(preview.definition.abilities[0].authoring, parent.abilities[0].authoring);
  child.attacks[0].authoring.initiativeCost = 9;
  await saveCreature(child);
  assert.deepEqual((await getCreature(parent.id)).attacks[0].authoring, parent.attacks[0].authoring);
});

test("Access: archived Creature Skill reference retains/clones, rejects new assignments, protects lifecycle and raw deletion", async () => {
  const saved = await accessCreatureFixture(), skillId = saved.forms[0].access.requirements[0].skillId;
  await pool.query("update skill set archived_at=now() where id=$1", [skillId]);
  assert.deepEqual((await saveCreature(saved)).forms[0].access, saved.forms[0].access);
  const clone = await createDerivedCreature(saved.id, "Archived Creature Access");
  assert.equal(clone.forms[0].access.requirements[0].skillId, skillId);
  await assert.rejects(saveCreature({ ...saved, forms: [...saved.forms, { ...saved.forms[0], key: "new-archived" }] }), /Archived Skills/);
  const preview = await lifecycle.previewLifecycleEntityForActor({ entityKind: "skill", entityId: skillId }, lifecycleActor);
  assert.equal(preview.canDelete, false);
  assert.ok(preview.dependencies.some(row => row.label === "Creature Form Access Skill prerequisites" && row.count === 2));
  await assert.rejects(pool.query("delete from skill where id=$1", [skillId]), /foreign key/);
});

test("Access: Form and eligible Creature lifecycle deletion cascade requirement rows", async () => {
  const saved = await accessCreatureFixture(), id = saved.forms[0].id;
  await saveCreature({ ...saved, forms: [] });
  assert.deepEqual(await rows("select * from creature_form_access_requirements where form_id=$1", [id]), []);
  const recreated = await saveCreature(saved);
  await lifecycle.permanentlyDeleteLifecycleEntityForActor({ entityKind: "creature", entityId: saved.id }, lifecycleActor);
  assert.deepEqual(await rows("select * from creature_form_access_requirements where form_id=$1", [recreated.forms[0].id]), []);
});

test("Access: new NPC freezes Normal facts and requirements; later library Skill/Ability/rule changes cannot alter its eligibility", async () => {
  const saved = await accessCreatureFixture(), id = await npcFixture(saved);
  const initial = await getCreatureNpc(id);
  for (const snapshot of [initial.baselineSnapshot, initial.currentSnapshot]) {
    assert.deepEqual(snapshot.forms[0].access, saved.forms[0].access);
    assert.equal(evaluateFormAccess(snapshot.forms[0].access, creatureFormAccessContext(snapshot)).status, "available");
  }
  await saveCreature({ ...saved, skillLinks: [], abilities: [], forms: [{ ...saved.forms[0], access: access(requirement("manual", { notes: "Changed library gate" })) }] });
  const reopened = await getCreatureNpc(id);
  assert.deepEqual(reopened.currentSnapshot, initial.currentSnapshot);
  assert.deepEqual(reopened.baselineSnapshot, initial.baselineSnapshot);
  assert.equal(evaluateFormAccess(reopened.currentSnapshot.forms[0].access, creatureFormAccessContext(reopened.currentSnapshot)).status, "available");
});

test("Access: frozen locked/manual previews are mutation-free; unrelated and forged NPC saves preserve access definitions and active health", async () => {
  const template = await accessCreatureFixture();
  template.forms = [{ ...template.forms[0], access: access(requirement("attribute", { attributeKey: "STR", requiredValue: 100 })) }, { ...template.forms[0], key: "manual-access", name: "Manual Form", access: access(requirement("manual", { notes: "First Awakening" })) }];
  const saved = await saveCreature(template), id = await npcFixture(saved), npc = await getCreatureNpc(id);
  const before = await runtimeRows(), source = structuredClone(npc);
  for (const form of npc.currentSnapshot.forms) {
    const status = evaluateFormAccess(form.access, creatureFormAccessContext(npc.currentSnapshot)).status;
    assert.equal(status, form.key === "manual-access" ? "manual-review" : "locked");
    assert.ok(resolveCreatureFormPreview(npc.currentSnapshot, form.id));
  }
  assert.deepEqual(npc, source); assert.deepEqual(await runtimeRows(), before);
  const forged = structuredClone(npc); forged.personality = "Unrelated safe edit";
  forged.currentSnapshot.forms[0].access = { mode: "unrestricted", requirements: [] };
  forged.baselineSnapshot.forms[0].access = { mode: "unrestricted", requirements: [] };
  const result = await saveCreatureNpc(forged);
  assert.deepEqual(result.currentSnapshot.forms, source.currentSnapshot.forms);
  assert.deepEqual(result.baselineSnapshot, source.baselineSnapshot);
  assert.equal(evaluateFormAccess(result.currentSnapshot.forms[0].access, creatureFormAccessContext(result.currentSnapshot)).status, "locked");
  assert.equal((await rows("select total_damage from campaign_character_active_health where character_id=$1", [id]))[0].total_damage, 7);
});

test("Access: old snapshots with Forms but no Access remain valid, Unrestricted and unmodified on ordinary save", async () => {
  const saved = await accessCreatureFixture(), id = await npcFixture(saved);
  const legacy = buildCreatureNpcSnapshot(saved); delete legacy.forms[0].access;
  const text = JSON.stringify(legacy);
  await pool.query("update campaign_creature_npc_profile set baseline_snapshot_json=$1,current_snapshot_json=$1 where character_id=$2", [text, id]);
  const parsed = parseCreatureNpcSnapshot(text);
  assert.equal(evaluateFormAccess(parsed.forms[0].access, creatureFormAccessContext(parsed)).status, "available");
  const npc = await getCreatureNpc(id), result = await saveCreatureNpc({ ...npc, personality: "Legacy ordinary edit" });
  assert.equal(Object.hasOwn(result.currentSnapshot.forms[0], "access"), false);
  assert.equal(Object.hasOwn(result.baselineSnapshot.forms[0], "access"), false);
});
