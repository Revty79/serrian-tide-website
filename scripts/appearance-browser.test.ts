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
import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";

const defaultWindowsPostgresBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN
  ?? (existsSync(defaultWindowsPostgresBin) ? defaultWindowsPostgresBin : "");
const initdbExecutable = postgresBin ? join(postgresBin, "initdb.exe") : "initdb";
const pgCtlExecutable = postgresBin ? join(postgresBin, "pg_ctl.exe") : "pg_ctl";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = "Appearance-Browser-Only!";
const SCREENSHOT_DIRECTORY = resolve(process.cwd(), "coverage", "appearance-validation");
const DIST_DIRECTORY = `.next-appearance-${process.pid}`;
const DIST_PATH = resolve(process.cwd(), DIST_DIRECTORY);
if (dirname(DIST_PATH) !== resolve(process.cwd()) || basename(DIST_PATH) !== DIST_DIRECTORY) {
  throw new Error("The isolated Appearance browser directory is unsafe.");
}

async function findLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  if (!port) throw new Error("A disposable Appearance browser-test port could not be reserved.");
  return port;
}

async function one<T extends pg.QueryResultRow>(client: PoolClient, query: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(query, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

type Fixture = {
  adminEmail: string;
  playerEmail: string;
  campaignId: number;
  shopId: number;
  townId: number;
  characterId: number;
};

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const marker = `appearance-browser-${Date.now()}-${process.pid}`;
  const adminId = `${marker}-admin`;
  const playerId = `${marker}-player`;
  const adminEmail = `${adminId}@example.invalid`;
  const playerEmail = `${playerId}@example.invalid`;
  const password = await hashPassword(PASSWORD);
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const account of [
      { id: adminId, name: "Appearance Administrator", email: adminEmail },
      { id: playerId, name: "Appearance Player", email: playerEmail },
    ]) {
      await client.query(
        `insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$1,$1)`,
        [account.id, account.name, account.email],
      );
      await client.query(
        `insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`,
        [`${account.id}-credential`, account.id, password],
      );
    }
    await client.query("insert into user_role (user_id,role) values ($1,'admin'),($1,'god'),($2,'player')", [adminId, playerId]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
      max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Appearance browser fixture',0,0,0,0,100,100,'Credits','Assigned',0,$2) returning id`, [`Appearance Campaign ${marker}`, adminId]);
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,false)", [campaign.id, playerId]);
    const shop = await one<{ id: number }>(client, "insert into shop (campaign_id,name,category,balance_credits,storefront_state) values ($1,'Chromatic Lantern','General',250,'open') returning id", [campaign.id]);
    const town = await one<{ id: number }>(client, "insert into town (campaign_id,name,category,overview) values ($1,'Prism Harbor','Port Town','A representative themed Town.') returning id", [campaign.id]);
    const character = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Mira Tideglass') returning id", [campaign.id, playerId]);
    await client.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps) values ($1,0,0)", [character.id]);
    for (const attributeKey of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
      await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,25)", [character.id, attributeKey]);
    }
    await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [character.id]);
    await client.query("commit");
    return { adminEmail, playerEmail, campaignId: campaign.id, shopId: shop.id, townId: town.id, characterId: character.id };
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
  throw new Error("Timed out waiting for the Appearance browser-test server.");
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

async function rootVariable(page: Page, name: string): Promise<string> {
  return page.evaluate((propertyName) => getComputedStyle(document.documentElement).getPropertyValue(propertyName).trim().toUpperCase(), name);
}

type ComputedThemeStyle = {
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  borderTopColor: string;
};

async function computedThemeStyle(locator: Locator): Promise<ComputedThemeStyle> {
  await locator.waitFor();
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderTopColor: style.borderTopColor,
    };
  });
}

async function resolveCssValue(page: Page, property: string, value: string): Promise<string> {
  return page.evaluate(({ propertyName, propertyValue }) => {
    const probe = document.createElement("span");
    probe.style.setProperty("position", "fixed");
    probe.style.setProperty("visibility", "hidden");
    probe.style.setProperty(propertyName, propertyValue);
    document.body.append(probe);
    const resolved = getComputedStyle(probe).getPropertyValue(propertyName);
    probe.remove();
    return resolved;
  }, { propertyName: property, propertyValue: value });
}

async function assertComputedTheme(
  page: Page,
  selector: string,
  expectations: Partial<Record<"color" | "background-color" | "border-top-color", string>>,
): Promise<void> {
  const element = page.locator(selector).first();
  const actual = await computedThemeStyle(element);
  const actualByProperty = {
    color: actual.color,
    "background-color": actual.backgroundColor,
    "border-top-color": actual.borderTopColor,
  };
  for (const [property, expression] of Object.entries(expectations)) {
    assert.equal(
      actualByProperty[property as keyof typeof actualByProperty],
      await resolveCssValue(page, property, expression),
      `${selector} did not resolve ${property} from ${expression}.`,
    );
  }
}

async function previewThemeStyles(page: Page): Promise<Record<string, ComputedThemeStyle>> {
  const preview = page.locator("[data-appearance-preview]");
  return {
    preview: await computedThemeStyle(preview),
    brand: await computedThemeStyle(preview.locator("nav strong")),
    surface: await computedThemeStyle(preview.locator("article")),
    input: await computedThemeStyle(preview.locator("input")),
    secondaryButton: await computedThemeStyle(preview.locator("button").nth(1)),
  };
}

async function main(): Promise<void> {
  const temporaryCluster = await mkdtemp(join(tmpdir(), "serrian-appearance-browser-postgres-"));
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
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const anonymousContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const adminPage = await login(adminContext, baseUrl, fixture.adminEmail);
    const playerPage = await login(playerContext, baseUrl, fixture.playerEmail);

    await adminPage.goto(`${baseUrl}/admin`);
    assert.equal(await adminPage.getByRole("link", { name: /APPEARANCE/ }).getAttribute("href"), "/admin/appearance");
    await adminPage.getByRole("link", { name: /APPEARANCE/ }).click();
    await adminPage.getByRole("heading", { name: "Site Appearance" }).waitFor();
    assert.equal(await rootVariable(adminPage, "--st-primary"), "#4DA97D");
    assert.equal(await adminPage.locator("html").getAttribute("data-appearance-preset"), "serrian-tide");

    const preview = adminPage.locator("[data-appearance-preview]");
    const controls = adminPage.locator('[aria-labelledby="appearance-controls-heading"]');
    const savedPreviewStyles = await previewThemeStyles(adminPage);
    const savedSurroundingStyles = await computedThemeStyle(controls);
    await adminPage.getByRole("button", { name: "Classic" }).click();
    await adminPage.waitForFunction(() => getComputedStyle(document.querySelector("[data-appearance-preview]")!).getPropertyValue("--st-primary").trim().toUpperCase() === "#8B5CF6");
    const classicPreviewStyles = await previewThemeStyles(adminPage);
    assert.equal(await preview.evaluate((element) => getComputedStyle(element).getPropertyValue("--st-primary").trim().toUpperCase()), "#8B5CF6");
    assert.notEqual(classicPreviewStyles.brand.backgroundImage, savedPreviewStyles.brand.backgroundImage, "The preview logo gradient did not react to the draft preset.");
    assert.notEqual(classicPreviewStyles.input.backgroundColor, savedPreviewStyles.input.backgroundColor, "The preview input did not react to the draft preset.");
    assert.notEqual(classicPreviewStyles.input.borderTopColor, savedPreviewStyles.input.borderTopColor, "The preview input border did not react to the draft preset.");
    assert.notEqual(classicPreviewStyles.secondaryButton.backgroundColor, savedPreviewStyles.secondaryButton.backgroundColor, "The preview secondary action did not react to the draft preset.");
    assert.notEqual(classicPreviewStyles.surface.backgroundColor, savedPreviewStyles.surface.backgroundColor, "The preview panel did not react to the draft preset.");
    assert.deepEqual(await computedThemeStyle(controls), savedSurroundingStyles, "The unsaved draft changed the surrounding Appearance page.");
    assert.equal(await rootVariable(adminPage, "--st-primary"), "#4DA97D", "Unsaved preview leaked into the live document.");
    await adminPage.getByRole("button", { name: "Cancel changes" }).click();
    await adminPage.waitForFunction(() => getComputedStyle(document.querySelector("[data-appearance-preview]")!).getPropertyValue("--st-primary").trim().toUpperCase() === "#4DA97D");
    assert.equal(await preview.evaluate((element) => getComputedStyle(element).getPropertyValue("--st-primary").trim().toUpperCase()), "#4DA97D");
    assert.deepEqual(await previewThemeStyles(adminPage), savedPreviewStyles, "Cancel did not restore every computed preview treatment.");

    await adminPage.getByRole("button", { name: "Classic" }).click();
    await adminPage.waitForFunction(() => getComputedStyle(document.querySelector("[data-appearance-preview]")!).getPropertyValue("--st-primary").trim().toUpperCase() === "#8B5CF6");
    const classicBeforeSave = await previewThemeStyles(adminPage);
    await adminPage.getByRole("button", { name: "Save appearance" }).click();
    await adminPage.getByText("Site appearance saved.", { exact: false }).waitFor();
    assert.equal(await rootVariable(adminPage, "--st-primary"), "#8B5CF6");
    assert.deepEqual(await previewThemeStyles(adminPage), classicBeforeSave, "Publishing changed the previewed Classic styles.");
    await assertComputedTheme(adminPage, "[data-appearance-preview]", {
      color: "var(--st-text)",
      "background-color": "var(--st-page)",
      "border-top-color": "var(--st-border)",
    });
    await assertComputedTheme(adminPage, "[data-appearance-preview] input", {
      color: "var(--st-text)",
      "background-color": "var(--st-input)",
      "border-top-color": "var(--st-border-strong)",
    });
    assert.deepEqual((await pool.query("select preset_id,primary_accent from site_appearance_setting where key='site'")).rows, [{ preset_id: "classic", primary_accent: "#8B5CF6" }]);

    await adminPage.reload();
    await preview.waitFor();
    assert.deepEqual(await previewThemeStyles(adminPage), classicBeforeSave, "A fresh load did not reproduce the previewed Classic styles.");

    await adminPage.getByRole("button", { name: "Serrian Tide" }).click();
    await adminPage.waitForFunction(() => getComputedStyle(document.querySelector("[data-appearance-preview]")!).getPropertyValue("--st-primary").trim().toUpperCase() === "#4DA97D");
    assert.notDeepEqual(await previewThemeStyles(adminPage), classicBeforeSave, "The Serrian Tide preset was not visually distinct from Classic.");
    assert.equal(await rootVariable(adminPage, "--st-primary"), "#8B5CF6", "The unsaved Serrian Tide preset leaked into the document root.");
    await adminPage.getByRole("button", { name: "Cancel changes" }).click();
    await adminPage.waitForFunction(() => getComputedStyle(document.querySelector("[data-appearance-preview]")!).getPropertyValue("--st-primary").trim().toUpperCase() === "#8B5CF6");
    assert.deepEqual(await previewThemeStyles(adminPage), classicBeforeSave, "Cancel did not restore the saved Classic preview.");

    const anonymousPage = await anonymousContext.newPage();
    const response = await anonymousPage.goto(baseUrl);
    assert.ok(response);
    assert.match(await response!.text(), /data-appearance-preset="classic"/);
    assert.equal(await rootVariable(anonymousPage, "--st-primary"), "#8B5CF6");

    const custom = {
      "Page background hex value": "#06110F",
      "Panel / surface background hex value": "#101A18",
      "Primary accent hex value": "#58B88B",
      "Secondary accent hex value": "#E6C75A",
      "Main text hex value": "#F1F3E8",
      "Muted text hex value": "#AAB9B0",
    };
    for (const [label, value] of Object.entries(custom)) await adminPage.getByLabel(label).fill(value);
    await adminPage.waitForFunction(() => getComputedStyle(document.querySelector("[data-appearance-preview]")!).getPropertyValue("--st-primary").trim().toUpperCase() === "#58B88B");
    const customBeforeSave = await previewThemeStyles(adminPage);
    assert.notDeepEqual(customBeforeSave, classicBeforeSave, "The custom palette was not visibly different from Classic.");
    assert.equal(await rootVariable(adminPage, "--st-primary"), "#8B5CF6", "The unsaved custom palette leaked into the document root.");
    await adminPage.getByRole("button", { name: "Save appearance" }).click();
    await adminPage.getByText("Site appearance saved.", { exact: false }).waitFor();
    assert.equal(await rootVariable(adminPage, "--st-primary"), "#58B88B");
    assert.deepEqual(await previewThemeStyles(adminPage), customBeforeSave, "Publishing changed the previewed custom styles.");
    await adminPage.reload();
    assert.equal(await adminPage.getByLabel("Main text hex value").inputValue(), "#F1F3E8");
    assert.deepEqual(await previewThemeStyles(adminPage), customBeforeSave, "A fresh load did not reproduce the previewed custom styles.");

    await adminPage.getByLabel("Main text hex value").fill("#06110F");
    await adminPage.locator('p[role="alert"]').waitFor();
    assert.equal(await adminPage.getByRole("button", { name: "Save appearance" }).isDisabled(), true);
    assert.equal((await pool.query("select main_text from site_appearance_setting where key='site'")).rows[0]!.main_text, "#F1F3E8");
    await adminPage.getByRole("button", { name: "Cancel changes" }).click();

    await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
    await adminPage.screenshot({ path: join(SCREENSHOT_DIRECTORY, "appearance-admin-desktop.png"), fullPage: true });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.reload();
    await adminPage.locator("[data-appearance-preview]").waitFor();
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Appearance overflowed the narrow viewport.");
    await adminPage.screenshot({ path: join(SCREENSHOT_DIRECTORY, "appearance-admin-narrow.png"), fullPage: true });
    await adminPage.setViewportSize({ width: 1440, height: 960 });

    await adminPage.goto(`${baseUrl}/heavens`);
    await adminPage.getByRole("heading", { name: "THE HEAVENS" }).waitFor();
    await assertComputedTheme(adminPage, "main", { color: "var(--st-text)" });
    await adminPage.screenshot({ path: join(SCREENSHOT_DIRECTORY, "heavens-themed-desktop.png"), fullPage: true });

    await adminPage.goto(`${baseUrl}/heavens/equipment`);
    await adminPage.getByRole("heading", { name: "Equipment", exact: true }).waitFor();
    await assertComputedTheme(adminPage, ".items-page", { color: "var(--st-text)" });
    await assertComputedTheme(adminPage, "#item-search", {
      color: "var(--st-text)",
      "background-color": "var(--st-input)",
      "border-top-color": "color-mix(in srgb, var(--st-text-strong) 12%, transparent)",
    });
    const equipmentPanelStyle = await computedThemeStyle(adminPage.locator(".skill-library"));
    assert.notEqual(equipmentPanelStyle.backgroundImage, "none", "Equipment retained no themed panel treatment.");
    await adminPage.screenshot({ path: join(SCREENSHOT_DIRECTORY, "equipment-themed-desktop.png"), fullPage: true });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Equipment overflowed the narrow viewport.");
    await adminPage.screenshot({ path: join(SCREENSHOT_DIRECTORY, "equipment-themed-narrow.png"), fullPage: true });
    await adminPage.setViewportSize({ width: 1440, height: 960 });

    await adminPage.goto(`${baseUrl}/heavens/skills`);
    await adminPage.getByRole("heading", { name: "Skills", exact: true }).waitFor();
    await assertComputedTheme(adminPage, ".skills-page", { color: "var(--st-text)" });
    await assertComputedTheme(adminPage, ".skill-library input", {
      color: "var(--st-text)",
      "background-color": "var(--st-input)",
      "border-top-color": "color-mix(in srgb, var(--st-text-strong) 12%, transparent)",
    });
    assert.notEqual((await computedThemeStyle(adminPage.locator(".skill-library"))).backgroundImage, "none", "Skills retained no themed panel treatment.");

    await adminPage.goto(`${baseUrl}/heavens/tabletop?campaign=${fixture.campaignId}`);
    await adminPage.getByRole("heading", { name: "Tabletop Operations" }).waitFor();
    await assertComputedTheme(adminPage, ".tabletop-page", { color: "var(--st-text)" });
    await assertComputedTheme(adminPage, ".tabletop-campaigns select", {
      color: "var(--st-text)",
      "background-color": "var(--st-surface)",
      "border-top-color": "color-mix(in srgb, var(--st-text-strong) 14%, transparent)",
    });

    await adminPage.goto(`${baseUrl}/chat`);
    await adminPage.locator("[data-chat-workspace]").waitFor();
    await assertComputedTheme(adminPage, "[data-chat-workspace]", { color: "var(--st-text)" });
    await assertComputedTheme(adminPage, "[data-chat-workspace] h1", { color: "var(--st-text)" });
    const crossroadsWorkspaceStyle = await computedThemeStyle(adminPage.locator('[data-chat-workspace] [aria-label="Selected conversation"]'));
    assert.notEqual(crossroadsWorkspaceStyle.backgroundImage, "none", "Crossroads retained no themed conversation surface.");
    await adminPage.setViewportSize({ width: 390, height: 844 });
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Crossroads overflowed the narrow viewport.");
    await adminPage.screenshot({ path: join(SCREENSHOT_DIRECTORY, "crossroads-themed-narrow.png"), fullPage: true });
    await adminPage.setViewportSize({ width: 1440, height: 960 });

    await adminPage.goto(`${baseUrl}/heavens/shops?campaign=${fixture.campaignId}&shop=${fixture.shopId}`);
    await adminPage.getByRole("heading", { name: "Chromatic Lantern", exact: true }).waitFor();
    await assertComputedTheme(adminPage, ".shops-panel", {
      "background-color": "var(--st-surface-raised)",
      "border-top-color": "var(--st-border)",
    });
    await adminPage.addStyleTag({ content: ".authenticated-navigation { position: static !important; }" });
    await adminPage.locator(".shops-editor").screenshot({ path: join(SCREENSHOT_DIRECTORY, "shop-themed-desktop.png") });
    await adminPage.getByRole("button", { name: "Delete Shop", exact: true }).click();
    const shopDialog = adminPage.locator("dialog.shops-dialog[open]");
    await shopDialog.waitFor();
    await assertComputedTheme(adminPage, "dialog.shops-dialog[open]", {
      color: "var(--st-text)",
      "background-color": "var(--st-page)",
      "border-top-color": "color-mix(in srgb, var(--st-secondary) 25%, transparent)",
    });
    const backdropColor = await shopDialog.evaluate((element) => getComputedStyle(element, "::backdrop").backgroundColor);
    assert.equal(backdropColor, await resolveCssValue(adminPage, "background-color", "color-mix(in srgb, var(--st-page) 72%, transparent)"), "The Shop overlay backdrop did not inherit the published page color.");
    await adminPage.screenshot({ path: join(SCREENSHOT_DIRECTORY, "shop-delete-overlay-themed-desktop.png"), fullPage: true });
    await shopDialog.getByRole("button", { name: "Cancel" }).click();

    await adminPage.goto(`${baseUrl}/heavens/towns?campaign=${fixture.campaignId}&town=${fixture.townId}`);
    await adminPage.getByRole("heading", { name: "Prism Harbor", exact: true }).waitFor();
    await assertComputedTheme(adminPage, ".towns-panel", {
      "background-color": "var(--st-surface-raised)",
      "border-top-color": "var(--st-border)",
    });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.addStyleTag({ content: ".authenticated-navigation { position: static !important; }" });
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Town Builder overflowed the narrow viewport.");
    await adminPage.locator(".towns-editor").screenshot({ path: join(SCREENSHOT_DIRECTORY, "town-themed-narrow.png") });

    await playerPage.goto(`${baseUrl}/realms`);
    const realmSelectors = playerPage.locator(".realms-control-grid select");
    await realmSelectors.nth(0).selectOption(String(fixture.campaignId));
    await realmSelectors.nth(1).locator(`option[value="${fixture.characterId}"]`).waitFor({ state: "attached" });
    await realmSelectors.nth(1).selectOption(String(fixture.characterId));
    await assertComputedTheme(playerPage, "main", { color: "var(--st-text)" });
    await playerPage.screenshot({ path: join(SCREENSHOT_DIRECTORY, "realms-themed-narrow.png"), fullPage: true });
    await playerPage.goto(`${baseUrl}/realms/characters/${fixture.characterId}`);
    await playerPage.getByRole("heading", { name: "Character Creation" }).waitFor();
    await playerPage.getByText(/Character: Mira Tideglass/).waitFor();
    await assertComputedTheme(playerPage, "main", { color: "var(--st-text)" });

    await playerPage.goto(`${baseUrl}/admin/appearance`);
    await playerPage.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
    assert.equal(await playerPage.getByRole("heading", { name: "Choose Your Path" }).isVisible(), true);

    console.log(JSON.stringify({ passed: true, verified: [
      "admin-only Appearance navigation",
      "preset selection, isolated preview, cancel, publish, cache invalidation, and SSR hydration",
      "custom color persistence and invalid-contrast rejection",
      "computed theme styles across Equipment, Skills, Tabletop, Crossroads, Shops, Towns, Realms, and Character routes",
      "desktop, narrow, and overlay screenshots",
    ], screenshotDirectory: SCREENSHOT_DIRECTORY }, null, 2));
    await Promise.all([adminContext.close(), playerContext.close(), anonymousContext.close()]);
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
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Appearance browser-test cleanup failed.");
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
