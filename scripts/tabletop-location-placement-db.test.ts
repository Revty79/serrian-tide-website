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

async function findLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => (
    error ? rejectClose(error) : resolveClose()
  )));
  if (!port) throw new Error("A disposable location-placement PostgreSQL port could not be reserved.");
  return port;
}

async function insertCampaign(pool: pg.Pool, ownerId: string, name: string): Promise<number> {
  const result = await pool.query<{ id: number }>(`
    insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,
      points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,
      currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'',0,0,0,0,100,0,'Credits','Assigned',0,$2)
    returning id
  `, [name, ownerId]);
  return result.rows[0]!.id;
}

async function insertNpc(
  pool: pg.Pool,
  input: { campaignId: number; ownerId: string; name: string; kind: "race" | "creature"; build: "simple" | "detailed" },
): Promise<number> {
  const result = await pool.query<{ id: number }>(`
    insert into campaign_character (
      campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,npc_role_label
    ) values ($1,$2,$3,true,$4,'detailed',$5) returning id
  `, [input.campaignId, input.ownerId, input.name, input.kind, `${input.kind} fixture`]);
  const id = result.rows[0]!.id;
  if (input.build === "simple") {
    await pool.query("update campaign_character set npc_build_mode='simple' where id=$1", [id]);
  }
  return id;
}

test("Town and Shop placement is atomic, scoped, repeat-safe, refreshable, and leak-safe", { timeout: 120_000 }, async () => {
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-location-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await findLoopbackPort();
  let seedPool: pg.Pool | null = null;
  let applicationPool: { end(): Promise<void> } | null = null;
  let clusterStarted = false;

  try {
    execFileSync(initdbExecutable, ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", dataDirectory], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;
    const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    process.env.DATABASE_URL = connectionString;
    seedPool = new pg.Pool({ connectionString });
    await migrate(drizzle(seedPool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const migrationLedger = await seedPool.query<{ count: number }>(
      "select count(*)::int count from drizzle.__drizzle_migrations",
    );
    assert.equal(Number(migrationLedger.rows[0]?.count), 41, "the disposable database did not reach migration 0040");

    const ownerA = "location-owner-a";
    const ownerB = "location-owner-b";
    await seedPool.query(`insert into "user" (id,name,email,email_verified) values
      ($1,'Location Owner A','location-a@example.invalid',true),
      ($2,'Location Owner B','location-b@example.invalid',true)`, [ownerA, ownerB]);
    await seedPool.query("insert into user_role (user_id,role) values ($1,'god'),($2,'god')", [ownerA, ownerB]);
    const campaignA = await insertCampaign(seedPool, ownerA, "Location Campaign A");
    const campaignB = await insertCampaign(seedPool, ownerB, "Location Campaign B");
    await seedPool.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($3,$4,true)", [campaignA, ownerA, campaignB, ownerB]);

    const sessionId = Number((await seedPool.query<{ id: number }>(`
      insert into campaign_session (campaign_id,title,sequence_number,status,started_at)
      values ($1,'Location Session',1,'active',now()) returning id
    `, [campaignA])).rows[0]!.id);
    const sceneId = Number((await seedPool.query<{ id: number }>(`
      insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at)
      values ($1,$2,1,'Market Arrival','active',now()) returning id
    `, [sessionId, campaignA])).rows[0]!.id);
    const townId = Number((await seedPool.query<{ id: number }>(`
      insert into town (campaign_id,name,category,overview,location_notes,god_notes)
      values ($1,'Lantern Harbor','Port','A harbor of lantern-lit piers.','Private route notes','Secret harbor faction') returning id
    `, [campaignA])).rows[0]!.id);
    const foreignTownId = Number((await seedPool.query<{ id: number }>(`
      insert into town (campaign_id,name,category) values ($1,'Foreign Town','Village') returning id
    `, [campaignB])).rows[0]!.id);
    const townShopId = Number((await seedPool.query<{ id: number }>(`
      insert into shop (campaign_id,name,category,description,balance_credits,storefront_state,location_notes)
      values ($1,'Brass Compass','Supplies','Charts and voyage provisions.',77,'open','Private margins') returning id
    `, [campaignA])).rows[0]!.id);
    const standaloneShopId = Number((await seedPool.query<{ id: number }>(`
      insert into shop (campaign_id,name,category,description,balance_credits,storefront_state,location_notes)
      values ($1,'Night Cart','Street vendor','A shuttered traveling cart.',31,'closed','Private route') returning id
    `, [campaignA])).rows[0]!.id);
    const archivedShopId = Number((await seedPool.query<{ id: number }>(`
      insert into shop (campaign_id,name,category,description,balance_credits,storefront_state,location_notes)
      values ($1,'Retired Chandlery','Supplies','A shuttered chandlery.',0,'closed','Retained private notes') returning id
    `, [campaignA])).rows[0]!.id);
    await seedPool.query(`insert into town_shop_membership (town_id,shop_id,campaign_id,sort_order) values
      ($1,$2,$3,0),($1,$4,$3,1)`, [townId, townShopId, campaignA, archivedShopId]);
    const placeA = Number((await seedPool.query<{ id: number }>(`
      insert into town_place (town_id,campaign_id,name,category,description,location_notes,god_notes,sort_order)
      values ($1,$2,'Signal Tower','Landmark','A tall brass signal tower.','Private stair','Hidden lens',0) returning id
    `, [townId, campaignA])).rows[0]!.id);
    const placeB = Number((await seedPool.query<{ id: number }>(`
      insert into town_place (town_id,campaign_id,name,category,description,sort_order)
      values ($1,$2,'Low Market','District','A crowded waterside market.',1) returning id
    `, [townId, campaignA])).rows[0]!.id);
    const sharedNpcId = await insertNpc(seedPool, { campaignId: campaignA, ownerId: ownerA, name: "Mira Voss", kind: "race", build: "simple" });
    const directNpcId = await insertNpc(seedPool, { campaignId: campaignA, ownerId: ownerA, name: "Harbor Drake", kind: "creature", build: "detailed" });
    const staffNpcId = await insertNpc(seedPool, { campaignId: campaignA, ownerId: ownerA, name: "Tomas Vale", kind: "race", build: "detailed" });
    const archivedOnlyStaffNpcId = await insertNpc(seedPool, { campaignId: campaignA, ownerId: ownerA, name: "Retired Clerk", kind: "race", build: "simple" });
    const directFallbackNpcId = await insertNpc(seedPool, { campaignId: campaignA, ownerId: ownerA, name: "Town Lamplighter", kind: "race", build: "detailed" });
    const activeShopFallbackNpcId = await insertNpc(seedPool, { campaignId: campaignA, ownerId: ownerA, name: "Relief Clerk", kind: "creature", build: "simple" });
    await seedPool.query(`insert into town_npc_association (town_id,campaign_id,npc_character_id,relationship_label,sort_order)
      values ($1,$2,$3,'Harbormaster',0),($1,$2,$4,'Dock guardian',1),($1,$2,$5,'Lamplighter',2)`, [townId, campaignA, sharedNpcId, directNpcId, directFallbackNpcId]);
    await seedPool.query(`insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id,responsibility_label,is_primary_contact,sort_order)
      values
        ($1,$2,$3,'Navigator',true,0),
        ($1,$2,$4,'Proprietor',false,1),
        ($1,$2,$5,'Relief clerk',false,2),
        ($6,$2,$7,'Retired clerk',false,0),
        ($6,$2,$8,'Lamp supplier',false,1),
        ($6,$2,$5,'Former relief clerk',false,2)`, [
          townShopId,
          campaignA,
          sharedNpcId,
          staffNpcId,
          activeShopFallbackNpcId,
          archivedShopId,
          archivedOnlyStaffNpcId,
          directFallbackNpcId,
        ]);
    await seedPool.query("update shop set archived_at=now(),archive_reason='Closed before Session preparation' where id=$1", [archivedShopId]);
    await seedPool.query(`insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order)
      values ($1,$2,$3,0)`, [sessionId, campaignA, sharedNpcId]);
    await seedPool.query(`insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order)
      values ($1,$2,$3,$4,0)`, [sceneId, sessionId, campaignA, sharedNpcId]);

    const dbModule = await import("@/db");
    applicationPool = dbModule.pool;
    const location = await import("@/features/tabletop-operations/location-placement-service");
    const publicProjection = await import("@/features/tabletop-operations/location-public-projection");
    const initialWorkspace = await dbModule.db.transaction((tx) => location.readLocationPlacementWorkspaceInTransaction(tx, { sessionId, sceneId }));
    const initialTown = initialWorkspace.towns.find(({ id }) => id === townId);
    assert.ok(initialTown);
    const defaultSelection = {
      shopIds: initialTown.shops.filter(({ archived }) => !archived).map(({ id }) => id),
      placeIds: initialTown.places.filter(({ archived }) => !archived).map(({ id }) => id),
      npcCharacterIds: initialTown.npcs.filter(({ archived }) => !archived).map(({ id }) => id),
    };
    assert.deepEqual(defaultSelection.shopIds, [townShopId], "archived Town Shops must be omitted from the default preview");
    assert.equal(defaultSelection.npcCharacterIds.includes(archivedOnlyStaffNpcId), false, "staffing only an archived Shop must not confer placement eligibility");
    assert.equal(defaultSelection.npcCharacterIds.includes(directFallbackNpcId), true, "a direct Town association must preserve eligibility");
    assert.equal(defaultSelection.npcCharacterIds.includes(activeShopFallbackNpcId), true, "staffing another active Town Shop must preserve eligibility");
    const first = await dbModule.db.transaction((tx) => location.placeTownInSceneInTransaction(tx, sceneId, townId, defaultSelection, ownerA));
    const repeated = await dbModule.db.transaction((tx) => location.placeTownInSceneInTransaction(tx, sceneId, townId, defaultSelection, ownerA));
    assert.equal(first.created, true);
    assert.equal(repeated.created, false);

    const placementCounts = (await seedPool.query(`select
      (select count(*) from campaign_session_scene_town where scene_id=$1)::int towns,
      (select count(*) from campaign_session_scene_town_shop where scene_id=$1)::int shops,
      (select count(*) from campaign_session_scene_town_place where scene_id=$1)::int places,
      (select count(*) from campaign_session_scene_town_npc where scene_id=$1)::int npcs,
      (select count(*) from campaign_session_roster where session_id=$2)::int roster,
      (select count(*) from campaign_session_scene_member where scene_id=$1)::int members,
      (select count(*) from campaign_session_encounter_participant where scene_id=$1)::int encounters
    `, [sceneId, sessionId])).rows[0];
    assert.deepEqual(placementCounts, { towns: 1, shops: 1, places: 2, npcs: 5, roster: 5, members: 5, encounters: 0 });

    await dbModule.db.transaction((tx) => location.placeShopInSceneInTransaction(tx, sceneId, standaloneShopId, ownerA));
    const hidden = await dbModule.db.transaction((tx) => publicProjection.readPublicSceneLocationDirectoryInTransaction(tx, { sceneId, sessionId, campaignId: campaignA }));
    assert.deepEqual(hidden, { towns: [], shops: [] });
    await dbModule.db.transaction(async (tx) => {
      await location.setTownPlacementVisibilityInTransaction(tx, sceneId, townId, true, true, ownerA);
      await location.setShopPlacementVisibilityInTransaction(tx, sceneId, standaloneShopId, true, ownerA);
    });
    const revealed = await dbModule.db.transaction((tx) => publicProjection.readPublicSceneLocationDirectoryInTransaction(tx, { sceneId, sessionId, campaignId: campaignA }));
    assert.equal(revealed.towns[0]?.npcs.length, 5);
    assert.equal(revealed.towns[0]?.npcs.filter(({ id }) => id === sharedNpcId).length, 1, "a direct-and-staff NPC must be deduplicated");
    assert.equal(revealed.towns[0]?.shops[0]?.staff.length, 3);
    assert.equal(revealed.shops[0]?.storefrontState, "closed");
    const publicJson = JSON.stringify(revealed);
    assert.equal(publicJson.includes(`"npcCharacterId":${archivedOnlyStaffNpcId}`), false, "archived-Shop-only staff must not reach the public projection");
    for (const privateField of ["godNotes", "locationNotes", "balanceCredits", "characterPurchaseMode", "shopNote"]) {
      assert.equal(publicJson.includes(privateField), false, `${privateField} leaked into the public projection`);
    }

    const secondTownId = Number((await seedPool.query<{ id: number }>(`
      insert into town (campaign_id,name,category,overview)
      values ($1,'Warden Quarter','District','A guarded inland quarter.') returning id
    `, [campaignA])).rows[0]!.id);
    const secondTownShopId = Number((await seedPool.query<{ id: number }>(`
      insert into shop (campaign_id,name,category,description,balance_credits,storefront_state)
      values ($1,'Warden Outfitters','Outfitter','A shop beside the inland gate.',0,'open') returning id
    `, [campaignA])).rows[0]!.id);
    await seedPool.query("insert into town_shop_membership (town_id,shop_id,campaign_id,sort_order) values ($1,$2,$3,0)", [secondTownId, secondTownShopId, campaignA]);
    await seedPool.query(`insert into shop_staff_assignment
      (shop_id,campaign_id,npc_character_id,responsibility_label,is_primary_contact,sort_order)
      values ($1,$2,$3,'Quartermaster',true,0)`, [secondTownShopId, campaignA, sharedNpcId]);
    const secondTownWorkspace = await dbModule.db.transaction((tx) => location.readLocationPlacementWorkspaceInTransaction(tx, { sessionId, sceneId }));
    const secondTown = secondTownWorkspace.towns.find(({ id }) => id === secondTownId);
    assert.ok(secondTown);
    const secondTownSelection = {
      shopIds: secondTown.shops.filter(({ archived }) => !archived).map(({ id }) => id),
      placeIds: secondTown.places.filter(({ archived }) => !archived).map(({ id }) => id),
      npcCharacterIds: secondTown.npcs.filter(({ archived }) => !archived).map(({ id }) => id),
    };
    await dbModule.db.transaction((tx) => location.placeTownInSceneInTransaction(tx, sceneId, secondTownId, secondTownSelection, ownerA));
    await dbModule.db.transaction(async (tx) => {
      await location.setTownPlacementVisibilityInTransaction(tx, sceneId, secondTownId, true, false, ownerA);
      await location.setTownChildStateInTransaction(tx, {
        sceneId, townId: secondTownId, kind: "shop", childId: secondTownShopId, included: true, revealed: true,
      }, ownerA);
    });
    const hiddenInSecondTown = await dbModule.db.transaction((tx) => publicProjection.readPublicSceneLocationDirectoryInTransaction(tx, { sceneId, sessionId, campaignId: campaignA }));
    const hiddenSecondShop = hiddenInSecondTown.towns.find(({ id }) => id === secondTownId)?.shops.find(({ id }) => id === secondTownShopId);
    assert.deepEqual(hiddenSecondShop?.staff, [], "an NPC revealed in another Town must not expose a hidden staff role here");

    await dbModule.db.transaction((tx) => location.setTownChildStateInTransaction(tx, {
      sceneId, townId: secondTownId, kind: "npc", childId: sharedNpcId, included: false, revealed: false,
    }, ownerA));
    const excludedFromSecondTown = await dbModule.db.transaction((tx) => publicProjection.readPublicSceneLocationDirectoryInTransaction(tx, { sceneId, sessionId, campaignId: campaignA }));
    const excludedSecondShop = excludedFromSecondTown.towns.find(({ id }) => id === secondTownId)?.shops.find(({ id }) => id === secondTownShopId);
    assert.deepEqual(excludedSecondShop?.staff, [], "an NPC revealed in another Town must not expose an excluded staff role here");

    await dbModule.db.transaction((tx) => location.setTownChildStateInTransaction(tx, {
      sceneId, townId: secondTownId, kind: "npc", childId: sharedNpcId, included: true, revealed: true,
    }, ownerA));
    const revealedInSecondTown = await dbModule.db.transaction((tx) => publicProjection.readPublicSceneLocationDirectoryInTransaction(tx, { sceneId, sessionId, campaignId: campaignA }));
    const revealedSecondShop = revealedInSecondTown.towns.find(({ id }) => id === secondTownId)?.shops.find(({ id }) => id === secondTownShopId);
    assert.deepEqual(revealedSecondShop?.staff.map(({ npcCharacterId, responsibilityLabel }) => ({ npcCharacterId, responsibilityLabel })), [
      { npcCharacterId: sharedNpcId, responsibilityLabel: "Quartermaster" },
    ]);
    await dbModule.db.transaction((tx) => location.detachTownFromSceneInTransaction(tx, sceneId, secondTownId, ownerA));

    await seedPool.query("update shop set archived_at=now(),archive_reason='Historical read check' where id=$1", [townShopId]);
    const archivedSourceHistory = await dbModule.db.transaction((tx) => location.readLocationPlacementWorkspaceInTransaction(tx, { sessionId, sceneId }));
    const archivedSourceTown = archivedSourceHistory.sceneTowns.find(({ town: sourceTown }) => sourceTown.id === townId);
    assert.equal(archivedSourceTown?.shops.find(({ id }) => id === townShopId)?.archived, true);
    assert.equal(archivedSourceTown?.npcs.some(({ id }) => id === staffNpcId), true, "an existing staff-derived placement must remain readable after its Shop is archived");
    await seedPool.query("update shop set archived_at=null,archive_reason='' where id=$1", [townShopId]);

    await dbModule.db.transaction((tx) => location.setTownChildStateInTransaction(tx, {
      sceneId, townId, kind: "place", childId: placeB, included: false, revealed: false,
    }, ownerA));
    await seedPool.query("delete from town_npc_association where town_id=$1 and npc_character_id=$2", [townId, directNpcId]);
    const historical = await dbModule.db.transaction((tx) => location.readLocationPlacementWorkspaceInTransaction(tx, { sessionId, sceneId }));
    assert.ok(historical.sceneTowns[0]?.npcs.some(({ id }) => id === directNpcId), "removed builder relationships remain readable before refresh");
    const newPlaceId = Number((await seedPool.query<{ id: number }>(`
      insert into town_place (town_id,campaign_id,name,category,description,sort_order)
      values ($1,$2,'Moon Bridge','Crossing','A new bridge over the inner canal.',2) returning id
    `, [townId, campaignA])).rows[0]!.id);
    const newNpcId = await insertNpc(seedPool, { campaignId: campaignA, ownerId: ownerA, name: "Bridge Warden", kind: "creature", build: "simple" });
    await seedPool.query("insert into town_npc_association (town_id,campaign_id,npc_character_id,relationship_label,sort_order) values ($1,$2,$3,'Warden',2)", [townId, campaignA, newNpcId]);
    const preview = await dbModule.db.transaction((tx) => location.previewTownRefreshInTransaction(tx, sceneId, townId, ownerA));
    assert.deepEqual(preview.placeAdditions.map(({ id }) => id), [newPlaceId]);
    assert.deepEqual(preview.npcAdditions.map(({ id }) => id), [newNpcId]);
    assert.deepEqual(preview.npcRemovals.map(({ id }) => id), [directNpcId]);
    await dbModule.db.transaction((tx) => location.applyTownRefreshInTransaction(tx, sceneId, townId, ownerA));
    const refreshed = await dbModule.db.transaction((tx) => location.readLocationPlacementWorkspaceInTransaction(tx, { sessionId, sceneId }));
    const refreshedTown = refreshed.sceneTowns[0]!;
    assert.equal(refreshedTown.shops[0]?.revealed, true, "retained visibility must survive refresh");
    const retainedExcludedPlace = refreshedTown.places.find(({ id }) => id === placeB);
    assert.equal(retainedExcludedPlace?.included, false);
    assert.equal(retainedExcludedPlace?.revealed, false);
    assert.equal(refreshedTown.places.find(({ id }) => id === newPlaceId)?.revealed, false);
    assert.equal(refreshedTown.npcs.find(({ id }) => id === newNpcId)?.revealed, false);
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_roster where session_id=$1 and character_id=$2", [sessionId, newNpcId])).rows[0].value), 1);

    await assert.rejects(
      dbModule.db.transaction((tx) => location.placeTownInSceneInTransaction(tx, sceneId, foreignTownId, {}, ownerA)),
      /active Town from this Campaign/,
    );
    await assert.rejects(
      dbModule.db.transaction((tx) => location.placeTownInSceneInTransaction(tx, sceneId, townId, {}, ownerB)),
      /Campaign creator/,
    );
    await assert.rejects(seedPool.query("delete from shop where id=$1", [townShopId]), /foreign key/i);
    await assert.rejects(seedPool.query("delete from town where id=$1", [townId]), /foreign key/i);
    await assert.rejects(seedPool.query("delete from town_place where id=$1", [placeA]), /foreign key/i);
    await assert.rejects(seedPool.query("delete from campaign_character where id=$1", [sharedNpcId]), /foreign key/i);

    await dbModule.db.transaction((tx) => location.detachTownFromSceneInTransaction(tx, sceneId, townId, ownerA));
    const retained = (await seedPool.query(`select
      (select count(*) from town where id=$1)::int town,
      (select count(*) from campaign_session_roster where session_id=$2)::int roster,
      (select count(*) from campaign_session_scene_member where scene_id=$3)::int members,
      (select balance_credits from shop where id=$4)::int balance,
      (select storefront_state from shop where id=$5) storefront,
      (select count(*) from campaign_session_scene_town where scene_id=$3)::int town_placements,
      (select count(*) from campaign_session_scene_town_shop where scene_id=$3)::int town_shop_refs,
      (select count(*) from campaign_session_scene_town_place where scene_id=$3)::int town_place_refs,
      (select count(*) from campaign_session_scene_town_npc where scene_id=$3)::int town_npc_refs,
      (select count(*) from campaign_session_scene_shop where scene_id=$3)::int independent_shops
    `, [townId, sessionId, sceneId, townShopId, standaloneShopId])).rows[0];
    assert.deepEqual(retained, {
      town: 1,
      roster: 6,
      members: 6,
      balance: 77,
      storefront: "closed",
      town_placements: 0,
      town_shop_refs: 0,
      town_place_refs: 0,
      town_npc_refs: 0,
      independent_shops: 1,
    });

    const createWorkspace = await dbModule.db.transaction((tx) => location.readLocationPlacementWorkspaceInTransaction(tx, { sessionId, sceneId }));
    const createTown = createWorkspace.towns.find(({ id }) => id === townId);
    assert.ok(createTown);
    const createDefaultSelection = {
      shopIds: createTown.shops.filter(({ archived }) => !archived).map(({ id }) => id),
      placeIds: createTown.places.filter(({ archived }) => !archived).map(({ id }) => id),
      npcCharacterIds: createTown.npcs.filter(({ archived }) => !archived).map(({ id }) => id),
    };
    assert.equal(createDefaultSelection.npcCharacterIds.includes(archivedOnlyStaffNpcId), false);
    const created = await dbModule.db.transaction((tx) => location.createSceneFromTownInTransaction(tx, sessionId, townId, createDefaultSelection, ownerA));
    assert.notEqual(created.sceneId, sceneId);
    assert.deepEqual((await seedPool.query("select title,status,location_label,description from campaign_session_scene where id=$1", [created.sceneId])).rows, [{
      title: "Lantern Harbor", status: "planned", location_label: "Lantern Harbor", description: "A harbor of lantern-lit piers.",
    }]);
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_scene_town_npc where scene_id=$1 and npc_character_id=$2", [created.sceneId, archivedOnlyStaffNpcId])).rows[0].value), 0);
    await seedPool.query("update campaign_session_scene set status='completed',completed_at=now() where id=$1", [sceneId]);
    await assert.rejects(
      dbModule.db.transaction((tx) => location.placeShopInSceneInTransaction(tx, sceneId, townShopId, ownerA)),
      /completed/i,
    );
    assert.equal(Number((await seedPool.query("select count(*)::int value from campaign_session_encounter where session_id=$1", [sessionId])).rows[0].value), 0);
    assert.equal(placeA > 0, true);
  } finally {
    if (applicationPool) await applicationPool.end().catch(() => undefined);
    if (seedPool) await seedPool.end().catch(() => undefined);
    if (clusterStarted && existsSync(path.join(dataDirectory, "postmaster.pid"))) {
      execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    }
    await rm(temporaryCluster, { recursive: true, force: true });
    assert.equal(existsSync(temporaryCluster), false, "Disposable location-placement PostgreSQL files were not removed.");
  }
});
