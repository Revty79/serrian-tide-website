import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Crossroads navigation browser test.");
const databaseUrl = new URL(connectionString);
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Crossroads navigation fixtures against ${databaseUrl.pathname.slice(1)}.`);
}
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Crossroads navigation fixtures against ${databaseUrl.hostname}.`);
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.CROSSROADS_NAVIGATION_PORT ?? 3105);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-crossroads-navigation-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (
  dirname(TEST_DIST_PATH) !== resolve(process.cwd())
  || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY
) {
  throw new Error("The isolated Crossroads navigation build directory is unsafe.");
}
const PASSWORD = "Crossroads-Navigation-Browser-Only!";
const MARKER = `crossroads-navigation-${Date.now()}`;
const ALL_ROLE_ID = `${MARKER}-all`;
const PLAYER_ID = `${MARKER}-player`;
const SCREENSHOT_DIRECTORY = process.env.CROSSROADS_NAVIGATION_SCREENSHOTS_DIR?.trim() || null;

type Fixture = {
  allRoleEmail: string;
  playerEmail: string;
};

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const accounts = [
      {
        id: ALL_ROLE_ID,
        name: "Crossroads All Paths",
        email: `${ALL_ROLE_ID}@example.invalid`,
        username: `${MARKER}-all`,
      },
      {
        id: PLAYER_ID,
        name: "Crossroads Player Path",
        email: `${PLAYER_ID}@example.invalid`,
        username: `${MARKER}-player`,
      },
    ];
    for (const account of accounts) {
      await client.query(
        `insert into "user" (id,name,email,email_verified,username,display_username)
         values ($1,$2,$3,true,$4,$4)`,
        [account.id, account.name, account.email, account.username],
      );
      await client.query(
        `insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
         values ($1,'local:credential',$2,'credential',$2,$3,now())`,
        [`${account.id}-credential`, account.id, password],
      );
    }
    await client.query(
      "insert into user_role (user_id,role) values ($1,'admin'),($1,'god'),($1,'player'),($2,'player')",
      [ALL_ROLE_ID, PLAYER_ID],
    );
    await client.query("commit");
    return { allRoleEmail: accounts[0]!.email, playerEmail: accounts[1]!.email };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool): Promise<void> {
  await pool.query("delete from \"user\" where id = any($1::text[])", [[ALL_ROLE_ID, PLAYER_ID]]);
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the Crossroads navigation browser-test server.");
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
  await page.getByRole("heading", { name: "Choose Your Path" }).waitFor();
  return page;
}

async function accessCardHrefs(page: Page): Promise<string[]> {
  const destinationHrefs = ["/admin", "/heavens", "/realms", "/chat"];
  return page.locator("main a").evaluateAll((links, expected) => links
    .map((link) => link.getAttribute("href"))
    .filter((href): href is string => Boolean(href && expected.includes(href))), destinationHrefs);
}

async function verifyPathsLayout(
  page: Page,
  expectedCardCount: number,
  prefix: string,
): Promise<void> {
  const viewports = [
    { width: 1440, height: 900, expectedRows: 1 },
    { width: 390, height: 844, expectedRows: expectedCardCount },
  ];
  if (SCREENSHOT_DIRECTORY) await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    const layout = await page.evaluate((expectedHrefs) => {
      const cards = [...document.querySelectorAll<HTMLAnchorElement>("main a")]
        .filter((link) => expectedHrefs.includes(link.getAttribute("href") ?? ""));
      const tops = new Set(cards.map((card) => card.offsetTop));
      return {
        cardCount: cards.length,
        rowCount: tops.size,
        cardPositions: cards.map((card) => ({
          href: card.getAttribute("href"),
          left: Math.round(card.getBoundingClientRect().left),
          top: Math.round(card.getBoundingClientRect().top),
          width: Math.round(card.getBoundingClientRect().width),
        })),
        gridTemplateColumns: cards[0]?.parentElement
          ? getComputedStyle(cards[0].parentElement).gridTemplateColumns
          : "missing",
        gridDisplay: cards[0]?.parentElement
          ? getComputedStyle(cards[0].parentElement).display
          : "missing",
        gridClassName: cards[0]?.parentElement?.className ?? "missing",
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          || document.body.scrollWidth > document.documentElement.clientWidth,
      };
    }, ["/admin", "/heavens", "/realms", "/chat"]);
    assert.equal(layout.cardCount, expectedCardCount);
    assert.equal(
      layout.rowCount,
      viewport.expectedRows,
      `${prefix} Paths cards were not balanced at ${viewport.width}px: ${JSON.stringify(layout)}.`,
    );
    assert.equal(layout.horizontalOverflow, false, `${prefix} Paths overflowed at ${viewport.width}px.`);
    if (SCREENSHOT_DIRECTORY) {
      await page.screenshot({
        path: join(SCREENSHOT_DIRECTORY, `${prefix}-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    }
  }
}

async function verifySharedNavigation(page: Page, path: "/admin" | "/heavens" | "/realms") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}${path}`);
  const navigation = page.locator(".authenticated-navigation");
  await navigation.waitFor();
  const chatLinks = navigation.locator('a[href="/chat"]');
  assert.equal(await chatLinks.count(), 2, `${path} must render one desktop and one mobile Crossroads link.`);
  assert.equal(await chatLinks.evaluateAll((links) => links.filter((link) => {
    const style = getComputedStyle(link);
    return style.display !== "none" && link.getClientRects().length > 0;
  }).length), 1, `${path} must show exactly one desktop Crossroads link.`);
  assert.equal(await navigation.evaluate((element) => element.scrollWidth > element.clientWidth), false);

  await page.setViewportSize({ width: 390, height: 844 });
  await navigation.getByText("Navigate", { exact: true }).click();
  assert.equal(await chatLinks.evaluateAll((links) => links.filter((link) => {
    const style = getComputedStyle(link);
    return style.display !== "none" && link.getClientRects().length > 0;
  }).length), 1, `${path} must show exactly one mobile Crossroads link.`);
  assert.equal(await navigation.evaluate((element) => element.scrollWidth > element.clientWidth), false);
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const fixture = await seedFixture(pool);
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          BETTER_AUTH_URL: BASE_URL,
          NEXT_TELEMETRY_DISABLED: "1",
          SERRIAN_TEST_NEXT_DIST_DIR: TEST_DIST_DIRECTORY,
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const allRoleContext = await browser.newContext();
    const playerContext = await browser.newContext();
    const allRolePage = await login(allRoleContext, fixture.allRoleEmail);
    const playerPage = await login(playerContext, fixture.playerEmail);

    assert.deepEqual(await accessCardHrefs(allRolePage), ["/admin", "/heavens", "/realms", "/chat"]);
    assert.deepEqual(await accessCardHrefs(playerPage), ["/realms", "/chat"]);
    assert.equal(allRolePage.url(), `${BASE_URL}/access`);
    assert.equal(playerPage.url(), `${BASE_URL}/access`);
    await verifyPathsLayout(allRolePage, 4, "paths-all-roles");
    await verifyPathsLayout(playerPage, 2, "paths-player-role");

    for (const path of ["/admin", "/heavens", "/realms"] as const) {
      await verifySharedNavigation(allRolePage, path);
    }

    await Promise.all([allRoleContext.close(), playerContext.close()]);
    console.log(JSON.stringify({
      passed: true,
      verified: [
        "four-card all-role Paths",
        "two-card single-role Paths",
        "desktop Crossroads navigation",
        "mobile Crossroads navigation",
      ],
    }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2_000);
        server!.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    await cleanupFixture(pool).catch(() => undefined);
    await pool.end();
    await rm(TEST_DIST_PATH, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main();
