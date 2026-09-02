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
if (!connectionString) throw new Error("DATABASE_URL is required for the Chat live browser test.");
const databaseUrl = new URL(connectionString);
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Chat live browser fixtures against ${databaseUrl.pathname.slice(1)}.`);
}
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Chat live browser fixtures against ${databaseUrl.hostname}.`);
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.CHAT_LIVE_BROWSER_PORT ?? 3106);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-crossroads-navigation-browser";
const LIVE_APPLICATION_NAME = "serrian-tide-chat-live-sse-browser-test";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (dirname(TEST_DIST_PATH) !== resolve(process.cwd()) || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY) {
  throw new Error("The isolated Chat live browser build directory is unsafe.");
}

const PASSWORD = "Crossroads-Live-Browser-Only!";
const MARKER = `crossroads-live-${Date.now()}`;
const USER_A_ID = `${MARKER}-a`;
const USER_B_ID = `${MARKER}-b`;
const ROLELESS_USER_ID = `${MARKER}-roleless`;
const SCREENSHOT_DIRECTORY = process.env.CHAT_LIVE_SCREENSHOTS_DIR?.trim() || null;

type Fixture = {
  userAEmail: string;
  userBEmail: string;
  rolelessEmail: string;
};

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const accounts = [
      { id: USER_A_ID, name: "Crossroads Live A", displayName: "Live Browser A" },
      { id: USER_B_ID, name: "Crossroads Live B", displayName: "Live Browser B" },
      { id: ROLELESS_USER_ID, name: "Crossroads Roleless", displayName: "Live Browser Roleless" },
    ].map((account) => ({
      ...account,
      email: `${account.id}@example.invalid`,
      username: account.id,
    }));
    for (const account of accounts) {
      await client.query(
        `insert into "user" (id,name,email,email_verified,username,display_username)
         values ($1,$2,$3,true,$4,$5)`,
        [account.id, account.name, account.email, account.username, account.displayName],
      );
      await client.query(
        `insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
         values ($1,'local:credential',$2,'credential',$2,$3,now())`,
        [`${account.id}-credential`, account.id, password],
      );
    }
    await client.query(
      "insert into user_role (user_id,role) values ($1,'player'),($2,'player')",
      [USER_A_ID, USER_B_ID],
    );
    await client.query("commit");
    return {
      userAEmail: accounts[0]!.email,
      userBEmail: accounts[1]!.email,
      rolelessEmail: accounts[2]!.email,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool): Promise<void> {
  const ids = [USER_A_ID, USER_B_ID, ROLELESS_USER_ID];
  await pool.query("delete from chat_message where author_user_id = any($1::text[]) or deleted_by_user_id = any($1::text[])", [ids]);
  await pool.query(
    `delete from chat_room
     where scope = 'direct'
       and id in (select room_id from chat_room_member where user_id = any($1::text[]))`,
    [ids],
  );
  await pool.query("delete from \"user\" where id = any($1::text[])", [ids]);
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The isolated server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Timed out waiting for the Chat live browser-test server.");
}

async function waitForLiveConnectionCleanup(pool: pg.Pool): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [{ count }] = (await pool.query<{ count: string }>(
      "select count(*)::text as count from pg_stat_activity where application_name = $1",
      [LIVE_APPLICATION_NAME],
    )).rows;
    if (Number(count) === 0) return 0;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  return Number((await pool.query<{ count: string }>(
    "select count(*)::text as count from pg_stat_activity where application_name = $1",
    [LIVE_APPLICATION_NAME],
  )).rows[0]?.count ?? 0);
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
  return page;
}

async function verifyActualChatLayout(page: Page): Promise<void> {
  if (SCREENSHOT_DIRECTORY) await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
  for (const viewport of [
    { width: 1440, height: 900, mode: "desktop" },
    { width: 390, height: 844, mode: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>("[data-chat-workspace]");
      const hero = main?.querySelector<HTMLElement>("header");
      const sidebar = main?.querySelector<HTMLElement>('aside[aria-label="Chat rooms"]');
      const conversation = main?.querySelector<HTMLElement>('section[aria-label="Selected conversation"]');
      const composer = main?.querySelector<HTMLElement>("form");
      const picker = main?.querySelector<HTMLElement>('select[id="chat-room-select"]')?.closest("div")?.parentElement;
      const workspace = sidebar?.parentElement;
      return {
        mainClass: main?.className ?? "",
        heroClass: hero?.className ?? "",
        heroBorder: hero ? getComputedStyle(hero).borderTopWidth : "missing",
        workspaceDisplay: workspace ? getComputedStyle(workspace).display : "missing",
        workspaceColumns: workspace ? getComputedStyle(workspace).gridTemplateColumns : "missing",
        sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : "missing",
        pickerDisplay: picker ? getComputedStyle(picker).display : "missing",
        workspaceBorder: workspace ? getComputedStyle(workspace).borderTopWidth : "missing",
        conversationWidth: conversation?.getBoundingClientRect().width ?? 0,
        composerBorder: composer ? getComputedStyle(composer).borderTopWidth : "missing",
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          || document.body.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert.notEqual(layout.mainClass, "", `${viewport.mode} Chat CSS module class was empty.`);
    assert.notEqual(layout.heroClass, "", `${viewport.mode} Chat header CSS module class was empty.`);
    assert.equal(layout.heroBorder, "1px", `${viewport.mode} Chat header border was not applied.`);
    assert.equal(layout.workspaceBorder, "1px", `${viewport.mode} conversation workspace border was not applied.`);
    assert.ok(layout.conversationWidth > 300, `${viewport.mode} conversation panel became impractically narrow.`);
    assert.equal(layout.composerBorder, "1px", `${viewport.mode} composer border was not applied.`);
    assert.equal(layout.overflow, false, `${viewport.mode} Chat layout overflowed horizontally.`);
    if (viewport.mode === "desktop") {
      assert.equal(layout.workspaceDisplay, "grid");
      assert.notEqual(layout.workspaceColumns, "none");
      assert.notEqual(layout.sidebarDisplay, "none");
      assert.equal(layout.pickerDisplay, "none");
    } else {
      assert.equal(layout.sidebarDisplay, "none");
      assert.notEqual(layout.pickerDisplay, "none");
    }
    if (SCREENSHOT_DIRECTORY) {
      await page.screenshot({
        path: join(SCREENSHOT_DIRECTORY, `crossroads-live-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function submitMessage(page: Page, content: string): Promise<void> {
  const composer = page.locator("#chat-message");
  await composer.fill(content);
  await page.getByRole("button", { name: /^Send$/ }).click();
  try {
    await page.locator("li", { hasText: content }).waitFor();
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      liveStatus: document.querySelector<HTMLElement>("[data-live-status]")?.dataset.liveStatus ?? null,
      selectedRoom: document.querySelector<HTMLSelectElement>("#chat-room-select")?.value ?? null,
      composerValue: document.querySelector<HTMLTextAreaElement>("#chat-message")?.value ?? null,
      text: document.body.innerText.slice(-2_000),
    }));
    throw new Error(`Sent message was not reconciled into its room: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const fixture = await seedFixture(pool);
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_AUTH_URL: BASE_URL,
        CHAT_LIVE_APPLICATION_NAME: LIVE_APPLICATION_NAME,
        NEXT_TELEMETRY_DISABLED: "1",
        SERRIAN_TEST_NEXT_DIST_DIR: TEST_DIST_DIRECTORY,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server);

    assert.equal((await fetch(`${BASE_URL}/api/chat/live?room=crossroads`)).status, 401);

    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const rolelessContext = await browser.newContext();
    const pageA = await login(contextA, fixture.userAEmail);
    const pageB = await login(contextB, fixture.userBEmail);
    const rolelessPage = await login(rolelessContext, fixture.rolelessEmail);
    assert.equal(await rolelessPage.evaluate(async () => (await fetch("/api/chat/live?room=crossroads")).status), 403);
    await rolelessContext.close();

    await Promise.all([pageA.goto(`${BASE_URL}/chat`), pageB.goto(`${BASE_URL}/chat`)]);
    await Promise.all([
      pageA.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
      pageB.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
    ]);
    assert.equal(await pageA.evaluate(async () => (await fetch("/api/chat/live?room=missing-room")).status), 404);
    await verifyActualChatLayout(pageA);

    const sharedMessage = `${MARKER} shared message`;
    await submitMessage(pageA, sharedMessage);
    const receivedByB = pageB.locator("li", { hasText: sharedMessage });
    await receivedByB.waitFor({ timeout: 15_000 });
    const sharedMessageId = await receivedByB.getAttribute("data-message-id");
    assert.ok(sharedMessageId, "The live message did not expose its stable message identity.");

    const sentByA = pageA.locator("li", { hasText: sharedMessage });
    await sentByA.getByRole("button", { name: "Delete" }).click();
    await sentByA.getByRole("button", { name: "Confirm" }).click();
    const redactedForB = pageB.locator(`li[data-message-id="${sharedMessageId}"]`);
    await redactedForB.getByText("Message removed", { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal((await redactedForB.innerText()).includes(sharedMessage), false);

    await pageA.getByRole("button", { name: "New Message" }).click();
    await pageA.locator("#direct-user-search").fill("Live Browser B");
    await pageA.getByRole("button", { name: "Search", exact: true }).click();
    await pageA.getByRole("button", { name: /Live Browser B.*Open conversation/ }).click();
    await pageA.getByRole("heading", { name: "Live Browser B" }).waitFor({ timeout: 15_000 });
    await pageB.locator('aside[aria-label="Chat rooms"]').getByRole("button", { name: /Live Browser A/ }).waitFor({ timeout: 15_000 });

    await pageA.locator('[data-live-status="live"]').waitFor({ timeout: 15_000 });
    await pageA.waitForTimeout(1_100);
    const directMessage = `${MARKER} private room message`;
    await submitMessage(pageA, directMessage);
    await pageB.waitForTimeout(1_500);
    assert.equal(await pageB.getByText(directMessage, { exact: true }).count(), 0, "An unrelated-room message reached the visible global history.");

    const terminatedConnections = await pool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where application_name = $1",
      [LIVE_APPLICATION_NAME],
    );
    assert.ok(terminatedConnections.rowCount && terminatedConnections.rowCount >= 2, "The two live browser sessions did not own dedicated PostgreSQL listeners.");
    await pageA.locator('[data-live-status="reconnecting"]').waitFor({ timeout: 15_000 });
    await pageA.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 });

    await Promise.all([contextA.close(), contextB.close()]);
    assert.equal(await waitForLiveConnectionCleanup(pool), 0, "SSE PostgreSQL connections remained after browser contexts closed.");

    console.log(JSON.stringify({
      passed: true,
      verified: [
        "unauthenticated and roleless SSE rejection",
        "authorized room SSE",
        "two-session live post",
        "two-session live deletion redaction",
        "live direct-room directory refresh",
        "unrelated-room event isolation",
        "SSE reconnect",
        "dedicated connection cleanup",
        "desktop and mobile real-route styling",
      ],
    }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolvePromise) => {
        const timeout = setTimeout(resolvePromise, 2_000);
        server!.once("exit", () => {
          clearTimeout(timeout);
          resolvePromise();
        });
      });
    }
    await cleanupFixture(pool).catch(() => undefined);
    await pool.end();
    await rm(TEST_DIST_PATH, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main();
