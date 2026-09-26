import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.SERRIAN_DISPOSABLE_RACE_AUTHORING !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_race_authoring_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Race authoring harness.");
const actors = new AsyncLocalStorage();
const actor = { userId: "form-mechanics-god", roles: ["god"] };
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: async () => ({ user: { id: actor.userId } }),
  requireGod: async () => ({ user: { id: actor.userId } }),
  requirePlayer: async () => ({ user: { id: actor.userId } }),
  requireGodOrAdminAccessContext: async () => ({ session: { user: { id: actors.getStore() ?? actor.userId } }, roles: ["god"] }),
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool } = await import("../src/db/index.ts");
const { getRace, saveRace, createRaceVariant } = await import("../src/app/heavens/races/actions.ts");
const { emptyRaceForm } = await import("../src/features/races/race-forms.ts");
const { emptyRaceNaturalAttack } = await import("../src/features/races/race-natural-attacks.ts");
const { createHumanoidRaceAnatomy } = await import("../src/features/races/race-anatomy.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const { emptyRaceFormMechanics } = await import("../src/features/races/race-form-mechanics.ts");
const { wolfFormMechanics } = await import("./race-form-mechanics-fixture.ts");
const { getCharacter } = await import("../src/app/characters/actions.ts");
const rows = async (sql, args = []) => (await pool.query(sql, args)).rows;
const childTables = ["race_form_movement_modes", "race_form_natural_protections", "race_form_natural_attacks", "race_form_skill_links"];
const owned = async id => Object.fromEntries(await Promise.all(childTables.map(async table => [table, await rows(`select * from ${table} where form_id=$1 order by sort_order,id`, [id])])));
const stored = id => rows("select * from race_forms where race_id=$1 order by sort_order,id", [id]);
const definition = row => { const result = { ...row }; delete result.id; delete result.form_id; return result; };
before(async () => {
  for (const id of [actor.userId, "form-mechanics-other"]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,'god')", [id]);
  }
});
after(() => pool.end());
async function fixture() {
  const [race] = await rows("insert into races(name,size,created_by_user_id) values('Form Mechanics Race','Medium',$1) returning id", [actor.userId]);
  const [skill] = await rows("insert into skill(name,classification,tier) values('Form Predisposition','standard',1) returning id");
  const [ability] = await rows("insert into skill(name,classification,tier) values('Form Ability','Special Ability',null) returning id");
  const draft = await getRace(race.id);
  const bite = { ...emptyRaceNaturalAttack("race-bite"), attackName: "Race Bite", damage: "2" };
  const base = await saveRace({ ...draft, core: { ...draft.core, anatomy: createHumanoidRaceAnatomy() },
    movementModes: [{ movementMode: "Land", baseValue: 3, notes: "Race movement", sortOrder: 0 }],
    attributeCaps: [{ attributeKey: "STR", maxValue: 40, sortOrder: 0 }], naturalAttacks: [bite] });
  const mechanics = wolfFormMechanics(skill.id, ability.id);
  mechanics.attacks[0].skillName = "Form Predisposition";
  mechanics.skillLinks[0].skillName = "Form Predisposition"; mechanics.skillLinks[0].skillClassification = "standard";
  mechanics.skillLinks[1].skillName = "Form Ability"; mechanics.skillLinks[1].skillClassification = "Special Ability";
  return { base, mechanics, skillId: skill.id, abilityId: ability.id };
}
const form = mechanics => ({ ...emptyRaceForm("wolf"), name: "Wolf Form", description: "Independent body", notes: "Test only", mechanics });

test("Pass 2 Forms load with all Race defaults; no mechanics are inferred from Wolf Form", async () => {
  const { base } = await fixture();
  await pool.query("insert into race_forms(race_id,key,name,description,notes,sort_order) values($1,'wolf','Wolf Form','Keep description','Keep notes',0)", [base.id]);
  const loaded = await getRace(base.id);
  assert.deepEqual(loaded.forms[0].mechanics, emptyRaceFormMechanics());
  const before = await stored(base.id);
  const saved = await saveRace(loaded);
  assert.equal(saved.forms[0].id, before[0].id);
  assert.equal(saved.forms[0].description, "Keep description");
  assert.deepEqual(await owned(saved.forms[0].id), Object.fromEntries(childTables.map(table => [table, []])));
});

test("multi-system Wolf Form round-trips Size, Anatomy, Movement, protection, attacks, Skills, rules and capabilities", async () => {
  const { base, mechanics } = await fixture();
  const saved = await saveRace({ ...base, forms: [form(mechanics)] });
  assert.deepEqual(saved.forms[0].mechanics, mechanics);
  assert.deepEqual((await getRace(base.id)).forms, saved.forms);
  assert.deepEqual(saved.core, base.core);
  for (const field of ["naturalAttacks", "naturalProtections", "movementModes", "skillLinks", "attributeCaps"]) assert.deepEqual(saved[field], base[field], field);
  const children = await owned(saved.forms[0].id);
  assert.equal(children.race_form_natural_attacks[0].skill_id, mechanics.attacks[0].skillId);
  assert.ok(childTables.every(table => children[table].every(row => row.form_id === saved.forms[0].id)));
});

test("signed Attribute adjustments persist and clone independently with unchanged INT and original Race Caps", async () => {
  const { base, mechanics } = await fixture();
  const saved = await saveRace({ ...base, forms: [form(mechanics)] });
  assert.deepEqual(saved.forms[0].mechanics.attributeAdjustments, { STR: 5, DEX: 10, CON: 5, INT: 0, WIS: 5, CHR: -5 });
  const clone = await createRaceVariant(base.id, "Attribute Adjustment Variant");
  assert.deepEqual(clone.forms[0].mechanics.attributeAdjustments, mechanics.attributeAdjustments);
  clone.forms[0].mechanics.attributeAdjustments.STR = -7;
  clone.forms[0].mechanics.attributeAdjustments.CHR = 0;
  await saveRace(clone);
  assert.deepEqual((await getRace(base.id)).forms[0].mechanics.attributeAdjustments, mechanics.attributeAdjustments);
  assert.deepEqual((await getRace(base.id)).attributeCaps, base.attributeCaps);
});

test("empty override versus Race fallback intent remains explicit for all collection categories", async () => {
  const { base } = await fixture(), mechanics = emptyRaceFormMechanics();
  Object.assign(mechanics, { movementMode: "override", protectionMode: "override", attacksMode: "override", skillsMode: "add", interactionMode: "replace" });
  const saved = await saveRace({ ...base, forms: [form(mechanics)] });
  assert.deepEqual(saved.forms[0].mechanics, mechanics);
  assert.deepEqual((await saveRace({ ...saved, forms: [form(emptyRaceFormMechanics())] })).forms[0].mechanics, emptyRaceFormMechanics());
});

test("Form attacks and protection validate against overridden or inherited Anatomy and reject removed locations/pools", async () => {
  const { base, mechanics } = await fixture();
  mechanics.attacks[0].anatomy.hpPoolIds = ["wolf-tail"];
  const saved = await saveRace({ ...base, forms: [form(mechanics)] });
  const invalid = structuredClone(mechanics); invalid.anatomyMode = "race"; invalid.anatomy = null;
  await assert.rejects(saveRace({ ...saved, forms: [form(invalid)] }), /HP Pools/);
  const raceWithTail = await saveRace({ ...saved, core: { ...saved.core, anatomy: mechanics.anatomy }, forms: [form(invalid)] });
  assert.equal(raceWithTail.forms[0].mechanics.anatomyMode, "race");
  const missingLocation = structuredClone(mechanics); missingLocation.anatomy.hitLocations = missingLocation.anatomy.hitLocations.filter(row => row.hitLocationNumber !== 0);
  await assert.rejects(saveRace({ ...saved, forms: [form(missingLocation)] }), /Coverage/);
  const before = await stored(base.id);
  const oldCaller = { ...raceWithTail, core: { ...base.core } }; delete oldCaller.forms;
  await assert.rejects(saveRace(oldCaller), /HP Pools/);
  assert.deepEqual(await stored(base.id), before);
  assert.deepEqual((await getRace(base.id)).core.anatomy, mechanics.anatomy);
});

test("invalid references, capabilities, adjustments and duplicate children roll back all Race/Form changes", async () => {
  const { base, mechanics } = await fixture(), saved = await saveRace({ ...base, forms: [form(mechanics)] });
  const before = await stored(base.id), children = await owned(saved.forms[0].id);
  const variants = [
    { attacks: [{ ...mechanics.attacks[0], skillId: 2147483647 }] },
    { movement: [...mechanics.movement, mechanics.movement[0]] },
    { equipment: { state: "destroyed", notes: "" } },
    { attributeAdjustments: { ...mechanics.attributeAdjustments, STR: Infinity } },
    { attributeAdjustments: { ...mechanics.attributeAdjustments, LUCK: 5 } },
    { skillLinks: [{ ...mechanics.skillLinks[0], linkType: "Granted", skillClassification: "Special Ability" }] },
    { interactionRules: { schemaVersion: 1, rules: [{ ...mechanics.interactionRules.rules[0], conditions: [{ key: "tag", kind: "item-tag", tagCanonicalId: "MISSING-TAG" }] }] } },
  ];
  for (const patch of variants) {
    await assert.rejects(saveRace({ ...saved, core: { ...saved.core, name: "Must roll back" }, forms: [form({ ...mechanics, ...patch })] }));
    assert.deepEqual(await stored(base.id), before); assert.deepEqual(await owned(saved.forms[0].id), children);
    assert.equal((await getRace(base.id)).core.name, saved.core.name);
  }
});

test("reordering, editing and old callers preserve Form and child IDs and leave sibling definitions untouched", async () => {
  const { base, mechanics } = await fixture();
  const saved = await saveRace({ ...base, forms: [form(mechanics), { ...form(mechanics), key: "hybrid", name: "Hybrid" }] });
  const children = await owned(saved.forms[0].id), sibling = await owned(saved.forms[1].id);
  const changed = structuredClone(saved.forms[0]); changed.mechanics.movement.reverse(); changed.mechanics.attacks[0].damage = "8";
  const reordered = await saveRace({ ...saved, forms: [saved.forms[1], changed] });
  assert.deepEqual(reordered.forms.map(row => row.id), [...saved.forms].reverse().map(row => row.id));
  const after = await owned(changed.id);
  for (const table of childTables) assert.deepEqual(after[table].map(row => row.id).sort(), children[table].map(row => row.id).sort());
  assert.deepEqual(await owned(saved.forms[1].id), sibling);
  const old = { ...reordered, forms: reordered.forms.map(row => { const form = { ...row }; delete form.mechanics; return form; }) };
  assert.deepEqual((await saveRace(old)).forms, reordered.forms);
});

test("deep variant cloning copies every Form definition and fresh owned row IDs, independently in both directions", async () => {
  const { base, mechanics } = await fixture(), saved = await saveRace({ ...base, forms: [form(mechanics)] });
  const clone = await createRaceVariant(base.id, "Mechanical Variant");
  assert.deepEqual(clone.forms[0].mechanics, saved.forms[0].mechanics);
  const original = await owned(saved.forms[0].id), copied = await owned(clone.forms[0].id);
  for (const table of childTables) {
    assert.deepEqual(copied[table].map(definition), original[table].map(definition), table);
    assert.ok(copied[table].every(row => row.form_id === clone.forms[0].id && !original[table].some(parent => parent.id === row.id)));
  }
  const coverage = id => rows("select location_key from race_form_natural_protection_locations where protection_id=$1 order by location_key", [id]);
  assert.deepEqual(await coverage(copied.race_form_natural_protections[0].id), await coverage(original.race_form_natural_protections[0].id));
  clone.forms[0].mechanics.attacks[0].damage = "20";
  clone.forms[0].mechanics.anatomy.hpPools[0].poolName = "Variant body";
  await saveRace(clone);
  assert.deepEqual((await getRace(base.id)).forms, saved.forms);
  await saveRace({ ...saved, forms: [] });
  assert.equal((await getRace(clone.id)).forms[0].mechanics.attacks[0].damage, "20");
});

test("archived Skill bases/additions survive saves and clones; new archived assignments and ineligible links reject", async () => {
  const { base, mechanics, skillId } = await fixture(), saved = await saveRace({ ...base, forms: [form(mechanics)] });
  await pool.query("update skill set archived_at=now() where id=$1", [skillId]);
  assert.deepEqual((await saveRace(saved)).forms, saved.forms);
  const clone = await createRaceVariant(base.id, "Archived Form Skill Variant");
  assert.deepEqual((await saveRace(clone)).forms[0].mechanics, saved.forms[0].mechanics);
  await assert.rejects(saveRace({ ...saved, forms: [...saved.forms, { ...form(mechanics), key: "new" }] }), /Archived Skills/);
  const preview = await lifecycle.previewLifecycleEntityForActor({ entityKind: "skill", entityId: skillId }, actor);
  assert.equal(preview.canDelete, false);
  assert.ok(preview.dependencies.some(row => row.label === "Form Natural Attack Skill bases" && row.count === 2));
  assert.ok(preview.dependencies.some(row => row.label === "Form Skill additions" && row.count === 2));
  const [highTier] = await rows("insert into skill(name,classification,tier) values('High Tier Form Skill','standard',3) returning id");
  const invalid = structuredClone(mechanics); invalid.skillLinks = [{ ...invalid.skillLinks[0], skillId: highTier.id }];
  await assert.rejects(saveRace({ ...saved, forms: [form(invalid)] }), /Tier 1/);
  invalid.skillLinks = []; invalid.attacks[0].skillId = highTier.id;
  assert.equal((await saveRace({ ...saved, forms: [form(invalid)] })).forms[0].mechanics.attacks[0].skillId, highTier.id, "attack basis still supports any Skill tier");
});

test("archive/restore preserve owned mechanics; Form and eligible Race deletion cascade every child", async () => {
  const { base, mechanics } = await fixture(), saved = await saveRace({ ...base, forms: [form(mechanics)] });
  const id = saved.forms[0].id, target = { entityKind: "race", entityId: base.id }, before = await owned(id), parent = await stored(base.id);
  await assert.rejects(actors.run("form-mechanics-other", () => saveRace(saved)), /access|owner|creator|author/i);
  await lifecycle.archiveLifecycleEntityForActor(target, actor, "Form mechanics regression");
  assert.deepEqual(await owned(id), before); assert.deepEqual(await stored(base.id), parent);
  await lifecycle.restoreLifecycleEntityForActor(target, actor);
  assert.deepEqual(await owned(id), before); assert.deepEqual(await stored(base.id), parent);
  await saveRace({ ...saved, forms: [] });
  assert.ok(Object.values(await owned(id)).every(rows => rows.length === 0));
  assert.deepEqual(await rows("select * from race_form_natural_protection_locations where protection_id=$1", [before.race_form_natural_protections[0].id]), []);
  const recreated = await saveRace(saved), recreatedChildren = await owned(recreated.forms[0].id);
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(target, actor);
  assert.deepEqual(await stored(base.id), []);
  assert.ok(Object.values(await owned(recreated.forms[0].id)).every(rows => rows.length === 0));
  assert.deepEqual(await rows("select * from race_form_natural_protection_locations where protection_id=$1", [recreatedChildren.race_form_natural_protections[0].id]), []);
});

test("authoring Form Attributes and mechanics leaves existing Character storage and effective reads unchanged", async () => {
  const { base, mechanics } = await fixture();
  const [campaign] = await rows("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Form Isolation Campaign',100,100,50,10,100,250,'Credits','Assigned',$1) returning id", [actor.userId]);
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaign.id, actor.userId]);
  await pool.query("insert into campaign_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaign.id, base.id]);
  await pool.query("insert into campaign_allowed_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaign.id, base.id]);
  const [character] = await rows("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Untransformed Character') returning id", [campaign.id, actor.userId]);
  await pool.query("insert into campaign_character_profile(character_id,race_id) values($1,$2)", [character.id, base.id]);
  for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,35)", [character.id, key]);
  const before = await getCharacter(character.id, true);
  const tables = ["campaign_character", "campaign_character_profile", "campaign_character_attribute", "campaign_character_skill_allocation", "campaign_character_item", "campaign_character_item_instance"];
  const snapshot = async () => Promise.all(tables.map(table => rows(`select to_jsonb(t) body from ${table} t order by to_jsonb(t)::text`)));
  const storedBefore = await snapshot();
  await saveRace({ ...base, forms: [form(mechanics)] });
  assert.deepEqual(await snapshot(), storedBefore);
  assert.deepEqual(await getCharacter(character.id, true), before);
});
