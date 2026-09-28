import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Pool } from "pg";
import type { Page } from "playwright-core";
import { seedClassificationFixtures } from "./catalog-visibility-fixtures";

export async function runCatalogPassThreeBrowserChecks(input: {
  page: Page; pool: Pool; databaseUrl: string; baseUrl: string; screenshots: string;
  login: (page: Page, baseUrl: string, identity: string) => Promise<void>;
}) {
  const { page, pool, databaseUrl, baseUrl, screenshots, login } = input;
  await seedClassificationFixtures(pool);
  execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/classify-system-canon.ts", "--apply", "--expect-database", "serrian_profile_browser_dev", "--administrator-email", "profile-all@example.invalid"], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe", windowsHide: true,
  });
  const configs = [
    { route: "races", catalog: "Races", table: "races", noun: "Race", parent: "parent_race_id", search: "race-search" },
    { route: "creatures", catalog: "Creatures", table: "creatures", noun: "Creature", parent: "parent_creature_id", search: "creature-search" },
    { route: "skills", catalog: "Skills", table: "skill", noun: "Skill", parent: null, search: "skill-list-search" },
    { route: "derived-abilities", catalog: "Derived Abilities", table: "derived_ability", noun: "Ability", parent: null, search: "derived-ability-search" },
  ];
  for (const config of configs) {
    const ids: number[] = [];
    for (const [label, owner, canon] of [["Canon", "profile-god", true], ["Mine", "profile-all", false], ["Promoted", "profile-all", true], ["Foreign", "profile-god", false], ["Foreign Canon", "profile-god", true], ["Middle", "profile-god", false]] as const) {
      const name = `Browse ${config.noun} ${label}`;
      const columns = config.table === "creatures" ? "canonical_name,canonical_id,size" : "name";
      const values = config.table === "creatures" ? "$1,upper($1),'Medium'" : "$1";
      ids.push((await pool.query(`insert into ${config.table}(${columns},created_by_user_id,is_system_canon,canon_marked_by_user_id,canon_marked_at)
        values(${values},$2,$3,case when $3 then 'profile-all' else null end,case when $3 then now() else null end) returning id`, [name, owner, canon])).rows[0].id);
    }
    if (config.table === "creatures") {
      for (const [id, family] of [[ids[0], "Browse Canon Family"], [ids[1], "Browse Mine Family"], [ids[3], "Browse Foreign Family"]]) {
        await pool.query("update creatures set family=$1 where id=$2", [family, id]);
      }
    }
    if (config.parent) {
      for (const [child, parent] of [[ids[5], ids[0]], [ids[1], ids[5]], [ids[4], ids[0]]]) await pool.query(`update ${config.table} set ${config.parent}=$1 where id=$2`, [parent, child]);
    } else if (config.table === "skill") {
      await pool.query("update skill set primary_attribute='STR',tier=1 where id=any($1::int[])", [ids]);
      await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type,sort_order) values($1,$2,'parent',0),($2,$3,'parent',0),($4,$3,'parent',1)", [ids[1], ids[5], ids[0], ids[4]]);
    }
  }

  async function choose(label: string) {
    const radio = page.getByRole("radio", { name: label, exact: true });
    if (!await radio.isChecked()) {
      await radio.check();
      await page.getByRole("status").filter({ hasText: /^Saved\.$/ }).waitFor();
    }
  }
  function catalogRow(name: string) {
    return page.locator(".skill-library__row").filter({ has: page.locator(".skill-library__row-name").filter({ hasText: new RegExp(`^${name}(?:\\s+#\\d+)?$`) }) });
  }
  async function contains(name: string, visible: boolean) {
    const row = catalogRow(name);
    if (visible) await row.waitFor();
    else await row.waitFor({ state: "detached" });
    return row;
  }
  for (const config of configs) {
    await page.goto(`${baseUrl}/heavens/${config.route}`);
    // All three modes go through the actual authoring action, filters, counts, and UI.
    await page.locator('.skill-library input[type="search"]').first().fill(`Browse ${config.noun}`);
    await choose("Mine Only");
    const mine = `Browse ${config.noun} Mine`, promoted = `Browse ${config.noun} Promoted`;
    await contains(mine, true);
    const promotedRow = await contains(promoted, true);
    await promotedRow.getByText("Serrian Tide Canon", { exact: true }).waitFor();
    await contains(`Browse ${config.noun} Foreign`, false);
    await contains(`Browse ${config.noun} Foreign Canon`, false);
    if (config.table === "creatures") {
      const family = page.getByRole("combobox", { name: "Family", exact: true });
      await family.getByRole("option", { name: "Browse Mine Family", exact: true }).waitFor({ state: "attached" });
      assert.equal(await family.getByRole("option", { name: "Browse Canon Family", exact: true }).count(), 0);
      assert.equal(await family.getByRole("option", { name: "Browse Foreign Family", exact: true }).count(), 0);
    }
    if (config.table !== "derived_ability") {
      for (const label of ["Canon", "Middle"]) {
        const row = await contains(`Browse ${config.noun} ${label}`, true);
        await row.getByText("Context", { exact: true }).waitFor();
      }
    } else await contains(`Browse ${config.noun} Canon`, false);
    await choose("Canon Only");
    await contains(mine, false);
    await contains(`Browse ${config.noun} Foreign Canon`, true);
    await contains(`Browse ${config.noun} Middle`, false);
    if (config.table === "creatures") {
      const family = page.getByRole("combobox", { name: "Family", exact: true });
      await family.getByRole("option", { name: "Browse Canon Family", exact: true }).waitFor({ state: "attached" });
      assert.equal(await family.getByRole("option", { name: "Browse Mine Family", exact: true }).count(), 0);
    }
    await choose("Canon + Mine");
    await contains(mine, true);
    assert.equal(await catalogRow(promoted).count(), 1);
    await contains(`Browse ${config.noun} Foreign`, false);
    await choose("Mine Only");
    await page.locator('.skill-library input[type="search"]').first().fill(mine);
    await contains(promoted, false);
    await contains(mine, true);

    // Governance works independently of edit ownership and the browse mode.
    await catalogRow(mine).click();
    await page.getByRole("button", { name: "Mark System Canon", exact: true }).waitFor();
    await choose("Canon Only");
    await contains(mine, false);
    await page.getByRole("button", { name: "Mark System Canon", exact: true }).click();
    await page.getByRole("button", { name: "Remove System Canon", exact: true }).waitFor();
    await contains(mine, true);
    const nameColumn = config.table === "creatures" ? "canonical_name" : "name";
    const marked = (await pool.query(`select is_system_canon,canon_marked_by_user_id,created_by_user_id from ${config.table} where ${nameColumn}=$1`, [mine])).rows[0];
    assert.deepEqual(marked, { is_system_canon: true, canon_marked_by_user_id: "profile-all", created_by_user_id: "profile-all" });
    await page.getByRole("button", { name: "Remove System Canon", exact: true }).click();
    await page.getByRole("button", { name: "Mark System Canon", exact: true }).waitFor();
    await contains(mine, false);
    await choose("Mine Only");
    await contains(mine, true);

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, `${config.catalog} must fit 390px`);
    await page.screenshot({ path: path.join(screenshots, `pass-three-${config.route}-390.png`), fullPage: true });
    if (config.table === "skill") {
      await page.getByRole("button", { name: "Tree View", exact: true }).click();
      await page.getByLabel("Search every depth").fill(mine);
      await page.locator(".skill-library__search-result").filter({ hasText: mine }).click();
      const lineage = page.getByRole("navigation", { name: "Selected Skill lineage" });
      for (const label of ["Canon", "Middle", "Mine"]) await lineage.getByRole("button", { name: new RegExp(`Browse Skill ${label}`) }).waitFor();
      assert.equal(await lineage.getByText("Context", { exact: true }).count(), 2);
      assert.equal(await page.getByText("Browse Skill Foreign Canon", { exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({ path: path.join(screenshots, "pass-three-skills-tree-390.png"), fullPage: true });
    }
    await page.locator(".skill-editor__header").screenshot({ path: path.join(screenshots, `pass-three-${config.route}-editor-header-390.png`) });
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(`PASS: ${config.catalog} SQL modes, search, source labels, nested context, and 390px layout.`);
  }

  // Profile -> catalog -> Profile, using exactly the same persisted preference.
  for (const config of configs.slice(0, 2)) {
    await page.goto(`${baseUrl}/profile`);
    const group = page.getByRole("group", { name: config.catalog, exact: true });
    assert.equal(await group.getByRole("radio", { name: "Mine Only", exact: true }).isChecked(), true);
    await page.goto(`${baseUrl}/heavens/${config.route}`);
    assert.equal(await page.getByRole("radio", { name: "Mine Only", exact: true }).isChecked(), true);
    await choose("Canon Only");
    await page.goto(`${baseUrl}/profile`);
    assert.equal(await group.getByRole("radio", { name: "Canon Only", exact: true }).isChecked(), true);
  }
  await page.locator('.authenticated-navigation button:visible').filter({ hasText: /^Log Out$/ }).first().click();
  await login(page, baseUrl, "all");
  await page.goto(`${baseUrl}/profile`);
  for (const config of configs.slice(0, 2)) assert.equal(await page.getByRole("group", { name: config.catalog, exact: true }).getByRole("radio", { name: "Canon Only", exact: true }).isChecked(), true);
  for (const config of configs.slice(0, 2)) {
    await page.goto(`${baseUrl}/heavens/${config.route}`);
    assert.equal(await page.getByRole("radio", { name: "Canon Only", exact: true }).isChecked(), true);
  }
  console.log("PASS: Profile and both Race/Creature controls agree after changes and logout/login.");

  await page.goto(`${baseUrl}/profile`);
  await page.locator('.authenticated-navigation button:visible').filter({ hasText: /^Log Out$/ }).click();
  await login(page, baseUrl, "admin");
  await page.goto(`${baseUrl}/heavens/races`);
  await page.locator("#race-search").fill("Browse Race Canon");
  await catalogRow("Browse Race Canon").click();
  await page.getByRole("button", { name: "Remove System Canon", exact: true }).click();
  await page.getByRole("button", { name: "Mark System Canon", exact: true }).click();
  await page.getByRole("button", { name: "Remove System Canon", exact: true }).waitFor();
  assert.equal((await pool.query("select canon_marked_by_user_id from races where name='Browse Race Canon'")).rows[0].canon_marked_by_user_id, "profile-admin");
  await page.goto(`${baseUrl}/profile`);
  await page.locator('.authenticated-navigation button:visible').filter({ hasText: /^Log Out$/ }).click();
  await login(page, baseUrl, "god");
  await page.goto(`${baseUrl}/heavens/races`);
  await page.locator("#race-search").fill("Browse Race Canon");
  await catalogRow("Browse Race Canon").click();
  await page.getByRole("heading", { name: "Browse Race Canon", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^(Mark|Remove) System Canon$/ }).count(), 0);
  console.log("PASS: all four admin controls refresh Canon results; a different Admin-only account can mark/remove, and G.O.D.-only has no governance control.");
}
