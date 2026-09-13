import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { pool } from "../src/db";
import { userRole } from "../src/db/authorization-schema";
import { campaignCharacterItemInstance } from "../src/db/realm-schema";
import { campaignSessionEncounter, campaignCharacterFirearmState } from "../src/db/tabletop-operations-schema";
import { initializeFirearmStateInTransaction } from "../src/features/tabletop-operations/firearm-readiness-service";
import { handleMagazineInTransaction } from "../src/features/items/magazine-inventory-service";
import { prepareCharacterFirearm } from "../src/features/items/firearm-setup-service";
import { readEffectiveFirearmState, validateMagazineSwap } from "../src/features/items/firearm-magazine-service";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { digest, readCatalog, type Catalog } from "./weapon-catalog-repair";
import { applyMagazineRepair, magazineReview, planMagazineRepair } from "./magazine-catalog-repair";

const url=new URL(process.env.DATABASE_URL!);
assert.ok(process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION === "true" && url.hostname === "127.0.0.1" && url.pathname === "/serrian_combat_completion_dev" && url.port !== "5432","Use the disposable combat harness, not shared DEV.");
after(() => pool.end());
const source: Catalog=JSON.parse(readFileSync("artifacts/magazine-catalog-repair/reviewed-targets.json","utf8"));
const actor="magazine-catalog-test-admin";
type Tx=Parameters<typeof completionServiceFixture>[0];
async function fixture(run: (client: pg.Client,reviewed: Catalog,tx: Tx) => Promise<void>) {
  const client=new pg.Client({ connectionString:url.toString() }); await client.connect();
  const rollback=new Error("ROLLBACK_MAGAZINE_REPAIR_FIXTURE");
  try {
    await assert.rejects(drizzle(client).transaction(async (tx) => {
    assert.equal((await client.query("select count(*)::int n from items")).rows[0].n,0,"Use an empty disposable catalog.");
    await client.query('insert into "user"(id,name,email) values($1,$2,$3)',[actor,"Magazine Catalog Test","magazine-catalog@example.invalid"]);
    await client.query("insert into user_role(user_id,role) values($1,'admin')",[actor]);
    await client.query("insert into items select * from jsonb_populate_recordset(null::items,$1::jsonb)",[JSON.stringify(source.items.map((i) => ({ ...i,created_by_user_id:actor,parent_item_id:null,archived_by_user_id:null })))]);
    await client.query("insert into weapon_profiles select * from jsonb_populate_recordset(null::weapon_profiles,$1::jsonb)",[JSON.stringify(source.profiles)]);
    for (const [id,name] of [[1021,"Existing five-round rifle magazine"],[1022,"Existing revolver drum"]]) await client.query("insert into items(id,canonical_id,name,catalog_scope,record_type,family,category,price_basis,created_by_user_id) values($1,$2,$3,'inventory','Magazine','Test','Magazine','unit',$4)",[id,`TEST-MAG-${id}`,name,actor]);
    await client.query("insert into magazine_profiles(item_id,capacity_rounds,fill_initiative_cost_per_round) values(1021,5,null),(1022,6,0)");
    await client.query("insert into magazine_ammunition(magazine_item_id,ammunition_item_id) values(1021,155),(1022,1008)");
    await client.query("insert into weapon_magazines(weapon_profile_id,magazine_item_id) values(242,1022)");
    for (const p of source.profiles.filter((p) => p.profile_record_type === "Weapon")) await client.query("insert into weapon_firing_modes(weapon_profile_id,name,normalized_name,sort_order,mechanics_review_required) values($1,'Single','single',0,true)",[p.id]);
    for (const table of ["items","weapon_profiles"]) await client.query(`select setval(pg_get_serial_sequence('${table}','id'),(select max(id) from ${table}))`);
    await run(client,magazineReview(await readCatalog(client)),tx);
    throw rollback;
    }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
  } finally { await client.end(); }
}

test("repair creates all nine exact models, retains old models/zero costs, and repeats without writes",async () => fixture(async (client,reviewed) => {
  const before=await readCatalog(client);
  const result=await applyMagazineRepair(client,reviewed,planMagazineRepair(before,reviewed).digest,actor);
  assert.equal(result.createdItems.length,9); assert.equal(result.links.length,9); assert.equal(result.plan.patches.length,21);
  assert.deepEqual(result.after.magazines.filter((m) => [1021,1022].includes(Number(m.item_id))),before.magazines);
  assert.deepEqual(result.after.profiles.find((p) => p.item_id === 112),before.profiles.find((p) => p.item_id === 112));
  assert.deepEqual(result.after.profiles.find((p) => p.item_id === 77),before.profiles.find((p) => p.item_id === 77));
  for (const i of result.createdItems) assert.equal(i.credits,null);
  assert.equal(result.after.weaponMagazines.filter((m) => m.weapon_profile_id === 61).length,2);
  const retry=await applyMagazineRepair(client,reviewed,planMagazineRepair(result.after,reviewed).digest,actor);
  assert.equal(retry.createdItems.length+retry.links.length+retry.plan.patches.length,0);
  assert.equal(digest(retry.after),digest(result.after));
}));

test("all nine models fill, attach, detach and empty with exact conservation; 500 rounds is not clamped to weapon capacity",async () => fixture(async (client,reviewed,tx) => {
  const before=await readCatalog(client);
  const result=await applyMagazineRepair(client,reviewed,planMagazineRepair(before,reviewed).digest,actor);
  const f=await completionServiceFixture(tx,"repaired-magazines");
  await tx.insert(userRole).values([{ userId:f.godId,role:"god" },{ userId:f.godId,role:"player" }]).onConflictDoNothing();
  await tx.update(campaignSessionEncounter).set({ status:"completed",completedAt:new Date() }).where(eq(campaignSessionEncounter.id,f.encounterId));
  const copies: { weaponId: number; magazineId: number; itemId: number }[]=[];
  for (const model of result.links) {
    const [gun,magazine]=await tx.insert(campaignCharacterItemInstance).values([model.weaponItemId,model.magazineItemId].map((itemId) => ({ characterId:f.heroId,itemId,currentCharges:0,equipmentState:"wielded",unitCostCredits:0 }))).returning();
    const mode=(await client.query("select id from weapon_firing_modes where weapon_profile_id=$1 order by id limit 1",[model.weaponProfileId])).rows[0].id;
    await initializeFirearmStateInTransaction(tx,{ campaignId:f.campaignId,encounterId:null },f.godId,{ characterId:f.heroId,itemId:model.weaponItemId,itemInstanceId:gun.id,selectedFiringModeId:mode,readinessModeRuling:"draw-is-ready",reason:"Explicit disposable fixture readiness ruling; live missing costs stay unauthored.",idempotencyKey:crypto.randomUUID() });
    await client.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,$3,2) on conflict(character_id,item_id) do update set quantity=campaign_character_item.quantity+excluded.quantity",[f.heroId,model.ammunitionItemId,model.capacity]);
    const looseBefore=Number((await client.query("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[f.heroId,model.ammunitionItemId])).rows[0].quantity);
    const fill={ characterId:f.heroId,instanceId:magazine.id,operation:"fill" as const,ammunitionItemId:model.ammunitionItemId,rounds:null,expectedRounds:0,expectedAmmunitionItemId:null,requestKey:crypto.randomUUID() };
    await handleMagazineInTransaction(tx,f.godId,fill); await handleMagazineInTransaction(tx,f.godId,fill);
    const state=async () => (await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId,gun.id)))[0];
    const attach={ characterId:f.heroId,instanceId:gun.id,operation:"magazine" as const,magazineInstanceId:magazine.id,expectedVersion:(await state()).version,requestKey:crypto.randomUUID() };
    await prepareCharacterFirearm(tx,f.godId,attach);
    const effective=await readEffectiveFirearmState(tx,await state());
    assert.equal(effective.loadedRounds,model.capacity); assert.equal(effective.capacityRounds,model.capacity);
    assert.equal((await state()).loadedRounds,0);
    if (model.capacity === 500) assert.equal((await state()).capacityRounds,100);
    await prepareCharacterFirearm(tx,f.godId,{ ...attach,magazineInstanceId:null,expectedVersion:(await state()).version,requestKey:crypto.randomUUID() });
    const empty={ ...fill,operation:"empty" as const,expectedRounds:model.capacity,expectedAmmunitionItemId:model.ammunitionItemId,requestKey:crypto.randomUUID() };
    await handleMagazineInTransaction(tx,f.godId,empty); await handleMagazineInTransaction(tx,f.godId,empty);
    assert.equal(Number((await client.query("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[f.heroId,model.ammunitionItemId])).rows[0].quantity),looseBefore);
    copies.push({ weaponId:gun.id,magazineId:magazine.id,itemId:model.weaponItemId });
  }
  const carbine=copies.find((c) => c.itemId === 2)!,luger=copies.find((c) => c.itemId === 3)!;
  const state=(await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId,carbine.weaponId)))[0];
  await assert.rejects(validateMagazineSwap(tx,state,luger.magazineId),/physically compatible/);
}));

test("hunting and sniper rifles load five individual rounds, reject a sixth, and unload without a detachable magazine",async () => fixture(async (client,reviewed,tx) => {
  await applyMagazineRepair(client,reviewed,planMagazineRepair(await readCatalog(client),reviewed).digest,actor);
  const f=await completionServiceFixture(tx,"internal-five");
  await tx.insert(userRole).values([{ userId:f.godId,role:"god" },{ userId:f.godId,role:"player" }]).onConflictDoNothing();
  await tx.update(campaignSessionEncounter).set({ status:"completed",completedAt:new Date() }).where(eq(campaignSessionEncounter.id,f.encounterId));
  for (const itemId of [63,123]) {
    const p=(await client.query("select * from weapon_profiles where item_id=$1",[itemId])).rows[0];
    const [gun]=await tx.insert(campaignCharacterItemInstance).values({ characterId:f.heroId,itemId,currentCharges:0,equipmentState:"wielded",unitCostCredits:0 }).returning();
    const mode=(await client.query("select id from weapon_firing_modes where weapon_profile_id=$1",[p.id])).rows[0].id;
    await initializeFirearmStateInTransaction(tx,{ campaignId:f.campaignId,encounterId:null },f.godId,{ characterId:f.heroId,itemId,itemInstanceId:gun.id,selectedFiringModeId:mode,readinessModeRuling:"draw-is-ready",reason:"Explicit fixture readiness ruling.",idempotencyKey:crypto.randomUUID() });
    await client.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,6,2)",[f.heroId,p.ammunition_item_id]);
    const state=async () => (await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId,gun.id)))[0];
    const load=async () => prepareCharacterFirearm(tx,f.godId,{ characterId:f.heroId,instanceId:gun.id,operation:"load",rounds:1,expectedVersion:(await state()).version,requestKey:crypto.randomUUID() });
    for (let i=1;i<=5;i++) { await load(); assert.equal((await state()).loadedRounds,i); }
    await assert.rejects(load(),/capacity|full|fit|exceed/i);
    await prepareCharacterFirearm(tx,f.godId,{ characterId:f.heroId,instanceId:gun.id,operation:"unload",expectedVersion:(await state()).version,requestKey:crypto.randomUUID() });
    assert.equal((await state()).loadedRounds,0);
    assert.equal(Number((await client.query("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[f.heroId,p.ammunition_item_id])).rows[0].quantity),6);
  }
}));

test("stale plan and unauthorized actor cannot author a magazine",async () => fixture(async (client,reviewed) => {
  const before=await readCatalog(client),plan=planMagazineRepair(before,reviewed);
  await assert.rejects(applyMagazineRepair(client,reviewed,plan.digest,"unrelated"),/administrator/);
  await client.query("update items set name='Other new edit' where id=1021");
  const changed=await readCatalog(client);
  await assert.rejects(applyMagazineRepair(client,reviewed,plan.digest,actor),/changed after planning/);
  assert.equal(digest(await readCatalog(client)),digest(changed));
}));

test("failed compatibility insertion rolls back every newly created model and loading change",async () => fixture(async (client,reviewed) => {
  const before=await readCatalog(client);
  await client.query("savepoint repair_failure");
  await client.query("create function pg_temp.reject_mag_link() returns trigger language plpgsql as $$ begin if new.weapon_profile_id=2 then raise exception 'simulated magazine link failure'; end if; return new; end $$");
  await client.query("create trigger magazine_link_failure before insert on weapon_magazines for each row execute function pg_temp.reject_mag_link()");
  await assert.rejects(applyMagazineRepair(client,reviewed,planMagazineRepair(before,reviewed).digest,actor));
  await client.query("rollback to savepoint repair_failure");
  assert.equal(digest(await readCatalog(client)),digest(before));
}));
