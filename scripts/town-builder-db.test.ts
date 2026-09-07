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
import pg, { type PoolClient } from "pg";

import { currentMigrationSnapshotName } from "./current-migration-snapshot";

const defaultWindowsPostgresBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN
  ?? (existsSync(defaultWindowsPostgresBin) ? defaultWindowsPostgresBin : "");
const initdbExecutable = postgresBin ? path.join(postgresBin, "initdb.exe") : "initdb";
const pgCtlExecutable = postgresBin ? path.join(postgresBin, "pg_ctl.exe") : "pg_ctl";
const migrationRoot = path.resolve(process.cwd(), "drizzle");

async function findLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  if (!port) throw new Error("A disposable Town-test PostgreSQL port could not be reserved.");
  return port;
}

let rejectionSequence = 0;

async function expectRejection(client: PoolClient, operation: () => Promise<unknown>, expected: RegExp): Promise<void> {
  const savepoint = `town_rejection_${++rejectionSequence}`;
  await client.query(`savepoint ${savepoint}`);
  let caught: unknown;
  try { await operation(); } catch (error) { caught = error; }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert.ok(caught, "Expected the Town database operation to be rejected.");
  assert.match(caught instanceof Error ? caught.message : String(caught), expected);
}

async function insertCampaign(client: PoolClient, ownerId: string, name: string): Promise<number> {
  const result = await client.query<{ id: number }>(`
    insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,
      points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,
      currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'',0,0,0,0,100,0,'Credits','Assigned',0,$2)
    returning id
  `, [name, ownerId]);
  return result.rows[0]!.id;
}

async function insertNpc(client: PoolClient, input: {
  campaignId: number;
  userId: string;
  name: string;
  kind: "race" | "creature";
  build: "simple" | "detailed";
  archived?: boolean;
  isNpc?: boolean;
}): Promise<number> {
  const result = await client.query<{ id: number }>(`
    insert into campaign_character (
      campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,
      archived_at,archived_by_user_id,archive_reason
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id
  `, [
    input.campaignId,
    input.userId,
    input.name,
    input.isNpc ?? true,
    input.kind,
    input.isNpc === false ? null : input.build,
    input.archived ? new Date() : null,
    input.archived ? input.userId : null,
    input.archived ? "Archived fixture" : "",
  ]);
  return result.rows[0]!.id;
}

test("0036 replays with parity and enforces Town ownership, eligibility, cardinality, and survival rules", { timeout: 120_000 }, async () => {
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-town-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await findLoopbackPort();
  let pool: pg.Pool | null = null;
  let clusterStarted = false;

  try {
    execFileSync(initdbExecutable, ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", dataDirectory], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;
    const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    pool = new pg.Pool({ connectionString });
    await migrate(drizzle(pool), { migrationsFolder: migrationRoot });
    const parityOutput = execFileSync(process.execPath, ["scripts/verify-runtime-foundation-schema.mjs", currentMigrationSnapshotName(migrationRoot)], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: connectionString },
      windowsHide: true,
    });
    assert.match(parityOutput, /Runtime Foundation schema parity passed/);

    const client = await pool.connect();
    try {
      await client.query("begin");
      const ownerA = "town-db-owner-a";
      const ownerB = "town-db-owner-b";
      await client.query(`insert into "user" (id,name,email,email_verified) values
        ($1,'Town Owner A','town-owner-a@example.invalid',true),
        ($2,'Town Owner B','town-owner-b@example.invalid',true)`, [ownerA, ownerB]);
      await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'god')", [ownerA, ownerB]);
      const campaignA = await insertCampaign(client, ownerA, "Town Campaign A");
      const campaignB = await insertCampaign(client, ownerB, "Town Campaign B");
      await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($3,$4,true)", [campaignA, ownerA, campaignB, ownerB]);

      const townA = Number((await client.query<{ id: number }>("insert into town (campaign_id,name,category,overview,location_notes,god_notes) values ($1,'Harbor Rest','Port','A harbor town','Northern coast','Smugglers below') returning id", [campaignA])).rows[0]!.id);
      const townB = Number((await client.query<{ id: number }>("insert into town (campaign_id,name,category) values ($1,'High Market','Market district') returning id", [campaignA])).rows[0]!.id);
      const crossTown = Number((await client.query<{ id: number }>("insert into town (campaign_id,name,category) values ($1,'Other Town','Village') returning id", [campaignB])).rows[0]!.id);
      const shopA = Number((await client.query<{ id: number }>("insert into shop (campaign_id,name,category,balance_credits,storefront_state) values ($1,'Salt & Steel','Armorer',73,'open') returning id", [campaignA])).rows[0]!.id);
      const shopB = Number((await client.query<{ id: number }>("insert into shop (campaign_id,name,category) values ($1,'Wayfarer Goods','General') returning id", [campaignA])).rows[0]!.id);
      const crossShop = Number((await client.query<{ id: number }>("insert into shop (campaign_id,name,category) values ($1,'Foreign Goods','General') returning id", [campaignB])).rows[0]!.id);

      const membership = Number((await client.query<{ id: number }>("insert into town_shop_membership (town_id,shop_id,campaign_id,sort_order) values ($1,$2,$3,0) returning id", [townA, shopA, campaignA])).rows[0]!.id);
      await expectRejection(client, () => client.query("insert into town_shop_membership (town_id,shop_id,campaign_id) values ($1,$2,$3)", [townA, shopA, campaignA]), /town_shop_membership.*uq|duplicate key/i);
      await expectRejection(client, () => client.query("insert into town_shop_membership (town_id,shop_id,campaign_id) values ($1,$2,$3)", [townB, shopA, campaignA]), /town_shop_membership_shop_uq|duplicate key/i);
      await expectRejection(client, () => client.query("insert into town_shop_membership (town_id,shop_id,campaign_id) values ($1,$2,$3)", [townA, crossShop, campaignA]), /same Campaign|foreign key/i);
      await expectRejection(client, () => client.query("insert into town_shop_membership (town_id,shop_id,campaign_id) values ($1,$2,$3)", [crossTown, shopB, campaignB]), /same Campaign|foreign key/i);
      await client.query("update town_shop_membership set town_id=$1,sort_order=0 where id=$2 and town_id=$3", [townB, membership, townA]);
      assert.deepEqual((await client.query("select town_id,shop_id from town_shop_membership where id=$1", [membership])).rows, [{ town_id: townB, shop_id: shopA }]);
      assert.deepEqual((await client.query("select balance_credits,storefront_state from shop where id=$1", [shopA])).rows, [{ balance_credits: 73, storefront_state: "open" }]);

      const variants = [
        await insertNpc(client, { campaignId: campaignA, userId: ownerA, name: "Simple Race", kind: "race", build: "simple" }),
        await insertNpc(client, { campaignId: campaignA, userId: ownerA, name: "Detailed Race", kind: "race", build: "detailed" }),
        await insertNpc(client, { campaignId: campaignA, userId: ownerA, name: "Simple Creature", kind: "creature", build: "simple" }),
        await insertNpc(client, { campaignId: campaignA, userId: ownerA, name: "Detailed Creature", kind: "creature", build: "detailed" }),
      ];
      for (const [sortOrder, npcId] of variants.entries()) {
        await client.query("insert into town_npc_association (town_id,campaign_id,npc_character_id,relationship_label,town_note,sort_order) values ($1,$2,$3,$4,'Retained Town note',$5)", [townA, campaignA, npcId, `Relationship ${sortOrder + 1}`, sortOrder]);
      }
      await client.query("insert into town_npc_association (town_id,campaign_id,npc_character_id) values ($1,$2,$3)", [townB, campaignA, variants[0]]);
      assert.equal(Number((await client.query<{ value: number }>("select count(*)::int value from town_npc_association where npc_character_id=$1", [variants[0]])).rows[0]!.value), 2);
      await expectRejection(client, () => client.query("insert into town_npc_association (town_id,campaign_id,npc_character_id) values ($1,$2,$3)", [townA, campaignA, variants[0]]), /town_npc_association_town_npc_uq|duplicate key/i);
      const archivedNpc = await insertNpc(client, { campaignId: campaignA, userId: ownerA, name: "Archived NPC", kind: "race", build: "simple", archived: true });
      const player = await insertNpc(client, { campaignId: campaignA, userId: ownerA, name: "Player", kind: "race", build: "detailed", isNpc: false });
      const crossNpc = await insertNpc(client, { campaignId: campaignB, userId: ownerB, name: "Foreign NPC", kind: "creature", build: "simple" });
      await expectRejection(client, () => client.query("insert into town_npc_association (town_id,campaign_id,npc_character_id) values ($1,$2,$3)", [townA, campaignA, archivedNpc]), /active persistent Race or Creature NPC/);
      await expectRejection(client, () => client.query("insert into town_npc_association (town_id,campaign_id,npc_character_id) values ($1,$2,$3)", [townA, campaignA, player]), /active persistent Race or Creature NPC/);
      await expectRejection(client, () => client.query("insert into town_npc_association (town_id,campaign_id,npc_character_id) values ($1,$2,$3)", [townA, campaignA, crossNpc]), /same Campaign|foreign key/i);
      await client.query("update campaign_character set archived_at=now(),archived_by_user_id=$1,archive_reason='After linking' where id=$2", [ownerA, variants[1]]);
      assert.equal(Number((await client.query<{ value: number }>("select count(*)::int value from town_npc_association where npc_character_id=$1", [variants[1]])).rows[0]!.value), 1);

      const placeA = Number((await client.query<{ id: number }>("insert into town_place (town_id,campaign_id,name,category,description,location_notes,god_notes,sort_order) values ($1,$2,'Old Lighthouse','Landmark','Storm-worn tower','Western point','Hidden chamber',0) returning id", [townA, campaignA])).rows[0]!.id);
      await client.query("insert into town_place (town_id,campaign_id,name,category,sort_order) values ($1,$2,'Lower Market','District',1)", [townA, campaignA]);
      await expectRejection(client, () => client.query("insert into town_place (town_id,campaign_id,name) values ($1,$2,'Crossed Place')", [townA, campaignB]), /same Campaign|foreign key|active parent Town/i);
      await client.query("update town_place set archived_at=now(),archived_by_user_id=$1,archive_reason='Collapsed',sort_order=0 where id=$2", [ownerA, placeA]);
      assert.deepEqual((await client.query("select name,archive_reason from town_place where id=$1", [placeA])).rows, [{ name: "Old Lighthouse", archive_reason: "Collapsed" }]);

      await expectRejection(client, () => client.query("delete from shop where id=$1", [shopA]), /town_shop_membership_shop_campaign_fk|foreign key/i);
      await expectRejection(client, () => client.query("delete from campaign_character where id=$1", [variants[0]]), /town_npc_association_npc_campaign_fk|foreign key/i);
      const shopItem = Number((await client.query<{ id: number }>(`insert into items (
        canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis,created_by_user_id
      ) values ('TOWN-DB-SHOP-ITEM','Harbor Rope','inventory',null,'Inventory','Supplies','General','A Shop-owned offering fixture.',4,'coil',$1) returning id`, [ownerA])).rows[0]!.id);
      await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0)", [campaignA, shopItem]);
      await client.query("insert into shop_offering (shop_id,campaign_id,item_id,shop_note) values ($1,$2,$3,'Preserved through Town deletion')", [shopA, campaignA, shopItem]);
      await client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id,responsibility_label,is_primary_contact) values ($1,$2,$3,'Proprietor',true)", [shopA, campaignA, variants[0]]);
      await client.query("insert into lifecycle_audit_event (action,entity_kind,target_id,target_name,campaign_id_snapshot,owner_user_id_snapshot,actor_user_id) values ('delete','town',$1,'Harbor Rest',$2,$3,$3)", [String(townA), campaignA, ownerA]);
      await client.query("delete from town where id=$1", [townA]);
      const survival = (await client.query(`select
        (select count(*) from town where id=$1)::int town,
        (select count(*) from town_place where town_id=$1)::int places,
        (select count(*) from town_shop_membership where town_id=$1)::int shop_links,
        (select count(*) from town_npc_association where town_id=$1)::int npc_links,
        (select count(*) from shop where id=any($2::int[]))::int shops,
        (select count(*) from campaign_character where id=any($3::int[]))::int npcs,
        (select count(*) from items where id=$5)::int items,
        (select count(*) from shop_offering where shop_id=$6 and item_id=$5)::int offerings,
        (select count(*) from shop_staff_assignment where shop_id=$6 and npc_character_id=$7)::int staff,
        (select count(*) from lifecycle_audit_event where entity_kind='town' and target_id=$4)::int audits
      `, [townA, [shopA, shopB], variants, String(townA), shopItem, shopA, variants[0]])).rows[0];
      assert.deepEqual(survival, { town: 0, places: 0, shop_links: 0, npc_links: 0, shops: 2, npcs: 4, items: 1, offerings: 1, staff: 1, audits: 1 });
      assert.equal(Number((await client.query<{ value: number }>("select count(*)::int value from town_shop_membership where town_id=$1 and shop_id=$2", [townB, shopA])).rows[0]!.value), 1);
      assert.equal(Number((await client.query<{ value: number }>("select count(*)::int value from town_npc_association where town_id=$1 and npc_character_id=$2", [townB, variants[0]])).rows[0]!.value), 1);
      await client.query("rollback");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    if (pool) await pool.end().catch(() => undefined);
    if (clusterStarted && existsSync(path.join(dataDirectory, "postmaster.pid"))) {
      execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    }
    await rm(temporaryCluster, { recursive: true, force: true });
    assert.equal(existsSync(temporaryCluster), false, "Disposable Town PostgreSQL files were not removed.");
  }
});
