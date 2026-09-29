import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_CATALOG_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_catalog_visibility_dev$/);
const actors = new AsyncLocalStorage();
const admin = "admin-browse-admin", foreign = "admin-browse-foreign";
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: async () => ({ user: { id: actors.getStore() ?? admin } }),
  requireGodOrAdminAccessContext: async () => {
    const id = actors.getStore() ?? admin;
    const roles = (await pool.query("select role from user_role where user_id=$1", [id])).rows.map(({ role }) => role);
    if (!roles.some((role) => role === "admin" || role === "god")) throw new Error("Authoring access required.");
    return { session: { user: { id } }, roles };
  },
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool } = await import("../src/db/index.ts");
const { bindCatalogPreferenceOperations } = await import("../src/features/catalog-visibility/catalog-preference-service.ts");
const { getCatalogBrowseState } = await import("../src/features/catalog-visibility/catalog-query.ts");
const { getCatalogManagementState } = await import("../src/features/catalog-visibility/admin-catalog-query.ts");
const races = await import("../src/app/heavens/races/actions.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const skills = await import("../src/app/heavens/skills/actions.ts");
const abilities = await import("../src/app/heavens/derived-abilities/actions.ts");
const items = await import("../src/app/heavens/items/actions.ts");
const configs = [
  { key: "race", table: "races", list: races.listRaces },
  { key: "creature", table: "creatures", list: creatures.listCreatures },
  { key: "skill", table: "skill", list: skills.listSkills },
  { key: "derivedAbility", table: "derived_ability", list: abilities.listDerivedAbilities },
  ...["equipment", "inventory"].map((key) => ({ key, table: "items", list: (filters) => items.listItems({ ...filters, catalogScope: key }) })),
];
const preferences = bindCatalogPreferenceOperations(async () => admin);
const matchIds = (result) => result.items.filter((row) => row.catalogSource !== "context").map(({ id }) => id);

before(async () => {
  for (const [id, label, role] of [[admin, "Zebra Admin", "admin"], [foreign, "Alpha Creator", "god"]]) {
    await pool.query('insert into "user"(id,name,email,display_username) values($1,$1,$2,$3)', [id, `${id}@example.invalid`, label]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
  for (const config of configs) {
    config.ids = [];
    config.search = `Admin Browse ${config.key}`;
    for (const [index, creator, canon] of [[0, foreign, true], [1, admin, false], [2, admin, true], [3, foreign, false], [4, null, false]]) {
      const name = `${config.search} ${index}`;
      const columns = [config.table === "creatures" ? "canonical_name" : "name", "created_by_user_id", "is_system_canon", "canon_marked_by_user_id", "canon_marked_at"];
      const values = [name, creator, canon, canon ? admin : null, canon ? new Date() : null];
      if (config.table === "creatures" || config.table === "items") { columns.push("canonical_id"); values.push(name.toUpperCase()); }
      if (config.table === "creatures") { columns.push("size", "family"); values.push("Medium", `Admin Family ${index}`); }
      if (config.table === "skill") { columns.push("classification", "tier", "primary_attribute"); values.push(`Admin Class ${index}`, 1, "STR"); }
      if (config.table === "items") { columns.push("catalog_scope", "record_type", "family", "category", "price_basis"); values.push(config.key, `Admin Type ${index}`, "Test", "Test", "Each"); }
      const { rows } = await pool.query(`insert into ${config.table}(${columns.join(",")}) values(${values.map((_, i) => `$${i + 1}`).join(",")}) returning id`, values);
      config.ids.push(rows[0].id);
    }
  }
});
after(() => pool.end());

for (const config of configs) {
  test(`${config.key}: four admin views, creator filtering, attribution and sorting before pagination`, async () => {
    // Admin preferences are effective even before the public catalog is activated.
    await pool.query("delete from catalog_visibility_scope_activation where catalog_key=$1", [config.key]);
    for (const [mode, indexes] of [["canon", [0, 2]], ["mine", [1, 2]], ["canon-and-mine", [0, 1, 2]]]) {
      await preferences.update({ catalog: config.key, mode });
      const result = await config.list({ search: config.search });
      assert.deepEqual(matchIds(result), indexes.map((i) => config.ids[i]));
      assert.ok(result.visibility.admin);
      assert.equal(result.total, indexes.length);
      assert.equal(result.items.find(({ id }) => id === config.ids[2]).catalogSource, "canon");
    }
    const before = await preferences.read();
    const all = await config.list({ search: config.search, adminBrowse: { all: true } });
    assert.deepEqual(matchIds(all), config.ids);
    assert.equal(all.items[3].creatorLabel, "Alpha Creator");
    assert.equal(all.items[4].creatorLabel, "No recorded creator");
    assert.ok(!JSON.stringify(all).includes("@example.invalid"));
    assert.deepEqual(matchIds(await config.list({ search: config.search, adminBrowse: { all: true, creatorId: foreign } })), [config.ids[0], config.ids[3]]);
    assert.deepEqual(matchIds(await config.list({ search: config.search, adminBrowse: { all: true, creatorId: "__unattributed__" } })), [config.ids[4]]);
    const sorted = [];
    for (let page = 1; page <= 5; page++) {
      const result = await config.list({ search: config.search, page, pageSize: 1, adminBrowse: { all: true, sortBy: "user" } });
      assert.equal(result.total, 5); assert.equal(result.pageCount, 5);
      sorted.push(...matchIds(result));
    }
    assert.deepEqual(sorted, [0, 3, 4, 1, 2].map((i) => config.ids[i]));
    assert.deepEqual(await preferences.read(), before);
    assert.equal((await getCatalogBrowseState(admin, config.key)).admin, undefined, "Campaign/reference discovery must not inherit the administrative view");
    await actors.run(foreign, async () => {
      assert.equal((await config.list({ search: config.search })).visibility.admin, undefined);
      for (const adminBrowse of [{ all: true }, { creatorId: admin }, { sortBy: "user" }, {}]) {
        await assert.rejects(config.list({ search: config.search, adminBrowse }), /Administrator access/);
      }
    });
  });
}

test("creator filters apply to facets, Skill trees and retained ancestry", async () => {
  const options = { all: true, creatorId: foreign };
  assert.deepEqual((await creatures.listCreatureFacets(false, options)).families.filter((name) => name.startsWith("Admin Family")), ["Admin Family 0", "Admin Family 3"]);
  assert.deepEqual((await skills.getSkillFilterOptions(false, options)).classifications.filter((name) => name.startsWith("Admin Class")), ["Admin Class 0", "Admin Class 3"]);
  assert.deepEqual((await items.listItemFacets("equipment", false, false, options)).recordTypes.filter((name) => name.startsWith("Admin Type")), ["Admin Type 0", "Admin Type 3"]);
  const tree = await skills.getRecursiveSkillLibrary(options);
  const config = configs.find(({ key }) => key === "skill");
  assert.deepEqual(tree.skills.filter(({ name }) => name.startsWith(config.search)).map(({ id }) => id).sort((a,b) => a-b), [config.ids[0], config.ids[3]]);
  const race = configs[0];
  await pool.query("update races set parent_race_id=$1 where id=$2", [race.ids[3], race.ids[1]]);
  await preferences.update({ catalog: "race", mode: "mine" });
  const result = await races.listRaces({ search: race.search, adminBrowse: { creatorId: admin } });
  assert.equal(result.total, 2);
  assert.equal(result.items[0].id, race.ids[3]);
  assert.equal(result.items[0].catalogSource, "context");
  assert.equal(result.items[0].creatorLabel, "Alpha Creator");
});

test("invalid controls and role revocation cannot widen a catalog", async () => {
  for (const input of [{ all: "true" }, { sortBy: "email" }, { creatorId: [] }, { actorId: admin }, null]) {
    await assert.rejects(getCatalogManagementState(admin, "race", input));
  }
  await pool.query("delete from user_role where user_id=$1 and role='admin'", [admin]);
  await assert.rejects(getCatalogManagementState(admin, "race", { all: true }), /Administrator access/);
  assert.equal((await getCatalogManagementState(admin, "race")).admin, undefined);
});
