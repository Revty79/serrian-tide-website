import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const defaultWindowsPostgresBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN
  ?? (existsSync(defaultWindowsPostgresBin) ? defaultWindowsPostgresBin : "");
const initdbExecutable = postgresBin ? path.join(postgresBin, "initdb.exe") : "initdb";
const pgCtlExecutable = postgresBin ? path.join(postgresBin, "pg_ctl.exe") : "pg_ctl";

async function loopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("A disposable Shop-commerce PostgreSQL port could not be reserved.");
  return port;
}

async function one<T extends pg.QueryResultRow>(pool: pg.Pool, query: string, values: readonly unknown[] = []): Promise<T> {
  const result = await pool.query<T>(query, [...values]);
  assert.equal(result.rows.length, 1);
  return result.rows[0]!;
}

test("Shop commerce is atomic, repeat-safe, policy-bound, state-preserving, and private", { timeout: 180_000 }, async () => {
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-shop-commerce-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await loopbackPort();
  const concurrencyPools: pg.Pool[] = [];
  let seedPool: pg.Pool | null = null;
  let applicationPool: { end(): Promise<void> } | null = null;
  let started = false;
  try {
    execFileSync(initdbExecutable, ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", dataDirectory], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    process.env.DATABASE_URL = connectionString;
    seedPool = new pg.Pool({ connectionString });
    await migrate(drizzle(seedPool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    assert.equal(Number((await one<{ value: number }>(seedPool, "select count(*)::int value from drizzle.__drizzle_migrations")).value), 41);

    const godId = "commerce-god";
    const otherGodId = "commerce-other-god";
    const playerIds = ["commerce-player-a", "commerce-player-b", "commerce-player-c", "commerce-player-d"];
    await seedPool.query(`insert into "user" (id,name,email,email_verified) values
      ($1,'Commerce G.O.D.','commerce-god@example.invalid',true),
      ($2,'Other G.O.D.','commerce-other-god@example.invalid',true),
      ($3,'Player A','commerce-a@example.invalid',true),
      ($4,'Player B','commerce-b@example.invalid',true),
      ($5,'Player C','commerce-c@example.invalid',true),
      ($6,'Player D','commerce-d@example.invalid',true)`, [godId, otherGodId, ...playerIds]);
    await seedPool.query("insert into user_role (user_id,role) values ($1,'admin')", [godId]);
    const campaign = await one<{ id: number }>(seedPool, `insert into campaign
      (name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id)
      values ('Commerce Campaign','',0,0,0,0,100,0,'Credits','Assigned',0,$1) returning id`, [godId]);
    const foreignCampaign = await one<{ id: number }>(seedPool, `insert into campaign
      (name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id)
      values ('Foreign Campaign','',0,0,0,0,100,0,'Credits','Assigned',0,$1) returning id`, [otherGodId]);
    for (const playerId of playerIds) {
      await seedPool.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,false)", [campaign.id, playerId]);
    }
    await seedPool.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($3,$4,true)", [campaign.id, godId, foreignCampaign.id, otherGodId]);
    const characterIds: number[] = [];
    for (let index = 0; index < playerIds.length; index += 1) {
      const character = await one<{ id: number }>(seedPool, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,$3) returning id", [campaign.id, playerIds[index], `Buyer ${String.fromCharCode(65 + index)}`]);
      characterIds.push(character.id);
      await seedPool.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps,credits_remaining) values ($1,0,0,$2)", [character.id, index === 3 ? 0 : 100]);
    }
    const foreignCharacter = await one<{ id: number }>(seedPool, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Foreign Buyer') returning id", [foreignCampaign.id, otherGodId]);
    await seedPool.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps,credits_remaining) values ($1,0,0,100)", [foreignCharacter.id]);

    const session = await one<{ id: number }>(seedPool, "insert into campaign_session (campaign_id,title,sequence_number,status,started_at) values ($1,'Commerce Session',1,'active',now()) returning id", [campaign.id]);
    const scene = await one<{ id: number }>(seedPool, "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at) values ($1,$2,1,'Market','active',now()) returning id", [session.id, campaign.id]);
    for (let index = 0; index < characterIds.length; index += 1) {
      await seedPool.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4)", [session.id, campaign.id, characterIds[index], index]);
      await seedPool.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,$5)", [scene.id, session.id, campaign.id, characterIds[index], index]);
    }
    const shop = await one<{ id: number }>(seedPool, `insert into shop
      (campaign_id,name,category,description,storefront_state,balance_credits,character_purchase_mode,sold_item_handling,changed_sale_confirmation_mode)
      values ($1,'Ledger & Lantern','Goods','Commerce test Shop.','open',100,'immediate','remove-from-active-play','character-owner-accepts') returning id`, [campaign.id]);
    await seedPool.query("insert into campaign_session_prepared_shop (session_id,campaign_id,shop_id,sort_order) values ($1,$2,$3,0)", [session.id, campaign.id, shop.id]);
    await seedPool.query("insert into campaign_session_scene_shop (scene_id,session_id,campaign_id,shop_id,sort_order,revealed) values ($1,$2,$3,$4,0,true)", [scene.id, session.id, campaign.id, shop.id]);

    const stackItem = await one<{ id: number }>(seedPool, `insert into items
      (canonical_id,name,catalog_scope,record_type,family,category,description,credits,price_basis)
      values ('COMMERCE-STACK','Trail Ration','inventory','misc','Supplies','Travel','A ration.',10,'Each') returning id`);
    const serviceItem = await one<{ id: number }>(seedPool, `insert into items
      (canonical_id,name,catalog_scope,record_type,family,category,description,credits,price_basis)
      values ('COMMERCE-SERVICE','Local Directions','inventory','misc','Services','Services','Narrative directions.',0,'Each') returning id`);
    const lastStockItem = await one<{ id: number }>(seedPool, `insert into items
      (canonical_id,name,catalog_scope,record_type,family,category,description,credits,price_basis)
      values ('COMMERCE-LAST','Last Lantern','inventory','misc','Supplies','Travel','The last lantern.',5,'Each') returning id`);
    const chargedItem = await one<{ id: number }>(seedPool, `insert into items
      (canonical_id,name,catalog_scope,record_type,family,category,description,credits,price_basis)
      values ('COMMERCE-CHARGED','Signal Crystal','equipment','gear','Tools','Tools','A charged crystal.',12,'Each') returning id`);
    const firearmItem = await one<{ id: number }>(seedPool, `insert into items
      (canonical_id,name,catalog_scope,record_type,family,category,description,credits,price_basis)
      values ('COMMERCE-FIREARM','Road Pistol','equipment','weapon','Firearm','Weapons','A loaded-state rehearsal firearm.',25,'Each') returning id`);
    const freshExactItem = await one<{ id: number }>(seedPool, `insert into items
      (canonical_id,name,catalog_scope,record_type,family,category,description,credits,price_basis)
      values ('COMMERCE-FRESH-EXACT','Wayfinder Stone','equipment','gear','Tools','Tools','A freshly stocked charged Item.',6,'Each') returning id`);
    await seedPool.query(`insert into item_runtime_profiles
      (item_id,use_mode,quantity_per_use,maximum_charges,charges_per_use,recharge_notes,activation_label,use_notes)
      values ($1,'charges',null,10,1,'Recharge at a shrine.','Signal','')`, [chargedItem.id]);
    await seedPool.query(`insert into item_runtime_profiles
      (item_id,use_mode,quantity_per_use,maximum_charges,charges_per_use,recharge_notes,activation_label,use_notes)
      values ($1,'charges',null,4,1,'Recharge under the stars.','Navigate','')`, [freshExactItem.id]);
    const firearmProfile = await one<{ id: number }>(seedPool, `insert into weapon_profiles
      (item_id,profile_record_type,weapon_type,capacity_rounds,readiness_mode,fire_modes)
      values ($1,'firearm','Pistol',6,'separate-ready-action','["Single"]') returning id`, [firearmItem.id]);
    const firingMode = await one<{ id: number }>(seedPool, `insert into weapon_firing_modes
      (weapon_profile_id,name,normalized_name,sort_order,base_cycling_initiative_cost,base_recoil_reset_initiative_cost,delivery_cadence,rounds_per_cadence,mechanics_review_required)
      values ($1,'Single','single',0,1,1,'per-trigger',1,false) returning id`, [firearmProfile.id]);
    await seedPool.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0),($1,$3,1),($1,$4,2),($1,$5,3),($1,$6,4),($1,$7,5)", [campaign.id, stackItem.id, serviceItem.id, lastStockItem.id, chargedItem.id, firearmItem.id, freshExactItem.id]);
    const stackOffering = await one<{ id: number }>(seedPool, `insert into shop_offering
      (shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,selling_price_override_credits,buying_price_override_credits,sort_order)
      values ($1,$2,$3,'inventory-transfer',true,true,null,4,0) returning id`, [shop.id, campaign.id, stackItem.id]);
    const serviceOffering = await one<{ id: number }>(seedPool, `insert into shop_offering
      (shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,selling_price_override_credits,buying_price_override_credits,sort_order)
      values ($1,$2,$3,'service-narrative',true,true,null,null,1) returning id`, [shop.id, campaign.id, serviceItem.id]);
    const lastOffering = await one<{ id: number }>(seedPool, `insert into shop_offering
      (shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,limited_quantity,sort_order)
      values ($1,$2,$3,'inventory-transfer',true,false,1,2) returning id`, [shop.id, campaign.id, lastStockItem.id]);
    const freshExactOffering = await one<{ id: number }>(seedPool, `insert into shop_offering
      (shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,sort_order)
      values ($1,$2,$3,'inventory-transfer',true,true,3) returning id`, [shop.id, campaign.id, freshExactItem.id]);
    const soldInstance = await one<{ id: number }>(seedPool, `insert into campaign_character_item_instance
      (character_id,item_id,current_charges,equipment_state,unit_cost_credits) values ($1,$2,3,'inactive',8) returning id`, [characterIds[0], chargedItem.id]);
    const soldFirearm = await one<{ id: number }>(seedPool, `insert into campaign_character_item_instance
      (character_id,item_id,current_charges,equipment_state,unit_cost_credits) values ($1,$2,0,'inactive',20) returning id`, [characterIds[0], firearmItem.id]);
    await seedPool.query(`insert into campaign_character_firearm_state
      (item_instance_id,campaign_id,character_id,item_id,weapon_profile_id,selected_firing_mode_id,loaded_rounds,capacity_rounds,capacity_source,readiness_mode,readiness_mode_source,readied,requires_cycling,requires_recoil_recovery,initialization_key,initialized_by_user_id,updated_by_user_id)
      values ($1,$2,$3,$4,$5,$6,0,6,'canonical','separate-ready-action','canonical',true,true,true,'commerce-firearm-source',$7,$7)`, [soldFirearm.id, campaign.id, characterIds[0], firearmItem.id, firearmProfile.id, firingMode.id, godId]);

    const dbModule = await import("@/db");
    applicationPool = dbModule.pool;
    const commerce = await import("@/features/tabletop-operations/shop-commerce-service");
    const visits = await import("@/features/tabletop-operations/shop-visit-service");
    const lifecycle = await import("@/features/lifecycle/lifecycle-service");
    const tabletopLifecycle = await import("@/features/lifecycle/tabletop-lifecycle-service");
    const accountLifecycle = await import("@/features/lifecycle/admin-account-lifecycle-service");
    const purchaseTerms = new Map<number, {
      version: number;
      unitPriceCredits: number;
      fulfillmentKind: "inventory-transfer" | "service-narrative";
    }>([
      [stackOffering.id, { version: 0, unitPriceCredits: 10, fulfillmentKind: "inventory-transfer" }],
      [serviceOffering.id, { version: 0, unitPriceCredits: 0, fulfillmentKind: "service-narrative" }],
      [lastOffering.id, { version: 0, unitPriceCredits: 5, fulfillmentKind: "inventory-transfer" }],
      [freshExactOffering.id, { version: 0, unitPriceCredits: 6, fulfillmentKind: "inventory-transfer" }],
    ]);
    function quotePurchase(offeringId: number, quantity: number) {
      const quoted = purchaseTerms.get(offeringId);
      if (!quoted) throw new Error(`Missing displayed terms for offering ${offeringId}.`);
      return {
        offeringId,
        quantity,
        expectedOfferingVersion: quoted.version,
        quotedUnitPriceCredits: quoted.unitPriceCredits,
        quotedFulfillmentKind: quoted.fulfillmentKind,
      };
    }
    const godActor = { userId: godId, roles: ["god"] as const };
    const visit = await dbModule.db.transaction((tx) => visits.startOrAddShopVisitInTransaction(tx, {
      sceneId: scene.id,
      shopId: shop.id,
      placement: { kind: "independent" as const },
      characterIds,
      mode: "roleplay",
      closedShopOverrideReason: "",
    }, godActor));

    const immediateLines = [await quotePurchase(stackOffering.id, 2), await quotePurchase(serviceOffering.id, 2), await quotePurchase(freshExactOffering.id, 1)];
    const immediate = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[0]!,
      lines: immediateLines,
      narrativeNote: "Supplies and directions.",
      submissionKey: "immediate-a",
    }, playerIds[0]!));
    assert.equal(immediate.status, "completed");
    const repeatedImmediate = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[0]!,
      lines: immediateLines,
      narrativeNote: "Supplies and directions.",
      submissionKey: "immediate-a",
    }, playerIds[0]!));
    assert.deepEqual(repeatedImmediate, immediate);
    assert.equal(Number((await one<{ value: number }>(seedPool, "select count(*)::int value from shop_transaction where request_id=$1", [immediate.requestId])).value), 1);
    assert.equal(Number((await one<{ quantity: number }>(seedPool, "select quantity from campaign_character_item where character_id=$1 and item_id=$2", [characterIds[0], stackItem.id])).quantity), 2);
    assert.equal(Number((await one<{ value: number }>(seedPool, "select count(*)::int value from campaign_character_item where character_id=$1 and item_id=$2", [characterIds[0], serviceItem.id])).value), 0, "a service must not create inventory");
    assert.deepEqual(await one<{ current_charges: number; equipment_state: string }>(seedPool, "select current_charges,equipment_state from campaign_character_item_instance where character_id=$1 and item_id=$2 and retired_at is null", [characterIds[0], freshExactItem.id]), { current_charges: 4, equipment_state: "inactive" }, "a fresh exact Item did not use the established initialization rules");
    assert.deepEqual(await one<{ character_balance: number; shop_balance: number }>(seedPool, `select p.credits_remaining character_balance,s.balance_credits shop_balance
      from campaign_character_profile p cross join shop s where p.character_id=$1 and s.id=$2`, [characterIds[0], shop.id]), { character_balance: 74, shop_balance: 126 });
    await assert.rejects(dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[0]!, lines: [quotePurchase(stackOffering.id, 1)], submissionKey: "unauthorized-a",
    }, playerIds[1]!)), /own Character/);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[0]!, lines: [quotePurchase(stackOffering.id, 0)], submissionKey: "bad-quantity",
    }, playerIds[0]!)), /positive whole number/);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[0]!, lines: [quotePurchase(stackOffering.id, 1)], submissionKey: "immediate-a",
    }, playerIds[0]!)), /different transaction contents/);

    const racePoolA = new pg.Pool({ connectionString, max: 1 });
    const racePoolB = new pg.Pool({ connectionString, max: 1 });
    concurrencyPools.push(racePoolA, racePoolB);
    const raceDbA = drizzle(racePoolA);
    const raceDbB = drizzle(racePoolB);
    const lastStockQuote = await quotePurchase(lastOffering.id, 1);
    const lastStockResults = await Promise.allSettled([
      raceDbA.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, { visitId: visit.visitId, characterId: characterIds[0]!, lines: [lastStockQuote], submissionKey: "last-a" }, playerIds[0]!)),
      raceDbB.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, { visitId: visit.visitId, characterId: characterIds[2]!, lines: [lastStockQuote], submissionKey: "last-c" }, playerIds[2]!)),
    ]);
    assert.equal(lastStockResults.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(lastStockResults.filter(({ status }) => status === "rejected").length, 1);
    assert.equal(Number((await one<{ limited_quantity: number }>(seedPool, "select limited_quantity from shop_offering where id=$1", [lastOffering.id])).limited_quantity), 0);

    const staleImmediateQuote = quotePurchase(stackOffering.id, 1);
    const staleImmediateBalance = (await one<{ credits_remaining: number }>(seedPool, "select credits_remaining from campaign_character_profile where character_id=$1", [characterIds[3]])).credits_remaining;
    await seedPool.query("update shop_offering set selling_price_override_credits=10.5,version=version+1 where id=$1", [stackOffering.id]);
    purchaseTerms.set(stackOffering.id, { version: 1, unitPriceCredits: 10.5, fulfillmentKind: "inventory-transfer" });
    const staleImmediate = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[3]!,
      lines: [staleImmediateQuote],
      narrativeNote: "Displayed before the price changed.",
      submissionKey: "stale-immediate-d",
    }, playerIds[3]!));
    assert.equal(staleImmediate.status, "owner-review", "stale immediate checkout charged instead of requiring reconfirmation");
    assert.equal((await one<{ credits_remaining: number }>(seedPool, "select credits_remaining from campaign_character_profile where character_id=$1", [characterIds[3]])).credits_remaining, staleImmediateBalance);
    assert.deepEqual(await one<{ quoted: number; current: number }>(seedPool, "select quoted_unit_price_credits quoted,current_unit_price_credits current from shop_transaction_request_line where request_id=$1", [staleImmediate.requestId]), { quoted: 10, current: 10.5 });
    const repeatedStaleImmediate = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[3]!,
      lines: [staleImmediateQuote],
      narrativeNote: "Displayed before the price changed.",
      submissionKey: "stale-immediate-d",
    }, playerIds[3]!));
    assert.deepEqual(repeatedStaleImmediate, staleImmediate, "an uncertain stale-checkout retry did not reuse its original request");
    assert.equal(Number((await one<{ value: number }>(seedPool, `select count(*)::int value from shop_transaction_request request
      inner join shop_commerce_operation operation on operation.id=request.origin_operation_id
      where request.requested_by_user_id=$1 and operation.submission_key='stale-immediate-d'`, [playerIds[3]])).value), 1);
    await dbModule.db.transaction((tx) => commerce.cancelShopRequestInTransaction(tx, { requestId: staleImmediate.requestId, submissionKey: "cancel-stale-immediate-d" }, { userId: playerIds[3]!, roles: [] }));
    const afterCancelledReconfirmation = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[3]!,
      lines: [quotePurchase(serviceOffering.id, 1)],
      narrativeNote: "A genuinely new checkout after cancellation.",
      submissionKey: "after-cancelled-reconfirmation-d",
    }, playerIds[3]!));
    assert.equal(afterCancelledReconfirmation.status, "completed", "a new checkout after cancellation could not use a new identity");
    await seedPool.query("update shop_offering set selling_price_override_credits=null,version=version+1 where id=$1", [stackOffering.id]);
    purchaseTerms.set(stackOffering.id, { version: 2, unitPriceCredits: 10, fulfillmentKind: "inventory-transfer" });

    await seedPool.query("update shop set character_purchase_mode='god-approval-required' where id=$1", [shop.id]);
    const priceReview = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[1]!, lines: [quotePurchase(stackOffering.id, 1)], submissionKey: "approval-price-b",
    }, playerIds[1]!));
    assert.equal(priceReview.status, "pending");
    await seedPool.query("update shop_offering set selling_price_override_credits=11,version=version+1 where id=$1", [stackOffering.id]);
    purchaseTerms.set(stackOffering.id, { version: 3, unitPriceCredits: 11, fulfillmentKind: "inventory-transfer" });
    const revisedPurchase = await dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: priceReview.requestId, expectedTermsVersion: 1, decision: "approve", submissionKey: "approval-price-god",
    }, godActor));
    assert.equal(revisedPurchase.status, "owner-review");
    const godConfirmedSecondTerms = await dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: priceReview.requestId, expectedTermsVersion: 2, decision: "approve", submissionKey: "approval-price-2-god",
    }, godActor));
    assert.equal(godConfirmedSecondTerms.status, "owner-review");
    await seedPool.query("update shop_offering set selling_price_override_credits=12,version=version+1 where id=$1", [stackOffering.id]);
    purchaseTerms.set(stackOffering.id, { version: 4, unitPriceCredits: 12, fulfillmentKind: "inventory-transfer" });
    const secondPriceChange = await dbModule.db.transaction((tx) => commerce.acceptShopRequestTermsInTransaction(tx, {
      requestId: priceReview.requestId, expectedTermsVersion: 2, submissionKey: "accept-price-2-b",
    }, playerIds[1]!));
    assert.equal(secondPriceChange.status, "owner-review", "a second price change during owner acceptance did not require fresh confirmation");
    await assert.rejects(dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: priceReview.requestId, expectedTermsVersion: 2, decision: "approve", submissionKey: "stale-approval-price-2-god",
    }, godActor)), /terms changed after they were displayed/i);
    const ownerAcceptedThirdTerms = await dbModule.db.transaction((tx) => commerce.acceptShopRequestTermsInTransaction(tx, {
      requestId: priceReview.requestId, expectedTermsVersion: 3, submissionKey: "accept-price-3-b",
    }, playerIds[1]!));
    assert.equal(ownerAcceptedThirdTerms.status, "pending");
    const acceptedPurchase = await dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: priceReview.requestId, expectedTermsVersion: 3, decision: "approve", submissionKey: "approval-price-3-god",
    }, godActor));
    assert.equal(acceptedPurchase.status, "completed");
    assert.equal((await one<{ credits_remaining: number }>(seedPool, "select credits_remaining from campaign_character_profile where character_id=$1", [characterIds[1]])).credits_remaining, 88);

    const concurrentApprovalRequest = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[1]!, lines: [quotePurchase(serviceOffering.id, 1)], submissionKey: "concurrent-approval-b",
    }, playerIds[1]!));
    const approvalResults = await Promise.allSettled([
      raceDbA.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, { requestId: concurrentApprovalRequest.requestId, expectedTermsVersion: 1, decision: "approve", submissionKey: "concurrent-approve-1" }, godActor)),
      raceDbB.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, { requestId: concurrentApprovalRequest.requestId, expectedTermsVersion: 1, decision: "approve", submissionKey: "concurrent-approve-2" }, godActor)),
    ]);
    assert.deepEqual(approvalResults.map(({ status }) => status), ["fulfilled", "fulfilled"]);
    assert.equal(Number((await one<{ value: number }>(seedPool, "select count(*)::int value from shop_transaction where request_id=$1", [concurrentApprovalRequest.requestId])).value), 1);

    await seedPool.query("update shop set character_purchase_mode='immediate',sold_item_handling='remove-from-active-play',changed_sale_confirmation_mode='character-owner-accepts' where id=$1", [shop.id]);
    const stackSale = await dbModule.db.transaction((tx) => commerce.submitPlayerSaleInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[0]!, lines: [{ itemId: stackItem.id, quantity: 1 }], narrativeNote: "Selling one ration.", submissionKey: "sale-stack-a",
    }, playerIds[0]!));
    const stackSaleLine = await one<{ id: number }>(seedPool, "select id from shop_transaction_request_line where request_id=$1", [stackSale.requestId]);
    const changedSale = await dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: stackSale.requestId,
      expectedTermsVersion: 1,
      decision: "approve",
      revisedLines: [{ requestLineId: stackSaleLine.id, quantity: 1, unitPriceCredits: 5.5 }],
      submissionKey: "sale-stack-review",
    }, godActor));
    assert.equal(changedSale.status, "owner-review");
    const acceptedSale = await dbModule.db.transaction((tx) => commerce.acceptShopRequestTermsInTransaction(tx, { requestId: stackSale.requestId, expectedTermsVersion: 2, submissionKey: "sale-stack-accept" }, playerIds[0]!));
    assert.equal(acceptedSale.status, "completed");
    assert.equal((await one<{ quantity: number }>(seedPool, "select quantity from campaign_character_item where character_id=$1 and item_id=$2", [characterIds[0], stackItem.id])).quantity, 1);

    await seedPool.query("update shop set sold_item_handling='add-to-shop-stock',changed_sale_confirmation_mode='god-approval-finalizes' where id=$1", [shop.id]);
    const exactSale = await dbModule.db.transaction((tx) => commerce.submitPlayerSaleInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[0]!, lines: [{ itemId: chargedItem.id, itemInstanceId: soldInstance.id, quantity: 1 }], submissionKey: "sale-exact-a",
    }, playerIds[0]!));
    const exactSaleLine = await one<{ id: number }>(seedPool, "select id from shop_transaction_request_line where request_id=$1", [exactSale.requestId]);
    const completedExactSale = await dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: exactSale.requestId,
      expectedTermsVersion: 1,
      decision: "approve",
      revisedLines: [{ requestLineId: exactSaleLine.id, quantity: 1, unitPriceCredits: 3.75 }],
      submissionKey: "sale-exact-review",
    }, godActor));
    assert.equal(completedExactSale.status, "completed");
    assert.ok((await one<{ retired_at: Date | null }>(seedPool, "select retired_at from campaign_character_item_instance where id=$1", [soldInstance.id])).retired_at);
    const resaleOffering = await one<{ id: number; limited_quantity: number; unlimited_stock: boolean }>(seedPool, "select id,limited_quantity,unlimited_stock from shop_offering where shop_id=$1 and item_id=$2", [shop.id, chargedItem.id]);
    purchaseTerms.set(resaleOffering.id, { version: 0, unitPriceCredits: 12, fulfillmentKind: "inventory-transfer" });
    assert.deepEqual({ quantity: resaleOffering.limited_quantity, unlimited: resaleOffering.unlimited_stock }, { quantity: 1, unlimited: false });
    const repurchase = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[1]!, lines: [quotePurchase(resaleOffering.id, 1)], submissionKey: "repurchase-exact-b",
    }, playerIds[1]!));
    assert.equal(repurchase.status, "completed");
    const acquired = await one<{ current_charges: number; provenance_source_instance_id: number }>(seedPool, "select current_charges,provenance_source_instance_id from campaign_character_item_instance where character_id=$1 and item_id=$2 and retired_at is null", [characterIds[1], chargedItem.id]);
    assert.deepEqual({ charges: acquired.current_charges, source: acquired.provenance_source_instance_id }, { charges: 3, source: soldInstance.id });

    const firearmSale = await dbModule.db.transaction((tx) => commerce.submitPlayerSaleInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[0]!, lines: [{ itemId: firearmItem.id, itemInstanceId: soldFirearm.id, quantity: 1 }], submissionKey: "sale-firearm-a",
    }, playerIds[0]!));
    const firearmSaleResult = await dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: firearmSale.requestId, expectedTermsVersion: 1, decision: "approve", submissionKey: "sale-firearm-review",
    }, godActor));
    assert.equal(firearmSaleResult.status, "completed");
    const firearmOffering = await one<{ id: number }>(seedPool, "select id from shop_offering where shop_id=$1 and item_id=$2", [shop.id, firearmItem.id]);
    purchaseTerms.set(firearmOffering.id, { version: 0, unitPriceCredits: 25, fulfillmentKind: "inventory-transfer" });
    const firearmPurchase = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[1]!, lines: [quotePurchase(firearmOffering.id, 1)], submissionKey: "repurchase-firearm-b",
    }, playerIds[1]!));
    assert.equal(firearmPurchase.status, "completed");
    const acquiredFirearm = await one<{ id: number; provenance_source_instance_id: number }>(seedPool, "select id,provenance_source_instance_id from campaign_character_item_instance where character_id=$1 and item_id=$2 and retired_at is null", [characterIds[1], firearmItem.id]);
    const acquiredFirearmState = await one<{ loaded_rounds: number; capacity_rounds: number; readied: boolean; requires_cycling: boolean; requires_recoil_recovery: boolean }>(seedPool, "select loaded_rounds,capacity_rounds,readied,requires_cycling,requires_recoil_recovery from campaign_character_firearm_state where item_instance_id=$1", [acquiredFirearm.id]);
    assert.equal(acquiredFirearm.provenance_source_instance_id, soldFirearm.id);
    assert.deepEqual(acquiredFirearmState, { loaded_rounds: 0, capacity_rounds: 6, readied: true, requires_cycling: true, requires_recoil_recovery: true }, "firearm runtime state was reset during resale");

    await dbModule.db.transaction((tx) => commerce.correctShopBalanceInTransaction(tx, { campaignId: campaign.id, shopId: shop.id, newBalanceCredits: 0, reason: "Insufficient-funds rehearsal.", submissionKey: "shop-zero" }, godActor));
    const insufficientSale = await dbModule.db.transaction((tx) => commerce.submitPlayerSaleInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[0]!, lines: [{ itemId: stackItem.id, quantity: 1 }], submissionKey: "insufficient-shop-sale",
    }, playerIds[0]!));
    await assert.rejects(dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: insufficientSale.requestId, expectedTermsVersion: 1, decision: "approve", submissionKey: "insufficient-shop-approve",
    }, godActor)), /Shop does not have enough money/);
    assert.equal((await one<{ status: string }>(seedPool, "select status from shop_transaction_request where id=$1", [insufficientSale.requestId])).status, "pending");
    assert.equal((await one<{ quantity: number }>(seedPool, "select quantity from campaign_character_item where character_id=$1 and item_id=$2", [characterIds[0], stackItem.id])).quantity, 1, "failed execution removed inventory");
    assert.equal(Number((await one<{ value: number }>(seedPool, "select count(*)::int value from shop_transaction where request_id=$1", [insufficientSale.requestId])).value), 0);
    await dbModule.db.transaction((tx) => commerce.correctShopBalanceInTransaction(tx, { campaignId: campaign.id, shopId: shop.id, newBalanceCredits: 100, reason: "Restore disposable test balance.", submissionKey: "shop-restore" }, godActor));

    await seedPool.query("update campaign set currency_system='Derived Currency' where id=$1", [campaign.id]);
    const bits = await one<{ id: number }>(seedPool, "insert into campaign_derived_currency (campaign_id,name,description,credits_per_unit,sort_order) values ($1,'Bits','Quarter credit',0.25,0) returning id", [campaign.id]);
    const balanceBeforeGrant = (await one<{ credits_remaining: number }>(seedPool, "select credits_remaining from campaign_character_profile where character_id=$1", [characterIds[0]])).credits_remaining;
    await dbModule.db.transaction((tx) => commerce.giveCharacterMoneyInTransaction(tx, { campaignId: campaign.id, characterId: characterIds[0]!, amountCredits: 0.25, reason: "Quarter-credit award.", submissionKey: "grant-quarter" }, godActor));
    assert.equal((await one<{ credits_remaining: number }>(seedPool, "select credits_remaining from campaign_character_profile where character_id=$1", [characterIds[0]])).credits_remaining, balanceBeforeGrant + 0.25);
    assert.ok((await one<{ quantity: number }>(seedPool, "select quantity from campaign_character_currency_holding where character_id=$1 and currency_id=$2", [characterIds[0], bits.id])).quantity > 0);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.giveCharacterMoneyInTransaction(tx, { campaignId: campaign.id, characterId: characterIds[0]!, amountCredits: 0.1, reason: "Unrepresentable award.", submissionKey: "grant-tenth" }, godActor)), /cannot be represented/);
    assert.equal((await one<{ credits_remaining: number }>(seedPool, "select credits_remaining from campaign_character_profile where character_id=$1", [characterIds[0]])).credits_remaining, balanceBeforeGrant + 0.25);

    await seedPool.query("update shop set character_purchase_mode='god-approval-required' where id=$1", [shop.id]);
    const pendingAtClose = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[3]!,
      lines: [quotePurchase(serviceOffering.id, 1)],
      submissionKey: "pending-at-close-d",
    }, playerIds[3]!));
    await seedPool.query("update shop set storefront_state='closed' where id=$1", [shop.id]);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: pendingAtClose.requestId,
      expectedTermsVersion: 1,
      decision: "approve",
      submissionKey: "approve-after-close",
    }, godActor)), /remain open through final approval/i);
    assert.equal((await one<{ status: string }>(seedPool, "select status from shop_transaction_request where id=$1", [pendingAtClose.requestId])).status, "pending");
    const rejectedAfterClose = await dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: pendingAtClose.requestId,
      expectedTermsVersion: 1,
      decision: "reject",
      reason: "The Shop closed before approval.",
      submissionKey: "reject-after-close",
    }, godActor));
    assert.equal(rejectedAfterClose.status, "rejected", "Shop closure prevented a safe rejection path");
    const override = await dbModule.db.transaction((tx) => commerce.completeGodOverridePurchaseInTransaction(tx, {
      campaignId: campaign.id, shopId: shop.id, characterId: characterIds[2]!, lines: [quotePurchase(serviceOffering.id, 1)], overrideReason: "Off-scene courier service.", submissionKey: "god-override",
    }, godActor));
    assert.ok(override.transactionId > 0);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[1]!, lines: [quotePurchase(serviceOffering.id, 1)], submissionKey: "closed-player",
    }, playerIds[1]!)), /open Shop/);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.completeGodOverridePurchaseInTransaction(tx, {
      campaignId: campaign.id, shopId: shop.id, characterId: foreignCharacter.id, lines: [quotePurchase(serviceOffering.id, 1)], overrideReason: "Invalid cross-Campaign attempt.", submissionKey: "cross-campaign",
    }, godActor)), /Character not found in this Campaign/);
    await seedPool.query("update shop set storefront_state='open',character_purchase_mode='immediate' where id=$1", [shop.id]);

    await seedPool.query("update campaign_character set archived_at=now() where id=$1", [characterIds[3]]);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.completeGodOverridePurchaseInTransaction(tx, {
      campaignId: campaign.id, shopId: shop.id, characterId: characterIds[3]!, lines: [quotePurchase(serviceOffering.id, 1)], overrideReason: "Archived Character boundary.", submissionKey: "archived-character",
    }, godActor)), /Archived Characters/);
    await seedPool.query("update campaign_character set archived_at=null where id=$1", [characterIds[3]]);
    await seedPool.query("update items set archived_at=now() where id=$1", [serviceItem.id]);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.completeGodOverridePurchaseInTransaction(tx, {
      campaignId: campaign.id, shopId: shop.id, characterId: characterIds[3]!, lines: [quotePurchase(serviceOffering.id, 1)], overrideReason: "Archived Item boundary.", submissionKey: "archived-item",
    }, godActor)), /unavailable|archived/i);
    await seedPool.query("update items set archived_at=null where id=$1", [serviceItem.id]);
    await seedPool.query("update campaign set archived_at=now() where id=$1", [campaign.id]);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.completeGodOverridePurchaseInTransaction(tx, {
      campaignId: campaign.id, shopId: shop.id, characterId: characterIds[3]!, lines: [quotePurchase(serviceOffering.id, 1)], overrideReason: "Archived Campaign boundary.", submissionKey: "archived-campaign",
    }, godActor)), /Archived Campaigns/);
    await seedPool.query("update campaign set archived_at=null where id=$1", [campaign.id]);

    const departureRequest = await dbModule.db.transaction((tx) => commerce.submitPlayerSaleInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[0]!, lines: [{ itemId: stackItem.id, quantity: 1 }], submissionKey: "departure-sale",
    }, playerIds[0]!));
    const departureResults = await Promise.allSettled([
      raceDbA.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, { requestId: departureRequest.requestId, expectedTermsVersion: 1, decision: "approve", submissionKey: "departure-approve" }, godActor)),
      raceDbB.transaction((tx) => visits.leaveOwnShopVisitInTransaction(tx, characterIds[0]!, playerIds[0]!)),
    ]);
    assert.ok(departureResults.some(({ status }) => status === "fulfilled"));
    const departureStatus = (await one<{ status: string }>(seedPool, "select status from shop_transaction_request where id=$1", [departureRequest.requestId])).status;
    assert.ok(departureStatus === "completed" || departureStatus === "cancelled");
    assert.ok(Number((await one<{ value: number }>(seedPool, "select count(*)::int value from shop_transaction where request_id=$1", [departureRequest.requestId])).value) <= 1);

    await seedPool.query("update shop set character_purchase_mode='god-approval-required' where id=$1", [shop.id]);
    const accessLossRequest = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[2]!, lines: [quotePurchase(serviceOffering.id, 1)], submissionKey: "access-loss-purchase",
    }, playerIds[2]!));
    await dbModule.db.transaction((tx) => visits.leaveOwnShopVisitInTransaction(tx, characterIds[2]!, playerIds[2]!));
    assert.equal((await one<{ status: string }>(seedPool, "select status from shop_transaction_request where id=$1", [accessLossRequest.requestId])).status, "cancelled", "losing visit access left an actionable request");

    await seedPool.query("update shop set character_purchase_mode='immediate' where id=$1", [shop.id]);
    const reentered = await dbModule.db.transaction((tx) => visits.startOrAddShopVisitInTransaction(tx, {
      sceneId: scene.id,
      shopId: shop.id,
      placement: { kind: "independent" as const },
      characterIds: [characterIds[2]!],
      mode: "shopping",
      closedShopOverrideReason: "",
    }, godActor));
    assert.equal(reentered.visitId, visit.visitId, "re-entry should reuse the active visit while another member remains");
    assert.deepEqual(await seedPool.query<{ status: string }>("select status from campaign_session_scene_shop_visit_member where visit_id=$1 and character_id=$2 order by id", [visit.visitId, characterIds[2]]).then(({ rows }) => rows.map(({ status }) => status)), ["ended", "active"]);
    const reentryPurchase = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[2]!,
      lines: [quotePurchase(stackOffering.id, 1)],
      submissionKey: "reentry-purchase-c",
    }, playerIds[2]!));
    assert.equal(reentryPurchase.status, "completed", "the active re-entry membership was shadowed by historical membership");
    const reentrySale = await dbModule.db.transaction((tx) => commerce.submitPlayerSaleInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[2]!,
      lines: [{ itemId: stackItem.id, quantity: 1 }],
      submissionKey: "reentry-sale-c",
    }, playerIds[2]!));
    const reentrySaleResult = await dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: reentrySale.requestId,
      expectedTermsVersion: 1,
      decision: "approve",
      submissionKey: "reentry-sale-god",
    }, godActor));
    assert.equal(reentrySaleResult.status, "completed");
    assert.equal((await one<{ status: string }>(seedPool, "select status from shop_transaction_request where id=$1", [accessLossRequest.requestId])).status, "cancelled", "re-entry revived a cancelled request from the prior membership");

    await seedPool.query("update shop set character_purchase_mode='god-approval-required' where id=$1", [shop.id]);
    const ownershipLossRequest = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId,
      characterId: characterIds[3]!,
      lines: [quotePurchase(serviceOffering.id, 1)],
      submissionKey: "ownership-loss-d",
    }, playerIds[3]!));
    await seedPool.query("update campaign_character set player_user_id=$1 where id=$2", [playerIds[2], characterIds[3]]);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.reviewShopRequestInTransaction(tx, {
      requestId: ownershipLossRequest.requestId,
      expectedTermsVersion: 1,
      decision: "approve",
      submissionKey: "ownership-loss-approve",
    }, godActor)), /Character owner changed/);
    assert.equal((await one<{ status: string }>(seedPool, "select status from shop_transaction_request where id=$1", [ownershipLossRequest.requestId])).status, "pending");
    await seedPool.query("update campaign_character set player_user_id=$1 where id=$2", [playerIds[3], characterIds[3]]);
    await dbModule.db.transaction((tx) => commerce.cancelShopRequestInTransaction(tx, { requestId: ownershipLossRequest.requestId, submissionKey: "ownership-loss-cancel" }, { userId: playerIds[3]!, roles: [] }));

    const privateView = await dbModule.db.transaction((tx) => commerce.readShopCommerceInTransaction(tx, { campaignId: campaign.id, shopId: shop.id, characterId: characterIds[1]!, viewerUserId: playerIds[1]!, godView: false }));
    assert.ok(privateView.history.length >= 3);
    assert.equal(privateView.shopBalanceCredits, null, "the Player projection exposed the Shop's private balance");
    assert.ok(privateView.moneyEvents.every((event) => event.reason.length > 0));
    assert.ok(privateView.moneyEvents.every(({ kind }) => ["purchase-character-debit", "sale-character-credit", "grant-character-credit", "character-balance-correction"].includes(kind)));
    const serializedPrivateView = JSON.stringify(privateView);
    assert.doesNotMatch(serializedPrivateView, /purchase-shop-credit|sale-shop-debit|shop-balance-correction/, "the serialized Player commerce payload exposed a private Shop ledger event");
    const godCommerceView = await dbModule.db.transaction((tx) => commerce.readShopCommerceInTransaction(tx, { campaignId: campaign.id, shopId: shop.id, characterId: characterIds[1]!, viewerUserId: godId, godView: true }));
    assert.ok(godCommerceView.moneyEvents.some(({ kind }) => kind === "purchase-shop-credit" || kind === "sale-shop-debit"), "the G.O.D. ledger lost Shop-side money events");
    await assert.rejects(dbModule.db.transaction((tx) => commerce.readShopCommerceInTransaction(tx, { campaignId: campaign.id, shopId: shop.id, characterId: characterIds[1]!, viewerUserId: playerIds[2]!, godView: false })), /own Shop transaction details/);
    const versions = await one<{ character_version: number; shop_version: number; offering_version: number }>(seedPool, `select p.commerce_version character_version,s.commerce_version shop_version,o.version offering_version
      from campaign_character_profile p cross join shop s cross join shop_offering o where p.character_id=$1 and s.id=$2 and o.id=$3`, [characterIds[1], shop.id, stackOffering.id]);
    assert.ok(versions.character_version > 0 && versions.shop_version > 0 && versions.offering_version > 0, "live commits must advance stale-editor versions");
    assert.equal((await seedPool.query("update shop set balance_credits=999 where id=$1 and commerce_version=$2", [shop.id, 0])).rowCount, 0, "a stale Shop editor predicate overwrote the live balance");
    assert.equal((await seedPool.query("update campaign_character_profile set credits_remaining=999 where character_id=$1 and commerce_version=$2", [characterIds[1], 0])).rowCount, 0, "a stale Character editor predicate overwrote the live purse");

    const characterPreview = await lifecycle.previewLifecycleEntityForActor({ entityKind: "player-character", entityId: characterIds[1]! }, godActor);
    assert.ok(characterPreview.dependencies.some(({ label, count, blocking }) => label === "Shop transaction and money history" && count > 0 && blocking));
    assert.equal(characterPreview.canDelete, false);
    const itemPreview = await lifecycle.previewLifecycleEntityForActor({ entityKind: "item", entityId: chargedItem.id }, godActor);
    assert.ok(itemPreview.dependencies.some(({ label, count, blocking }) => label === "Shop transaction history" && count > 0 && blocking));
    assert.equal(itemPreview.canDelete, false);
    const campaignPreview = await lifecycle.previewLifecycleEntityForActor({ entityKind: "campaign", entityId: campaign.id }, godActor);
    assert.ok(campaignPreview.dependencies.some(({ label, count, blocking }) => label === "Shop transaction and money history" && count > 0 && !blocking));
    const sessionPreview = await tabletopLifecycle.previewTabletopLifecycleEntityForActor({ entityKind: "campaign-session", entityId: session.id }, godActor);
    assert.ok(sessionPreview.dependencies.some(({ label, count, blocking }) => label === "Shop transaction history" && count > 0 && blocking));
    const scenePreview = await tabletopLifecycle.previewTabletopLifecycleEntityForActor({ entityKind: "scene", entityId: scene.id }, godActor);
    assert.ok(scenePreview.dependencies.some(({ label, count, blocking }) => label === "Shop transaction history" && count > 0 && blocking));
    const accountPreview = await accountLifecycle.previewAdminAccountDeletion(godId, playerIds[1]!);
    assert.ok(accountPreview.dependencies.some(({ label, count, blocking }) => label === "Shop transaction requests" && count > 0 && blocking));
    assert.equal(accountPreview.canDelete, false);

    await seedPool.query("update shop set character_purchase_mode='god-approval-required' where id=$1", [shop.id]);
    const sceneEndRequest = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: visit.visitId, characterId: characterIds[3]!, lines: [quotePurchase(serviceOffering.id, 1)], submissionKey: "scene-end-request",
    }, playerIds[3]!));
    await dbModule.db.transaction((tx) => visits.endActiveShopVisitsForSceneInTransaction(tx, scene.id, godId));
    assert.equal((await one<{ status: string }>(seedPool, "select status from shop_transaction_request where id=$1", [sceneEndRequest.requestId])).status, "cancelled", "Scene completion left an actionable request");
    const reopenedVisit = await dbModule.db.transaction((tx) => visits.startOrAddShopVisitInTransaction(tx, {
      sceneId: scene.id,
      shopId: shop.id,
      placement: { kind: "independent" as const },
      characterIds: [characterIds[1]!],
      mode: "shopping",
      closedShopOverrideReason: "",
    }, godActor));
    const sessionEndRequest = await dbModule.db.transaction((tx) => commerce.submitPlayerPurchaseInTransaction(tx, {
      visitId: reopenedVisit.visitId, characterId: characterIds[1]!, lines: [quotePurchase(serviceOffering.id, 1)], submissionKey: "session-end-request",
    }, playerIds[1]!));
    await dbModule.db.transaction((tx) => visits.endActiveShopVisitsForSessionInTransaction(tx, session.id, godId));
    assert.equal((await one<{ status: string }>(seedPool, "select status from shop_transaction_request where id=$1", [sessionEndRequest.requestId])).status, "cancelled", "Session completion left an actionable request");

    await seedPool.query("update shop set archived_at=now(),archive_reason='History rehearsal' where id=$1", [shop.id]);
    await assert.rejects(dbModule.db.transaction((tx) => commerce.completeGodOverridePurchaseInTransaction(tx, {
      campaignId: campaign.id, shopId: shop.id, characterId: characterIds[1]!, lines: [quotePurchase(serviceOffering.id, 1)], overrideReason: "Archived Shop boundary.", submissionKey: "archived-shop",
    }, godActor)), /Archived Shops/);
    const archivedHistory = await dbModule.db.transaction((tx) => commerce.readShopCommerceInTransaction(tx, { campaignId: campaign.id, shopId: shop.id, characterId: characterIds[1]!, viewerUserId: godId, godView: true }));
    assert.equal(archivedHistory.history.length, privateView.history.length, "archiving rewrote completed transaction history");
    assert.ok((await one<{ value: number }>(seedPool, "select count(*)::int value from shop_transaction_line where item_id=$1", [chargedItem.id])).value >= 2, "exact-copy sale and resale history was not retained");
  } finally {
    await Promise.all(concurrencyPools.map((pool) => pool.end().catch(() => undefined)));
    if (applicationPool) await applicationPool.end().catch(() => undefined);
    if (seedPool) await seedPool.end().catch(() => undefined);
    if (started) execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    await rm(temporaryCluster, { recursive: true, force: true });
  }
});
