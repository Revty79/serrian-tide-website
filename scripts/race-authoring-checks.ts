import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { race } from "@/db/race-schema";
import { createRaceVariantForActor } from "@/features/races/race-variant-service";
import { readRaceNaturalProtectionInTransaction, saveRaceNaturalProtectionInTransaction } from "@/features/races/race-natural-protection-service";
import { archiveLifecycleEntityForActor, restoreLifecycleEntityForActor, previewLifecycleEntityForActor, permanentlyDeleteLifecycleEntityForActor } from "@/features/lifecycle/lifecycle-service";
import { readProtectionLayersInTransaction } from "@/features/protection/protection-service";
import { resolveIncomingEffect } from "@/features/incoming-effects/resolve-incoming-effect";
import { runRaceAuthoringBrowser } from "./race-authoring-browser";
import { applyLocalizedDamageInTransaction, healAreaInTransaction, readActiveHealthInTransaction } from "@/features/active-state/active-health-service";

if (process.env.SERRIAN_DISPOSABLE_RACE_AUTHORING !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_race_authoring_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Race authoring harness.");
const actor = { userId: "race-author-god", roles: ["god"] as const };
const target = (id: number) => ({ entityKind: "race" as const, entityId: id });
async function rows(table: string, id: number) { return (await pool.query(`select * from ${table} where race_id=$1 order by sort_order,id`, [id])).rows; }
function childDefinition(row: Record<string, unknown>) {
  const copy = { ...row }; for (const key of ["id", "race_id", "created_at", "updated_at"]) delete copy[key]; return copy;
}
function coreDefinition(row: Record<string, unknown>) {
  const copy = { ...row }; for (const key of ["id", "name", "parent_race_id", "created_at", "updated_at", "created_by_user_id", "source_system", "source_external_id", "archived_at", "archived_by_user_id", "archive_reason"]) delete copy[key]; return copy;
}
async function main() {
  for (const [id, role] of [[actor.userId, "god"], ["race-other-god", "god"], ["race-player", "player"]]) {
    await pool.query('insert into "user"(id,name,email,email_verified,username,display_username) values($1,$1,$2,true,$1,$1)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
  const rules = { schemaVersion: 1, rules: [{ key: "silver", name: "Silver required", ruleType: "requirement", scope: "damage", match: "ALL", conditions: [{ key: "silver-material", kind: "item-property", propertyName: "Material", value: "Silver" }], percentage: null, notes: "Keep this rule", sortOrder: 0 }] };
  const parent = (await pool.query(`insert into races(name,size,base_magic,legacy_description,physical_characteristics,physical_description,age_range_text,age_min,age_max,racial_quirk_name,quirk_success_effect,quirk_failure_effect,common_languages_known,common_archetypes,genre_examples,cultural_mindset,outlook_on_magic,interaction_rules_json,created_by_user_id)
    values ('Variant Authoring Parent','Medium',3,'Original legacy lore','Scales and feathers','Detailed description','20-300',20,300,'Memory','Recall','Forget','Tide Cant','Scout','Fantasy','Curious','Respectful',$1,$2) returning *`, [rules, actor.userId])).rows[0];
  const parentId = parent.id as number;
  for (const [index, attribute] of ["STR", "DEX", "CON", "INT", "WIS", "CHR"].entries()) await pool.query("insert into race_attribute_caps(race_id,attribute_key,max_value,sort_order) values($1,$2,$3,$4)", [parentId, attribute, 40 + index, index]);
  await pool.query("insert into race_movement_modes(race_id,movement_mode,base_value,notes,sort_order) values($1,'Land',3,'Walk safely',0),($1,'Swim',2.5,'Water only',1)", [parentId]);
  const root = (await pool.query("insert into skill(name,classification,tier) values('Race Test Root','standard',1) returning id")).rows[0].id;
  const gift = (await pool.query("insert into skill(name,classification,tier) values('Race Test Gift','Special Ability',null) returning id")).rows[0].id;
  await pool.query("insert into race_skill_links(race_id,skill_id,link_type,value,sort_order) values($1,$2,'Skill',2,0),($1,$3,'Granted',1,0)", [parentId, root, gift]);
  const definitions = [{ key: "hide", name: "Hide", naturalSoak: 2, coverage: { kind: "all" as const }, sortOrder: 0 }, { key: "shell", name: "Shell", naturalSoak: 0.5, coverage: { kind: "locations" as const, locationKeys: ["9"] }, sortOrder: 1 }];
  await db.transaction((tx) => saveRaceNaturalProtectionInTransaction(tx, parentId, definitions));
  for (const id of [0, -1, NaN, 2147483647]) await assert.rejects(createRaceVariantForActor(id, "Invalid", actor.userId), /saved|Save|Parent/);
  await assert.rejects(createRaceVariantForActor(parentId, " ", actor.userId), /Name/);
  await assert.rejects(createRaceVariantForActor(parentId, "Player clone", "race-player"), /access/);
  await assert.rejects(createRaceVariantForActor(parentId, "Other owner clone", "race-other-god"), /creator/);
  console.log("PASS: saved-parent, name, current role and source authoring permissions enforced");

  const variantId = await createRaceVariantForActor(parentId, "Independent Variant", actor.userId);
  const [variant] = await db.select().from(race).where(eq(race.id, variantId));
  assert.equal(variant.parentRaceId, parentId); assert.equal(variant.createdByUserId, actor.userId);
  const variantRaw = (await pool.query("select * from races where id=$1", [variantId])).rows[0];
  assert.deepEqual(coreDefinition(variantRaw), coreDefinition(parent));
  for (const table of ["race_attribute_caps", "race_movement_modes", "race_skill_links", "race_natural_protections"]) {
    const originals = await rows(table, parentId), copies = await rows(table, variantId);
    assert.deepEqual(copies.map(childDefinition), originals.map(childDefinition), table);
    assert.ok(copies.every((copy) => !originals.some((original) => original.id === copy.id)), `${table} identities must be independent`);
  }
  assert.deepEqual(await db.transaction((tx) => readRaceNaturalProtectionInTransaction(tx, variantId)), definitions);
  const coverage = (await pool.query("select l.* from race_natural_protection_locations l join race_natural_protections p on p.id=l.protection_id where p.race_id=$1", [variantId])).rows;
  assert.deepEqual(coverage.map(({ location_key }) => location_key), ["9"]);
  console.log("PASS: complete core, lore, Quirk, rules, caps, movement, Skills and protection copied with new owned identities");

  await pool.query("update races set cultural_mindset='Variant only',interaction_rules_json=jsonb_set(interaction_rules_json,'{rules,0,notes}','\"Variant rule\"') where id=$1", [variantId]);
  await pool.query("update race_attribute_caps set max_value=7 where race_id=$1 and attribute_key='STR'", [variantId]);
  assert.equal((await pool.query("select cultural_mindset from races where id=$1", [parentId])).rows[0].cultural_mindset, "Curious");
  assert.equal((await rows("race_attribute_caps", parentId))[0].max_value, 40);
  await pool.query("update races set base_magic=9 where id=$1", [parentId]);
  await pool.query("update race_movement_modes set notes='Parent only' where race_id=$1", [parentId]);
  assert.equal((await pool.query("select base_magic from races where id=$1", [variantId])).rows[0].base_magic, 3);
  assert.equal((await rows("race_movement_modes", variantId))[0].notes, "Walk safely");
  await pool.query("update races set base_magic=3 where id=$1", [parentId]);
  await pool.query("update race_movement_modes set notes=case when movement_mode='Land' then 'Walk safely' else 'Water only' end where race_id=$1", [parentId]);
  const grandchild = await createRaceVariantForActor(variantId, "Grandchild", actor.userId);
  assert.equal((await pool.query("select parent_race_id from races where id=$1", [grandchild])).rows[0].parent_race_id, variantId);
  assert.deepEqual((await pool.query("select id from races where parent_race_id=$1 order by id", [parentId])).rows.map(({ id }) => id), [variantId]);
  console.log("PASS: later edits in either direction stay independent and only direct variants are listed");

  const preview = await previewLifecycleEntityForActor(target(parentId), actor);
  assert.equal(preview.canDelete, false); assert.equal(preview.dependencies.find(({ label }) => label === "Child Race variants")?.count, 1);
  await assert.rejects(permanentlyDeleteLifecycleEntityForActor(target(parentId), actor), /Child Race variants/);
  await assert.rejects(pool.query("delete from races where id=$1", [parentId]), /foreign key/);
  await archiveLifecycleEntityForActor(target(parentId), actor, "Archive parent only");
  await assert.rejects(createRaceVariantForActor(parentId, "Archived parent clone", actor.userId), /Restore/);
  assert.equal((await pool.query("select archived_at from races where id=$1", [variantId])).rows[0].archived_at, null);
  await restoreLifecycleEntityForActor(target(parentId), actor);
  await archiveLifecycleEntityForActor(target(variantId), actor, "Archive child only");
  assert.equal((await pool.query("select archived_at from races where id=$1", [parentId])).rows[0].archived_at, null);
  await restoreLifecycleEntityForActor(target(variantId), actor);
  await permanentlyDeleteLifecycleEntityForActor(target(grandchild), actor);
  await permanentlyDeleteLifecycleEntityForActor(target(variantId), actor);
  for (const table of ["race_attribute_caps", "race_movement_modes", "race_skill_links", "race_natural_protections"]) assert.deepEqual(await rows(table, variantId), []);
  assert.equal((await rows("race_natural_protections", parentId)).length, 2);
  console.log("PASS: archive/restore are independent; FK and lifecycle protect parents; leaf deletion removes only its children");

  await pool.query("update races set source_system='fixture-import',source_external_id='original' where id=$1", [parentId]);
  const importedClone = await createRaceVariantForActor(parentId, "Imported source clone", actor.userId);
  const identity = (await pool.query("select source_system,source_external_id,created_by_user_id from races where id=$1", [importedClone])).rows[0];
  assert.deepEqual(identity, { source_system: null, source_external_id: null, created_by_user_id: actor.userId });
  await permanentlyDeleteLifecycleEntityForActor(target(importedClone), actor);
  await pool.query("update races set source_system=null,source_external_id=null where id=$1", [parentId]);
  console.log("PASS: cloned source/import identity is cleared and creator belongs to the cloning user");

  const campaign = (await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Race Reader Campaign',100,100,50,10,100,250,'Credits','Assigned',$1) returning id", [actor.userId])).rows[0].id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaign, actor.userId]);
  await pool.query("insert into campaign_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaign, parentId]);
  await pool.query("insert into campaign_allowed_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaign, parentId]);
  const character = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Race Reader Character') returning id", [campaign, actor.userId])).rows[0].id;
  await pool.query("insert into campaign_character_profile(character_id,race_id) values($1,$2)", [character, parentId]);
  for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,35)", [character, key]);
  const profile = await db.transaction((tx) => readProtectionLayersInTransaction(tx, { kind: "character", characterId: character }));
  assert.deepEqual(profile.natural.map(({ soak }) => soak), [2, 0.5]); assert.ok(profile.natural.every((row) => !("armor" in row)));
  const incoming = { effect: { label: "Incoming", amount: 10, harmful: null }, source: { damageType: "Fire", magical: false, sourceKind: "weapon" as const, weaponFamily: "none" as const, itemProperties: [], itemTags: [], mechanicalEffectKind: "health.damage" as const, conditionName: null }, target: { ruleSource: { kind: "race" as const, id: `race:${parentId}`, name: parent.name }, interactionRules: null, protection: profile }, hitLocationKey: "0" };
  assert.equal(resolveIncomingEffect(incoming).finalEffect?.damage, 8);
  assert.equal(resolveIncomingEffect({ ...incoming, hitLocationKey: "9" }).issues[0].code, "multiple-natural");
  console.log("PASS: actual Character reader exposes single Race Soak and retains overlap ruling boundary");
  await pool.query("insert into user_role(user_id,role) values($1,'player')", [actor.userId]);
  await runRaceAuthoringBrowser({ parentId, actorUserId: actor.userId, characterId: character });
  const readHealth = () => db.transaction((tx) => readActiveHealthInTransaction(tx, character, "race"));
  const health = await readHealth();
  const tail = health.anatomy.hitLocations.find((location) => location.result === 7)!;
  assert.equal(tail.name, "Tail"); assert.ok(tail.poolKey);
  assert.equal(health.anatomy.totalMaximumHp, 72, "Race Size must not change character HP rules");
  const protection = await db.transaction((tx) => readProtectionLayersInTransaction(tx, { kind: "character", characterId: character }));
  assert.equal(protection.locations.find((location) => location.key === "7")?.name, "Tail");
  await db.transaction((tx) => applyLocalizedDamageInTransaction(tx, { characterId: character, hitLocationNumber: 7, amount: 4, injuryName: "Bruised tail", injuryNotes: "Anatomy test" }, "race"));
  assert.equal((await readHealth()).view.tracks.find((track) => track.key === tail.poolKey)?.damage, 4);
  await db.transaction((tx) => healAreaInTransaction(tx, character, "race", tail.poolKey!, 1));
  const damaged = await readHealth();
  assert.equal(damaged.view.tracks.find((track) => track.key === tail.poolKey)?.damage, 3);
  assert.equal(damaged.view.injuries[0].poolKey, tail.poolKey);
  const source = (await pool.query("select anatomy_json from races where id=$1", [parentId])).rows[0].anatomy_json;
  source.hpPools.find((entry: { canonicalId: string }) => entry.canonicalId === tail.poolKey).poolName = "Renamed Tail";
  await pool.query("update races set anatomy_json=$1 where id=$2", [source, parentId]);
  assert.equal((await readHealth()).view.tracks.find((track) => track.key === tail.poolKey)?.damage, 3);
  await pool.query("update races set anatomy_json=null where id=$1", [parentId]);
  const reverted = await readHealth();
  assert.equal(reverted.view.tracks.find((track) => track.key === tail.poolKey)?.orphaned, true);
  assert.equal(reverted.view.totalDamage, damaged.view.totalDamage);
  assert.deepEqual(reverted.view.injuries, damaged.view.injuries);
  console.log("PASS: saved Race anatomy reaches runtime health/protection; tail damage and healing persist; renames/default restoration preserve damage and injuries");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
