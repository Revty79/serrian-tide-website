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
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  if (!port) throw new Error("A disposable Shop-test PostgreSQL port could not be reserved.");
  return port;
}

let savepointSequence = 0;

async function expectRejection(
  client: PoolClient,
  operation: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  const savepoint = `shop_rejection_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert.ok(caught, "Expected the Shop database operation to be rejected.");
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

async function insertCharacter(client: PoolClient, input: {
  campaignId: number;
  userId: string;
  name: string;
  isNpc: boolean;
  buildMode?: "simple" | "detailed";
  archived?: boolean;
}): Promise<number> {
  const result = await client.query<{ id: number }>(`
    insert into campaign_character (
      campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,
      archived_at,archived_by_user_id,archive_reason
    ) values ($1,$2,$3,$4,'race',$5,$6,$7,$8)
    returning id
  `, [
    input.campaignId,
    input.userId,
    input.name,
    input.isNpc,
    input.isNpc ? input.buildMode ?? "simple" : null,
    input.archived ? new Date() : null,
    input.archived ? input.userId : null,
    input.archived ? "Archived fixture" : "",
  ]);
  return result.rows[0]!.id;
}

async function insertItem(client: PoolClient, ownerId: string, input: {
  canonicalId: string;
  name: string;
  credits: number | null;
  archived?: boolean;
}): Promise<number> {
  const result = await client.query<{ id: number }>(`
    insert into items (
      canonical_id,name,catalog_scope,record_type,family,category,description,
      credits,price_basis,created_by_user_id,archived_at,archived_by_user_id,archive_reason
    ) values ($1,$2,'inventory','Shop Test','Fixtures','Supplies','Disposable Shop fixture',$3,'each',$4,$5,$6,$7)
    returning id
  `, [
    input.canonicalId,
    input.name,
    input.credits,
    ownerId,
    input.archived ? new Date() : null,
    input.archived ? ownerId : null,
    input.archived ? "Archived fixture" : "",
  ]);
  return result.rows[0]!.id;
}

test("0035 replays with exact schema parity, enforces Shop integrity, and preserves referenced Campaign records", { timeout: 120_000 }, async () => {
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-shop-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await findLoopbackPort();
  let pool: pg.Pool | null = null;
  let clusterStarted = false;

  try {
    execFileSync(initdbExecutable, [
      "--auth=trust",
      "--encoding=UTF8",
      "--no-locale",
      "--username=postgres",
      "-D",
      dataDirectory,
    ], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, [
      "-D",
      dataDirectory,
      "-l",
      logPath,
      "-o",
      `-p ${port} -h 127.0.0.1`,
      "-w",
      "start",
    ], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;
    const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    pool = new pg.Pool({ connectionString });
    await migrate(drizzle(pool), { migrationsFolder: migrationRoot });
    const parityOutput = execFileSync(
      process.execPath,
      ["scripts/verify-runtime-foundation-schema.mjs", "0035_snapshot.json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: connectionString },
        windowsHide: true,
      },
    );
    assert.match(parityOutput, /Runtime Foundation schema parity passed/);

    const client = await pool.connect();
    try {
      await client.query("begin");
      const ownerA = "shop-db-owner-a";
      const ownerB = "shop-db-owner-b";
      await client.query(`insert into "user" (id,name,email,email_verified) values
        ($1,'Shop Owner A','shop-owner-a@example.invalid',true),
        ($2,'Shop Owner B','shop-owner-b@example.invalid',true)`, [ownerA, ownerB]);
      await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'god')", [ownerA, ownerB]);
      const campaignA = await insertCampaign(client, ownerA, "Shop Campaign A");
      const campaignB = await insertCampaign(client, ownerB, "Shop Campaign B");
      await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($3,$4,true)", [campaignA, ownerA, campaignB, ownerB]);

      const simpleNpc = await insertCharacter(client, { campaignId: campaignA, userId: ownerA, name: "Simple Clerk", isNpc: true, buildMode: "simple" });
      const detailedNpc = await insertCharacter(client, { campaignId: campaignA, userId: ownerA, name: "Detailed Smith", isNpc: true, buildMode: "detailed" });
      const playerCharacter = await insertCharacter(client, { campaignId: campaignA, userId: ownerA, name: "Player Character", isNpc: false });
      const archivedNpc = await insertCharacter(client, { campaignId: campaignA, userId: ownerA, name: "Archived Clerk", isNpc: true, buildMode: "simple", archived: true });
      const crossCampaignNpc = await insertCharacter(client, { campaignId: campaignB, userId: ownerB, name: "Other Clerk", isNpc: true, buildMode: "simple" });

      const stockItem = await insertItem(client, ownerA, { canonicalId: "SHOP-DB-ITEM-A", name: "Stock Item", credits: 12 });
      const serviceItem = await insertItem(client, ownerA, { canonicalId: "SHOP-DB-ITEM-B", name: "Narrative Service", credits: null });
      const unauthorizedItem = await insertItem(client, ownerA, { canonicalId: "SHOP-DB-ITEM-C", name: "Unauthorized Item", credits: 4 });
      const archivedItem = await insertItem(client, ownerA, { canonicalId: "SHOP-DB-ITEM-D", name: "Archived Item", credits: 3, archived: true });
      await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0),($1,$3,1),($1,$4,2)", [campaignA, stockItem, serviceItem, archivedItem]);

      const shopResult = await client.query<{ id: number; balance_credits: number; storefront_state: string; character_purchase_mode: string; sold_item_handling: string; changed_sale_confirmation_mode: string }>(`
        insert into shop (campaign_id,name,category) values ($1,'The Test Forge','Armorer')
        returning id,balance_credits,storefront_state,character_purchase_mode,sold_item_handling,changed_sale_confirmation_mode
      `, [campaignA]);
      const shopId = shopResult.rows[0]!.id;
      assert.deepEqual(shopResult.rows[0], {
        id: shopId,
        balance_credits: 0,
        storefront_state: "closed",
        character_purchase_mode: "god-approval-required",
        sold_item_handling: "add-to-shop-stock",
        changed_sale_confirmation_mode: "character-owner-accepts",
      });
      await expectRejection(client, () => client.query("update shop set balance_credits=-1 where id=$1", [shopId]), /shop_balance_valid/);

      await client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id,responsibility_label,is_primary_contact,sort_order) values ($1,$2,$3,'Clerk',true,0)", [shopId, campaignA, simpleNpc]);
      await client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id,responsibility_label,sort_order) values ($1,$2,$3,'Smith',1)", [shopId, campaignA, detailedNpc]);
      await expectRejection(client, () => client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id) values ($1,$2,$3)", [shopId, campaignA, simpleNpc]), /shop_staff_assignment_shop_npc_uq|duplicate key/i);
      await expectRejection(client, () => client.query("update shop_staff_assignment set is_primary_contact=true where shop_id=$1 and npc_character_id=$2", [shopId, detailedNpc]), /shop_staff_assignment_one_primary_uq|duplicate key/i);
      await expectRejection(client, () => client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id) values ($1,$2,$3)", [shopId, campaignA, playerCharacter]), /active persistent Race or Creature NPC/);
      await expectRejection(client, () => client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id) values ($1,$2,$3)", [shopId, campaignA, archivedNpc]), /active persistent Race or Creature NPC/);
      await expectRejection(client, () => client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id) values ($1,$2,$3)", [shopId, campaignA, crossCampaignNpc]), /same Campaign/);
      const secondShopResult = await client.query<{ id: number }>("insert into shop (campaign_id,name,category) values ($1,'The Test Ferry','Transportation') returning id", [campaignA]);
      const secondShopId = secondShopResult.rows[0]!.id;
      await client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id,responsibility_label,is_primary_contact) values ($1,$2,$3,'Ticket clerk',true)", [secondShopId, campaignA, simpleNpc]);
      assert.equal(Number((await client.query<{ value: number }>("select count(*)::int value from shop_staff_assignment where npc_character_id=$1", [simpleNpc])).rows[0]!.value), 2);
      await client.query("update campaign_character set archived_at=now(),archived_by_user_id=$1,archive_reason='Later archive' where id=$2", [ownerA, simpleNpc]);
      assert.equal(Number((await client.query<{ value: number }>("select count(*)::int value from shop_staff_assignment where npc_character_id=$1", [simpleNpc])).rows[0]!.value), 2);

      const offering = await client.query<{ id: number }>(`
        insert into shop_offering (shop_id,campaign_id,item_id,sort_order)
        values ($1,$2,$3,0) returning id
      `, [shopId, campaignA, stockItem]);
      const offeringId = offering.rows[0]!.id;
      const serviceOffering = await client.query<{ id: number }>(`
        insert into shop_offering (
          shop_id,campaign_id,item_id,fulfillment_kind,unlimited_stock,limited_quantity,
          selling_price_override_credits,buying_price_override_credits,sort_order
        ) values ($1,$2,$3,'service-narrative',false,0,20,5,1) returning id
      `, [shopId, campaignA, serviceItem]);
      assert.ok(serviceOffering.rows[0]!.id > 0);
      await expectRejection(client, () => client.query("insert into shop_offering (shop_id,campaign_id,item_id,sort_order) values ($1,$2,$3,2)", [shopId, campaignA, unauthorizedItem]), /active Equipment or Inventory Item authorized/);
      await expectRejection(client, () => client.query("insert into shop_offering (shop_id,campaign_id,item_id,sort_order) values ($1,$2,$3,2)", [shopId, campaignA, archivedItem]), /active Equipment or Inventory Item authorized/);
      await expectRejection(client, () => client.query("insert into shop_offering (shop_id,campaign_id,item_id,sort_order) values ($1,$2,$3,2)", [shopId, campaignA, stockItem]), /shop_offering_shop_item_uq|duplicate key/i);
      await expectRejection(client, () => client.query("update shop_offering set unlimited_stock=true,limited_quantity=1 where id=$1", [offeringId]), /shop_offering_stock_valid/);
      await expectRejection(client, () => client.query("update shop_offering set unlimited_stock=false,limited_quantity=-1 where id=$1", [offeringId]), /shop_offering_stock_valid/);
      await expectRejection(client, () => client.query("update shop_offering set selling_price_override_credits=-1 where id=$1", [offeringId]), /shop_offering_selling_price_valid/);
      assert.deepEqual((await client.query("select coalesce(o.selling_price_override_credits,i.credits) effective_selling_price,coalesce(o.buying_price_override_credits,i.credits) effective_buying_price from shop_offering o inner join items i on i.id=o.item_id where o.id=$1", [offeringId])).rows, [{ effective_selling_price: 12, effective_buying_price: 12 }]);
      await client.query("update shop_offering set selling_price_override_credits=9,buying_price_override_credits=4 where id=$1", [offeringId]);
      assert.deepEqual((await client.query("select coalesce(o.selling_price_override_credits,i.credits) effective_selling_price,coalesce(o.buying_price_override_credits,i.credits) effective_buying_price from shop_offering o inner join items i on i.id=o.item_id where o.id=$1", [offeringId])).rows, [{ effective_selling_price: 9, effective_buying_price: 4 }]);

      await expectRejection(client, () => client.query("delete from campaign_inventory_item where campaign_id=$1 and item_id=$2", [campaignA, stockItem]), /enabled in an active Shop/);
      await client.query("update shop_offering set enabled=false where id=$1", [offeringId]);
      await client.query("delete from campaign_inventory_item where campaign_id=$1 and item_id=$2", [campaignA, stockItem]);
      assert.equal(Number((await client.query<{ value: number }>("select count(*)::int value from shop_offering where id=$1", [offeringId])).rows[0]!.value), 1);

      await client.query("update shop set archived_at=now(),archived_by_user_id=$1,archive_reason='Seasonal' where id=$2", [ownerA, shopId]);
      await client.query("delete from campaign_inventory_item where campaign_id=$1 and item_id=$2", [campaignA, serviceItem]);
      await expectRejection(client, () => client.query("update shop set archived_at=null,archived_by_user_id=null,archive_reason='' where id=$1", [shopId]), /enabled offering/);
      await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0),($1,$3,1)", [campaignA, stockItem, serviceItem]);
      await client.query("update shop set archived_at=null,archived_by_user_id=null,archive_reason='',storefront_state='closed' where id=$1", [shopId]);
      await client.query("insert into lifecycle_audit_event (action,entity_kind,target_id,target_name,campaign_id_snapshot,owner_user_id_snapshot,actor_user_id) values ('archive','shop',$1,'The Test Forge',$2,$3,$3)", [String(shopId), campaignA, ownerA]);

      await client.query("delete from shop where id=$1", [shopId]);
      const preserved = await client.query<{ campaigns: number; characters: number; items: number; shops: number; staff: number; offerings: number }>(`
        select
          (select count(*) from campaign where id=$1)::int campaigns,
          (select count(*) from campaign_character where campaign_id=$1)::int characters,
          (select count(*) from items where id=any($2::int[]))::int items,
          (select count(*) from shop where id=$3)::int shops,
          (select count(*) from shop_staff_assignment where shop_id=$3)::int staff,
          (select count(*) from shop_offering where shop_id=$3)::int offerings
      `, [campaignA, [stockItem, serviceItem, unauthorizedItem, archivedItem], shopId]);
      assert.deepEqual(preserved.rows[0], { campaigns: 1, characters: 4, items: 4, shops: 0, staff: 0, offerings: 0 });
      assert.equal(Number((await client.query<{ value: number }>("select count(*)::int value from shop_staff_assignment where shop_id=$1 and npc_character_id=$2", [secondShopId, simpleNpc])).rows[0]!.value), 1);
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
      execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
    await rm(temporaryCluster, { recursive: true, force: true });
    assert.equal(existsSync(temporaryCluster), false, "Disposable Shop PostgreSQL files were not removed.");
  }
});
