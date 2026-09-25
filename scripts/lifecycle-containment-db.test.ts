import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { pool } from "@/db";
import { permanentlyDeleteLifecycleEntityForActor } from "@/features/lifecycle/lifecycle-service";
import type { LifecycleActor, LifecycleEntityKind } from "@/features/lifecycle/types";

if (!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_containment_dev$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run the disposable inventory-containment harness.");
}
after(() => pool.end());

type CharacterKind = Extract<LifecycleEntityKind, "player-character" | "race-npc" | "creature-npc">;
type Contents = "stack" | "exact" | "nested";
async function id(query: string, values: unknown[] = []): Promise<number> {
  const result = await pool.query<{ id: number }>(query, values);
  assert.equal(result.rows.length, 1);
  return result.rows[0].id;
}

async function fixture() {
  const ownerId = `containment-lifecycle-${randomUUID()}`;
  await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [ownerId, `${ownerId}@example.invalid`]);
  await pool.query("insert into user_role(user_id,role) values($1,'god')", [ownerId]);
  const campaignName = `Containment lifecycle ${randomUUID()}`;
  const campaignId = await id("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id) values($1,0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id", [campaignName, ownerId]);
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaignId, ownerId]);
  const modelId = await id("insert into items(canonical_id,name,catalog_scope,record_type,family,category,price_basis) values($1,'Container','inventory','Item','Fixture','Fixture','unit') returning id", [`CONTAINER-${randomUUID()}`.toUpperCase()]);
  const itemId = await id("insert into items(canonical_id,name,catalog_scope,record_type,family,category,price_basis) values($1,'Supplies','inventory','Item','Fixture','Fixture','unit') returning id", [`CONTENT-${randomUUID()}`.toUpperCase()]);
  const exactItemId = await id("insert into items(canonical_id,name,catalog_scope,record_type,family,category,price_basis) values($1,'Charged copy','inventory','Item','Fixture','Fixture','unit') returning id", [`EXACT-${randomUUID()}`.toUpperCase()]);
  await pool.query("insert into container_profiles(item_id,max_weight_lb,volume_capacity_l,max_item_dimension_cm) values($1,100,100,100)", [modelId]);
  await pool.query("update items set weight=1,weight_unit='lb',volume_l=1,longest_dimension_cm=10 where id=any($1::int[])", [[modelId, itemId, exactItemId]]);
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use) values($1,'charges',5,1)", [exactItemId]);
  await pool.query("update container_profiles set weight_capacity_mode='unlimited',volume_capacity_mode='unlimited',contained_weight_behavior='fixed',fixed_loaded_weight_lb=2,time_behavior='suspended' where item_id=$1", [modelId]);
  await pool.query("update container_profiles set source=$2 where item_id=$1", [modelId, JSON.stringify({ mode: "finite", maxQuantity: 2, locked: true, allowsItems: true, substance: { id: "water", name: "Water", unit: "L", weightLbPerUnit: 2, volumeLPerUnit: 1, physicalForm: "liquid", isMagical: false } })]);
  const actor: LifecycleActor = { userId: ownerId, roles: ["god"] };
  async function character(kind: CharacterKind, contents: Contents = "nested") {
    const characterId = await id("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values($1,$2,$3,$4,$5,$6) returning id",
      [campaignId, ownerId, `${kind} fixture`, kind !== "player-character", kind === "creature-npc" ? "creature" : "race", kind === "player-character" ? null : "detailed"]);
    await pool.query("insert into campaign_character_profile(character_id) values($1)", [characterId]);
    const copy = (copyItemId: number) => id("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,$3,4) returning id", [characterId, copyItemId, copyItemId === exactItemId ? 5 : 0]);
    const outerId = await copy(modelId);
    await pool.query("insert into inventory_container_substance(instance_id,character_id,item_id,substance,quantity) values($1,$2,$3,$4,1.3)", [outerId, characterId, modelId, JSON.stringify({ id: "water", name: "Water", unit: "L", weightLbPerUnit: 2, volumeLPerUnit: 1, physicalForm: "liquid", isMagical: false })]);
    let innerId = outerId;
    if (contents === "nested") {
      innerId = await copy(modelId);
      await pool.query("insert into inventory_instance_location(instance_id,character_id,item_id,container_instance_id,container_item_id) values($1,$2,$3,$4,$3)", [innerId, characterId, modelId, outerId]);
    }
    let exactId: number | null = null;
    if (contents !== "stack") {
      exactId = await copy(exactItemId);
      await pool.query("insert into inventory_instance_location(instance_id,character_id,item_id,container_instance_id,container_item_id) values($1,$2,$3,$4,$5)", [exactId, characterId, exactItemId, innerId, modelId]);
    }
    if (contents !== "exact") {
      await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,10,3)", [characterId, itemId]);
      await pool.query("insert into inventory_stack_location(character_id,item_id,container_instance_id,container_item_id,quantity) values($1,$2,$3,$4,8)", [characterId, itemId, innerId, modelId]);
    }
    return { characterId, outerId, innerId, exactId, kind };
  }
  return { actor, ownerId, campaignName, campaignId, modelId, itemId, exactItemId, character };
}

async function inventorySnapshot(characterId: number) {
  const result: Record<string, unknown[]> = {};
  for (const table of ["inventory_container_substance", "inventory_instance_location", "inventory_stack_location", "campaign_character_item", "campaign_character_item_instance", "campaign_character_profile"] as const) {
    result[table] = (await pool.query(`select to_jsonb(t) row from ${table} t where character_id=$1 order by to_jsonb(t)::text`, [characterId])).rows;
  }
  result.character = (await pool.query("select * from campaign_character where id=$1", [characterId])).rows;
  return result;
}

for (const [kind, contents] of [
  ["player-character", "stack"], ["player-character", "exact"], ["player-character", "nested"],
  ["race-npc", "nested"], ["creature-npc", "nested"],
] as const) {
  test(`permanent ${kind} deletion clears ${contents} containment and preserves other roots`, async () => {
    const f = await fixture();
    const target = await f.character(kind, contents);
    const sentinel = await f.character("player-character");
    const before = await inventorySnapshot(sentinel.characterId);
    const targetBefore = await inventorySnapshot(target.characterId);
    assert.ok(targetBefore.inventory_instance_location.length + targetBefore.inventory_stack_location.length > 0);
    await permanentlyDeleteLifecycleEntityForActor({ entityKind: kind, entityId: target.characterId }, f.actor);
    assert.ok(Object.values(await inventorySnapshot(target.characterId)).every(rows => rows.length === 0), "No ownership or containment rows may survive root deletion");
    assert.deepEqual(await inventorySnapshot(sentinel.characterId), before, "Other Character contents stay intact");
    assert.equal((await pool.query("select id from campaign where id=$1", [f.campaignId])).rowCount, 1);
    assert.equal((await pool.query('select id from "user" where id=$1', [f.ownerId])).rowCount, 1);
    assert.equal((await pool.query("select item_id from container_profiles where item_id=$1", [f.modelId])).rowCount, 1);
    assert.equal((await pool.query("select id from lifecycle_audit_event where entity_kind=$1 and target_id=$2 and action='delete'", [kind, String(target.characterId)])).rowCount, 1);
  });
}

test("permanent Campaign deletion clears nested Player and NPC containment only in that Campaign", async () => {
  const f = await fixture(), other = await fixture();
  const targets = await Promise.all((["player-character", "race-npc", "creature-npc"] as const).map(kind => f.character(kind)));
  const sentinel = await other.character("creature-npc");
  const before = await inventorySnapshot(sentinel.characterId);
  await permanentlyDeleteLifecycleEntityForActor({ entityKind: "campaign", entityId: f.campaignId }, f.actor, f.campaignName);
  assert.equal((await pool.query("select id from campaign where id=$1", [f.campaignId])).rowCount, 0);
  for (const target of targets) assert.ok(Object.values(await inventorySnapshot(target.characterId)).every(rows => rows.length === 0));
  assert.deepEqual(await inventorySnapshot(sentinel.characterId), before);
  assert.equal((await pool.query("select id from items where id=any($1::int[])", [[f.modelId, f.itemId, f.exactItemId]])).rowCount, 3);
});

test("failed Campaign deletion restores both location tables and ownership atomically", async () => {
  const f = await fixture(), target = await f.character("player-character");
  const before = await inventorySnapshot(target.characterId);
  await assert.rejects(permanentlyDeleteLifecycleEntityForActor({ entityKind: "campaign", entityId: f.campaignId }, f.actor, f.campaignName, {
    afterCampaignDeleteStep(tableName) {
      if (tableName === "inventory_stack_location") throw new Error("forced containment cleanup rollback");
    },
  }), /forced containment cleanup rollback/);
  assert.deepEqual(await inventorySnapshot(target.characterId), before);
  assert.equal((await pool.query("select id from lifecycle_audit_event where entity_kind='campaign' and target_id=$1 and action='delete'", [String(f.campaignId)])).rowCount, 0);
});

test("unauthorized root deletion leaves containment intact", async () => {
  const f = await fixture(), target = await f.character("player-character");
  const before = await inventorySnapshot(target.characterId);
  await assert.rejects(permanentlyDeleteLifecycleEntityForActor({ entityKind: "player-character", entityId: target.characterId }, { userId: "not-the-owner", roles: ["god"] }), /creator|permission|access/i);
  assert.deepEqual(await inventorySnapshot(target.characterId), before);
});

test("ordinary occupied container removal is still blocked", async () => {
  const f = await fixture(), target = await f.character("player-character");
  const before = await inventorySnapshot(target.characterId);
  await assert.rejects(pool.query("delete from campaign_character_item_instance where id=$1", [target.outerId]), /Empty the container/);
  await assert.rejects(pool.query("update campaign_character_item_instance set retired_at=now(),retirement_reason='fixture removal' where id=$1", [target.innerId]), /Empty the container/);
  assert.deepEqual(await inventorySnapshot(target.characterId), before);
});

test("ordinary contained exact Item removal requires moving it loose first", async () => {
  const f = await fixture(), target = await f.character("player-character", "exact");
  const before = await inventorySnapshot(target.characterId);
  await assert.rejects(pool.query("delete from campaign_character_item_instance where id=$1", [target.exactId]), /Move this owned copy to loose/);
  assert.deepEqual(await inventorySnapshot(target.characterId), before);
  await pool.query("delete from inventory_instance_location where instance_id=$1", [target.exactId]);
  await pool.query("delete from campaign_character_item_instance where id=$1", [target.exactId]);
  assert.equal((await pool.query("select id from campaign_character_item_instance where id=$1", [target.exactId])).rowCount, 0);
});

test("ordinary stack reduction cannot consume its allocated quantity", async () => {
  const f = await fixture(), target = await f.character("player-character", "stack");
  const before = await inventorySnapshot(target.characterId);
  await assert.rejects(pool.query("update campaign_character_item set quantity=7 where character_id=$1 and item_id=$2", [target.characterId, f.itemId]), /Move the allocated stack quantity to loose/);
  assert.deepEqual(await inventorySnapshot(target.characterId), before);
  await pool.query("update campaign_character_item set quantity=8 where character_id=$1 and item_id=$2", [target.characterId, f.itemId]);
  assert.equal((await pool.query("select quantity from inventory_stack_location where character_id=$1", [target.characterId])).rows[0].quantity, 8);
});
