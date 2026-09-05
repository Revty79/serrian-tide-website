import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the recursive Skill browser workflow.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing recursive Skill browser fixtures outside a loopback _dev database.");
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.RECURSIVE_SKILL_BROWSER_PORT ?? 3121);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-recursive-skill-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (dirname(TEST_DIST_PATH) !== resolve(process.cwd()) || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY) {
  throw new Error("The isolated recursive Skill browser directory is unsafe.");
}
const PASSWORD = "Recursive-Skill-Browser-Only!";
const MARKER = `recursive-skill-browser-${Date.now()}`;
const GOD_ID = `${MARKER}-god`;
const PLAYER_ID = `${MARKER}-player`;

type Fixture = {
  godEmail: string;
  playerEmail: string;
  rootAId: number;
  endpointAId: number;
  rootAName: string;
  endpointBId: number;
  rootBName: string;
  branchAName: string;
  levelThreeAName: string;
  duplicateName: string;
  sharedId: number;
  sharedName: string;
  reviewRootName: string;
};

async function one<T extends pg.QueryResultRow>(
  client: pg.PoolClient,
  text: string,
  values: unknown[] = [],
): Promise<T> {
  const result = await client.query<T>(text, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

async function insertSkill(
  client: pg.PoolClient,
  input: { name: string; tier: number | null; attribute: string | null; externalId: string },
): Promise<number> {
  const row = await one<{ id: number }>(client, `insert into skill
    (name,classification,tier,primary_attribute,definition,created_by_user_id,source_system,source_external_id)
    values ($1,'standard',$2,$3,'Guarded recursive Skill browser fixture.',$4,$5,$6) returning id`, [
    input.name,
    input.tier,
    input.attribute,
    GOD_ID,
    MARKER,
    input.externalId,
  ]);
  return row.id;
}

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const godEmail = `${GOD_ID}@example.invalid`;
    const playerEmail = `${PLAYER_ID}@example.invalid`;
    for (const entry of [
      { id: GOD_ID, name: "Recursive Skill Browser G.O.D.", email: godEmail },
      { id: PLAYER_ID, name: "Recursive Skill Browser Player", email: playerEmail },
    ]) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username)
        values ($1,$2,$3,true,$1,$1)`, [entry.id, entry.name, entry.email]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
        values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${entry.id}-credential`, entry.id, password]);
    }
    await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'player')", [GOD_ID, PLAYER_ID]);

    const rootAName = `Root A ${MARKER}`;
    const rootBName = `Root B ${MARKER}`;
    const branchAName = `Branch A ${MARKER}`;
    const levelThreeAName = `Level Three A ${MARKER}`;
    const duplicateName = `Duplicate Endpoint ${MARKER}`;
    const sharedName = `Shared Route ${MARKER}`;
    const reviewRootName = `Unlinked Review ${MARKER}`;
    const rootAId = await insertSkill(client, { name: rootAName, tier: 1, attribute: "STR", externalId: "root-a" });
    const branchAId = await insertSkill(client, { name: branchAName, tier: 8, attribute: "DEX", externalId: "branch-a" });
    const levelThreeAId = await insertSkill(client, { name: levelThreeAName, tier: 19, attribute: "CON", externalId: "level-three-a" });
    const endpointAId = await insertSkill(client, { name: duplicateName, tier: 31, attribute: "WIS", externalId: "endpoint-a" });
    const rootBId = await insertSkill(client, { name: rootBName, tier: 1, attribute: "DEX", externalId: "root-b" });
    const branchBId = await insertSkill(client, { name: `Branch B ${MARKER}`, tier: 2, attribute: "DEX", externalId: "branch-b" });
    const levelThreeBId = await insertSkill(client, { name: `Level Three B ${MARKER}`, tier: 3, attribute: "DEX", externalId: "level-three-b" });
    const endpointBId = await insertSkill(client, { name: duplicateName, tier: 4, attribute: "DEX", externalId: "endpoint-b" });
    const sharedId = await insertSkill(client, { name: sharedName, tier: 42, attribute: "WIS", externalId: "shared-route" });
    await insertSkill(client, { name: reviewRootName, tier: null, attribute: null, externalId: "review-root" });
    for (const [childId, parentId, sortOrder] of [
      [branchAId, rootAId, 0],
      [levelThreeAId, branchAId, 0],
      [endpointAId, levelThreeAId, 0],
      [branchBId, rootBId, 0],
      [levelThreeBId, branchBId, 0],
      [endpointBId, levelThreeBId, 0],
      [sharedId, levelThreeAId, 1],
      [sharedId, levelThreeBId, 1],
    ]) {
      await client.query("insert into skill_relationship (skill_id,related_skill_id,relationship_type,sort_order) values ($1,$2,'parent',$3)", [childId, parentId, sortOrder]);
    }
    await client.query("commit");
    return { godEmail, playerEmail, rootAId, endpointAId, rootAName, endpointBId, rootBName, branchAName, levelThreeAName, duplicateName, sharedId, sharedName, reviewRootName };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from skill where created_by_user_id=$1", [GOD_ID]);
    await client.query("delete from account where user_id=any($1::text[])", [[GOD_ID, PLAYER_ID]]);
    await client.query("delete from user_role where user_id=any($1::text[])", [[GOD_ID, PLAYER_ID]]);
    await client.query(`delete from "user" where id=any($1::text[])`, [[GOD_ID, PLAYER_ID]]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  const remainingSkills = await pool.query<{
    count: string;
  }>("select count(*) from skill where created_by_user_id=$1 or name like $2", [GOD_ID, `%${MARKER}%`]);
  const remainingUsers = await pool.query<{ count: string }>(`select count(*) from "user" where id=any($1::text[])`, [[GOD_ID, PLAYER_ID]]);
  assert.equal(Number(remainingSkills.rows[0]?.count ?? 0), 0, "Recursive Skill browser records were not completely removed.");
  assert.equal(Number(remainingUsers.rows[0]?.count ?? 0), 0, "Recursive Skill browser users were not completely removed.");
}

async function cleanupStaleFixtures(pool: pg.Pool): Promise<void> {
  const users = await pool.query<{ id: string }>(`select id from "user" where id like 'recursive-skill-browser-%'`);
  const ids = users.rows.map(({ id }) => id);
  if (!ids.length) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from skill where created_by_user_id=any($1::text[])", [ids]);
    await client.query("delete from account where user_id=any($1::text[])", [ids]);
    await client.query("delete from user_role where user_id=any($1::text[])", [ids]);
    await client.query(`delete from "user" where id=any($1::text[])`, [ids]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The isolated local server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the recursive Skill browser server.");
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  return page;
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let fixtureCreated = false;
  try {
    await cleanupStaleFixtures(pool);
    const fixture = await seedFixture(pool);
    fixtureCreated = true;
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_AUTH_URL: BASE_URL,
        NEXT_TELEMETRY_DISABLED: "1",
        SERRIAN_TEST_NEXT_DIST_DIR: TEST_DIST_DIRECTORY,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const godContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const godPage = await login(godContext, fixture.godEmail);
    const playerPage = await login(playerContext, fixture.playerEmail);

    await godPage.goto(`${BASE_URL}/heavens/skills`);
    await godPage.getByRole("heading", { name: "Skill Library" }).waitFor();
    assert.equal(await godPage.getByRole("button", { name: "List View" }).getAttribute("aria-pressed"), "true");
    const pagination = godPage.getByRole("navigation", { name: "Skill pages" });
    await pagination.getByRole("button", { name: "Next" }).click();
    await pagination.getByText(/Page 2 of/).waitFor();
    await pagination.getByRole("button", { name: "Previous" }).click();
    await pagination.getByText(/Page 1 of/).waitFor();
    await godPage.getByLabel("Search", { exact: true }).fill(fixture.duplicateName);
    const listRows = godPage.locator(".skill-library__row");
    await godPage.waitForFunction(() => document.querySelectorAll(".skill-library__row").length === 2);
    assert.equal(await listRows.count(), 2, "List View should return both exact duplicate-name identities.");
    await listRows.filter({ hasText: `#${fixture.endpointAId}` }).click();
    await godPage.getByText(`SKILL ${fixture.endpointAId}`, { exact: true }).waitFor();
    await godPage.getByLabel("Search", { exact: true }).fill("");

    await godPage.getByRole("button", { name: "Tree View" }).click();
    await godPage.getByRole("heading", { name: "Choose an Attribute" }).waitFor();
    assert.equal(await godPage.getByRole("button", { name: new RegExp(fixture.rootAName) }).count(), 0, "Tree roots must stay hidden until an Attribute is selected.");
    const attributeSelector = godPage.getByRole("group", { name: "Skill Attribute selector" });
    await attributeSelector.getByRole("button", { name: /STR.*Strength/ }).click();
    const strengthRoots = godPage.getByRole("region", { name: /STR.*Strength roots/ });
    await strengthRoots.getByRole("button", { name: new RegExp(fixture.rootAName) }).waitFor();
    assert.equal(await strengthRoots.getByRole("button", { name: new RegExp(fixture.rootBName) }).count(), 0, "Only the selected Attribute's roots should be rendered.");
    await strengthRoots.getByRole("button", { name: new RegExp(fixture.rootAName) }).click();
    await godPage.getByRole("heading", { name: "Immediate Children" }).waitFor();
    await godPage.getByRole("button", { name: new RegExp(fixture.branchAName) }).click();
    await godPage.getByRole("button", { name: new RegExp(fixture.levelThreeAName) }).click();
    await godPage.getByRole("button", { name: new RegExp(fixture.duplicateName) }).click();
    await godPage.getByText(`Skill #${fixture.endpointAId}`, { exact: true }).waitFor();
    const breadcrumbs = godPage.getByRole("navigation", { name: "Selected Skill lineage" });
    const breadcrumbText = await breadcrumbs.innerText();
    for (const expectedName of [fixture.rootAName, fixture.branchAName, fixture.levelThreeAName, fixture.duplicateName]) {
      assert.match(breadcrumbText, new RegExp(expectedName), `Expected the selected lineage to include ${expectedName}.`);
    }
    await breadcrumbs.getByRole("button", { name: new RegExp(`${fixture.rootAName}.*#${fixture.rootAId}`) }).click();
    await godPage.getByText(`Skill #${fixture.rootAId}`, { exact: true }).waitFor();

    await godPage.getByLabel("Search every depth").fill(fixture.duplicateName);
    const searchResults = godPage
      .getByRole("region", { name: "Skill search results" })
      .locator(".skill-library__search-result");
    assert.equal(await searchResults.count(), 2);
    const rootBResult = searchResults.filter({ hasText: fixture.rootBName });
    assert.equal(await rootBResult.count(), 1);
    await rootBResult.click();
    await godPage.getByText(`Skill #${fixture.endpointBId}`, { exact: true }).waitFor();
    assert.match(await godPage.locator(".skill-library__path-preview").innerText(), new RegExp(fixture.rootBName));

    await godPage.getByLabel("Search every depth").fill(fixture.sharedName);
    const sharedResults = godPage
      .getByRole("region", { name: "Skill search results" })
      .locator(".skill-library__search-result");
    await sharedResults.filter({ hasText: fixture.sharedName }).first().waitFor();
    assert.equal(await sharedResults.count(), 2, "A multiple-parent Skill should expose both exact routes.");
    assert.equal(await sharedResults.filter({ hasText: `#${fixture.sharedId}` }).count(), 2);
    await sharedResults.filter({ hasText: fixture.rootBName }).click();
    await godPage.getByText(`Skill #${fixture.sharedId}`, { exact: true }).waitFor();
    assert.match(await godPage.locator(".skill-library__path-preview").innerText(), new RegExp(fixture.rootBName));

    await godPage.getByRole("button", { name: "Choose Attribute" }).click();
    await godPage.getByRole("group", { name: "Skill Attribute selector" }).getByRole("button", { name: /Review \/ Unlinked/ }).click();
    await godPage.getByRole("region", { name: "Review / Unlinked roots" }).getByRole("button", { name: new RegExp(fixture.reviewRootName) }).waitFor();

    const createdRootName = `UI Root ${MARKER}`;
    const createdChildName = `UI Child ${MARKER}`;
    await godPage.getByRole("button", { name: "New Skill", exact: true }).click();
    await godPage.getByLabel("Name *").fill(createdRootName);
    await godPage.getByLabel("Primary Attribute").selectOption("DEX");
    await godPage.getByRole("button", { name: "Save Skill" }).click();
    await godPage.getByText(new RegExp(`${createdRootName}.*was saved and placed`)).waitFor();
    assert.match(await godPage.locator(".skill-library__path-preview").innerText(), new RegExp(createdRootName));
    assert.match(await godPage.locator(".skill-library__selected-detail").innerText(), /effective attribute\s+DEX/i);
    await godPage.getByRole("button", { name: "Attribute Roots" }).click();
    const dexterityRoots = godPage.getByRole("region", { name: /DEX.*Dexterity roots/ });
    await dexterityRoots.getByRole("button", { name: new RegExp(createdRootName) }).click();

    await godPage.getByRole("button", { name: "New Skill", exact: true }).click();
    await godPage.getByLabel("Name *").fill(createdChildName);
    await godPage.getByLabel("Primary Attribute").selectOption("DEX");
    await godPage.getByRole("button", { name: "Pathing" }).click();
    await godPage.getByLabel("Find an exact parent at any depth").fill(createdRootName);
    const createdRootOptionValue = await godPage
      .getByLabel("Matching Skill identity")
      .locator("option")
      .filter({ hasText: createdRootName })
      .getAttribute("value");
    assert.ok(createdRootOptionValue, "Expected the new root Skill in the ordinary parent selector.");
    await godPage.getByLabel("Matching Skill identity").selectOption(createdRootOptionValue);
    await godPage.getByRole("button", { name: "Add as Parent" }).click();
    await godPage.getByRole("button", { name: "Save Skill" }).click();
    await godPage.getByText(new RegExp(`${createdChildName}.*was saved and placed`)).waitFor();
    assert.match(await godPage.locator(".skill-library__path-preview").innerText(), new RegExp(`${createdRootName}[\\s\\S]*${createdChildName}`));

    await godPage.getByRole("button", { name: "Up One Level" }).click();
    await godPage.getByRole("button", { name: "Pathing" }).click();
    await godPage.getByLabel("Find an exact parent at any depth").fill(createdChildName);
    const createdChildOptionValue = await godPage
      .getByLabel("Matching Skill identity")
      .locator("option")
      .filter({ hasText: createdChildName })
      .getAttribute("value");
    assert.ok(createdChildOptionValue, "Expected the new child Skill to be available as an exact parent candidate.");
    await godPage.getByLabel("Matching Skill identity").selectOption(createdChildOptionValue);
    await godPage.getByRole("button", { name: "Add as Parent" }).click();
    await godPage.getByRole("button", { name: "Save Skill" }).click();
    await godPage.getByText(/would create a canonical Skill cycle/i).first().waitFor();

    await godPage.setViewportSize({ width: 360, height: 800 });
    assert.equal(await godPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await godPage.getByRole("button", { name: "Choose Attribute" }).focus();
    assert.equal(await godPage.getByRole("button", { name: "Choose Attribute" }).evaluate((element) => element === document.activeElement), true);

    await playerPage.goto(`${BASE_URL}/heavens/skills`);
    await playerPage.waitForURL((url) => url.pathname === "/access");
    assert.equal(await playerPage.getByRole("button", { name: "New Skill", exact: true }).count(), 0);
    await playerPage.goto(`${BASE_URL}/realms`);
    await playerPage.getByRole("heading", { name: "The Realms", exact: true }).waitFor();
    await playerPage.goto(`${BASE_URL}/realms/tabletop`);
    await playerPage.getByRole("heading", { name: "Choose your Character", exact: true }).waitFor();

    await Promise.all([godContext.close(), playerContext.close()]);
    console.log(JSON.stringify({
      passed: true,
      verified: [
        "G.O.D. existing Skills workspace",
        "restored paginated List View",
        "duplicate-name exact List selection",
        "Attribute-first Tree View",
        "single-Attribute root visibility",
        "three descendant drill levels",
        "exact breadcrumb navigation",
        "duplicate-name exact search lineage",
        "multiple-parent exact route selection",
        "Review / Unlinked discovery",
        "ordinary New Skill root creation and automatic grouping",
        "ordinary New Skill child creation and automatic nesting",
        "cyclic reparent rejection",
        "Player mutation-control denial",
        "Player Realms access",
        "Player Tabletop empty-state access",
        "narrow-phone horizontal containment",
        "native keyboard focus",
      ],
    }, null, 2));
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      if (browser) await browser.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (server && server.exitCode === null) {
        server.kill();
        await new Promise<void>((resolveStop) => {
          const timeout = setTimeout(resolveStop, 3_000);
          server!.once("exit", () => {
            clearTimeout(timeout);
            resolveStop();
          });
        });
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (fixtureCreated) await cleanupFixture(pool);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await pool.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await rm(TEST_DIST_PATH, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await writeFile(tsconfigPath, tsconfigBefore);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "Recursive Skill browser cleanup failed.");
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
