import assert from "node:assert/strict";
import path from "node:path";
import type { Pool } from "pg";
import type { Page, Request } from "playwright-core";

export async function runCatalogPassFourBrowserChecks({ page, pool, baseUrl, screenshots, login }: {
  page: Page; pool: Pool; baseUrl: string; screenshots: string;
  login: (page: Page, baseUrl: string, identity: string) => Promise<void>;
}) {
  async function switchUser(identity: string) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/profile`);
    await page.locator('.authenticated-navigation button:visible').filter({ hasText: /^Log Out$/ }).click();
    await login(page, baseUrl, identity);
  }
  async function choose(label: string) {
    const radio = page.getByRole("radio", { name: label, exact: true });
    if (!await radio.isChecked()) {
      await radio.check();
      await page.getByRole("status").filter({ hasText: /^Saved\.$/ }).waitFor();
    }
  }
  const row = (name: string) => page.locator(".skill-library__row").filter({ has: page.locator(".skill-library__row-name").getByText(name, { exact: true }) });
  const ids = new Map<string, number[]>();
  const tag = (await pool.query("insert into item_tags_catalog(canonical_id,name,tag_group,description) values('P4_BROWSER_TAG','Pass Four Shared','Fixture','Browser discovery fixture') returning id")).rows[0].id as number;
  const hiddenTag = (await pool.query("insert into item_tags_catalog(canonical_id,name,tag_group,description) values('P4_BROWSER_HIDDEN','Pass Four Hidden','Fixture','Stored hidden metadata') returning id")).rows[0].id as number;
  for (const scope of ["equipment", "inventory"]) {
    const records: number[] = [];
    for (const [label, creator, canon] of [["Canon", "profile-god", true], ["Mine", "profile-all", false], ["Foreign", "profile-god", false], ["Promoted", "profile-all", true], ["Middle", "profile-god", false], ["Sibling", "profile-god", true]] as const) {
      const id = (await pool.query(`insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,is_system_canon,canon_marked_by_user_id,canon_marked_at)
        values($1,$2,$3,$4,'Item','General','General','Each',$5,$6,case when $6 then 'profile-all' else null end,case when $6 then now() else null end) returning id`,
      [`P4_BROWSER_${scope}_${label}`.toUpperCase(), `P4 ${scope} ${label}`, scope, scope === "equipment" ? "general" : null, creator, canon])).rows[0].id as number;
      records.push(id);
      await pool.query("insert into item_tag_links(item_id,tag_id) values($1,$2)", [id, tag]);
    }
    for (const [child, parent] of [[records[1], records[4]], [records[4], records[0]], [records[5], records[0]]]) await pool.query("update items set parent_item_id=$1 where id=$2", [parent, child]);
    await pool.query("insert into item_tag_links(item_id,tag_id) values($1,$2)", [records[2], hiddenTag]);
    ids.set(scope, records);
  }
  await switchUser("all");
  let canonRequest: Request | undefined;
  for (const scope of ["equipment", "inventory"]) {
    const label = scope === "equipment" ? "Equipment" : "Inventory";
    await page.goto(`${baseUrl}/profile`);
    await page.getByRole("group", { name: label, exact: true }).getByRole("radio", { name: "Mine Only", exact: true }).check();
    await page.getByRole("group", { name: label, exact: true }).getByRole("status").filter({ hasText: /^Saved\.$/ }).waitFor();
    await page.goto(`${baseUrl}/heavens/${scope}`);
    assert.equal(await page.getByRole("radio", { name: "Mine Only", exact: true }).isChecked(), true);
    await page.locator("#item-search").fill(`P4 ${scope}`);
    await row(`P4 ${scope} Foreign`).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Enable visibility filtering", exact: true }).click();
    await row(`P4 ${scope} Foreign`).waitFor({ state: "detached" });
    await row(`P4 ${scope} Middle`).getByText("Context", { exact: true }).waitFor();
    await row(`P4 ${scope} Canon`).getByText("Context", { exact: true }).waitFor();
    assert.equal(await row(`P4 ${scope} Sibling`).count(), 0);
    await row(`P4 ${scope} Promoted`).getByText("Serrian Tide Canon", { exact: true }).waitFor();
    await choose("Canon Only");
    await row(`P4 ${scope} Mine`).waitFor({ state: "detached" });
    await row(`P4 ${scope} Sibling`).waitFor();
    await choose("Canon + Mine");
    await row(`P4 ${scope} Mine`).waitFor();
    await page.getByRole("combobox", { name: "Administrative review", exact: true }).selectOption("review");
    await row(`P4 ${scope} Foreign`).click();
    await page.getByRole("heading", { name: `P4 ${scope} Foreign`, exact: true }).waitFor();
    const captured = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.postData()?.includes('"root":"item"')));
    await page.getByRole("button", { name: "Mark System Canon", exact: true }).click();
    canonRequest = await captured;
    await page.getByRole("button", { name: "Remove System Canon", exact: true }).waitFor();
    await row(`P4 ${scope} Foreign`).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Remove System Canon", exact: true }).click();
    await row(`P4 ${scope} Foreign`).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label} mobile overflow`);
    await page.locator(".skill-editor__header").screenshot({ path: path.join(screenshots, `pass-four-${scope}-canon-390.png`) });
    await page.getByRole("combobox", { name: "Administrative review", exact: true }).selectOption("browse");
    await choose("Canon Only");
    await page.goto(`${baseUrl}/profile`);
    assert.equal(await page.getByRole("group", { name: label, exact: true }).getByRole("radio", { name: "Canon Only", exact: true }).isChecked(), true);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await switchUser("god");
  for (const scope of ["equipment", "inventory"]) {
    await page.goto(`${baseUrl}/heavens/${scope}`);
    assert.equal(await page.getByRole("button", { name: /Enable visibility filtering|Disable filtering|System Canon/ }).count(), 0);
    assert.equal(await page.getByRole("combobox", { name: "Administrative review", exact: true }).count(), 0);
    await page.locator("#item-search").fill(`P4 ${scope}`);
    await row(`P4 ${scope} Mine`).waitFor({ state: "detached" });
    await row(`P4 ${scope} Promoted`).waitFor();
    await page.goto(`${baseUrl}/heavens/${scope}?item=${ids.get(scope)![1]}`);
    assert.equal(await page.getByRole("heading", { name: `P4 ${scope} Mine`, exact: true }).count(), 0, "A direct URL cannot open another creator's private Item");
    // A disabled personal filter still enforces creator/canon access.
    await pool.query("delete from catalog_visibility_scope_activation where catalog_key=$1", [scope]);
    await page.goto(`${baseUrl}/heavens/${scope}`);
    await page.locator("#item-search").fill(`P4 ${scope}`);
    await row(`P4 ${scope} Mine`).waitFor({ state: "detached" });
    await row(`P4 ${scope} Promoted`).waitFor();
    await pool.query("insert into catalog_visibility_scope_activation(catalog_key,activation_method,activated_by_user_id) values($1,'manual','profile-all')", [scope]);
  }
  assert.ok(canonRequest);
  const forged = await page.request.post(canonRequest.url(), { headers: {
    "next-action": canonRequest.headers()["next-action"], "content-type": canonRequest.headers()["content-type"], origin: baseUrl,
  }, data: canonRequest.postData()! });
  assert.match(await forged.text(), /Administrator|"digest"/);
  assert.equal((await pool.query("select is_system_canon from items where id=$1", [ids.get("inventory")![2]])).rows[0].is_system_canon, false);
  await switchUser("all");
  await page.goto(`${baseUrl}/profile`);
  assert.equal(await page.getByRole("group", { name: "Equipment", exact: true }).getByRole("radio", { name: "Canon Only", exact: true }).isChecked(), true);
  await page.getByRole("group", { name: "Inventory", exact: true }).getByRole("radio", { name: "Mine Only", exact: true }).check();
  await page.getByRole("group", { name: "Inventory", exact: true }).getByRole("status").filter({ hasText: /^Saved\.$/ }).waitFor();
  await page.getByRole("group", { name: "Races", exact: true }).getByRole("radio", { name: "Mine Only", exact: true }).check();
  await page.getByRole("group", { name: "Races", exact: true }).getByRole("status").filter({ hasText: /^Saved\.$/ }).waitFor();
  console.log("PASS: both Item scopes, activation, nested Context, Admin review/Canon, forged G.O.D. rejection, independent Profile preferences and login persistence.");

  const hiddenRace = (await pool.query("select id from races where name='Browse Race Foreign'")).rows[0].id;
  const campaignId = (await pool.query(`insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id)
    values('Pass Four Campaign',100,100,10,10,100,0,'Credits','Assigned',0,'profile-all') returning id`)).rows[0].id;
  await pool.query("insert into campaign_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaignId, hiddenRace]);
  const hiddenWorldRace = (await pool.query("select id from races where name='Browse Race Middle'")).rows[0].id;
  await pool.query("insert into campaign_race(campaign_id,race_id,sort_order) values($1,$2,1)", [campaignId, hiddenWorldRace]);
  await pool.query("insert into campaign_allowed_race(campaign_id,race_id,sort_order) values($1,$2,0)", [campaignId, hiddenRace]);
  await pool.query("insert into campaign_inventory_tag(campaign_id,tag_id,sort_order) values($1,$2,0),($1,$3,1)", [campaignId, tag, hiddenTag]);
  for (const [index, scope] of ["equipment", "inventory"].entries()) await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)", [campaignId, ids.get(scope)![2], index]);
  const membership = async () => (await pool.query("select item_id from campaign_inventory_item where campaign_id=$1 order by sort_order", [campaignId])).rows.map(({ item_id }) => item_id);
  const original = await membership();
  await page.goto(`${baseUrl}/heavens/campaigns/new`);
  assert.equal(await page.getByRole("checkbox", { name: "Select Browse Race Foreign", exact: true }).count(), 0);
  await page.getByRole("checkbox", { name: /Pass Four Shared/ }).check();
  await page.getByRole("button", { name: /P4 equipment Canon/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /P4 equipment Foreign|P4 inventory Foreign/ }).count(), 0);
  await page.getByRole("navigation", { name: "Available item type" }).getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Move All →", exact: true }).click();
  await page.getByText(/2 Campaign Items/).waitFor();
  assert.deepEqual(await membership(), original);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "New Campaign mobile overflow");
  await page.getByRole("heading", { name: "Campaign Race Workspace" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, "pass-four-new-campaign-races-390.png") });
  await page.getByRole("heading", { name: "Available in Campaign", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, "pass-four-new-campaign-items-390.png") });
  await page.goto(`${baseUrl}/heavens/campaigns?campaign=${campaignId}`);
  await page.getByRole("button", { name: "Allowed Races", exact: true }).click();
  const retained = page.getByRole("checkbox", { name: "Select Browse Race Foreign", exact: true });
  assert.equal(await retained.count(), 3);
  for (const checkbox of await retained.all()) assert.equal(await checkbox.isChecked(), true);
  const collapsedRoots = page.getByRole("button", { name: "Show variants of Browse Race Canon", exact: true });
  while (await collapsedRoots.count()) await collapsedRoots.first().click();
  assert.equal(await page.getByRole("checkbox", { name: "Select Browse Race Middle", exact: true }).count(), 2, "A hidden world-only Race is retained without becoming a new playable choice");
  await page.getByRole("button", { name: "Inventory Access", exact: true }).click();
  await page.getByText(/2 Campaign Items/).waitFor();
  await page.getByRole("button", { name: /P4 equipment Foreign/ }).getByText("Existing Campaign selection", { exact: true }).waitFor();
  await page.getByRole("button", { name: /P4 inventory Foreign/ }).getByText("Existing Campaign selection", { exact: true }).waitFor();
  assert.deepEqual(await membership(), original);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "Existing Campaign mobile overflow");
  await page.getByRole("navigation", { name: "Available item type" }).getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Move All →", exact: true }).click();
  await page.getByText(/4 Campaign Items/).waitFor();
  await page.getByRole("button", { name: "Save Campaign", exact: true }).click();
  await page.getByRole("button", { name: "Save Campaign", exact: true }).isDisabled();
  await page.waitForFunction(() => document.querySelector(".campaign-editor-header")?.textContent?.includes("Saved"));
  assert.deepEqual(await membership(), [...original, ids.get("inventory")![1], ids.get("inventory")![3]]);
  assert.equal((await pool.query("select count(*)::int n from campaign_allowed_race where campaign_id=$1 and race_id=$2", [campaignId, hiddenRace])).rows[0].n, 1);
  console.log("PASS: new/existing Campaign Race and Item discovery, retained hidden selections, independent Item scopes, filtered tags/Move All and explicit save at 390px.");

  for (const viewport of [{ width: 1440, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["races", "creatures", "skills", "derived-abilities", "equipment", "inventory"]) {
      await page.goto(`${baseUrl}/heavens/${route}`);
      if (route === "skills") await page.getByRole("button", { name: "List View", exact: true }).click();
      const panel = page.locator(".skill-library");
      await panel.locator(".skill-library__row").first().waitFor();
      await panel.scrollIntoViewIfNeeded();
      const dimensions = await panel.evaluate((element) => ({ height: element.clientHeight, scroll: element.scrollHeight, overflow: getComputedStyle(element).overflowY }));
      assert.equal(dimensions.overflow, "auto");
      assert.ok(dimensions.height < viewport.height, `${route}: Master Content fits viewport`);
      assert.ok(dimensions.scroll > dimensions.height, `${route}: controls and results share a scrollable panel`);
      for (const target of [panel.locator(".skill-library__row").first(), panel.locator(".skill-library__row").last()]) {
        await target.scrollIntoViewIfNeeded();
        const visible = await target.evaluate((element) => {
          const item = element.getBoundingClientRect(), container = element.closest(".skill-library")!.getBoundingClientRect();
          return item.top >= container.top && item.bottom <= container.bottom + 1 && item.top >= 0 && item.bottom <= innerHeight + 1;
        });
        assert.ok(visible, `${route}: first and last results remain reachable at ${viewport.width}px`);
      }
      await panel.locator(".skill-library__row").first().scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${route}: horizontal overflow`);
      await panel.screenshot({ path: path.join(screenshots, `pass-four-master-content-${route}-${viewport.width}.png`) });
    }
  }
  console.log("PASS: all six Master Content panels scroll as a whole with reachable results at 1440x800 and 390x844.");
}
