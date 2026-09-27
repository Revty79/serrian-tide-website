import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { eq, getTableName } from "drizzle-orm";
import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { userCatalogPreferences } from "@/db/catalog-preferences-schema";
import { race } from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import { item } from "@/db/item-schema";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { bindCatalogPreferenceOperations } from "@/features/catalog-visibility/catalog-preference-service";
import { defaultCatalogPreferences } from "@/features/catalog-visibility/catalog-visibility";
import { setSystemCanonForActor, type SystemCanonRoot } from "@/features/catalog-visibility/system-canon-service";
import { previewAdminAccountDeletion } from "@/features/lifecycle/admin-account-lifecycle-service";
import { createRaceVariantForActor } from "@/features/races/race-variant-service";

const target = new URL(process.env.DATABASE_URL ?? "invalid");
assert.equal(process.env.SERRIAN_CATALOG_DISPOSABLE, "true", "Run through the disposable catalog DB harness.");
assert.equal(target.hostname, "127.0.0.1");
assert.equal(target.pathname, "/serrian_catalog_visibility_dev");

const marker = `catalog-${randomUUID()}`;
const ids = { admin: `${marker}-admin`, player: `${marker}-player`, god: `${marker}-god`, other: `${marker}-other` };
const roots = { race, creature, item, skill, derivedAbility };
const records = new Map<SystemCanonRoot, number>();
const preferencesFor = (id: string) => bindCatalogPreferenceOperations(async () => id);

before(async () => {
  for (const [role, id] of Object.entries(ids)) {
    await db.insert(user).values({ id, name: id, email: `${id}@example.invalid` });
    await db.insert(userRole).values({ userId: id, role: role === "other" ? "player" : role as "admin" | "god" | "player" });
  }
  const provenance = { createdByUserId: ids.god, sourceSystem: "catalog-test-import" };
  const [r] = await db.insert(race).values({ name: marker, ...provenance }).returning({ id: race.id });
  const [c] = await db.insert(creature).values({ canonicalId: marker.toUpperCase(), canonicalName: marker, size: "Medium", ...provenance }).returning({ id: creature.id });
  const [i] = await db.insert(item).values({ canonicalId: marker.toUpperCase(), name: marker, catalogScope: "inventory", recordType: "item", family: "general", category: "general", priceBasis: "each", ...provenance }).returning({ id: item.id });
  const [s] = await db.insert(skill).values({ name: marker, ...provenance }).returning({ id: skill.id });
  const [a] = await db.insert(derivedAbility).values({ name: marker, ...provenance, archivedAt: new Date(), archivedByUserId: ids.god, archiveReason: "Retained archived fixture" }).returning({ id: derivedAbility.id });
  records.set("race", r.id).set("creature", c.id).set("item", i.id).set("skill", s.id).set("derivedAbility", a.id);
});

after(async () => {
  // Delete the child first; all cleanup is confined to this harness's disposable DB.
  await pool.query("delete from races where parent_race_id = $1", [records.get("race") ?? -1]);
  for (const [root, id] of records) await db.delete(roots[root]).where(eq(roots[root].id, id));
  for (const id of Object.values(ids)) await db.delete(user).where(eq(user.id, id));
  await pool.end();
});

for (const root of Object.keys(roots) as SystemCanonRoot[]) {
  test(`${root}: admin-only canon changes preserve creator, provenance, and lifecycle`, async () => {
    const id = records.get(root)!;
    const table = roots[root];
    const [original] = await db.select().from(table).where(eq(table.id, id));
    assert.equal(original.isSystemCanon, false);
    for (const actor of [ids.player, ids.god, "missing-user"]) {
      await assert.rejects(setSystemCanonForActor(actor, { root, id, isSystemCanon: true }), /Administrator access/);
    }
    const before = Date.now();
    const marked = await setSystemCanonForActor(ids.admin, { root, id, isSystemCanon: true });
    assert.equal(marked.isSystemCanon, true);
    assert.equal(marked.canonMarkedByUserId, ids.admin);
    assert.ok(marked.canonMarkedAt && marked.canonMarkedAt.getTime() >= before && marked.canonMarkedAt.getTime() <= Date.now());
    assert.deepEqual(await setSystemCanonForActor(ids.admin, { root, id, isSystemCanon: true }), marked);
    const preview = await previewAdminAccountDeletion(ids.admin, ids.admin);
    assert.ok(preview.blockers.some((entry) => entry.key === `${getTableName(table)}_canon_marked_by_user_id_user_id_fk`));
    for (const actor of [ids.player, ids.god]) {
      await assert.rejects(setSystemCanonForActor(actor, { root, id, isSystemCanon: false }), /Administrator access/);
    }
    const unmarked = await setSystemCanonForActor(ids.admin, { root, id, isSystemCanon: false });
    assert.equal(unmarked.isSystemCanon, false);
    assert.equal(unmarked.canonMarkedByUserId, null);
    assert.equal(unmarked.canonMarkedAt, null);
    const [final] = await db.select().from(table).where(eq(table.id, id));
    assert.deepEqual({ ...final, updatedAt: original.updatedAt }, original);
  });
}

test("invalid canon payloads and missing content cannot mutate records", async () => {
  for (const input of [{ root: "inventory", id: 1, isSystemCanon: true }, { root: "race", id: -1, isSystemCanon: true }, { root: "race", id: 1, isSystemCanon: "true" }, { root: "race", id: 1, isSystemCanon: true, actingUserId: ids.admin }]) {
    await assert.rejects(setSystemCanonForActor(ids.admin, input));
  }
  await assert.rejects(setSystemCanonForActor(ids.admin, { root: "race", id: 2147483647, isSystemCanon: true }), /not found/);
});

test("Race variants of canon parents start non-canon and retain their own creator", async () => {
  const id = records.get("race")!;
  await setSystemCanonForActor(ids.admin, { root: "race", id, isSystemCanon: true });
  const variantId = await createRaceVariantForActor(id, `${marker} variant`, ids.god);
  const [variant] = await db.select().from(race).where(eq(race.id, variantId));
  assert.equal(variant.parentRaceId, id);
  assert.equal(variant.createdByUserId, ids.god);
  assert.equal(variant.isSystemCanon, false);
  assert.equal(variant.canonMarkedAt, null);
  assert.equal(variant.canonMarkedByUserId, null);
  assert.equal(variant.sourceSystem, null);
});

test("missing preferences read as defaults without backfill; updates survive a fresh read", async () => {
  const prefs = preferencesFor(ids.player);
  assert.deepEqual(await prefs.read(), defaultCatalogPreferences());
  assert.equal((await db.select().from(userCatalogPreferences).where(eq(userCatalogPreferences.userId, ids.player))).length, 0);
  assert.deepEqual(await prefs.update({ catalog: "race", mode: "mine" }), { ...defaultCatalogPreferences(), race: "mine" });
  await prefs.update({ catalog: "equipment", mode: "canon" });
  await prefs.update({ catalog: "inventory", mode: "mine" });
  assert.deepEqual(await preferencesFor(ids.player).read(), { ...defaultCatalogPreferences(), race: "mine", equipment: "canon", inventory: "mine" });
});

test("the authenticated identity owns updates; payload IDs and invalid modes are rejected", async () => {
  const prefs = preferencesFor(ids.player);
  const before = await prefs.read();
  for (const actor of [ids.player, ids.admin]) {
    await assert.rejects(preferencesFor(actor).update({ catalog: "race", mode: "canon", userId: ids.other }), /Only a catalog/);
  }
  await assert.rejects(prefs.update({ catalog: "race", mode: "all" }), /visibility mode/);
  await assert.rejects(prefs.update({ catalog: "__proto__", mode: "canon" }), /Unknown catalog/);
  await assert.rejects(preferencesFor("").read(), /signed in/);
  await assert.rejects(preferencesFor("").update({ catalog: "race", mode: "canon" }), /signed in/);
  assert.deepEqual(await prefs.read(), before);
  assert.deepEqual(await preferencesFor(ids.other).read(), defaultCatalogPreferences());
});

test("concurrent first changes preserve independently selected catalog modes", async () => {
  await Promise.all([
    preferencesFor(ids.other).update({ catalog: "skill", mode: "canon" }),
    preferencesFor(ids.other).update({ catalog: "derivedAbility", mode: "mine" }),
  ]);
  assert.deepEqual(await preferencesFor(ids.other).read(), { ...defaultCatalogPreferences(), skill: "canon", derivedAbility: "mine" });
});

test("database checks enforce all six modes and complete canon attribution", async () => {
  for (const column of ["race_visibility", "creature_visibility", "skill_visibility", "derived_ability_visibility", "equipment_visibility", "inventory_visibility"]) {
    await assert.rejects(pool.query(`update user_catalog_preferences set ${column} = 'all' where user_id = $1`, [ids.player]), (error: unknown) => (error as { code: string }).code === "23514");
    await assert.rejects(pool.query(`update user_catalog_preferences set ${column} = null where user_id = $1`, [ids.player]), (error: unknown) => (error as { code: string }).code === "23502");
  }
  for (const [root, tableName] of Object.entries({ race: "races", creature: "creatures", item: "items", skill: "skill", derivedAbility: "derived_ability" })) {
    await assert.rejects(pool.query(`update ${tableName} set is_system_canon = true, canon_marked_by_user_id = null, canon_marked_at = null where id = $1`, [records.get(root as SystemCanonRoot)]), (error: unknown) => (error as { code: string }).code === "23514");
  }
});
