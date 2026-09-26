import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.SERRIAN_DISPOSABLE_RACE_AUTHORING !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_race_authoring_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Race authoring harness.");
const actors = new AsyncLocalStorage();
const actor = { userId: "form-preview-god", roles: ["god"] };
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
const { wolfFormMechanics } = await import("./race-form-mechanics-fixture.ts");
const { getCharacter, saveCharacter } = await import("../src/app/characters/actions.ts");
const rows = async (sql, args = []) => (await pool.query(sql, args)).rows;
const { transformationFixture } = await import("./race-form-transformation-fixture.ts");
const { FORM_ENTRY_METHODS, FORM_DURATION_MODES, FORM_EXIT_METHODS } = await import("../src/features/races/race-form-transformation.ts");
const { resolveCharacterFormPreview } = await import("../src/features/characters/character-form-preview.ts");
const { characterAggregateToDraft, evaluateCharacterReadiness } = await import("../src/features/characters/character-rules.ts");
const { buildCharacterPrintData } = await import("../src/features/characters/character-print.ts");
const { getActiveHealth } = await import("../src/features/active-state/active-health-service.ts");
const { getActiveMana } = await import("../src/features/active-state/active-mana-service.ts");
const { getCharacterEquipmentState } = await import("../src/features/items/equipment-state-service.ts");
before(async () => {
  await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [actor.userId, `${actor.userId}@example.invalid`]);
  await pool.query("insert into user_role(user_id,role) values($1,'god')", [actor.userId]);
});
after(() => pool.end());
async function fixture() {
  const [race] = await rows("insert into races(name,size,created_by_user_id) values('Form Preview Race','Medium',$1) returning id", [actor.userId]);
  const [skill] = await rows("insert into skill(name,classification,tier,primary_attribute) values('Preview Predisposition','standard',1,'DEX') returning id");
  const [ability] = await rows("insert into skill(name,classification,tier,definition) values('Preview Ability','Special Ability',null,'Authored preview ability') returning id");
  const base = await getRace(race.id);
  const form = { ...emptyRaceForm("wolf"), name: "Preview Wolf", mechanics: wolfFormMechanics(skill.id, ability.id), transformation: transformationFixture() };
  const saved = await saveRace({ ...base, forms: [form] });
  return { saved, skillId: skill.id };
}
async function characterFixture(raceId) {
  const [campaign] = await rows("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Preview Campaign',300,100,50,10,100,250,'Credits','Assigned',$1) returning id", [actor.userId]);
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaign.id, actor.userId]);
  await pool.query("insert into campaign_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaign.id, raceId]);
  await pool.query("insert into campaign_allowed_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaign.id, raceId]);
  const [character] = await rows("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Preview Character') returning id", [campaign.id, actor.userId]);
  await pool.query("insert into campaign_character_profile(character_id,race_id) values($1,$2)", [character.id, raceId]);
  for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,35)", [character.id, key]);
  await getActiveHealth(character.id); await getActiveMana(character.id); await getCharacterEquipmentState(character.id);
  await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,7) on conflict (character_id) do update set total_damage=7", [character.id]);
  const [item] = await rows("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis) values($1,'Preview Token','equipment','general','Item','General','General','each') returning id", [`FORM-PREVIEW-${character.id}`]);
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,3,0)", [character.id, item.id]);
  await pool.query("insert into campaign_character_item_equipment_state(character_id,item_id,state,quantity) values($1,$2,'equipped',1)", [character.id, item.id]);
  return character.id;
}
async function snapshot() {
  const tables = await rows("select tablename from pg_tables where schemaname='public' and (tablename like 'campaign_character%' or tablename like 'character_%' or tablename like 'inventory_%') order by tablename");
  return Object.fromEntries(await Promise.all(tables.map(async ({ tablename }) => [tablename, await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));
}

test("existing Forms remain transformation-neutral and old callers preserve authored definitions", async () => {
  const { saved } = await fixture();
  const legacy = structuredClone(saved); delete legacy.forms[0].transformation;
  assert.deepEqual((await saveRace(legacy)).forms[0].transformation, transformationFixture());
  await pool.query("update race_forms set transformation_json=null where race_id=$1", [saved.id]);
  assert.equal((await getRace(saved.id)).forms[0].transformation, null);
  assert.deepEqual((await getRace(saved.id)).forms[0].mechanics, saved.forms[0].mechanics);
});
test("all entry methods, independent timing/costs, requirements, triggers, duration, exit and cooldown persist", async () => {
  const { saved } = await fixture();
  const forms = FORM_ENTRY_METHODS.map((entryMethod, i) => ({ ...saved.forms[0], key: `method-${i}`, name: `Method ${entryMethod}`, transformation: { ...transformationFixture(), entryMethod } }));
  let result = await saveRace({ ...saved, forms });
  assert.deepEqual(result.forms.map(form => form.transformation), forms.map(form => form.transformation));
  assert.deepEqual((await getRace(saved.id)).forms, result.forms);
  for (const mode of FORM_DURATION_MODES) {
    result.forms[0].transformation.duration = { mode, description: "Duration ruling" };
    result.forms[0].transformation.exitMethods = [...FORM_EXIT_METHODS];
    result = await saveRace(result);
    assert.equal(result.forms[0].transformation.duration.mode, mode);
    assert.deepEqual(result.forms[0].transformation.exitMethods, FORM_EXIT_METHODS);
  }
  result.forms[0].transformation.entryTiming = { mode: "instant", initiativeCost: null, time: "", notes: "Explicit instant" };
  result.forms[0].transformation.exitTiming = { mode: "initiative", initiativeCost: 7, time: "Return time", notes: "" };
  result.forms[0].transformation.useLimits = [{ maximumUses: 1, refreshScope: "encounter", refreshKey: null, notes: "Once each encounter", sortOrder: 0 }];
  assert.deepEqual((await saveRace(result)).forms[0].transformation, result.forms[0].transformation);
});
test("variant transformation definitions deep-copy under independent Form identities", async () => {
  const { saved } = await fixture(), clone = await createRaceVariant(saved.id, "Transformation Variant");
  assert.notEqual(clone.forms[0].id, saved.forms[0].id);
  assert.deepEqual(clone.forms[0].transformation, saved.forms[0].transformation);
  clone.forms[0].transformation.entryCosts.costs[0].amount = 17;
  clone.forms[0].transformation.requirements[0].numericValue = 20;
  clone.forms[0].transformation.useLimits[0].maximumUses = 9;
  await saveRace(clone);
  assert.deepEqual((await getRace(saved.id)).forms[0].transformation, transformationFixture());
  await saveRace({ ...saved, forms: [] });
  assert.equal((await rows("select * from race_forms where id=$1", [saved.forms[0].id])).length, 0);
  assert.equal((await getRace(clone.id)).forms[0].transformation.entryCosts.costs[0].amount, 17);
});
test("Character reads zero Forms unchanged and resolves only exact selected Race, including many independent Forms", async () => {
  const { saved } = await fixture(), variant = await createRaceVariant(saved.id, "Exact Variant");
  const child = await createRaceVariant(variant.id, "Child Variant"), sibling = await createRaceVariant(saved.id, "Sibling Variant");
  assert.ok(child.id && sibling.id);
  const many = Array.from({ length: 35 }, (_, index) => ({ ...variant.forms[0], key: `variant-${index}`, name: `Variant Form ${index}` }));
  const exact = await saveRace({ ...variant, forms: many });
  const characterId = await characterFixture(variant.id), aggregate = await getCharacter(characterId, true);
  assert.deepEqual(aggregate.selectedRace.formPreview.forms, exact.forms);
  assert.equal(aggregate.selectedRace.formPreview.forms.length, 35);
  assert.ok(aggregate.selectedRace.formPreview.forms.every(form => form.raceId === variant.id));
  await saveRace({ ...exact, forms: [] });
  const empty = await getCharacter(characterId, true);
  assert.equal(empty.selectedRace.formPreview, undefined);
  assert.deepEqual({ ...aggregate.selectedRace, formPreview: undefined }, { ...empty.selectedRace, formPreview: undefined });
});
test("preview selections leave DB, readiness, stored Attributes, health, inventory, equipment and normal print unchanged", async () => {
  const { saved } = await fixture(), characterId = await characterFixture(saved.id);
  const aggregate = await getCharacter(characterId, true), draft = characterAggregateToDraft(aggregate);
  const stored = await snapshot(), original = structuredClone(draft), readiness = evaluateCharacterReadiness(draft, aggregate, aggregate.selectedRace);
  const printed = buildCharacterPrintData(aggregate, draft, aggregate.selectedRace);
  const preview = resolveCharacterFormPreview(draft, aggregate.selectedRace, saved.forms[0].id, aggregate.skillCatalog);
  assert.equal(preview.attributes[0].value, 40); assert.equal(preview.attributes[5].value, 30);
  assert.equal(preview.skillAdditions[1].definition, "Authored preview ability");
  assert.equal(resolveCharacterFormPreview(draft, aggregate.selectedRace, null, aggregate.skillCatalog), null);
  assert.deepEqual(await snapshot(), stored); assert.deepEqual(draft, original);
  assert.deepEqual(evaluateCharacterReadiness(draft, aggregate, aggregate.selectedRace), readiness);
  assert.deepEqual(buildCharacterPrintData(aggregate, draft, aggregate.selectedRace), printed);
});
test("saving an unrelated Character edit after preview never saves adjusted data", async () => {
  const { saved } = await fixture(), characterId = await characterFixture(saved.id);
  const aggregate = await getCharacter(characterId, true), draft = characterAggregateToDraft(aggregate);
  const health = await getActiveHealth(characterId), equipment = await getCharacterEquipmentState(characterId);
  const preview = resolveCharacterFormPreview(draft, aggregate.selectedRace, saved.forms[0].id, aggregate.skillCatalog);
  assert.equal(preview.attributes[1].value, 45);
  draft.profile.personality = "Unrelated personality edit";
  const result = await saveCharacter(characterId, draft, false, true);
  assert.equal(result.profile.personality, draft.profile.personality);
  assert.deepEqual(result.attributes, aggregate.attributes);
  assert.deepEqual(result.skillAllocations, aggregate.skillAllocations);
  assert.deepEqual(result.items, aggregate.items); assert.deepEqual(result.itemInstances, aggregate.itemInstances);
  assert.equal(result.profile.hpMultiplierSteps, aggregate.profile.hpMultiplierSteps);
  assert.equal(result.profile.baseMovementSteps, aggregate.profile.baseMovementSteps);
  assert.equal(result.profile.creationCompletedAt, aggregate.profile.creationCompletedAt);
  assert.deepEqual(await getActiveHealth(characterId), health);
  assert.deepEqual(await getCharacterEquipmentState(characterId), equipment);
});
