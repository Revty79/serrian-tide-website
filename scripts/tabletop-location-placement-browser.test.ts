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
const chromeExecutable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const password = "Location-Browser-Only!";
const screenshotDirectory = resolve(process.cwd(), "coverage", "tabletop-location-placement-validation");
const distDirectory = `.next-tabletop-locations-${process.pid}`;
const distPath = resolve(process.cwd(), distDirectory);
if (dirname(distPath) !== resolve(process.cwd()) || basename(distPath) !== distDirectory) {
  throw new Error("The isolated location-placement browser directory is unsafe.");
}

async function findLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => (
    error ? rejectClose(error) : resolveClose()
  )));
  if (!port) throw new Error("A disposable location browser-test port could not be reserved.");
  return port;
}

async function one<T extends pg.QueryResultRow>(client: PoolClient, query: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(query, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

type Fixture = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  townId: number;
  shopId: number;
  standaloneShopId: number;
  characterId: number;
  godEmail: string;
  playerEmail: string;
};

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const marker = `location-browser-${Date.now()}-${process.pid}`;
  const godId = `${marker}-god`;
  const playerId = `${marker}-player`;
  const godEmail = `${godId}@example.invalid`;
  const playerEmail = `${playerId}@example.invalid`;
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const account of [
      { id: godId, name: "Location Browser G.O.D.", email: godEmail, role: "god" },
      { id: playerId, name: "Location Browser Player", email: playerEmail, role: "player" },
    ]) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username)
        values ($1,$2,$3,true,$1,$1)`, [account.id, account.name, account.email]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
        values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${account.id}-credential`, account.id, passwordHash]);
      await client.query("insert into user_role (user_id,role) values ($1,$2)", [account.id, account.role]);
    }
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
      max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ('Lantern Coast Campaign','A live location-placement browser fixture.',0,0,0,0,100,100,'Credits','Assigned',0,$1) returning id`, [godId]);
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false)", [campaign.id, godId, playerId]);
    const character = await one<{ id: number }>(client, `insert into campaign_character
      (campaign_id,player_user_id,name) values ($1,$2,'Elia Marrow') returning id`, [campaign.id, playerId]);
    await client.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps) values ($1,0,0)", [character.id]);
    for (const attributeKey of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
      await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,25)", [character.id, attributeKey]);
    }
    await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [character.id]);
    const session = await one<{ id: number }>(client, `insert into campaign_session
      (campaign_id,title,sequence_number,status,started_at) values ($1,'Lantern Coast Session',1,'active',now()) returning id`, [campaign.id]);
    const scene = await one<{ id: number }>(client, `insert into campaign_session_scene
      (session_id,campaign_id,sequence_number,title,status,location_label,description,started_at)
      values ($1,$2,1,'Arrival at Lantern Harbor','active','Outer Piers','The party reaches the harbor.',now()) returning id`, [session.id, campaign.id]);
    await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0)", [session.id, campaign.id, character.id]);
    await client.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,0)", [scene.id, session.id, campaign.id, character.id]);
    const town = await one<{ id: number }>(client, `insert into town
      (campaign_id,name,category,overview,location_notes,god_notes)
      values ($1,'Lantern Harbor','Port Town','Amber lanterns line a sheltered harbor.','Private smuggler route','The harbor master is compromised.') returning id`, [campaign.id]);
    const shop = await one<{ id: number }>(client, `insert into shop
      (campaign_id,name,category,description,location_notes,balance_credits,storefront_state)
      values ($1,'Brass Compass','Navigation','Charts, sextants, and voyage provisions.','Private supplier notes',88,'open') returning id`, [campaign.id]);
    const standalone = await one<{ id: number }>(client, `insert into shop
      (campaign_id,name,category,description,location_notes,balance_credits,storefront_state)
      values ($1,'Night Cart','Street vendor','A shuttered cart beneath a striped awning.','Private route',34,'closed') returning id`, [campaign.id]);
    await client.query("insert into town_shop_membership (town_id,shop_id,campaign_id,sort_order) values ($1,$2,$3,0)", [town.id, shop.id, campaign.id]);
    await client.query(`insert into town_place (town_id,campaign_id,name,category,description,location_notes,god_notes,sort_order)
      values ($1,$2,'Signal Tower','Landmark','A brass signal tower above the piers.','Private stair','Hidden lens',0)`, [town.id, campaign.id]);
    const npc = await one<{ id: number }>(client, `insert into campaign_character
      (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,npc_role_label)
      values ($1,$2,'Mira Voss',true,'race','detailed','Harbormaster') returning id`, [campaign.id, godId]);
    const creatureNpc = await one<{ id: number }>(client, `insert into campaign_character
      (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,npc_role_label)
      values ($1,$2,'Harbor Drake',true,'creature','detailed','Dock guardian') returning id`, [campaign.id, godId]);
    await client.query("insert into town_npc_association (town_id,campaign_id,npc_character_id,relationship_label,sort_order) values ($1,$2,$3,'Harbormaster',0),($1,$2,$4,'Dock guardian',1)", [town.id, campaign.id, npc.id, creatureNpc.id]);
    await client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id,responsibility_label,is_primary_contact,sort_order) values ($1,$2,$3,'Navigator',true,0)", [shop.id, campaign.id, npc.id]);
    await client.query("commit");
    return {
      campaignId: campaign.id,
      sessionId: session.id,
      sceneId: scene.id,
      townId: town.id,
      shopId: shop.id,
      standaloneShopId: standalone.id,
      characterId: character.id,
      godEmail,
      playerEmail,
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
    } catch { /* Still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the location-placement browser-test server.");
}

async function login(context: BrowserContext, baseUrl: string, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
  return page;
}

async function main(): Promise<void> {
  const temporaryCluster = await mkdtemp(join(tmpdir(), "serrian-location-browser-postgres-"));
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
    await rm(distPath, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(appPort)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        BETTER_AUTH_URL: baseUrl,
        NEXT_TELEMETRY_DISABLED: "1",
        SERRIAN_TEST_NEXT_DIST_DIR: distDirectory,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server, baseUrl);
    browser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
    const godContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const godPage = await login(godContext, baseUrl, fixture.godEmail);
    const playerPage = await login(playerContext, baseUrl, fixture.playerEmail);
    await mkdir(screenshotDirectory, { recursive: true });

    await godPage.goto(`${baseUrl}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}`);
    await godPage.getByRole("heading", { name: "Campaign Sessions" }).waitFor();
    const intro = godPage.getByRole("dialog");
    if (await intro.count()) await intro.getByRole("button", { name: "Return to Tabletop Operations" }).click();
    await godPage.getByRole("button", { name: /Roster & Prep/ }).click();
    await godPage.getByRole("heading", { name: "Towns & independent Shops" }).waitFor();
    const townPrepSection = godPage.getByRole("heading", { name: "Prepare a Town" }).locator("xpath=../../..");
    const townPrep = townPrepSection.locator(".tabletop-location-option-list article").filter({ hasText: "Lantern Harbor" });
    await townPrep.getByRole("button", { name: "Prepare" }).click();
    await godPage.getByText("Lantern Harbor is prepared for this Session.").waitFor();
    const shopPrepSection = godPage.getByRole("heading", { name: "Prepare an independent Shop" }).locator("xpath=../../..");
    const shopPrep = shopPrepSection.locator(".tabletop-location-option-list article").filter({ hasText: "Night Cart" });
    await shopPrep.getByRole("button", { name: "Prepare" }).click();
    await godPage.getByText("Night Cart is prepared for independent placement.").waitFor();
    await godPage.reload();
    await godPage.getByRole("button", { name: /Roster & Prep/ }).click();
    await godPage.getByText("Lantern Harbor", { exact: true }).waitFor();
    await godPage.getByText("Night Cart", { exact: true }).waitFor();
    await godPage.locator(".tabletop-location-prep").screenshot({ path: join(screenshotDirectory, "session-preparation-desktop.png") });

    await playerPage.goto(`${baseUrl}/realms/tabletop?character=${fixture.characterId}`);
    await playerPage.getByRole("heading", { name: "Revealed locations" }).waitFor();
    await playerPage.getByText("No Scene locations have been revealed to players.").waitFor();

    await godPage.getByRole("button", { name: /Scenes/ }).click();
    await godPage.getByRole("heading", { name: "Location directory & player reveal" }).waitFor();
    await godPage.getByLabel("Campaign Town").selectOption(String(fixture.townId));
    await godPage.getByText("INCLUSION PREVIEW").waitFor();
    assert.equal(await godPage.locator(".tabletop-location-preview input:checked").count(), 4, "Town content did not default to selected.");
    await godPage.getByRole("button", { name: "Add Town to Scene", exact: true }).click();
    await godPage.getByText("Lantern Harbor and its selected contents were added hidden.").waitFor();
    assert.equal(Number((await pool.query("select count(*)::int value from campaign_session_scene_town where scene_id=$1 and town_id=$2", [fixture.sceneId, fixture.townId])).rows[0].value), 1);
    await godPage.reload();
    await godPage.getByRole("button", { name: /Scenes/ }).click();
    await godPage.getByRole("heading", { name: "Location directory & player reveal" }).waitFor();
    await godPage.getByLabel("Campaign Shop").selectOption(String(fixture.standaloneShopId));
    assert.match(await godPage.locator(".tabletop-shop-preview").innerText(), /Closed.*placement will not change this state/i);
    await godPage.getByRole("button", { name: "Add Shop to Scene", exact: true }).click();
    await godPage.getByText("Shop placed.").waitFor();
    assert.equal(Number((await pool.query("select count(*)::int value from campaign_session_scene_shop where scene_id=$1 and shop_id=$2", [fixture.sceneId, fixture.standaloneShopId])).rows[0].value), 1);
    await godPage.reload();
    await godPage.getByRole("button", { name: /Scenes/ }).click();
    await godPage.getByRole("heading", { name: "Location directory & player reveal" }).waitFor();
    const directory = godPage.locator(".tabletop-scene-locations");
    assert.match(await directory.innerText(), /Hidden from players/);
    await directory.screenshot({ path: join(screenshotDirectory, "scene-directory-hidden-desktop.png") });
    assert.equal((await pool.query("select storefront_state,balance_credits from shop where id=$1", [fixture.standaloneShopId])).rows[0]?.storefront_state, "closed");

    await directory.getByRole("button", { name: "Reveal Town + Included" }).click();
    await godPage.getByText("Lantern Harbor and all included content are revealed.").waitFor();
    const independent = godPage.locator(".tabletop-independent-shops").filter({ hasText: "Night Cart" });
    await independent.getByRole("button", { name: "Reveal" }).click();
    await godPage.getByText("Night Cart is revealed.").waitFor();
    await playerPage.getByText("Lantern Harbor", { exact: true }).waitFor({ timeout: 20_000 });
    await playerPage.getByText("Night Cart", { exact: true }).waitFor({ timeout: 20_000 });
    const playerDirectory = playerPage.getByRole("heading", { name: "Revealed locations" }).locator("xpath=../../..");
    const publicText = await playerDirectory.innerText();
    for (const forbidden of ["Private smuggler route", "compromised", "Private supplier notes", "88", "Enter Shop", "Purchase", "Sell Item"]) {
      assert.equal(publicText.includes(forbidden), false, `Player directory leaked or exposed ${forbidden}.`);
    }
    assert.match(publicText, /Brass Compass[\s\S]*Open/i);
    assert.match(publicText, /Night Cart[\s\S]*Closed/i);
    assert.equal(await playerPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await playerDirectory.screenshot({ path: join(screenshotDirectory, "player-directory-narrow.png") });

    await pool.query(`insert into town_place (town_id,campaign_id,name,category,description,sort_order)
      values ($1,$2,'Moon Bridge','Crossing','A newly authored canal crossing.',1)`, [fixture.townId, fixture.campaignId]);
    await directory.getByRole("button", { name: "Preview Refresh" }).click();
    const refreshDialog = godPage.getByRole("dialog", { name: "Lantern Harbor" });
    await refreshDialog.getByText(/\+1.*Moon Bridge/).waitFor();
    await refreshDialog.locator(":scope > section").screenshot({ path: join(screenshotDirectory, "refresh-preview-desktop.png") });
    await refreshDialog.getByRole("button", { name: "Apply 1 changes" }).click();
    await godPage.getByText("Lantern Harbor placement was refreshed.").waitFor();
    const moonBridge = directory.getByText("Moon Bridge", { exact: true }).locator("xpath=../..");
    assert.match(await moonBridge.innerText(), /Hidden/);
    assert.equal(Number((await pool.query("select count(*)::int value from campaign_session_encounter_participant where scene_id=$1", [fixture.sceneId])).rows[0].value), 0);
    assert.equal(await godPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await directory.screenshot({ path: join(screenshotDirectory, "scene-directory-revealed-desktop.png") });

    console.log(JSON.stringify({ passed: true, screenshots: [
      "session-preparation-desktop.png",
      "scene-directory-hidden-desktop.png",
      "scene-directory-revealed-desktop.png",
      "refresh-preview-desktop.png",
      "player-directory-narrow.png",
    ], verified: [
      "Session Town and independent Shop preparation",
      "default-inclusive Town preview and hidden placement",
      "closed standalone Shop state preservation",
      "G.O.D. reveal controls and live Player refresh",
      "narrow public projection without private notes, economy state, or Shop entry controls",
      "explicit refresh preview with newly included content hidden",
      "no Encounter enrollment and no horizontal overflow",
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
    try {
      if (clusterStarted && existsSync(join(dataDirectory, "postmaster.pid"))) {
        execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
      }
    } catch (error) { cleanupErrors.push(error); }
    try { await rm(temporaryCluster, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await rm(distPath, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await writeFile(tsconfigPath, tsconfigBefore); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Location-placement browser-test cleanup failed.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
