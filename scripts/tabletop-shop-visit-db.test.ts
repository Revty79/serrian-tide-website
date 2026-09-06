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
  if (!port) throw new Error("A disposable Shop-visit PostgreSQL port could not be reserved.");
  return port;
}

async function insertCampaign(pool: pg.Pool, ownerId: string, name: string): Promise<number> {
  const result = await pool.query<{ id: number }>(`insert into campaign (
    name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
    max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
  ) values ($1,'',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [name, ownerId]);
  return result.rows[0]!.id;
}

async function insertCharacter(pool: pg.Pool, campaignId: number, playerId: string, name: string, npc = false): Promise<number> {
  const result = await pool.query<{ id: number }>(`insert into campaign_character
    (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,npc_role_label)
    values ($1,$2,$3,$4,'race',$5,$6) returning id`, [campaignId, playerId, name, npc, npc ? "detailed" : null, npc ? "Shopkeeper" : ""]);
  return result.rows[0]!.id;
}

test("Shop visits are scoped, repeat-safe, concurrent-safe, leaveable, and lifecycle-bound", { timeout: 120_000 }, async () => {
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-shop-visit-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await loopbackPort();
  let seedPool: pg.Pool | null = null;
  let applicationPool: { end(): Promise<void> } | null = null;
  const concurrencyPools: pg.Pool[] = [];
  let started = false;
  try {
    execFileSync(initdbExecutable, ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", dataDirectory], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    process.env.DATABASE_URL = connectionString;
    seedPool = new pg.Pool({ connectionString });
    await migrate(drizzle(seedPool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    assert.equal(Number((await seedPool.query("select count(*)::int value from drizzle.__drizzle_migrations")).rows[0].value), 40);

    const god = "shop-visit-god";
    const otherGod = "shop-visit-other-god";
    const players = ["shop-visit-player-a", "shop-visit-player-b", "shop-visit-player-c"];
    await seedPool.query(`insert into "user" (id,name,email,email_verified) values
      ($1,'Visit G.O.D.','visit-god@example.invalid',true),
      ($2,'Other G.O.D.','visit-other@example.invalid',true),
      ($3,'Player A','visit-a@example.invalid',true),
      ($4,'Player B','visit-b@example.invalid',true),
      ($5,'Player C','visit-c@example.invalid',true)`, [god, otherGod, ...players]);
    const campaignId = await insertCampaign(seedPool, god, "Shop Visit Campaign");
    const foreignCampaignId = await insertCampaign(seedPool, otherGod, "Foreign Campaign");
    await seedPool.query(`insert into campaign_player (campaign_id,user_id,is_npc_controller) values
      ($1,$2,true),($1,$3,false),($1,$4,false),($1,$5,false),($6,$7,true)`,
    [campaignId, god, ...players, foreignCampaignId, otherGod]);
    const characterIds = [] as number[];
    for (let index = 0; index < players.length; index += 1) {
      characterIds.push(await insertCharacter(seedPool, campaignId, players[index]!, `Visitor ${String.fromCharCode(65 + index)}`));
    }
    const npcId = await insertCharacter(seedPool, campaignId, god, "Mira the Keeper", true);
    const sessionId = Number((await seedPool.query(`insert into campaign_session
      (campaign_id,title,sequence_number,status,started_at) values ($1,'Visit Session',1,'active',now()) returning id`, [campaignId])).rows[0].id);
    const sceneId = Number((await seedPool.query(`insert into campaign_session_scene
      (session_id,campaign_id,sequence_number,title,status,started_at) values ($1,$2,1,'Market Scene','active',now()) returning id`, [sessionId, campaignId])).rows[0].id);
    for (let index = 0; index < characterIds.length; index += 1) {
      await seedPool.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4)", [sessionId, campaignId, characterIds[index], index]);
      await seedPool.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,$5)", [sceneId, sessionId, campaignId, characterIds[index], index]);
    }
    const townA = Number((await seedPool.query("insert into town (campaign_id,name,category) values ($1,'Town A','Market') returning id", [campaignId])).rows[0].id);
    const townB = Number((await seedPool.query("insert into town (campaign_id,name,category) values ($1,'Town B','Market') returning id", [campaignId])).rows[0].id);
    const townShopA = Number((await seedPool.query("insert into shop (campaign_id,name,category,description,storefront_state) values ($1,'A Shop','Goods','Public A','open') returning id", [campaignId])).rows[0].id);
    const townShopB = Number((await seedPool.query("insert into shop (campaign_id,name,category,description,storefront_state) values ($1,'B Shop','Goods','Public B','open') returning id", [campaignId])).rows[0].id);
    const independentShop = Number((await seedPool.query("insert into shop (campaign_id,name,category,description,storefront_state) values ($1,'Independent Shop','Services','Public independent','open') returning id", [campaignId])).rows[0].id);
    const closedShop = Number((await seedPool.query("insert into shop (campaign_id,name,category,description,storefront_state) values ($1,'Closed Shop','Curios','Public closed','closed') returning id", [campaignId])).rows[0].id);
    const archivedShop = Number((await seedPool.query("insert into shop (campaign_id,name,category,storefront_state,archived_at,archive_reason) values ($1,'Archived Shop','Old','closed',now(),'Retired') returning id", [campaignId])).rows[0].id);
    await seedPool.query("insert into town_shop_membership (town_id,shop_id,campaign_id,sort_order) values ($1,$2,$3,0),($4,$5,$3,0)", [townA, townShopA, campaignId, townB, townShopB]);
    await seedPool.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id,responsibility_label,is_primary_contact,sort_order) values ($1,$2,$3,'Keeper A',true,0),($4,$2,$3,'Keeper B',true,0)", [townShopA, campaignId, npcId, townShopB]);
    const itemId = Number((await seedPool.query(`insert into items
      (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis)
      values ('VISIT-ITEM-0001','Voyage Kit','equipment','general','gear','Travel','Supplies','A public voyage kit.',12,'Each') returning id`)).rows[0].id);
    await seedPool.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0)", [campaignId, itemId]);
    const unpricedItemId = Number((await seedPool.query(`insert into items
      (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis)
      values ('VISIT-ITEM-0002','Unpriced Favor','inventory',null,'misc','Services','Services','A service whose price is intentionally not listed.',null,'Each') returning id`)).rows[0].id);
    const zeroPriceItemId = Number((await seedPool.query(`insert into items
      (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis)
      values ('VISIT-ITEM-0003','Complimentary Token','inventory',null,'misc','Travel','Supplies','A free public token.',0,'Each') returning id`)).rows[0].id);
    await seedPool.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,1)", [campaignId, unpricedItemId]);
    await seedPool.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,2)", [campaignId, zeroPriceItemId]);
    await seedPool.query(`insert into shop_offering
      (shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,selling_price_override_credits,buying_price_override_credits,sort_order)
      values ($1,$2,$3,'inventory-transfer',true,true,10,6,0),($1,$2,$4,'service-narrative',true,true,null,null,1),($1,$2,$5,'inventory-transfer',true,true,null,null,2)`, [townShopB, campaignId, itemId, unpricedItemId, zeroPriceItemId]);
    await seedPool.query("insert into campaign_session_prepared_town (session_id,campaign_id,town_id,sort_order) values ($1,$2,$3,0),($1,$2,$4,1)", [sessionId, campaignId, townA, townB]);
    await seedPool.query("insert into campaign_session_prepared_shop (session_id,campaign_id,shop_id,sort_order) values ($1,$2,$3,0),($1,$2,$4,1),($1,$2,$5,2)", [sessionId, campaignId, independentShop, closedShop, archivedShop]);
    await seedPool.query("insert into campaign_session_scene_town (scene_id,session_id,campaign_id,town_id,sort_order,revealed) values ($1,$2,$3,$4,0,true),($1,$2,$3,$5,1,true)", [sceneId, sessionId, campaignId, townA, townB]);
    await seedPool.query("insert into campaign_session_scene_town_shop (scene_id,session_id,campaign_id,town_id,shop_id,included,revealed,sort_order) values ($1,$2,$3,$4,$5,true,true,0),($1,$2,$3,$6,$7,true,true,0)", [sceneId, sessionId, campaignId, townA, townShopA, townB, townShopB]);
    await seedPool.query("insert into campaign_session_scene_town_npc (scene_id,session_id,campaign_id,town_id,npc_character_id,included,revealed,sort_order) values ($1,$2,$3,$4,$5,true,true,0),($1,$2,$3,$6,$5,true,false,0)", [sceneId, sessionId, campaignId, townA, npcId, townB]);
    await seedPool.query("insert into campaign_session_scene_shop (scene_id,session_id,campaign_id,shop_id,sort_order,revealed) values ($1,$2,$3,$4,0,true),($1,$2,$3,$5,1,true),($1,$2,$3,$6,2,true)", [sceneId, sessionId, campaignId, independentShop, closedShop, archivedShop]);

    const dbModule = await import("@/db");
    applicationPool = dbModule.pool;
    const visit = await import("@/features/tabletop-operations/shop-visit-service");
    const ownerActor = { userId: god, roles: ["god"] as const };
    const otherActor = { userId: otherGod, roles: ["god"] as const };

    const startedVisit = await dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: townShopB, placement: { kind: "town", townId: townB }, characterIds: characterIds.slice(0, 2), mode: "shopping", closedShopOverrideReason: "",
    }, ownerActor));
    assert.deepEqual(startedVisit.addedCharacterIds, characterIds.slice(0, 2));
    const repeated = await dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: townShopB, placement: { kind: "town", townId: townB }, characterIds: [characterIds[0]!], mode: "shopping", closedShopOverrideReason: "",
    }, ownerActor));
    assert.equal(repeated.visitId, startedVisit.visitId);
    assert.deepEqual(repeated.addedCharacterIds, []);
    await assert.rejects(dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: townShopB, placement: { kind: "town", townId: townB }, characterIds: [characterIds[2]!], mode: "shopping", closedShopOverrideReason: "",
    }, otherActor)), /Campaign-owning G\.O\.D/);
    const added = await dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: townShopB, placement: { kind: "town", townId: townB }, characterIds: [characterIds[2]!], mode: "shopping", closedShopOverrideReason: "",
    }, ownerActor));
    assert.deepEqual(added.addedCharacterIds, [characterIds[2]!], "an eligible Character can join an existing visit");
    await dbModule.db.transaction((tx) => visit.removeShopVisitorInTransaction(tx, startedVisit.visitId, characterIds[2]!, ownerActor));
    await dbModule.db.transaction((tx) => visit.setShopVisitModeInTransaction(tx, startedVisit.visitId, "roleplay", ownerActor));
    assert.equal((await seedPool.query("select mode from campaign_session_scene_shop_visit where id=$1", [startedVisit.visitId])).rows[0].mode, "roleplay");

    const hiddenStaffView = await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[0]!, players[0]!));
    assert.ok(hiddenStaffView);
    assert.deepEqual(hiddenStaffView.shop.staff, [], "Town A reveal must not expose the same NPC's staff assignment in Town B");
    assert.deepEqual(hiddenStaffView.currency, { currencySystem: "Credits", derivedCurrencies: [] });
    assert.deepEqual(hiddenStaffView.shop.offerings.map(({ name, sellingPriceCredits, buyingPriceCredits }) => ({ name, sellingPriceCredits, buyingPriceCredits })), [
      { name: "Voyage Kit", sellingPriceCredits: 10, buyingPriceCredits: 6 },
      { name: "Unpriced Favor", sellingPriceCredits: null, buyingPriceCredits: null },
      { name: "Complimentary Token", sellingPriceCredits: 0, buyingPriceCredits: 0 },
    ]);
    const currencyRules = await import("@/features/characters/currency-rules");
    assert.equal(currencyRules.formatCampaignMoney(10, hiddenStaffView.currency.currencySystem, hiddenStaffView.currency.derivedCurrencies), "10 Credits");
    assert.equal(JSON.stringify(hiddenStaffView).includes("shopNote"), false);
    assert.equal(JSON.stringify(hiddenStaffView).includes("closedShopOverrideReason"), false);
    assert.equal(await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[2]!, players[2]!)), null, "an unselected Player must stay outside the Shop view");
    assert.equal(await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[0]!, players[1]!)), null, "a Player cannot read another Character's visit by changing the Character ID");
    await seedPool.query("update campaign_session_scene_town_npc set included=false,revealed=false where scene_id=$1 and town_id=$2 and npc_character_id=$3", [sceneId, townB, npcId]);
    const excludedStaffView = await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[0]!, players[0]!));
    assert.deepEqual(excludedStaffView?.shop.staff, []);
    await seedPool.query("update campaign_session_scene_town_npc set included=true,revealed=true where scene_id=$1 and town_id=$2 and npc_character_id=$3", [sceneId, townB, npcId]);
    const revealedStaffView = await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[0]!, players[0]!));
    assert.deepEqual(revealedStaffView?.shop.staff.map(({ npcCharacterId, responsibilityLabel }) => ({ npcCharacterId, responsibilityLabel })), [{ npcCharacterId: npcId, responsibilityLabel: "Keeper B" }]);
    await seedPool.query("update campaign set currency_system='Derived Currency' where id=$1", [campaignId]);
    await seedPool.query(`insert into campaign_derived_currency (campaign_id,name,description,credits_per_unit,sort_order)
      values ($1,'Crowns','Large trade coin',2.5,0),($1,'Bits','Fractional trade coin',0.25,1)`, [campaignId]);
    const derivedPlayerView = await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[0]!, players[0]!));
    const derivedGodView = (await dbModule.db.transaction((tx) => visit.readGodShopVisitWorkspaceInTransaction(tx, sceneId, ownerActor)))
      .activeVisits.find(({ id }) => id === startedVisit.visitId);
    assert.ok(derivedPlayerView && derivedGodView);
    assert.equal(derivedPlayerView.currency.currencySystem, "Derived Currency");
    assert.deepEqual(derivedPlayerView.currency, derivedGodView.currency, "G.O.D. and Player visits must receive the same narrow currency rules");
    assert.equal(currencyRules.formatCampaignMoney(10, derivedPlayerView.currency.currencySystem, derivedPlayerView.currency.derivedCurrencies), "4 Crowns");
    assert.equal(currencyRules.formatCampaignMoney(6, derivedPlayerView.currency.currencySystem, derivedPlayerView.currency.derivedCurrencies), "2 Crowns, 4 Bits");
    assert.equal(derivedPlayerView.shop.offerings.find(({ name }) => name === "Unpriced Favor")?.sellingPriceCredits, null, "a missing price must remain distinct from zero");
    assert.equal(derivedPlayerView.shop.offerings.find(({ name }) => name === "Complimentary Token")?.sellingPriceCredits, 0, "a zero price must remain a formatted amount");
    assert.equal(currencyRules.formatCampaignMoney(0, derivedPlayerView.currency.currencySystem, derivedPlayerView.currency.derivedCurrencies), "0 Bits");

    await assert.rejects(dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: independentShop, placement: { kind: "independent" }, characterIds: [characterIds[0]!], mode: "roleplay", closedShopOverrideReason: "",
    }, ownerActor)), /another active Shop visit/);
    await assert.rejects(dbModule.db.transaction((tx) => visit.leaveOwnShopVisitInTransaction(tx, characterIds[0]!, players[1]!)), /only their own/);
    await dbModule.db.transaction((tx) => visit.leaveOwnShopVisitInTransaction(tx, characterIds[0]!, players[0]!));
    assert.equal((await seedPool.query("select status from campaign_session_scene_shop_visit where id=$1", [startedVisit.visitId])).rows[0].status, "active");
    await dbModule.db.transaction((tx) => visit.removeShopVisitorInTransaction(tx, startedVisit.visitId, characterIds[1]!, ownerActor));
    assert.equal((await seedPool.query("select status from campaign_session_scene_shop_visit where id=$1", [startedVisit.visitId])).rows[0].status, "ended", "the final visitor must close the visit");

    const departurePoolA = new pg.Pool({ connectionString, max: 1 });
    const departurePoolB = new pg.Pool({ connectionString, max: 1 });
    concurrencyPools.push(departurePoolA, departurePoolB);
    const departureDbA = drizzle(departurePoolA);
    const departureDbB = drizzle(departurePoolB);
    assert.notEqual(
      Number((await departurePoolA.query("select pg_backend_pid() pid")).rows[0].pid),
      Number((await departurePoolB.query("select pg_backend_pid() pid")).rows[0].pid),
      "concurrency rehearsal requires separate PostgreSQL connections",
    );
    const concurrentDepartureVisit = await dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: townShopB, placement: { kind: "town", townId: townB }, characterIds: characterIds.slice(0, 2), mode: "shopping", closedShopOverrideReason: "",
    }, ownerActor));
    const departureResults = await Promise.allSettled([
      departureDbA.transaction((tx) => visit.leaveOwnShopVisitInTransaction(tx, characterIds[0]!, players[0]!)),
      departureDbB.transaction((tx) => visit.leaveOwnShopVisitInTransaction(tx, characterIds[1]!, players[1]!)),
    ]);
    assert.deepEqual(departureResults.map(({ status }) => status), ["fulfilled", "fulfilled"]);
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_scene_shop_visit_member where visit_id=$1 and status='active'", [concurrentDepartureVisit.visitId])).rows[0].value), 0);
    const departedVisitRow = (await seedPool.query("select status,end_reason,ended_by_user_id,ended_at from campaign_session_scene_shop_visit where id=$1", [concurrentDepartureVisit.visitId])).rows[0];
    assert.equal(departedVisitRow.status, "ended", "concurrent final departures must close their shared visit");
    assert.equal(departedVisitRow.end_reason, "The final visitor left the Shop.");
    assert.ok(players.includes(String(departedVisitRow.ended_by_user_id)));
    assert.ok(departedVisitRow.ended_at);
    const departedMemberships = (await seedPool.query("select character_id,status,exit_kind,exited_by_user_id,exited_at from campaign_session_scene_shop_visit_member where visit_id=$1 order by character_id", [concurrentDepartureVisit.visitId])).rows;
    assert.deepEqual(departedMemberships.map((row) => ({ characterId: Number(row.character_id), status: row.status, exitKind: row.exit_kind, exitedBy: row.exited_by_user_id, exited: Boolean(row.exited_at) })), [
      { characterId: characterIds[0], status: "ended", exitKind: "player-left", exitedBy: players[0], exited: true },
      { characterId: characterIds[1], status: "ended", exitKind: "player-left", exitedBy: players[1], exited: true },
    ]);

    const departureAdditionRaceVisit = await dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: townShopB, placement: { kind: "town", townId: townB }, characterIds: [characterIds[0]!], mode: "roleplay", closedShopOverrideReason: "",
    }, ownerActor));
    const departureAdditionResults = await Promise.allSettled([
      departureDbA.transaction((tx) => visit.leaveOwnShopVisitInTransaction(tx, characterIds[0]!, players[0]!)),
      departureDbB.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
        sceneId, shopId: townShopB, placement: { kind: "town", townId: townB }, characterIds: [characterIds[1]!], mode: "roleplay", closedShopOverrideReason: "",
      }, ownerActor)),
    ]);
    assert.deepEqual(departureAdditionResults.map(({ status }) => status), ["fulfilled", "fulfilled"]);
    const activeRaceVisits = await seedPool.query<{ id: number; active_members: number }>(`select v.id,count(m.id)::int active_members
      from campaign_session_scene_shop_visit v
      left join campaign_session_scene_shop_visit_member m on m.visit_id=v.id and m.status='active'
      where v.scene_id=$1 and v.shop_id=$2 and v.status='active'
      group by v.id`, [sceneId, townShopB]);
    assert.equal(activeRaceVisits.rows.length, 1, "departure/addition race must leave exactly one active visit");
    assert.equal(activeRaceVisits.rows[0]!.active_members, 1, "an active visit must retain an active member after the race");
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_scene_shop_visit_member where character_id=$1 and status='active'", [characterIds[0]])).rows[0].value), 0);
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_scene_shop_visit_member where character_id=$1 and status='active'", [characterIds[1]])).rows[0].value), 1);
    await dbModule.db.transaction((tx) => visit.endShopVisitInTransaction(tx, activeRaceVisits.rows[0]!.id, `Race resolved after visit ${departureAdditionRaceVisit.visitId}`, ownerActor));

    await assert.rejects(dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: closedShop, placement: { kind: "independent" }, characterIds: [characterIds[0]!], mode: "roleplay", closedShopOverrideReason: "",
    }, ownerActor)), /override reason/);
    const closedVisit = await dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: closedShop, placement: { kind: "independent" }, characterIds: [characterIds[0]!], mode: "roleplay", closedShopOverrideReason: "Private appointment",
    }, ownerActor));
    assert.equal((await seedPool.query("select closed_shop_override,closed_shop_override_reason from campaign_session_scene_shop_visit where id=$1", [closedVisit.visitId])).rows[0].closed_shop_override, true);
    const closedPlayerView = await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[0]!, players[0]!));
    assert.equal(JSON.stringify(closedPlayerView).includes("Private appointment"), false, "the recorded G.O.D. override reason must not enter the Player projection");
    await assert.rejects(dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: archivedShop, placement: { kind: "independent" }, characterIds: [characterIds[2]!], mode: "shopping", closedShopOverrideReason: "Archived override",
    }, ownerActor)), /Archived Shops/);

    await dbModule.db.transaction((tx) => visit.endShopVisitInTransaction(tx, closedVisit.visitId, "Appointment complete", ownerActor));
    const concurrent = await Promise.allSettled([
      dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
        sceneId, shopId: independentShop, placement: { kind: "independent" }, characterIds: [characterIds[2]!], mode: "shopping", closedShopOverrideReason: "",
      }, ownerActor)),
      dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
        sceneId, shopId: townShopA, placement: { kind: "town", townId: townA }, characterIds: [characterIds[2]!], mode: "roleplay", closedShopOverrideReason: "",
      }, ownerActor)),
    ]);
    assert.equal(concurrent.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(({ status }) => status === "rejected").length, 1);
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_scene_shop_visit_member where character_id=$1 and status='active'", [characterIds[2]])).rows[0].value), 1, "the database must enforce one active Shop membership per Character");
    await seedPool.query("delete from campaign_session_scene_member where scene_id=$1 and character_id=$2", [sceneId, characterIds[2]]);
    assert.equal(await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[2]!, players[2]!)), null, "current Scene permission loss must immediately remove visit access");
    await seedPool.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,2)", [sceneId, sessionId, campaignId, characterIds[2]]);
    const activeVisitId = Number((await seedPool.query("select visit_id from campaign_session_scene_shop_visit_member where character_id=$1 and status='active'", [characterIds[2]])).rows[0].visit_id);
    const activeVisitRow = (await seedPool.query("select shop_id,placement_kind,town_id from campaign_session_scene_shop_visit where id=$1", [activeVisitId])).rows[0];
    await assert.rejects(dbModule.db.transaction((tx) => visit.assertNoActiveShopVisitForPlacementInTransaction(tx, {
      sceneId,
      shopId: Number(activeVisitRow.shop_id),
      ...(activeVisitRow.placement_kind === "town" ? { townId: Number(activeVisitRow.town_id) } : { placementKind: "independent" as const }),
    })), /End the active Shop visit/);

    await dbModule.db.transaction((tx) => visit.endActiveShopVisitsForSceneInTransaction(tx, sceneId, god));
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_scene_shop_visit where scene_id=$1 and status='active'", [sceneId])).rows[0].value), 0);
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_scene_shop_visit where scene_id=$1", [sceneId])).rows[0].value) >= 3, true, "ended visit history must remain readable");
    await seedPool.query("update campaign_session_scene set status='completed',completed_at=now() where id=$1", [sceneId]);
    await seedPool.query("update campaign_session_scene set status='active',completed_at=null where id=$1", [sceneId]);
    assert.equal(await dbModule.db.transaction((tx) => visit.readPlayerShopVisitInTransaction(tx, characterIds[2]!, players[2]!)), null, "reopening a Scene must not resurrect ended visits");

    const sessionVisit = await dbModule.db.transaction((tx) => visit.startOrAddShopVisitInTransaction(tx, {
      sceneId, shopId: independentShop, placement: { kind: "independent" }, characterIds: [characterIds[0]!], mode: "shopping", closedShopOverrideReason: "",
    }, ownerActor));
    await dbModule.db.transaction((tx) => visit.endActiveShopVisitsForSessionInTransaction(tx, sessionId, god));
    assert.equal((await seedPool.query("select status,end_reason from campaign_session_scene_shop_visit where id=$1", [sessionVisit.visitId])).rows[0].status, "ended");
    assert.equal((await seedPool.query("select end_reason from campaign_session_scene_shop_visit where id=$1", [sessionVisit.visitId])).rows[0].end_reason, "The Session was completed.");

    const state = (await seedPool.query("select s.status session_status,sc.status scene_status from campaign_session s join campaign_session_scene sc on sc.session_id=s.id where sc.id=$1", [sceneId])).rows[0];
    assert.deepEqual(state, { session_status: "active", scene_status: "active" });
  } finally {
    await Promise.all(concurrencyPools.map((pool) => pool.end().catch(() => undefined)));
    if (applicationPool) await applicationPool.end().catch(() => undefined);
    if (seedPool) await seedPool.end().catch(() => undefined);
    if (started) execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    await rm(temporaryCluster, { recursive: true, force: true });
  }
});
