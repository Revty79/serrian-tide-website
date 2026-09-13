import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readWeaponSkillGovernanceInTransaction } from "../src/features/items/weapon-skill-governance-service";
import { applyRepair, digest, planRepair, readCatalog, type Catalog } from "./weapon-catalog-repair";

const url = new URL(process.env.DATABASE_URL!);
assert.ok(process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION === "true" && url.hostname === "127.0.0.1" && url.pathname === "/serrian_combat_completion_dev" && url.port !== "5432", "Use the disposable combat completion harness, never shared DEV.");
const source: Catalog = JSON.parse(readFileSync("artifacts/weapon-catalog-repair/reviewed-catalog.json", "utf8"));
const actor = "catalog-repair-fixture-admin";

async function fixture(run: (client: pg.Client, reviewed: Catalog) => Promise<void>) {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query("begin");
    assert.equal((await client.query("select count(*)::int n from weapon_profiles")).rows[0].n, 0, "Fixture requires an empty disposable catalog.");
    await client.query('insert into "user" (id,name,email) values($1,$2,$3)', [actor, "Catalog Test", "catalog@example.invalid"]);
    await client.query("insert into user_role(user_id,role) values($1,'admin')", [actor]);
    // Migrations seed historical Skills. Replace their fixture graph only inside this rolled-back disposable test.
    await client.query("delete from skill_relationship");
    for (const s of source.skills) await client.query('insert into skill(id,name,classification,tier,primary_attribute,secondary_attribute,definition,created_by_user_id,archived_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set name=excluded.name,classification=excluded.classification,tier=excluded.tier,primary_attribute=excluded.primary_attribute,secondary_attribute=excluded.secondary_attribute,definition=excluded.definition,archived_at=excluded.archived_at', [s.id,s.name,s.classification,s.tier,s.primaryAttribute,s.secondaryAttribute,s.definition,actor,s.archivedAt]);
    for (const r of source.relationships) await client.query('insert into skill_relationship(id,skill_id,related_skill_id,relationship_type,sort_order) values($1,$2,$3,$4,$5)', [r.id,r.skillId,r.relatedSkillId,r.relationshipType,r.sortOrder]);
    async function insert(table: string, rows: unknown[]) {
      if (rows.length) await client.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows)]);
    }
    await insert("items", source.items.map((i) => ({ ...i, created_by_user_id: actor, archived_by_user_id: null, parent_item_id: null })));
    await insert("weapon_profiles", source.profiles);
    await insert("weapon_firing_modes", source.modes);
    await insert("weapon_skill_path_mappings", source.mappings.map((m) => ({ ...m, updated_by_user_id: actor })));
    for (const table of ["items", "weapon_profiles", "weapon_skill_path_mappings"]) await client.query(`select setval(pg_get_serial_sequence('${table}','id'),(select max(id) from ${table}))`);
    await insert("magazine_profiles", source.magazines);
    await insert("magazine_ammunition", source.magazineAmmo);
    await insert("weapon_magazines", source.weaponMagazines);
    await run(client, await readCatalog(client));
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

test("catalog repair applies 105 mappings and 18 blank fields; retry writes nothing and governance reads exact paths", async () => fixture(async (client, reviewed) => {
  const result = await applyRepair(client, reviewed, digest(reviewed), actor);
  assert.equal(result.inserted.length, 105);
  assert.equal(result.plan.patches.length, 6);
  assert.equal(result.createdItems.length, 12);
  assert.equal(result.ammunitionLinks.length, 12);
  for (const link of result.ammunitionLinks) {
    assert.equal(result.after.profiles.find((p) => p.id === link.weaponProfileId)?.ammunition_item_id, link.ammunitionItemId);
    const ammunition = result.after.profiles.find((p) => p.item_id === link.ammunitionItemId);
    assert.equal(ammunition?.profile_record_type, "Ammunition");
    assert.equal(ammunition?.damage, "8");
  }
  assert.deepEqual(result.after.mappings.filter((m) => reviewed.mappings.some((old) => old.id === m.id)), reviewed.mappings);
  const tx = drizzle(client) as unknown as Parameters<typeof readWeaponSkillGovernanceInTransaction>[0];
  for (const addition of result.plan.additions) {
    const read = await readWeaponSkillGovernanceInTransaction(tx, addition.itemId);
    assert.equal(read?.weaponDefault.status, "approved");
    assert.deepEqual(read?.weaponDefault.approvedOptions[0].path.rootToEndpoint.map((n) => n.id), addition.path);
    for (const mode of read!.modes) assert.equal(mode.canonicalBehavior, "inherits-weapon-default");
  }
  const retry = await applyRepair(client, reviewed, digest(result.after), actor);
  assert.equal(retry.inserted.length, 0);
  assert.equal(retry.plan.patches.length, 0);
  assert.equal(retry.createdItems.length, 0);
  assert.equal(retry.ammunitionLinks.length, 0);
  assert.equal(digest(retry.after), digest(result.after));
}));

test("stale digest rejects before any catalog write", async () => fixture(async (client, reviewed) => {
  const plan = planRepair(reviewed, reviewed);
  await client.query("update weapon_profiles set reload_initiative_cost=9 where item_id=20");
  const changed = await readCatalog(client);
  await assert.rejects(applyRepair(client, reviewed, plan.digest, actor), /changed after planning/);
  assert.equal(digest(await readCatalog(client)), digest(changed));
}));

test("non-admin author cannot apply catalog maintenance", async () => fixture(async (client, reviewed) => {
  await assert.rejects(applyRepair(client, reviewed, digest(reviewed), "unauthorized"), /administrator/);
  assert.equal(digest(await readCatalog(client)), digest(reviewed));
}));

test("database failure partway through repair rolls all profile/mapping changes back", async () => fixture(async (client, reviewed) => {
  await client.query("savepoint repair_failure");
  await client.query("create function pg_temp.reject_catalog_insert() returns trigger language plpgsql as $$ begin if new.weapon_profile_id=224 then raise exception 'simulated mid-repair failure'; end if; return new; end $$");
  await client.query("create trigger catalog_repair_test_failure before insert on weapon_skill_path_mappings for each row execute function pg_temp.reject_catalog_insert()");
  await assert.rejects(applyRepair(client, reviewed, digest(reviewed), actor), /simulated mid-repair failure/);
  await client.query("rollback to savepoint repair_failure");
  assert.equal(digest(await readCatalog(client)), digest(reviewed));
}));
