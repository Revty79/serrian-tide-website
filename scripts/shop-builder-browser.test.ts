import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  godEmail: string;
  playerEmail: string;
  simpleNpcId: number;
  detailedNpcId: number;
  swordName: string;
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
    const serviceName = "River Ferry Passage";
    const sword = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis,created_by_user_id
    ) values ('SHOP-BROWSER-SWORD',$1,'equipment','weapon','Weapon','Blades','Sword','A balanced practice blade.',12,'each',$2) returning id`, [swordName, godId]);
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
    const itemIds = [sword.id, service.id, ...extraIds];
    for (let sortOrder = 0; sortOrder < itemIds.length; sortOrder += 1) {
      await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,$3)", [campaign.id, itemIds[sortOrder], sortOrder]);
    }
    await client.query("commit");
    return {
      campaignId: campaign.id,
      godEmail,
      playerEmail,
      simpleNpcId: simpleNpc.id,
      detailedNpcId: detailedNpc.id,
      swordName,
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

    await godPage.getByLabel("Search permitted Items").fill("Moonsteel");
    const swordCatalog = godPage.locator(".shops-catalog article").filter({ hasText: fixture.swordName });
    await swordCatalog.getByRole("button", { name: "Add Offering" }).click();
    await godPage.getByText(new RegExp(`${fixture.swordName} was added`)).waitFor();
    await godPage.getByLabel("Search permitted Items").fill("Ferry");
    const serviceCatalog = godPage.locator(".shops-catalog article").filter({ hasText: fixture.serviceName });
    await serviceCatalog.getByRole("button", { name: "Add Offering" }).click();
    await godPage.getByText(new RegExp(`${fixture.serviceName} was added`)).waitFor();

    const swordOffering = godPage.locator(".shops-offerings article").filter({ hasText: fixture.swordName });
    await swordOffering.getByLabel("Fulfillment").selectOption("service-narrative");
    await swordOffering.getByLabel("Stock Tracking").selectOption("limited");
    await swordOffering.getByLabel("Limited Quantity").fill("5");
    await swordOffering.getByLabel(/Selling Override/).fill("9");
    await swordOffering.getByLabel(/Buying Override/).fill("4");
    await swordOffering.getByLabel("Shop-Facing Note").fill("Fitting is included as a narrative service.");
    const saveOffering = swordOffering.getByRole("button", { name: "Save Offering" });
    await godPage.evaluate(() => window.scrollTo({ top: 760, behavior: "instant" }));
    const beforeSave = await windowScroll(godPage);
    assert.ok(beforeSave > 50, "Shop Builder was not long enough to test scroll preservation.");
    await saveOffering.evaluate((element) => (element as HTMLElement).click());
    await godPage.getByText(`${fixture.swordName} was saved.`).waitFor();
    assert.ok(Math.abs((await windowScroll(godPage)) - beforeSave) <= 14, "Offering save did not preserve in-place scroll.");
    const refreshedSword = godPage.locator(".shops-offerings article").filter({ hasText: fixture.swordName });
    assert.match(await refreshedSword.innerText(), /Effective selling price[\s\S]*9 Credits[\s\S]*Shop override/);
    assert.match(await refreshedSword.innerText(), /Effective buying price[\s\S]*4 Credits[\s\S]*Shop override/);
    assert.equal(await refreshedSword.getByLabel("Limited Quantity").inputValue(), "5");
    assert.equal(await refreshedSword.getByLabel("Fulfillment").inputValue(), "service-narrative");

    await refreshedSword.getByRole("button", { name: `Move ${fixture.swordName} down` }).click();
    await godPage.getByText("Shop offering order was saved.").waitFor();
    const orderedNames = await godPage.locator(".shops-offerings article h4").allTextContents();
    assert.deepEqual(orderedNames, [fixture.serviceName, fixture.swordName]);

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
        "Campaign-authorized catalog search and offering creation",
        "service classification, limited stock, price overrides, and canonical display",
        "offering ordering and in-place scroll preservation",
        "archive read-only state and restore",
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
