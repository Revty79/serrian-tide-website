import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

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
const PASSWORD = "Town-Builder-Browser-Only!";
const SCREENSHOT_DIRECTORY = resolve(process.cwd(), "coverage", "town-builder-validation");
const DIST_DIRECTORY = `.next-town-builder-${process.pid}`;
const DIST_PATH = resolve(process.cwd(), DIST_DIRECTORY);
if (dirname(DIST_PATH) !== resolve(process.cwd()) || basename(DIST_PATH) !== DIST_DIRECTORY) throw new Error("The isolated Town Builder browser directory is unsafe.");

async function findLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  if (!port) throw new Error("A disposable Town browser-test port could not be reserved.");
  return port;
}

async function one<T extends pg.QueryResultRow>(client: PoolClient, query: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(query, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

type Fixture = {
  campaignId: number;
  alternateCampaignId: number;
  townId: number;
  otherTownId: number;
  standaloneShopId: number;
  reassignedShopId: number;
  godEmail: string;
  playerEmail: string;
  npcIds: number[];
};

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const marker = `town-browser-${Date.now()}-${process.pid}`;
  const godId = `${marker}-god`;
  const playerId = `${marker}-player`;
  const godEmail = `${godId}@example.invalid`;
  const playerEmail = `${playerId}@example.invalid`;
  const password = await hashPassword(PASSWORD);
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const account of [
      { id: godId, name: "Town Browser G.O.D.", email: godEmail, role: "god" },
      { id: playerId, name: "Town Browser Player", email: playerEmail, role: "player" },
    ]) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$1,$1)`, [account.id, account.name, account.email]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${account.id}-credential`, account.id, password]);
      await client.query("insert into user_role (user_id,role) values ($1,$2)", [account.id, account.role]);
    }
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
      max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Town Builder browser fixture',0,0,0,0,100,100,'Credits','Assigned',0,$2) returning id`, [`Town Campaign ${marker}`, godId]);
    const alternate = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
      max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Alternate Town fixture',0,0,0,0,100,100,'Credits','Assigned',0,$2) returning id`, [`Alternate Town Campaign ${marker}`, godId]);
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false)", [campaign.id, godId, playerId]);
    const town = await one<{ id: number }>(client, "insert into town (campaign_id,name,category,overview,location_notes,god_notes) values ($1,'Harbor Rest','Port Town','A working harbor.','North coast.','The old tunnels are active.') returning id", [campaign.id]);
    const otherTown = await one<{ id: number }>(client, "insert into town (campaign_id,name,category,overview) values ($1,'North Gate','Fortified Ward','A guarded trade entrance.') returning id", [campaign.id]);

    const linkedShopIds: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const shop = await one<{ id: number }>(client, "insert into shop (campaign_id,name,category,balance_credits,storefront_state) values ($1,$2,$3,$4,$5) returning id", [campaign.id, `Harbor Shop ${String(index + 1).padStart(2, "0")}`, index % 2 ? "General" : "Armorer", index * 10, index === 0 ? "open" : "closed"]);
      linkedShopIds.push(shop.id);
      await client.query("insert into town_shop_membership (town_id,shop_id,campaign_id,sort_order) values ($1,$2,$3,$4)", [town.id, shop.id, campaign.id, index]);
    }
    const standaloneShop = await one<{ id: number }>(client, "insert into shop (campaign_id,name,category,balance_credits,storefront_state) values ($1,'The Unmoored Lantern','Outfitter',222,'open') returning id", [campaign.id]);
    const reassignedShop = await one<{ id: number }>(client, "insert into shop (campaign_id,name,category,balance_credits,storefront_state) values ($1,'North Gate Provisions','Provisioner',91,'open') returning id", [campaign.id]);
    await client.query("insert into town_shop_membership (town_id,shop_id,campaign_id,sort_order) values ($1,$2,$3,0)", [otherTown.id, reassignedShop.id, campaign.id]);

    const npcIds: number[] = [];
    for (const npc of [
      { name: "Mara Quickquill", kind: "race", build: "simple", role: "Harbormaster" },
      { name: "Orin Emberhand", kind: "race", build: "detailed", role: "Smith" },
      { name: "Brinewing", kind: "creature", build: "simple", role: "Local creature" },
      { name: "Captain Vey", kind: "creature", build: "detailed", role: "Watch captain" },
    ]) {
      const created = await one<{ id: number }>(client, `insert into campaign_character
        (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,npc_role_label)
        values ($1,$2,$3,$4,$5,$6,$7) returning id`, [campaign.id, godId, npc.name, true, npc.kind, npc.build, npc.role]);
      npcIds.push(created.id);
    }
    await client.query("commit");
    return { campaignId: campaign.id, alternateCampaignId: alternate.id, townId: town.id, otherTownId: otherTown.id, standaloneShopId: standaloneShop.id, reassignedShopId: reassignedShop.id, godEmail, playerEmail, npcIds };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

async function waitForServer(server: ChildProcess, baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* Still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the Town Builder browser-test server.");
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

async function main(): Promise<void> {
  const temporaryCluster = await mkdtemp(join(tmpdir(), "serrian-town-browser-postgres-"));
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
    execFileSync(initdbExecutable, ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", dataDirectory], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-l", logPath, "-o", `-p ${postgresPort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;
    pool = new pg.Pool({ connectionString });
    await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), "drizzle") });
    const fixture = await seedFixture(pool);

    await rm(DIST_PATH, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(appPort)], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionString, BETTER_AUTH_URL: baseUrl, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: DIST_DIRECTORY },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server, baseUrl);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const godContext = await browser.newContext({ viewport: { width: 1365, height: 760 } });
    const playerContext = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const godPage = await login(godContext, baseUrl, fixture.godEmail);
    const playerPage = await login(playerContext, baseUrl, fixture.playerEmail);

    await godPage.goto(`${baseUrl}/heavens`);
    const townCard = godPage.getByRole("link", { name: /TOWN BUILDER/ });
    await townCard.waitFor();
    assert.equal(await townCard.getAttribute("href"), "/heavens/towns");
    const creationLibrary = godPage.locator("section.mt-10");
    const libraryCards = creationLibrary.locator('a[href^="/heavens/"]');
    const npcCard = creationLibrary.locator('a[href="/heavens/npcs"]');
    const townCardBox = await townCard.boundingBox();
    const npcCardBox = await npcCard.boundingBox();
    assert.equal(await libraryCards.last().getAttribute("href"), "/heavens/npcs", "NPCs is not the final Heavens library card.");
    assert.ok(townCardBox && npcCardBox && npcCardBox.width > townCardBox.width * 1.8, "The final NPC card does not span the desktop library grid.");
    await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
    await creationLibrary.screenshot({ path: join(SCREENSHOT_DIRECTORY, "heavens-library-desktop.png") });
    await godPage.setViewportSize({ width: 390, height: 900 });
    const narrowNpcBox = await npcCard.boundingBox();
    const narrowTownBox = await townCard.boundingBox();
    assert.ok(narrowNpcBox && narrowTownBox && Math.abs(narrowNpcBox.width - narrowTownBox.width) <= 2, "Narrow library cards do not share one balanced column.");
    await creationLibrary.screenshot({ path: join(SCREENSHOT_DIRECTORY, "heavens-library-narrow.png") });
    await godPage.setViewportSize({ width: 1365, height: 760 });

    await godPage.goto(`${baseUrl}/heavens/towns?campaign=${fixture.campaignId}&town=${fixture.townId}`);
    await godPage.getByRole("heading", { name: "Campaign Towns" }).waitFor();
    await godPage.getByRole("heading", { name: "Harbor Rest", exact: true }).waitFor();
    await godPage.getByLabel("Search Towns").fill("Port Town");
    assert.equal(await godPage.locator(".towns-index button").count(), 1);
    await godPage.getByLabel("Search Towns").fill("");

    const availableShop = godPage.getByLabel("Available Campaign Shop");
    assert.equal(await availableShop.locator(`option[value="${fixture.standaloneShopId}"]`).count(), 1);
    assert.equal(await availableShop.locator(`option[value="${fixture.reassignedShopId}"]`).count(), 1);
    assert.equal(await availableShop.locator("option", { hasText: "currently Harbor Rest" }).count(), 0, "Already attached Shops were offered as duplicate candidates.");
    const overview = godPage.getByLabel("Overview");
    await overview.fill("Unsaved harbor overview while organizing relationships.");
    const shopScroller = godPage.locator('[data-preserve-scroll="town-shops"]');
    await shopScroller.evaluate((element) => { element.scrollTop = 160; });
    const shopScrollBefore = await shopScroller.evaluate((element) => element.scrollTop);
    await availableShop.selectOption(String(fixture.standaloneShopId));
    await godPage.getByRole("button", { name: "Attach Shop" }).click();
    await godPage.getByText("The Unmoored Lantern attached.").waitFor();
    assert.equal(await overview.inputValue(), "Unsaved harbor overview while organizing relationships.");
    assert.ok(Math.abs((await shopScroller.evaluate((element) => element.scrollTop)) - shopScrollBefore) <= 20, "Attaching a Shop reset the Shop-list scroll.");
    assert.equal(await availableShop.locator(`option[value="${fixture.standaloneShopId}"]`).count(), 0, "Attached Shop remained available as a duplicate.");
    const attachedLantern = godPage.locator(".towns-card").filter({ hasText: "The Unmoored Lantern" });
    assert.match(await attachedLantern.innerText(), /Outfitter[\s\S]*0 assigned staff/i);
    assert.equal(await attachedLantern.getByRole("link", { name: "Open Shop Record" }).getAttribute("href"), `/heavens/shops?campaign=${fixture.campaignId}&shop=${fixture.standaloneShopId}`);
    const shopDependencyPage = await godContext.newPage();
    await shopDependencyPage.goto(`${baseUrl}/heavens/shops?campaign=${fixture.campaignId}&shop=${fixture.standaloneShopId}`);
    await shopDependencyPage.getByRole("heading", { name: "The Unmoored Lantern", exact: true }).waitFor();
    await shopDependencyPage.getByRole("button", { name: "Delete Shop", exact: true }).click();
    const shopDeleteDialog = shopDependencyPage.getByRole("dialog");
    await shopDeleteDialog.getByText(/attached to Harbor Rest/).waitFor();
    assert.equal(await shopDeleteDialog.getByRole("button", { name: "Permanently Delete Shop" }).isDisabled(), true);
    assert.equal(await shopDeleteDialog.getByRole("link", { name: "Open the Town Builder" }).getAttribute("href"), `/heavens/towns?campaign=${fixture.campaignId}&town=${fixture.townId}`);
    await shopDependencyPage.close();

    await availableShop.selectOption(String(fixture.reassignedShopId));
    assert.equal(await godPage.getByRole("button", { name: "Reassign Here" }).isVisible(), true);
    godPage.once("dialog", (dialog) => dialog.accept());
    await godPage.getByRole("button", { name: "Reassign Here" }).click();
    await godPage.getByText("North Gate Provisions reassigned to this Town.").waitFor();
    const reassignment = await pool.query<{ town_id: number; count: number }>("select min(town_id)::int town_id,count(*)::int count from town_shop_membership where shop_id=$1", [fixture.reassignedShopId]);
    assert.deepEqual(reassignment.rows[0], { town_id: fixture.townId, count: 1 });
    assert.deepEqual((await pool.query("select balance_credits,storefront_state from shop where id=$1", [fixture.reassignedShopId])).rows, [{ balance_credits: 91, storefront_state: "open" }]);

    const npcOptions = godPage.getByLabel("Available Campaign NPC");
    for (const npcId of fixture.npcIds) assert.equal(await npcOptions.locator(`option[value="${npcId}"]`).count(), 1, `Eligible NPC ${npcId} was absent.`);
    await godPage.getByLabel("Search NPCs").fill("creature");
    assert.equal(await npcOptions.locator("option").count(), 3, "NPC kind search did not combine with the eligible Campaign pool.");
    await godPage.getByLabel("Search NPCs").fill("");
    await npcOptions.selectOption(String(fixture.npcIds[0]));
    await godPage.getByLabel("Town relationship").last().fill("Harbormaster");
    await godPage.getByLabel("Town note").last().fill("Knows every incoming captain.");
    await godPage.getByRole("button", { name: "Associate NPC" }).click();
    await godPage.getByText("Mara Quickquill associated.").waitFor();
    assert.equal(await overview.inputValue(), "Unsaved harbor overview while organizing relationships.");
    assert.equal(await npcOptions.locator(`option[value="${fixture.npcIds[0]}"]`).count(), 0, "Associated NPC remained available as a duplicate.");
    const mara = godPage.locator(".towns-card.is-editable").filter({ hasText: "Mara Quickquill" });
    assert.equal(await mara.getByLabel("Town relationship").inputValue(), "Harbormaster");
    assert.equal(await mara.getByRole("link", { name: "Open NPC Record" }).getAttribute("href"), `/heavens/npcs/${fixture.npcIds[0]}?campaign=${fixture.campaignId}`);

    await godPage.getByRole("button", { name: "New Place" }).click();
    const placeForm = godPage.locator(".towns-place-form");
    await placeForm.getByLabel("Place name").fill("Old Lighthouse");
    await placeForm.getByLabel("Type / category").fill("Landmark");
    await placeForm.getByLabel("Description").fill("A storm-worn tower above the western point.");
    await placeForm.getByLabel("Location notes").fill("West of the breakwater.");
    await placeForm.getByLabel("G.O.D. notes").fill("A hidden chamber opens at low tide.");
    await placeForm.getByRole("button", { name: "Create Place" }).click();
    await godPage.getByText("Place created.").waitFor();
    const lighthouse = godPage.locator(".towns-place").filter({ hasText: "Old Lighthouse" });
    assert.match(await lighthouse.innerText(), /LANDMARK/);
    assert.equal(await lighthouse.getByLabel("Description").inputValue(), "A storm-worn tower above the western point.");
    assert.equal(await lighthouse.getByLabel("Location notes").inputValue(), "West of the breakwater.");
    assert.equal(await lighthouse.getByLabel("G.O.D. notes").inputValue(), "A hidden chamber opens at low tide.");
    await lighthouse.getByLabel("G.O.D. notes").fill("Unsaved secret preserved through Place ordering.");
    await godPage.getByRole("button", { name: "New Place" }).click();
    await placeForm.getByLabel("Place name").fill("Lower Market");
    await placeForm.getByLabel("Type / category").fill("District");
    await placeForm.getByRole("button", { name: "Create Place" }).click();
    await godPage.getByText("Place created.").waitFor();
    await lighthouse.getByRole("button", { name: "Move Old Lighthouse down" }).click();
    await godPage.getByText("Old Lighthouse moved.").waitFor();
    assert.equal(await lighthouse.getByLabel("G.O.D. notes").inputValue(), "Unsaved secret preserved through Place ordering.");
    assert.deepEqual(await godPage.locator(".towns-place h4").allTextContents(), ["Lower Market", "Old Lighthouse"]);
    await lighthouse.getByRole("button", { name: "Save Place" }).click();
    await godPage.getByText("Old Lighthouse saved.").waitFor();

    await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
    await godPage.addStyleTag({ content: ".authenticated-navigation { position: static !important; }" });
    const editor = godPage.locator(".towns-editor");
    await editor.screenshot({ path: join(SCREENSHOT_DIRECTORY, "town-builder-desktop.png") });
    await godPage.setViewportSize({ width: 390, height: 900 });
    await editor.screenshot({ path: join(SCREENSHOT_DIRECTORY, "town-builder-narrow.png") });
    await godPage.setViewportSize({ width: 1365, height: 760 });

    const archivedPlaceName = "Lower Market";
    const lowerMarket = godPage.locator(".towns-place").filter({ hasText: archivedPlaceName });
    godPage.once("dialog", (dialog) => dialog.accept("Seasonal closure"));
    await lowerMarket.getByRole("button", { name: "Archive" }).click();
    await godPage.getByText("Lower Market archived.").waitFor();
    await godPage.getByRole("button", { name: /^Archived \(1\)$/ }).click();
    const archivedMarket = godPage.locator(".towns-place").filter({ hasText: archivedPlaceName });
    assert.match(await archivedMarket.innerText(), /Archive reason: Seasonal closure/);
    await archivedMarket.getByRole("button", { name: "Restore" }).click();
    await godPage.getByText("Lower Market restored.").waitFor();
    await godPage.getByRole("button", { name: /^Active \(2\)$/ }).click();
    godPage.once("dialog", (dialog) => dialog.accept(archivedPlaceName));
    await godPage.locator(".towns-place").filter({ hasText: archivedPlaceName }).getByRole("button", { name: "Delete" }).click();
    await godPage.getByText("Lower Market permanently deleted.").waitFor();
    assert.equal(Number((await pool.query<{ count: number }>("select count(*)::int count from town_place where town_id=$1 and name=$2", [fixture.townId, archivedPlaceName])).rows[0]!.count), 0);

    await godPage.getByRole("button", { name: "Archive / Delete" }).click();
    await godPage.getByText("Attached Shops (survive as standalone Shops)").waitFor();
    godPage.once("dialog", (dialog) => dialog.accept("Winter authoring archive"));
    await godPage.getByRole("button", { name: "Archive Town" }).click();
    await godPage.getByText("Town archived.").waitFor();
    await godPage.getByRole("button", { name: /^Archived$/ }).click();
    await godPage.getByRole("button", { name: /Harbor Rest/ }).click();
    assert.equal(await godPage.locator(".towns-core").getByLabel("Name").isDisabled(), true);
    await godPage.getByRole("button", { name: "Archive / Delete" }).click();
    await godPage.getByRole("button", { name: "Restore Town" }).click();
    await godPage.getByText("Town restored.").waitFor();

    await godPage.getByRole("button", { name: /^Active$/ }).click();
    await godPage.getByRole("button", { name: /North Gate/ }).click();
    await godPage.getByRole("button", { name: "Archive / Delete" }).click();
    godPage.once("dialog", (dialog) => dialog.accept("Wrong name"));
    await godPage.getByRole("button", { name: "Permanently Delete" }).click();
    await godPage.getByText(/Type the exact name/).waitFor();
    godPage.once("dialog", (dialog) => dialog.accept("North Gate"));
    await godPage.getByRole("button", { name: "Permanently Delete" }).click();
    await godPage.getByText("Town permanently deleted; linked Shops and NPCs survived.").waitFor();
    assert.deepEqual((await pool.query("select count(*)::int towns,(select count(*)::int from shop where campaign_id=$1) shops from town where id=$2", [fixture.campaignId, fixture.otherTownId])).rows[0], { towns: 0, shops: 13 });

    const campaignSelect = godPage.getByLabel("Town Campaign");
    await campaignSelect.selectOption(String(fixture.alternateCampaignId));
    await godPage.getByText("No active Towns match this view.").waitFor();
    assert.equal(await godPage.locator(".towns-editor__header").count(), 0, "The previous Campaign Town remained rendered.");

    await playerPage.goto(`${baseUrl}/heavens/towns`);
    await playerPage.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
    assert.equal(await playerPage.getByRole("heading", { name: "Choose Your Path" }).isVisible(), true);
    assert.equal(await godPage.getByRole("button", { name: /Enter Shop|Purchase|Simulate/ }).count(), 0);

    console.log(JSON.stringify({ passed: true, verified: [
      "Town Builder navigation and Campaign scoping",
      "Shop attach, duplicate prevention, preserved Shop state, scroll, and atomic reassignment",
      "all four persistent NPC eligibility variants, search, add, duplicate prevention, and open-record link",
      "Town-owned Place creation, editing, ordering, archive, restore, and exact-confirmed deletion",
      "unsaved Town and Place drafts survive relationship mutations",
      "Town archive read-only behavior, restore, lifecycle preview, exact-confirmed delete, and referenced-record survival",
      "Shop delete review reports its Town dependency and requires detachment or reassignment",
      "Campaign switches clear stale Town state and players are rejected",
      "desktop and narrow screenshots with no runtime Town or transaction controls",
    ] }, null, 2));
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
    try { if (clusterStarted && existsSync(join(dataDirectory, "postmaster.pid"))) execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true }); } catch (error) { cleanupErrors.push(error); }
    try { await rm(temporaryCluster, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await rm(DIST_PATH, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await writeFile(tsconfigPath, tsconfigBefore); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Town Builder browser-test cleanup failed.");
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
