import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_campaign_skills_test$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Campaign Skill harness.");
let actor = "skill-owner";
mock.module(pathToFileURL(path.resolve("src/lib/auth.ts")).href, { namedExports: { auth: { api: { getSession: async () => ({ user: { id: actor } }) } } } });
mock.module("next/headers", { namedExports: { headers: async () => new Headers() } });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("next/navigation", { namedExports: { redirect(url) { throw new Error(`REDIRECT:${url}`); } } });
const { pool, db } = await import("../src/db/index.ts");
const admin = await import("../src/app/heavens/campaigns/actions.ts");
const creation = await import("../src/app/heavens/campaigns/new/actions.ts");
const characters = await import("../src/app/characters/actions.ts");
const { characterAggregateToDraft } = await import("../src/features/characters/character-rules.ts");
const service = await import("../src/features/campaigns/campaign-skill-access-service.ts");
const constructor = await import("../src/features/creatures/creature-npc-constructor-service.ts");
after(() => pool.end());

test("lifecycle explains exclusion-only Skill dependencies and deletes only the owning Campaign exclusions", async () => {
  const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
  const ownerId = "exclusion-lifecycle-owner";
  const owner = { userId: ownerId, roles: ["god"] };
  await pool.query(`insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,'Exclusion Owner','exclusion-owner@test.invalid',true,now(),now())`, [ownerId]);
  const skillId = (await pool.query("insert into skill(name,classification,tier,primary_attribute,definition,created_by_user_id) values('Exclusion only','standard',1,'INT','',$1) returning id", [ownerId])).rows[0].id;
  const campaignIds = [];
  for (const name of ["Exclusion lifecycle Campaign", "Independent exclusion Campaign"]) {
    const id = (await pool.query("insert into campaign(name,created_by_user_id,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points) values($1,$2,100,100,25,10,100,0,'Credits','Assigned',0) returning id", [name, ownerId])).rows[0].id;
    campaignIds.push(id);
    await pool.query("insert into campaign_skill_exclusion(campaign_id,skill_id,path_key) values($1,$2,$3)", [id, skillId, String(skillId)]);
  }
  const target = { entityKind: "skill", entityId: skillId };
  const preview = await lifecycle.previewLifecycleEntityForActor(target, owner);
  assert.equal(preview.canDelete, false);
  assert.deepEqual(preview.dependencies.filter(({ blocking, count }) => blocking && count > 0), [
    { label: "Campaign Skill exclusions", blocking: true, count: 2 },
  ]);
  assert.ok(preview.blockers.includes("Campaign Skill exclusions: 2"));
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(target, owner), /referenced: Campaign Skill exclusions \(2\)/);
  await assert.rejects(pool.query("delete from skill where id=$1", [skillId]), { constraint: "campaign_skill_exclusion_skill_id_skill_id_fk" });
  const campaignTarget = { entityKind: "campaign", entityId: campaignIds[0] };
  const campaignPreview = await lifecycle.previewLifecycleEntityForActor(campaignTarget, owner);
  assert.equal(campaignPreview.canDelete, true);
  assert.deepEqual(campaignPreview.dependencies.find(({ label }) => label === "Campaign Skill exclusions"), {
    label: "Campaign Skill exclusions", blocking: false, count: 1,
  });
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(campaignTarget, owner, "Exclusion lifecycle Campaign");
  assert.deepEqual((await pool.query("select campaign_id from campaign_skill_exclusion where skill_id=$1", [skillId])).rows, [{ campaign_id: campaignIds[1] }]);
  assert.equal((await lifecycle.previewLifecycleEntityForActor(target, owner)).dependencies.find(({ label }) => label === "Campaign Skill exclusions").count, 1);
  // Exercise the unchanged database cascade separately from the explicit service plan.
  await pool.query("delete from campaign where id=$1", [campaignIds[1]]);
  assert.equal((await lifecycle.previewLifecycleEntityForActor(target, owner)).canDelete, true);
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(target, owner);
  assert.equal((await pool.query("select count(*)::int n from skill where id=$1", [skillId])).rows[0].n, 0);
});

test("create/edit/reload, exact server allocation/XP enforcement, historical preservation, and grants", async () => {
  await pool.query(`insert into "user" (id,name,email,email_verified,created_at,updated_at) values ('skill-owner','Owner','skill-owner@test.invalid',true,now(),now()),('skill-player','Player','skill-player@test.invalid',true,now(),now())`);
  await pool.query("insert into user_role(user_id,role) values ('skill-owner','god'),('skill-owner','player'),('skill-player','player')");
  const ids = [];
  for (let tier = 1; tier <= 5; tier++) ids.push((await pool.query("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'standard',$2,'INT','Disposable recursive branch') returning id", [`Campaign depth ${tier}`, tier])).rows[0].id);
  for (let i = 1; i < ids.length; i++) await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type) values($1,$2,'parent')", [ids[i], ids[i - 1]]);
  const excluded = [{ skillId: ids[1], pathKey: ids.slice(0, 2).join(">") }];
  async function create(name, exclusions) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ name, overview: "", attributePoints: 150, skillPoints: 150, maxStartingSkill: 25, pointsToUnlockNextTier: 25, maxPointsInSkill: 100, startingCreditAmount: 0, currencySystem: "Credits", fatePointMethod: "Assigned", assignedFatePoints: 0, skillExclusions: JSON.stringify(exclusions) })) form.set(key, String(value));
    for (const system of ["Tier 1", "Tier 2", "Tier 3", "Spellcraft", "Talismanism", "Faith", "Special Abilities"]) form.append("allowedSystems", system);
    await assert.rejects(creation.createCampaign(form), /^Error: REDIRECT:\/heavens\?campaign=/);
    return (await pool.query("select id from campaign where name=$1", [name])).rows[0].id;
  }
  const campaignId = await create("Restricted Campaign", excluded);
  const otherId = await create("Independent Campaign", []);
  assert.deepEqual((await admin.getCampaignAdmin(campaignId)).skillExclusions, excluded);
  assert.deepEqual((await admin.getCampaignAdmin(otherId)).skillExclusions, []);
  await assert.rejects(pool.query("insert into campaign_skill_exclusion(campaign_id,skill_id,path_key) values($1,$2,$3)", [campaignId, ids[1], excluded[0].pathKey]), /duplicate key/);
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,'skill-player')", [campaignId]);
  let character = await characters.createCharacterForPlayer(campaignId, "skill-player");
  const characterId = character.character.id;
  let draft = characterAggregateToDraft(character);
  draft.skillAllocations = ids.map((skillId, index) => ({ draftId: -(index + 1), skillId, parentDraftId: index === 0 ? null : -index, points: 25 }));
  await assert.rejects(characters.saveCharacter(characterId, draft, false, true), /Excluded|restricted/);
  assert.equal((await pool.query("select count(*)::int n from campaign_character_skill_allocation where character_id=$1", [characterId])).rows[0].n, 0);
  let settings = await admin.getCampaignAdmin(campaignId);
  settings.skillExclusions = [];
  await admin.saveCampaignAdmin(settings);
  character = await characters.saveCharacter(characterId, draft, false, true);
  assert.equal(character.skillAllocations.length, 5, "five-level server save succeeds");
  const before = (await pool.query("select * from campaign_character_skill_allocation where character_id=$1 order by id", [characterId])).rows;
  await pool.query("update campaign_character_profile set creation_completed_at=now(),experience=100,total_experience=0 where character_id=$1", [characterId]);
  settings = await admin.getCampaignAdmin(campaignId); settings.skillExclusions = excluded;
  const saved = await admin.saveCampaignAdmin(settings);
  assert.equal(saved.skillConflicts.filter(row => row.characterId === characterId && row.source === "allocation").length, 4);
  assert.deepEqual((await pool.query("select * from campaign_character_skill_allocation where character_id=$1 order by id", [characterId])).rows, before);
  assert.deepEqual((await admin.getCampaignAdmin(otherId)).skillExclusions, []);
  actor = "skill-player";
  await assert.rejects(characters.advanceCharacterSkill(characterId, ids[4], before[3].id, 1), /preserved|Excluded|restricted/);
  await assert.rejects(characters.advanceCharacterSkills(characterId, [{ planId: "missing-parent", skillId: ids[1], parentAllocationId: null, parentPlanId: null, pointsToAdd: 1 }]), /path|parent/);
  assert.deepEqual((await pool.query("select experience,total_experience from campaign_character_profile where character_id=$1", [characterId])).rows[0], { experience: 100, total_experience: 0 });
  actor = "skill-owner";
  character = await characters.getCharacter(characterId, true); draft = characterAggregateToDraft(character);
  character = await characters.saveCharacter(characterId, draft, false, true);
  draft = characterAggregateToDraft(character);
  draft.skillAllocations.pop();
  await assert.rejects(characters.saveCharacter(characterId, draft, false, true), /preserved/);
  const newSkill = (await pool.query("insert into skill(name,classification,tier,primary_attribute,definition) values('New default Skill','standard',1,'INT','') returning id")).rows[0].id;
  assert.equal(await db.transaction(async tx => (await service.loadCampaignSkillAccessInTransaction(tx, campaignId)).access.resolve(String(newSkill)).allowed), true);
  const raceId = (await pool.query("insert into races(name) values('Restricted grant Race') returning id")).rows[0].id;
  await pool.query("insert into race_skill_links(race_id,skill_id,link_type,value) values($1,$2,'bonus',5)", [raceId, ids[1]]);
  await pool.query("insert into campaign_race(campaign_id,race_id) values($1,$2)", [campaignId, raceId]);
  await pool.query("insert into campaign_allowed_race(campaign_id,race_id) values($1,$2)", [campaignId, raceId]);
  const raceCharacter = await characters.createCharacterForPlayer(campaignId, "skill-player");
  const raceDraft = characterAggregateToDraft(raceCharacter); raceDraft.profile.raceId = raceId;
  await assert.rejects(characters.saveCharacter(raceCharacter.character.id, raceDraft, false, true), /grant/);
  const creatureId = (await pool.query("insert into creatures(canonical_id,canonical_name,size) values('CAMPAIGN-GRANT','Restricted grant Creature','Medium') returning id")).rows[0].id;
  await pool.query("insert into creature_skill_links(creature_id,skill_id,rank) values($1,$2,'5')", [creatureId, ids[1]]);
  await assert.rejects(db.transaction(async tx => {
    const template = await constructor.readCreatureNpcTemplateInTransaction(tx, creatureId);
    await constructor.createCreatureNpcInTransaction(tx, { campaignId, controllerUserId: "skill-owner", creatureId, name: "Blocked Creature", snapshot: constructor.buildCreatureNpcSnapshot(template) });
  }), /grant/);
  settings = await admin.getCampaignAdmin(campaignId); settings.skillExclusions = [];
  await admin.saveCampaignAdmin(settings);
  const creatureCharacterId = await db.transaction(async tx => {
    const template = await constructor.readCreatureNpcTemplateInTransaction(tx, creatureId);
    return constructor.createCreatureNpcInTransaction(tx, { campaignId, controllerUserId: "skill-owner", creatureId, name: "Retained Creature", snapshot: constructor.buildCreatureNpcSnapshot(template) });
  });
  await characters.saveCharacter(raceCharacter.character.id, raceDraft, false, true);
  settings = await admin.getCampaignAdmin(campaignId); settings.skillExclusions = excluded;
  const conflicts = (await admin.saveCampaignAdmin(settings)).skillConflicts;
  assert.ok(conflicts.some(row => row.characterId === creatureCharacterId && row.source === "creature grant"));
  assert.ok(conflicts.some(row => row.characterId === raceCharacter.character.id && row.source === "race grant"));
  assert.equal((await pool.query("select count(*)::int n from campaign_character_skill_allocation where character_id=$1", [characterId])).rows[0].n, 5);
  await assert.rejects(admin.saveCampaignAdmin({ ...settings, skillExclusions: [{ skillId: ids[4], pathKey: `${ids[0]}>${ids[4]}` }] }), /invalid/);
  assert.deepEqual((await admin.getCampaignAdmin(campaignId)).skillExclusions, excluded, "invalid save rolls back");
});
