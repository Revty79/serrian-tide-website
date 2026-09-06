import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, resolve, join } from "node:path";

import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg, { type PoolClient } from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const defaultWindowsPostgresBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN
  ?? (existsSync(defaultWindowsPostgresBin) ? defaultWindowsPostgresBin : "");
const initdbExecutable = postgresBin ? join(postgresBin, "initdb.exe") : "initdb";
const pgCtlExecutable = postgresBin ? join(postgresBin, "pg_ctl.exe") : "pg_ctl";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = "Shop-Builder-Browser-Only!";
const SCREENSHOT_DIRECTORY = resolve(process.cwd(), "coverage", "shop-builder-validation");
const DIST_DIRECTORY = `.next-shop-builder-${process.pid}`;
const DIST_PATH = resolve(process.cwd(), DIST_DIRECTORY);
if (dirname(DIST_PATH) !== resolve(process.cwd()) || basename(DIST_PATH) !== DIST_DIRECTORY) {
  throw new Error("The isolated Shop Builder browser directory is unsafe.");
}

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
  if (!port) throw new Error("A disposable browser-test port could not be reserved.");
  return port;
}

async function one<T extends pg.QueryResultRow>(
  client: PoolClient,
  query: string,
  values: unknown[] = [],
): Promise<T> {
  const result = await client.query<T>(query, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

type Fixture = {
  campaignId: number;
  alternateCampaignId: number;
  godEmail: string;
  playerEmail: string;
  simpleNpcId: number;
  detailedNpcId: number;
  swordName: string;
  armorName: string;
  serviceName: string;
};

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const marker = `shop-browser-${Date.now()}-${process.pid}`;
  const godId = `${marker}-god`;
  const playerId = `${marker}-player`;
  const godEmail = `${godId}@example.invalid`;
  const playerEmail = `${playerId}@example.invalid`;
  const password = await hashPassword(PASSWORD);
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const account of [
      { id: godId, name: "Shop Browser G.O.D.", email: godEmail, role: "god" },
      { id: playerId, name: "Shop Browser Player", email: playerEmail, role: "player" },
    ]) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username)
        values ($1,$2,$3,true,$1,$1)`, [account.id, account.name, account.email]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
        values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${account.id}-credential`, account.id, password]);
      await client.query("insert into user_role (user_id,role) values ($1,$2)", [account.id, account.role]);
    }
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,
      points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,
      currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Shop Builder browser fixture',0,0,0,0,100,100,'Credits','Assigned',0,$2)
    returning id`, [`Shop Campaign ${marker}`, godId]);
    const alternateCampaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,
      points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,
      currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Alternate browser fixture',0,0,0,0,100,100,'Credits','Assigned',0,$2)
    returning id`, [`Alternate Shop Campaign ${marker}`, godId]);
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false)", [campaign.id, godId, playerId]);
    const simpleNpc = await one<{ id: number }>(client, `insert into campaign_character
      (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,npc_role_label)
      values ($1,$2,'Mara Quickquill',$3,'race',$4,'Clerk') returning id`, [campaign.id, godId, true, "simple"]);
    const detailedNpc = await one<{ id: number }>(client, `insert into campaign_character
      (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,npc_role_label)
      values ($1,$2,'Orin Emberhand',true,'creature','detailed','Smith') returning id`, [campaign.id, godId]);
    await client.query(`insert into campaign_character
      (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode)
      values ($1,$2,'Player Hero',false,'race',null)`, [campaign.id, playerId]);

    const swordName = "Moonsteel Practice Sword";
    const armorName = "Emberwatch Plate";
    const serviceName = "River Ferry Passage";
    const ammunition = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,weight,weight_unit,credits,price_basis,created_by_user_id
    ) values ('SHOP-BROWSER-AMMO','Moonneedle Cartridge','inventory',null,'Ammunition','Cartridges','Ammunition','A silver-tipped practice cartridge.',0.04,'lb',1,'round',$1) returning id`, [godId]);
    await client.query(`insert into weapon_profiles
      (item_id,profile_record_type,weapon_type,damage_source,damage,damage_type,rules_text)
      values ($1,'Ammunition','Cartridge','weapon','2d6','Piercing','Use only with a compatible moonsteel launcher.')`, [ammunition.id]);
    const sword = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,weight,weight_unit,durability,credits,price_basis,created_by_user_id
    ) values ('SHOP-BROWSER-SWORD',$1,'equipment','weapon','Weapon','Blades','Sword','A balanced practice blade.',3.5,'lb',40,12,'each',$2) returning id`, [swordName, godId]);
    await client.query(`insert into weapon_profiles
      (item_id,profile_record_type,weapon_type,handedness,damage_source,damage,damage_type,ammunition_item_id,range_text,reach_text,rules_text)
      values ($1,'Weapon','Hybrid blade','One-handed','ammunition','1d6','Slashing',$2,'60 ft','5 ft','Balanced for close defense and ranged practice.')`, [sword.id, ammunition.id]);
    const armor = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,weight,weight_unit,durability,credits,price_basis,is_magical,created_by_user_id
    ) values ('SHOP-BROWSER-ARMOR',$1,'equipment','armor','Armor','Plate','Heavy Armor','Layered plate for the torso and arms.',18,'lb',65,45,'suit',true,$2) returning id`, [armorName, godId]);
    await client.query(`insert into armor_profiles
      (item_id,armor_type,coverage,base_soak,damage_modifiers_source_text,rules_text)
      values ($1,'Heavy plate','Torso and arms',4,'Piercing -1','Requires a fitted harness.')`, [armor.id]);
    const service = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis,created_by_user_id
    ) values ('SHOP-BROWSER-FERRY',$1,'inventory',null,'Service','Travel','Passage','A narrative river crossing.',3,'trip',$2) returning id`, [serviceName, godId]);
    const extraIds: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const extra = await one<{ id: number }>(client, `insert into items (
        canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis,created_by_user_id
      ) values ($1,$2,'equipment','general','Equipment','Shop Fixtures','General','Additional catalog fixture.',1,'each',$3) returning id`, [
        `SHOP-BROWSER-EXTRA-${String(index).padStart(2, "0")}`,
        `Shop Supply ${String(index).padStart(2, "0")}`,
        godId,
      ]);
      extraIds.push(extra.id);
    }
    const itemIds = [sword.id, armor.id, service.id, ammunition.id, ...extraIds];
    for (let sortOrder = 0; sortOrder < itemIds.length; sortOrder += 1) {
      await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,$3)", [campaign.id, itemIds[sortOrder], sortOrder]);
    }
    await client.query("commit");
    return {
      campaignId: campaign.id,
      alternateCampaignId: alternateCampaign.id,
      godEmail,
      playerEmail,
      simpleNpcId: simpleNpc.id,
      detailedNpcId: detailedNpc.id,
      swordName,
      armorName,
      serviceName,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function waitForServer(server: ChildProcess, baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The isolated local server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the Shop Builder browser-test server.");
}

async function login(context: BrowserContext, baseUrl: string, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
  return page;
}

async function windowScroll(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

async function assertSettledWindowScroll(page: Page, expected: number, message: string): Promise<void> {
  await page.waitForTimeout(400);
  const actual = await windowScroll(page);
  assert.ok(Math.abs(actual - expected) <= 14, `${message} Expected ${expected}, received ${actual}.`);
}

async function main(): Promise<void> {
  const temporaryCluster = await mkdtemp(join(tmpdir(), "serrian-shop-browser-postgres-"));
  const dataDirectory = join(temporaryCluster, "data");
  const logPath = join(temporaryCluster, "postgres.log");
  const postgresPort = await findLoopbackPort();
  const appPort = await findLoopbackPort();
  const baseUrl = `http://localhost:${appPort}`;
  const connectionString = `postgresql://postgres@127.0.0.1:${postgresPort}/postgres`;
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  let clusterStarted = false;
  let pool: pg.Pool | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

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
      `-p ${postgresPort} -h 127.0.0.1`,
      "-w",
      "start",
    ], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;
    pool = new pg.Pool({ connectionString });
    await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), "drizzle") });
    const fixture = await seedFixture(pool);

    await rm(DIST_PATH, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(appPort)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        BETTER_AUTH_URL: baseUrl,
        NEXT_TELEMETRY_DISABLED: "1",
        SERRIAN_TEST_NEXT_DIST_DIR: DIST_DIRECTORY,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server, baseUrl);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const godContext = await browser.newContext({ viewport: { width: 1365, height: 720 } });
    const playerContext = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const godPage = await login(godContext, baseUrl, fixture.godEmail);
    const playerPage = await login(playerContext, baseUrl, fixture.playerEmail);

    await godPage.goto(`${baseUrl}/heavens`);
    const shopCard = godPage.getByRole("link", { name: /SHOP BUILDER/ });
    await shopCard.waitFor();
    assert.equal(await shopCard.getAttribute("href"), "/heavens/shops");

    await godPage.goto(`${baseUrl}/heavens/shops?campaign=${fixture.campaignId}`);
    await godPage.getByRole("heading", { name: "Shop Builder", exact: true }).waitFor();
    await godPage.getByRole("button", { name: "Create Shop", exact: true }).click();
    const createDialog = godPage.getByRole("dialog");
    await createDialog.getByLabel("Shop Name").fill("The Lantern Forge");
    await createDialog.getByLabel("Type / Category").fill("Armorer and outfitter");
    await createDialog.getByLabel("Description").fill("A compact preparation-focused campaign Shop.");
    await createDialog.getByLabel("Location Notes").fill("Under the western watchtower.");
    await createDialog.getByLabel(/Opening Balance/).fill("125");
    await createDialog.getByRole("button", { name: "Create Shop", exact: true }).click();
    await godPage.getByText(/was created with its storefront closed/).waitFor();
    await godPage.getByRole("heading", { name: "The Lantern Forge", exact: true }).waitFor();
    assert.equal(await godPage.getByLabel("Storefront").inputValue(), "closed");
    assert.equal(await godPage.getByLabel("Character Purchases").inputValue(), "god-approval-required");

    await godPage.getByLabel("Storefront").selectOption("open");
    await godPage.getByLabel("Character Purchases").selectOption("immediate");
    await godPage.getByLabel("Sold Item Handling").selectOption("remove-from-active-play");
    await godPage.getByLabel("Changed Sale Terms").selectOption("god-approval-finalizes");
    await godPage.getByRole("button", { name: "Save Shop", exact: true }).click();
    await godPage.getByText("The Lantern Forge was saved.").waitFor();
    assert.equal(await godPage.getByLabel("Storefront").inputValue(), "open");

    await godPage.getByRole("combobox", { name: /^NPC/ }).selectOption(String(fixture.simpleNpcId));
    await godPage.getByLabel("Responsibility / Role").last().fill("Proprietor");
    await godPage.getByRole("button", { name: "Assign NPC" }).click();
    await godPage.getByText(/Mara Quickquill was assigned/).waitFor();
    const mara = godPage.locator(".shops-staff-list article").filter({ hasText: "Mara Quickquill" });
    assert.equal(await mara.getByLabel("Primary contact").isChecked(), true);

    await godPage.getByRole("combobox", { name: /^NPC/ }).selectOption(String(fixture.detailedNpcId));
    await godPage.getByLabel("Responsibility / Role").last().fill("Smith");
    await godPage.getByRole("button", { name: "Assign NPC" }).click();
    await godPage.getByText(/Orin Emberhand was assigned/).waitFor();
    const orin = godPage.locator(".shops-staff-list article").filter({ hasText: "Orin Emberhand" });
    await orin.getByLabel("Primary contact").check();
    await orin.getByRole("button", { name: "Save Assignment" }).click();
    await godPage.getByText(/Orin Emberhand's Shop assignment was saved/).waitFor();
    assert.equal(await mara.getByLabel("Primary contact").isChecked(), false);
    assert.equal(await orin.getByLabel("Primary contact").isChecked(), true);

    const catalogFilters = godPage.getByRole("navigation", { name: "Offering catalog filters" });
    const allItemsFilter = catalogFilters.getByRole("button", { name: /^All Items/ });
    const weaponsFilter = catalogFilters.getByRole("button", { name: /^Weapons/ });
    const armorFilter = catalogFilters.getByRole("button", { name: /^Armor/ });
    const generalFilter = catalogFilters.getByRole("button", { name: /^General Equipment/ });
    const inventoryFilter = catalogFilters.getByRole("button", { name: /^Inventory/ });
    assert.match(await allItemsFilter.innerText(), /All Items\s+14/);
    assert.match(await weaponsFilter.innerText(), /Weapons\s+1/);
    assert.match(await armorFilter.innerText(), /Armor\s+1/);
    assert.match(await generalFilter.innerText(), /General Equipment\s+10/);
    assert.match(await inventoryFilter.innerText(), /Inventory\s+2/);
    assert.equal(await allItemsFilter.getAttribute("aria-pressed"), "true");

    await weaponsFilter.click();
    await godPage.getByLabel("Search permitted Items").fill("Moonneedle");
    const availableCatalog = godPage.locator('[data-preserve-scroll="shop-catalog-available"]');
    const listedCatalog = godPage.locator('[data-preserve-scroll="shop-catalog-listed"]');
    const swordCatalog = availableCatalog.getByRole("button", { name: new RegExp(fixture.swordName) });
    assert.equal(await availableCatalog.getByRole("button").count(), 1, "Weapon filter and ammunition-name search did not combine.");
    await swordCatalog.click();
    const catalogPreview = godPage.locator(".shops-catalog-preview");
    assert.match(await catalogPreview.innerText(), /SHOP-BROWSER-SWORD[\s\S]*Hybrid blade[\s\S]*2d6 Piercing[\s\S]*Moonneedle Cartridge[\s\S]*60 ft[\s\S]*3.5 lb[\s\S]*12 Credits[\s\S]*each/);
    await catalogPreview.scrollIntoViewIfNeeded();
    const beforeAdd = await windowScroll(godPage);
    await swordCatalog.evaluate((element) => {
      element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await godPage.getByText(new RegExp(`${fixture.swordName} was added`)).waitFor();
    assert.equal(await weaponsFilter.getAttribute("aria-pressed"), "true");
    assert.equal(await godPage.getByLabel("Search permitted Items").inputValue(), "Moonneedle");
    assert.ok(Math.abs((await windowScroll(godPage)) - beforeAdd) <= 14, "Adding an offering did not preserve window scroll.");
    assert.equal(await swordCatalog.count(), 0, "The transferred Item remained in the available Campaign pool.");
    const listedSwordCatalog = listedCatalog.getByRole("button", { name: new RegExp(fixture.swordName) });
    assert.equal(await listedSwordCatalog.count(), 1, "The transferred Item did not move into the Shop list.");
    const alreadyListed = catalogPreview.getByRole("button", { name: "Already Listed" });
    assert.equal(await alreadyListed.isDisabled(), true, "The listed Item did not expose duplicate protection.");
    const duplicateRows = await pool.query<{ count: number }>(`select count(*)::int as count
      from shop_offering as offering
      inner join shop on shop.id = offering.shop_id
      inner join items on items.id = offering.item_id
      where shop.campaign_id = $1 and items.canonical_id = 'SHOP-BROWSER-SWORD'`, [fixture.campaignId]);
    assert.equal(duplicateRows.rows[0]?.count, 1, "The Shop contains a duplicate Item offering.");

    await armorFilter.click();
    await godPage.getByLabel("Search permitted Items").fill("Torso and arms");
    const armorCatalog = availableCatalog.getByRole("button", { name: new RegExp(fixture.armorName) });
    assert.equal(await armorCatalog.count(), 1, "Armor filter and coverage search did not combine.");
    await armorCatalog.click();
    const armorText = await catalogPreview.innerText();
    assert.match(armorText, /Heavy Armor · armor · Magical/);
    assert.match(armorText, /Heavy plate[\s\S]*Torso and arms[\s\S]*Base Soak[\s\S]*4[\s\S]*Piercing -1/);

    await inventoryFilter.click();
    await godPage.getByLabel("Search permitted Items").fill("Ferry");
    const serviceCatalog = availableCatalog.getByRole("button", { name: new RegExp(fixture.serviceName) });
    await serviceCatalog.click();
    await godPage.getByRole("button", { name: "Add Selected" }).click();
    await godPage.getByText(new RegExp(`${fixture.serviceName} was added`)).waitFor();

    const swordOffering = godPage.locator(".shops-offerings article").filter({ hasText: fixture.swordName });
    await swordOffering.getByLabel("Shop-Facing Note").fill("Unsaved catalog browsing draft.");
    await allItemsFilter.click();
    await godPage.getByLabel("Search permitted Items").fill("Additional");
    const catalogScroller = availableCatalog;
    assert.deepEqual(await availableCatalog.locator("button strong").allTextContents(), [
      "Shop Supply 00", "Shop Supply 01", "Shop Supply 02", "Shop Supply 03", "Shop Supply 04",
      "Shop Supply 05", "Shop Supply 06", "Shop Supply 07", "Shop Supply 08", "Shop Supply 09",
    ]);
    await catalogScroller.evaluate((element) => { element.scrollTop = 90; });
    await generalFilter.click();
    assert.equal(await swordOffering.getByLabel("Shop-Facing Note").inputValue(), "Unsaved catalog browsing draft.");
    assert.equal(await generalFilter.getAttribute("aria-pressed"), "true");
    assert.ok(await catalogScroller.evaluate((element) => element.scrollTop) >= 80, "Category filtering did not preserve catalog scroll.");

    await swordOffering.getByLabel("Fulfillment").selectOption("service-narrative");
    await swordOffering.getByLabel("Stock Tracking").selectOption("limited");
    await swordOffering.getByLabel("Limited Quantity").fill("5");
    await swordOffering.getByLabel(/Selling Override/).fill("9");
    await swordOffering.getByLabel(/Buying Override/).fill("4");
    await swordOffering.getByLabel("Shop-Facing Note").fill("Fitting is included as a narrative service.");
    const serviceOffering = godPage.locator(".shops-offerings article").filter({ hasText: fixture.serviceName });
    await serviceOffering.getByLabel("Shop-Facing Note").fill("Unsaved sibling offering draft.");
    const saveOffering = swordOffering.getByRole("button", { name: "Save Offering" });
    const catalogScrollBeforeSave = await catalogScroller.evaluate((element) => element.scrollTop);
    await godPage.evaluate(() => window.scrollTo({ top: 760, behavior: "instant" }));
    const focusedOfferingNote = swordOffering.getByLabel("Shop-Facing Note");
    await focusedOfferingNote.focus();
    const beforeSave = await windowScroll(godPage);
    assert.ok(beforeSave > 50, "Shop Builder was not long enough to test scroll preservation.");
    await saveOffering.evaluate((element) => (element as HTMLElement).click());
    await godPage.getByText(`${fixture.swordName} was saved.`).waitFor();
    await assertSettledWindowScroll(godPage, beforeSave, "Offering save did not preserve scroll after the delayed server render.");
    assert.ok(Math.abs((await catalogScroller.evaluate((element) => element.scrollTop)) - catalogScrollBeforeSave) <= 2, "Offering save did not preserve catalog scroll.");
    assert.equal(await generalFilter.getAttribute("aria-pressed"), "true");
    assert.equal(await godPage.getByLabel("Search permitted Items").inputValue(), "Additional");
    assert.equal(await focusedOfferingNote.evaluate((element) => document.activeElement === element), true, "Offering save lost field focus after the delayed server render.");
    assert.equal(await serviceOffering.getByLabel("Shop-Facing Note").inputValue(), "Unsaved sibling offering draft.", "Saving one offering discarded an unrelated unsaved edit.");
    const refreshedSword = godPage.locator(".shops-offerings article").filter({ hasText: fixture.swordName });
    assert.match(await refreshedSword.innerText(), /Effective selling price[\s\S]*9 Credits[\s\S]*Shop override/);
    assert.match(await refreshedSword.innerText(), /Effective buying price[\s\S]*4 Credits[\s\S]*Shop override/);
    assert.equal(await refreshedSword.getByLabel("Limited Quantity").inputValue(), "5");
    assert.equal(await refreshedSword.getByLabel("Fulfillment").inputValue(), "service-narrative");

    const supplyToTransfer = availableCatalog.getByRole("button", { name: /Shop Supply 05/ });
    await supplyToTransfer.click();
    const catalogScrollBeforeTransfer = await catalogScroller.evaluate((element) => element.scrollTop);
    const windowScrollBeforeTransfer = await windowScroll(godPage);
    await godPage.getByRole("button", { name: "Add Selected" }).evaluate((element) => (element as HTMLElement).click());
    await godPage.getByText(/Shop Supply 05 was added/).waitFor();
    assert.ok(await catalogScroller.evaluate((element) => element.scrollTop) > 30, "Transferring an Item snapped the available list to the top.");
    assert.ok(Math.abs((await catalogScroller.evaluate((element) => element.scrollTop)) - catalogScrollBeforeTransfer) <= 20, "Transferring an Item did not retain the available-list position.");
    assert.ok(Math.abs((await windowScroll(godPage)) - windowScrollBeforeTransfer) <= 14, "Transferring an Item snapped the page to the top.");
    assert.equal(await generalFilter.getAttribute("aria-pressed"), "true");
    assert.equal(await godPage.getByLabel("Search permitted Items").inputValue(), "Additional");

    const listedSupply = listedCatalog.getByRole("button", { name: /Shop Supply 05/ });
    await listedSupply.click();
    const catalogScrollBeforeRemoval = await catalogScroller.evaluate((element) => element.scrollTop);
    const windowScrollBeforeRemoval = await windowScroll(godPage);
    await godPage.getByRole("button", { name: "Remove Selected" }).evaluate((element) => (element as HTMLElement).click());
    await godPage.getByText(/Shop Supply 05 was removed/).waitFor();
    assert.equal(await listedSupply.count(), 0, "The removed offering remained in the Shop list.");
    assert.equal(await availableCatalog.getByRole("button", { name: /Shop Supply 05/ }).count(), 1, "The removed offering did not return to the Campaign pool.");
    assert.ok(Math.abs((await catalogScroller.evaluate((element) => element.scrollTop)) - catalogScrollBeforeRemoval) <= 20, "Removing an offering did not retain the available-list position.");
    assert.ok(Math.abs((await windowScroll(godPage)) - windowScrollBeforeRemoval) <= 14, "Removing an offering snapped the page to the top.");
    await godPage.getByRole("button", { name: "Add Selected" }).evaluate((element) => (element as HTMLElement).click());
    await godPage.getByText(/Shop Supply 05 was added/).waitFor();

    await generalFilter.click();
    await godPage.getByLabel("Search permitted Items").fill("Additional");
    await availableCatalog.getByRole("button", { name: /Shop Supply 06/ }).click();
    const catalogPanel = godPage.locator(".shops-panel").filter({ hasText: "CAMPAIGN-AUTHORIZED CATALOG" });
    await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
    await godPage.addStyleTag({ content: ".authenticated-navigation { position: static !important; }" });
    await catalogPanel.screenshot({ path: join(SCREENSHOT_DIRECTORY, "shop-inventory-browser-desktop.png") });
    await godPage.setViewportSize({ width: 390, height: 900 });
    await catalogPanel.scrollIntoViewIfNeeded();
    await catalogPanel.screenshot({ path: join(SCREENSHOT_DIRECTORY, "shop-inventory-browser-narrow.png") });
    await generalFilter.click();
    const catalogSearch = godPage.getByLabel("Search permitted Items");
    await catalogSearch.fill("Additional");
    const narrowSupply = availableCatalog.getByRole("button", { name: /Shop Supply 07/ });
    await narrowSupply.click();
    await catalogScroller.evaluate((element) => { element.scrollTop = 80; });
    await godPage.evaluate(() => window.scrollTo({ top: 760, behavior: "instant" }));
    await catalogSearch.focus();
    const narrowWindowScroll = await windowScroll(godPage);
    const narrowCatalogScroll = await catalogScroller.evaluate((element) => element.scrollTop);
    await godPage.getByRole("button", { name: "Add Selected" }).evaluate((element) => (element as HTMLElement).click());
    await godPage.getByText(/Shop Supply 07 was added/).waitFor();
    await assertSettledWindowScroll(godPage, narrowWindowScroll, "Narrow Shop mutation jumped after the delayed server render.");
    assert.ok(Math.abs((await catalogScroller.evaluate((element) => element.scrollTop)) - narrowCatalogScroll) <= 20, "Narrow Shop mutation lost the catalog-list position.");
    assert.equal(await generalFilter.getAttribute("aria-pressed"), "true");
    assert.equal(await catalogSearch.inputValue(), "Additional");
    assert.equal(await catalogSearch.evaluate((element) => document.activeElement === element), true, "Narrow Shop mutation lost catalog focus.");
    await godPage.setViewportSize({ width: 1365, height: 720 });

    await godPage.getByRole("button", { name: "Create Shop", exact: true }).first().evaluate((element) => (element as HTMLElement).click());
    const secondCreateDialog = godPage.getByRole("dialog");
    await secondCreateDialog.getByLabel("Shop Name").fill("Scrollwatch Kiosk");
    await secondCreateDialog.getByLabel("Type / Category").fill("Test kiosk");
    await godPage.evaluate(() => window.scrollTo({ top: 760, behavior: "instant" }));
    const beforeCreate = await windowScroll(godPage);
    await secondCreateDialog.getByRole("button", { name: "Create Shop", exact: true }).click();
    await godPage.getByText(/Scrollwatch Kiosk was created/).waitFor();
    await assertSettledWindowScroll(godPage, beforeCreate, "Creating a Shop jumped after the delayed server render.");
    assert.equal(await generalFilter.getAttribute("aria-pressed"), "true", "Creating a Shop reset the catalog filter.");
    assert.equal(await catalogSearch.inputValue(), "Additional", "Creating a Shop reset catalog search.");
    await godPage.getByRole("button", { name: "Delete Shop", exact: true }).first().click();
    const secondDeleteDialog = godPage.getByRole("dialog");
    await secondDeleteDialog.getByLabel(/^Type the exact Shop name/).fill("Scrollwatch Kiosk");
    await secondDeleteDialog.getByRole("button", { name: "Permanently Delete Shop", exact: true }).click();
    await godPage.getByText("Scrollwatch Kiosk was permanently deleted.").waitFor();
    await godPage.getByRole("button", { name: /The Lantern Forge/ }).click();

    const campaignSelect = godPage.locator(".shops-context select");
    await campaignSelect.selectOption(String(fixture.alternateCampaignId));
    await godPage.getByText("No active Shops match this view.").waitFor();
    assert.equal(await godPage.locator(".shops-catalog-preview").count(), 0, "The prior Campaign catalog remained rendered.");
    await campaignSelect.selectOption(String(fixture.campaignId));
    await godPage.getByRole("button", { name: /The Lantern Forge/ }).click();
    assert.equal(await allItemsFilter.getAttribute("aria-pressed"), "true");
    assert.equal(await godPage.getByLabel("Search permitted Items").inputValue(), "");

    await refreshedSword.getByRole("button", { name: `Move ${fixture.swordName} down` }).click();
    await godPage.getByText("Shop offering order was saved.").waitFor();
    const orderedNames = await godPage.locator(".shops-offerings article h4").allTextContents();
    assert.deepEqual(orderedNames, [fixture.serviceName, fixture.swordName, "Shop Supply 05", "Shop Supply 07"]);

    await godPage.getByRole("button", { name: "Archive Shop", exact: true }).first().click();
    const archiveDialog = godPage.getByRole("dialog");
    await archiveDialog.getByLabel("Archive Reason (optional)").fill("Closed for the winter market.");
    await archiveDialog.getByRole("button", { name: "Archive Shop", exact: true }).click();
    await godPage.getByText(/was archived and its storefront was closed/).waitFor();
    await godPage.getByRole("button", { name: "Archived", exact: true }).click();
    await godPage.getByRole("button", { name: /The Lantern Forge/ }).click();
    await godPage.getByText("This Shop is archived and read-only. Restore it before making changes.").waitFor();
    assert.equal(await godPage.locator(".shops-editor").getByLabel("Shop Name").isDisabled(), true);
    assert.equal(await godPage.getByRole("button", { name: "Save Shop" }).isDisabled(), true);
    await godPage.getByRole("button", { name: "Restore Shop" }).click();
    await godPage.getByText(/was restored with its storefront closed/).waitFor();

    await godPage.getByRole("button", { name: "Active", exact: true }).click();
    await godPage.getByRole("button", { name: /The Lantern Forge/ }).click();
    const persistedShopResult = await pool.query<{ id: number }>("select id from shop where campaign_id = $1 and name = 'The Lantern Forge'", [fixture.campaignId]);
    assert.equal(persistedShopResult.rows.length, 1);
    const persistedShop = persistedShopResult.rows[0]!;
    await godPage.getByRole("button", { name: "Delete Shop", exact: true }).click();
    const deleteDialog = godPage.getByRole("dialog");
    const confirmDelete = deleteDialog.getByRole("button", { name: "Permanently Delete Shop", exact: true });
    assert.equal(await confirmDelete.isDisabled(), true, "Permanent deletion did not require exact-name confirmation.");
    await deleteDialog.getByLabel(/^Type the exact Shop name/).fill("The Lantern Forge");
    assert.equal(await confirmDelete.isEnabled(), true);
    await confirmDelete.click();
    await godPage.getByText("The Lantern Forge was permanently deleted.").waitFor();
    await godPage.getByText("No active Shops match this view.").waitFor();
    const deletedShopState = await pool.query<{ shops: number; staff: number; offerings: number; audits: number }>(`
      select
        (select count(*) from shop where name = 'The Lantern Forge')::int shops,
        (select count(*) from shop_staff_assignment where shop_id = $1)::int staff,
        (select count(*) from shop_offering where shop_id = $1)::int offerings,
        (select count(*) from lifecycle_audit_event where entity_kind = 'shop' and target_id = $1::text and action = 'delete')::int audits
    `, [persistedShop.id]);
    assert.deepEqual(deletedShopState.rows[0], { shops: 0, staff: 0, offerings: 0, audits: 1 });

    await playerPage.goto(`${baseUrl}/heavens/shops`);
    await playerPage.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
    assert.equal(await playerPage.getByRole("heading", { name: "Choose Your Path" }).isVisible(), true);

    assert.equal(await godPage.getByRole("button", { name: /Buy Now|Checkout|Complete Sale/ }).count(), 0);
    console.log(JSON.stringify({
      passed: true,
      verified: [
        "Heavens Shop Builder card and route",
        "safe Shop creation defaults and policy editing",
        "multiple persistent NPC staff and single primary contact",
        "Character-store category counts and combined equipment-detail search",
        "Campaign-authorized offering creation and visible duplicate protection",
        "naturally sorted dual-list transfer without catalog or page scroll reset",
        "unsaved offering edits plus catalog and window scroll preservation",
        "Campaign switches clear prior catalog results and browsing state",
        "service classification, limited stock, price overrides, and canonical display",
        "offering ordering and in-place scroll preservation",
        "archive read-only state and restore",
        "exact-confirmed audited Shop deletion with owned-child cleanup",
        "player authorization rejection",
        "no checkout or live transaction controls",
      ],
    }, null, 2));
    await Promise.all([godContext.close(), playerContext.close()]);
  } finally {
    const cleanupErrors: unknown[] = [];
    try { if (browser) await browser.close(); } catch (error) { cleanupErrors.push(error); }
    try {
      if (server && server.exitCode === null) {
        server.kill();
        await new Promise<void>((resolveStop) => {
          const timeout = setTimeout(resolveStop, 4_000);
          server!.once("exit", () => { clearTimeout(timeout); resolveStop(); });
        });
      }
    } catch (error) { cleanupErrors.push(error); }
    try { if (pool) await pool.end(); } catch (error) { cleanupErrors.push(error); }
    try {
      if (clusterStarted && existsSync(join(dataDirectory, "postmaster.pid"))) {
        execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
      }
    } catch (error) { cleanupErrors.push(error); }
    try { await rm(temporaryCluster, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await rm(DIST_PATH, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await writeFile(tsconfigPath, tsconfigBefore); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Shop Builder browser-test cleanup failed.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
