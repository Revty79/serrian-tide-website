import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_OWNERSHIP_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const actors = new AsyncLocalStorage();
const god = "ownership-god", admin = "ownership-admin", player = "ownership-player", foreign = "ownership-foreign";
const session = async () => ({ user: { id: actors.getStore() ?? god } });
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: session, requireGod: session, requirePlayer: session,
  requireGodOrAdminAccessContext: async () => {
    const current = await session();
    const roles = (await rows("select role from user_role where user_id=$1", [current.user.id])).map(({ role }) => role);
    if (!roles.some((role) => role === "admin" || role === "god")) throw new Error("Authoring access required.");
    return { session: current, roles };
  },
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { db, pool } = await import("../src/db/index.ts");
const rows = async (text, values = []) => (await pool.query(text, values)).rows;
const one = async (text, values = []) => (await rows(text, values))[0];
const npcs = await import("../src/app/heavens/npcs/actions.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const { getCharacter } = await import("../src/app/characters/actions.ts");
const { getCharacterEncumbrance } = await import("../src/features/characters/character-sheet-rules.ts");
const health = await import("../src/features/active-state/active-health-service.ts");
const effects = await import("../src/features/active-state/active-effects-service.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const constructor = await import("../src/features/creatures/creature-npc-constructor-service.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const actor = { userId: god, roles: ["god"] };
let campaignId, otherCampaignId, ownerA, ownerB, raceOwner, foreignOwner, source;
let sequence = 0;
const create = (overrides = {}) => npcs.createNpc({ campaignId, origin: "creature", buildMode: "detailed", sourceId: source.id, name: `Horse ${++sequence}`, roleLabel: "Companion", notes: "Given at the north gate", ownerCharacterId: ownerA, ...overrides });
const transfer = (characterId, ownerCharacterId, override = {}) => npcs.setCreatureNpcOwner({ campaignId, characterId, ownerCharacterId, ...override });
const root = (id) => one("select * from campaign_character where id=$1", [id]);
const hurt = async (characterId, amount) => health.applyLocalizedDamageToCharacter({
  characterId, amount, poolKey: (await health.getActiveHealth(characterId)).anatomy.pools[0].key,
  injuryName: "Bruise", injuryNotes: "Retain with this individual",
});
const state = async (id) => {
  const result = {};
  for (const table of ["campaign_creature_npc_profile", "campaign_character_profile", "campaign_character_attribute", "campaign_character_skill_allocation", "campaign_character_active_health", "campaign_character_active_health_pool", "campaign_character_injury", "campaign_character_active_condition", "campaign_character_active_modifier", "campaign_character_item", "campaign_character_item_instance"]) {
    result[table] = await rows(`select to_jsonb(t) body from ${table} t where character_id=$1 order by to_jsonb(t)::text`, [id]);
  }
  return result;
};
async function makeCampaign(name) {
  return (await one(`insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id)
    values($1,100,100,50,10,100,0,'Credits','Assigned',$2) returning id`, [name, god])).id;
}
async function character(campaign, name, isNpc = false) {
  const controller = isNpc ? god : player;
  await pool.query("insert into campaign_player(campaign_id,user_id,is_npc_controller) values($1,$2,$3) on conflict do nothing", [campaign, controller, isNpc]);
  const id = (await one("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_build_mode) values($1,$2,$3,$4,$5) returning id", [campaign, controller, name, isNpc, isNpc ? "simple" : null])).id;
  await pool.query("insert into campaign_character_profile(character_id) values($1)", [id]);
  for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,25)", [id, key]);
  return id;
}
before(async () => {
  for (const [id, role] of [[god, "god"], [admin, "admin"], [player, "player"], [foreign, "god"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
  campaignId = await makeCampaign("Ownership Campaign"); otherCampaignId = await makeCampaign("Other Ownership Campaign");
  ownerA = await character(campaignId, "Owner A"); ownerB = await character(campaignId, "Owner B");
  raceOwner = await character(campaignId, "Race NPC Owner", true); foreignOwner = await character(otherCampaignId, "Foreign Owner");
  const draft = creatureDraftFixture();
  draft.core.canonicalName = "Ownership Horse";
  draft.forms = [creatureFormFixture()];
  source = await creatures.saveCreature(draft);
});
after(() => pool.end());

test("G.O.D. creates two independent persistent individuals through the authoritative constructor; owner mechanics and weight stay unchanged", async () => {
  const before = await getCharacter(ownerA, true);
  const beforeRows = await state(ownerA);
  const first = await create({ name: "Star", notes: "Gift from Mira" });
  const second = await create({ name: "Comet", buildMode: "simple" });
  assert.notEqual(first.characterId, second.characterId);
  for (const [entry, name] of [[first, "Star"], [second, "Comet"]]) {
    const row = await root(entry.characterId);
    assert.equal(row.owner_character_id, ownerA); assert.equal(row.is_npc, true); assert.equal(row.npc_kind, "creature");
    assert.equal(row.player_user_id, god); assert.equal(row.name, name);
  }
  const template = await db.transaction((tx) => constructor.readCreatureNpcTemplateInTransaction(tx, source.id));
  const npc = await npcs.getCreatureNpc(first.characterId);
  assert.equal(npc.ownerCharacterId, ownerA);
  assert.deepEqual(npc.baselineSnapshot, constructor.buildCreatureNpcSnapshot(template));
  assert.deepEqual(npc.currentSnapshot, npc.baselineSnapshot); assert.equal(npc.instanceNotes, "Gift from Mira");
  assert.equal(npc.currentSnapshot.forms.length, 1);
  await hurt(first.characterId, 7);
  await effects.addManualCondition({ characterId: first.characterId, name: "Limping", description: "Stone bruise", duration: { kind: "until-removed" } });
  assert.equal((await health.getActiveHealth(first.characterId)).total.damage, 7);
  assert.equal((await health.getActiveHealth(second.characterId)).total.damage, 0);
  assert.equal((await effects.getActiveEffects(second.characterId)).conditions.length, 0);
  assert.deepEqual(await state(ownerA), beforeRows);
  const after = await getCharacter(ownerA, true);
  assert.deepEqual(after, before, "The full owner aggregate, including Skills and mechanics, is unchanged");
  assert.deepEqual(getCharacterEncumbrance(after.items), getCharacterEncumbrance(before.items));
  assert.equal((await rows("select * from campaign_character_item where character_id=$1", [ownerA])).length, 0);
});

test("transfer to a Character or Race NPC and unassignment preserve exact identity, snapshots, health, conditions and history", async () => {
  const { characterId } = await create();
  await hurt(characterId, 9);
  await effects.addManualCondition({ characterId, name: "Tired", description: "Long journey", duration: { kind: "until-removed" } });
  const before = await state(characterId), beforeRoot = await root(characterId);
  for (const owner of [ownerB, raceOwner, null, ownerA]) {
    await transfer(characterId, owner);
    const afterRoot = await root(characterId);
    assert.deepEqual(afterRoot, { ...beforeRoot, owner_character_id: owner, updated_at: afterRoot.updated_at });
    assert.deepEqual(await state(characterId), before);
    assert.equal((await health.getActiveHealth(characterId)).total.damage, 9);
  }
  await health.restoreCharacterHealth(characterId);
  assert.equal((await health.getActiveHealth(characterId)).total.damage, 0);
  assert.equal((await effects.getActiveEffects(characterId)).conditions.length, 1, "Restoration keeps existing condition semantics");
});

test("ordinary unowned NPCs and exact Creature variants still use existing persistence and editing", async () => {
  const ordinary = await create({ ownerCharacterId: null });
  assert.equal((await root(ordinary.characterId)).owner_character_id, null);
  const variant = await creatures.createDerivedCreature(source.id, "Ownership Horse Variant");
  const created = await create({ sourceId: variant.id });
  const draft = await npcs.getCreatureNpc(created.characterId);
  assert.equal(draft.creatureId, variant.id); assert.equal(draft.currentSnapshot.core.parentCreatureId, source.id);
  draft.instanceNotes = "Individual saddle scar";
  draft.ownerCharacterId = ownerB; // A snapshot save cannot bypass the ownership operation.
  await npcs.saveCreatureNpc(draft);
  assert.equal((await npcs.getCreatureNpc(created.characterId)).instanceNotes, "Individual saddle scar");
  assert.equal((await root(created.characterId)).owner_character_id, ownerA);
  const simple = await create({ buildMode: "simple" });
  await npcs.upgradeNpcToDetailed(simple.characterId);
  assert.equal((await root(simple.characterId)).owner_character_id, ownerA);
});

test("cross-campaign, missing, self, Creature-owner, archived-owner, and invalid IDs reject atomically", async () => {
  const { characterId } = await create();
  const count = async () => (await one("select count(*)::int n from campaign_character")).n;
  const beforeCount = await count(), before = await state(characterId);
  for (const owner of [foreignOwner, 2147483647, characterId, 0, -1, 1.5, "1", undefined]) {
    await assert.rejects(transfer(characterId, owner));
    if (owner !== undefined) await assert.rejects(create({ ownerCharacterId: owner }));
  }
  await assert.rejects(transfer(characterId, ownerA, { campaignId: otherCampaignId }));
  await assert.rejects(transfer(ownerA, ownerB));
  await assert.rejects(create({ origin: "race" }), /Only individual Creature/);
  await lifecycle.archiveLifecycleEntityForActor({ entityKind: "player-character", entityId: ownerB }, actor);
  await assert.rejects(transfer(characterId, ownerB), /Restore the owning Character/);
  await lifecycle.restoreLifecycleEntityForActor({ entityKind: "player-character", entityId: ownerB }, actor);
  assert.equal(await count(), beforeCount); assert.deepEqual(await state(characterId), before);
  for (const [id, owner] of [[characterId, foreignOwner], [characterId, 2147483647], [characterId, characterId], [ownerA, ownerB]]) {
    await assert.rejects(pool.query("update campaign_character set owner_character_id=$1 where id=$2", [owner, id]), /constraint/);
  }
});

test("Players and other G.O.D.s gain no ownership, NPC editing, lifecycle, or active-state authority; Admin retains record authority", async () => {
  const { characterId } = await create();
  const before = await state(characterId), draft = await npcs.getCreatureNpc(characterId);
  for (const id of [player, foreign]) await actors.run(id, async () => {
    for (const call of [() => create(), () => transfer(characterId, ownerB), () => npcs.listCreatureOwners(campaignId), () => npcs.saveCreatureNpc(draft), () => health.restoreCharacterHealth(characterId), () => effects.addManualCondition({ characterId, name: "Unauthorized", description: "", duration: { kind: "until-removed" } })]) await assert.rejects(call());
    await assert.rejects(lifecycle.archiveLifecycleEntityForActor({ entityKind: "creature-npc", entityId: characterId }, { userId: id, roles: [id === player ? "player" : "god"] }));
  });
  await actors.run(admin, async () => {
    await transfer(characterId, ownerB);
    const created = await create(); assert.equal((await root(created.characterId)).player_user_id, god);
    await assert.rejects(health.restoreCharacterHealth(characterId), /permission/);
  });
  assert.deepEqual(await state(characterId), before);
  await pool.query("delete from user_role where user_id=$1", [god]);
  await assert.rejects(transfer(characterId, ownerA));
  await pool.query("insert into user_role(user_id,role) values($1,'god')", [god]);
});

test("archive/restore retain ownership; owner deletion is blocked; Campaign graph deletion stays scoped and atomic", async () => {
  const localCampaign = await makeCampaign("Ownership Lifecycle");
  const owner = await character(localCampaign, "Lifecycle Owner");
  const { characterId } = await create({ campaignId: localCampaign, ownerCharacterId: owner });
  const before = await state(characterId);
  const target = { entityKind: "creature-npc", entityId: characterId };
  await lifecycle.archiveLifecycleEntityForActor(target, actor, "Resting");
  assert.equal((await root(characterId)).owner_character_id, owner);
  await assert.rejects(transfer(characterId, null, { campaignId: localCampaign }), /Archived NPCs/);
  await lifecycle.restoreLifecycleEntityForActor(target, actor);
  assert.deepEqual(await state(characterId), before);
  await assert.rejects(pool.query("delete from campaign_character where id=$1", [owner]), /foreign key/);
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor({ entityKind: "player-character", entityId: owner }, actor), /Owned Creatures/);
  await transfer(characterId, null, { campaignId: localCampaign });
  await lifecycle.permanentlyDeleteLifecycleEntityForActor({ entityKind: "player-character", entityId: owner }, actor);
  assert.deepEqual(await state(characterId), before);
  const anotherOwner = await character(localCampaign, "Another Owner");
  await transfer(characterId, anotherOwner, { campaignId: localCampaign });
  const campaignTarget = { entityKind: "campaign", entityId: localCampaign };
  await lifecycle.archiveLifecycleEntityForActor(campaignTarget, actor);
  await assert.rejects(transfer(characterId, null, { campaignId: localCampaign }), /Restore this Campaign/);
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(campaignTarget, actor, "Ownership Lifecycle", {
    afterCampaignDeleteStep: () => { throw new Error("Ownership rollback probe"); },
  }), /Ownership rollback probe/);
  assert.equal((await root(characterId)).owner_character_id, anotherOwner);
  assert.deepEqual(await state(characterId), before);
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(campaignTarget, actor, "Ownership Lifecycle");
  assert.equal(await root(characterId), undefined);
  assert.ok(await root(ownerA)); assert.ok(await root(foreignOwner));
});
