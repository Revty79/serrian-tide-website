import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

import { CHAT_LIVE_CHANNEL } from "@/features/chat/chat-live-events";

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
const PRODUCTION_MODE = process.argv.includes("--production");
const PORT = Number(process.env.CHAT_LIVE_BROWSER_PORT ?? (PRODUCTION_MODE ? 3107 : 3106));
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
const USER_C_ID = `${MARKER}-c`;
const USER_ADMIN_ID = `${MARKER}-admin`;
const ROLELESS_USER_ID = `${MARKER}-roleless`;
const VISUAL_ROOM_SLUG = `${MARKER}-gallery`;
const EMPTY_ROOM_SLUG = `${MARKER}-empty`;
const ARCHIVED_ROOM_SLUG = `${MARKER}-archive`;
const SCREENSHOT_DIRECTORY = resolve(
  process.env.CHAT_LIVE_SCREENSHOTS_DIR?.trim()
    || join(tmpdir(), `serrian-crossroads-pass8-evidence-${MARKER}`),
);
const evidencePaths: string[] = [];

type Fixture = {
  userAEmail: string;
  userBEmail: string;
  userCEmail: string;
  adminEmail: string;
  rolelessEmail: string;
  campaignId: number;
  campaignSlug: string;
  visualRoomSlug: string;
  emptyRoomSlug: string;
  archivedRoomSlug: string;
};

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const accounts = [
      { id: USER_A_ID, name: "Crossroads Live A", displayName: "Live Browser A" },
      { id: USER_B_ID, name: "Crossroads Live B", displayName: "Live Browser B" },
      { id: USER_C_ID, name: "Crossroads Live C", displayName: "Live Browser C" },
      { id: USER_ADMIN_ID, name: "Crossroads Live Admin", displayName: "Live Browser Admin" },
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
      `insert into user_role (user_id,role) values
        ($1,'god'),($2,'player'),($3,'player'),($4,'admin'),($4,'god')`,
      [USER_A_ID, USER_B_ID, USER_C_ID, USER_ADMIN_ID],
    );
    const visualRoomId = Number((await client.query<{ id: number }>(
      `insert into chat_room (slug,name,scope)
       values ($1,'The Lantern Crossroads','global') returning id`,
      [VISUAL_ROOM_SLUG],
    )).rows[0]!.id);
    const archivedRoomId = Number((await client.query<{ id: number }>(
      `insert into chat_room (slug,name,scope,is_archived)
       values ($1,'The Archived Waystone','global',true) returning id`,
      [ARCHIVED_ROOM_SLUG],
    )).rows[0]!.id);
    await client.query(
      "insert into chat_room (slug,name,scope) values ($1,'The Quiet Crossing','global')",
      [EMPTY_ROOM_SLUG],
    );
    await client.query(
      `insert into chat_message (room_id,author_user_id,client_request_id,content,created_at)
       values
         ($1,$2,$3,'The northern road is clear through moonrise.',now() - interval '8 minutes'),
         ($1,$4,$5,'Then I will bring the warding lanterns. Meet at the old marker.',now() - interval '6 minutes'),
         ($6,$2,$7,'This record is preserved for the Campaign archive.',now() - interval '2 days')`,
      [
        visualRoomId,
        USER_B_ID,
        `${MARKER}-visual-b`,
        USER_A_ID,
        `${MARKER}-visual-a`,
        archivedRoomId,
        `${MARKER}-archive-a`,
      ],
    );
    const campaignId = Number((await client.query<{ id: number }>(`
      insert into campaign (
        name, overview, attribute_points, skill_points, max_starting_skill,
        points_to_unlock_next_tier, max_points_in_skill, starting_credit_amount,
        currency_system, fate_point_method, assigned_fate_points, created_by_user_id
      ) values (
        'Crossroads Live Campaign', '', 150, 50, 50,
        10, 100, 1000, 'Credits', 'Assigned', 3, $1
      ) returning id
    `, [USER_A_ID])).rows[0]!.id);
    await client.query(
      "insert into campaign_player (campaign_id,user_id) values ($1,$2),($1,$3)",
      [campaignId, USER_B_ID, USER_C_ID],
    );
    const campaignSlug = `campaign-${campaignId}-general`;
    await client.query(
      "insert into chat_room (slug,name,scope,campaign_id) values ($1,'Crossroads Live Campaign Chat','campaign',$2)",
      [campaignSlug, campaignId],
    );
    await client.query("commit");
    return {
      userAEmail: accounts[0]!.email,
      userBEmail: accounts[1]!.email,
      userCEmail: accounts[2]!.email,
      adminEmail: accounts[3]!.email,
      rolelessEmail: accounts[4]!.email,
      campaignId,
      campaignSlug,
      visualRoomSlug: VISUAL_ROOM_SLUG,
      emptyRoomSlug: EMPTY_ROOM_SLUG,
      archivedRoomSlug: ARCHIVED_ROOM_SLUG,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool): Promise<void> {
  const ids = [USER_A_ID, USER_B_ID, USER_C_ID, USER_ADMIN_ID, ROLELESS_USER_ID];
  await pool.query("delete from chat_message where author_user_id = any($1::text[]) or deleted_by_user_id = any($1::text[])", [ids]);
  await pool.query(
    `delete from chat_room
     where scope = 'direct'
       and id in (select room_id from chat_room_member where user_id = any($1::text[]))`,
    [ids],
  );
  await pool.query("delete from chat_room where slug = any($1::text[])", [
    [VISUAL_ROOM_SLUG, EMPTY_ROOM_SLUG, ARCHIVED_ROOM_SLUG],
  ]);
  await pool.query("delete from campaign where created_by_user_id=$1", [USER_A_ID]);
  await pool.query("delete from \"user\" where id = any($1::text[])", [ids]);
}

async function removeCampaignMembershipAndNotify(pool: pg.Pool, campaignId: number, userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const removed = await client.query(
      "delete from campaign_player where campaign_id=$1 and user_id=$2 returning user_id",
      [campaignId, userId],
    );
    assert.equal(removed.rowCount, 1, "Expected one Campaign membership to be removed.");
    await client.query("select pg_notify($1,$2)", [CHAT_LIVE_CHANNEL, JSON.stringify({ category: "directory" })]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function renameCampaignAndNotify(
  pool: pg.Pool,
  campaignId: number,
  campaignSlug: string,
  campaignName: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const renamed = await client.query("update campaign set name=$1 where id=$2 returning id", [campaignName, campaignId]);
    assert.equal(renamed.rowCount, 1, "Expected one Campaign to be renamed.");
    const synchronized = await client.query(
      "update chat_room set name=$1,updated_at=clock_timestamp() where slug=$2 returning slug",
      [`${campaignName} Chat`, campaignSlug],
    );
    assert.deepEqual(synchronized.rows, [{ slug: campaignSlug }], "Campaign room slug changed during rename.");
    await client.query("select pg_notify($1,$2)", [CHAT_LIVE_CHANNEL, JSON.stringify({ category: "directory" })]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function removeFinalRoleAndNotify(pool: pg.Pool, userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const removed = await client.query("delete from user_role where user_id=$1 returning role", [userId]);
    assert.equal(removed.rowCount, 1, "Expected one final Serrian role to be removed.");
    await client.query("select pg_notify($1,$2)", [CHAT_LIVE_CHANNEL, JSON.stringify({ category: "directory" })]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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

async function runCompiledProductionBuild(): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
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
    build.once("error", reject);
    build.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Compiled Crossroads production build exited with ${code}.`));
    });
  });
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
  const authResponses: Array<{ status: number; url: string }> = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/auth/")) {
      authResponses.push({ status: response.status(), url: response.url() });
    }
  });
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  try {
    await page.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
  } catch (error) {
    const diagnostic = {
      url: page.url(),
      error: await page.locator('[role="alert"]').allTextContents(),
      authResponses,
      cookies: (await context.cookies()).map((cookie) => ({
        domain: cookie.domain,
        name: cookie.name,
        secure: cookie.secure,
      })),
    };
    throw new Error(`Browser fixture login failed: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  return page;
}

async function captureEvidence(page: Page, filename: string): Promise<void> {
  await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
  const path = join(SCREENSHOT_DIRECTORY, filename);
  await page.screenshot({ path, fullPage: false });
  evidencePaths.push(path);
}

async function assertDirectPanelFits(page: Page, width: number, height: number, mode: string): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(100);
  const layout = await page.getByRole("dialog", { name: "Start a Conversation" }).evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button, input"));
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      overflowY: getComputedStyle(dialog).overflowY,
      shortestControl: Math.min(...controls.map((control) => control.getBoundingClientRect().height)),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert.ok(layout.left >= 0 && layout.right <= width, `${mode} direct-message panel overflowed horizontally.`);
  assert.ok(layout.top >= 0 && layout.bottom <= height, `${mode} direct-message panel escaped the viewport.`);
  assert.equal(layout.overflowY, "auto", `${mode} direct-message panel cannot scroll on a short screen.`);
  assert.equal(layout.pageOverflow, false, `${mode} direct-message panel caused page overflow.`);
  if (width <= 760) assert.ok(layout.shortestControl >= 44, `${mode} direct-message control is shorter than 44px.`);
}

async function verifyActualChatLayout(page: Page): Promise<void> {
  for (const viewport of [
    { width: 1440, height: 900, mode: "desktop" },
    { width: 1024, height: 768, mode: "laptop" },
    { width: 768, height: 1024, mode: "tablet" },
    { width: 390, height: 844, mode: "mobile" },
    { width: 360, height: 800, mode: "narrow-mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>("[data-chat-workspace]");
      const hero = main?.querySelector<HTMLElement>("header");
      const sidebar = main?.querySelector<HTMLElement>('aside[aria-label="Chat rooms"]');
      const conversation = main?.querySelector<HTMLElement>('section[aria-label="Selected conversation"]');
      const history = main?.querySelector<HTMLElement>('[aria-live="polite"][aria-busy]');
      const composer = main?.querySelector<HTMLTextAreaElement>("#chat-message")?.closest<HTMLElement>("form");
      const picker = main?.querySelector<HTMLElement>('select[id="chat-room-select"]')?.closest("div")?.parentElement;
      const workspace = sidebar?.parentElement;
      const incoming = main?.querySelector<HTMLElement>('li[aria-label^="Message from"]');
      const own = main?.querySelector<HTMLElement>('li[aria-label="Your message"]');
      const liveStatus = main?.querySelector<HTMLElement>('[data-live-status]');
      const conversationRect = conversation?.getBoundingClientRect();
      const composerRect = composer?.getBoundingClientRect();
      const visibleControls = Array.from(main?.querySelectorAll<HTMLElement>("button, select, textarea, a") ?? [])
        .filter((control) => control.getBoundingClientRect().height > 0);
      return {
        mainClass: main?.className ?? "",
        heroClass: hero?.className ?? "",
        heroBorder: hero ? getComputedStyle(hero).borderTopWidth : "missing",
        heroHeight: hero?.getBoundingClientRect().height ?? 0,
        workspaceDisplay: workspace ? getComputedStyle(workspace).display : "missing",
        workspaceColumns: workspace ? getComputedStyle(workspace).gridTemplateColumns : "missing",
        workspaceHeight: workspace?.getBoundingClientRect().height ?? 0,
        sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : "missing",
        sidebarOverflow: sidebar ? getComputedStyle(sidebar).overflowY : "missing",
        pickerDisplay: picker ? getComputedStyle(picker).display : "missing",
        workspaceBorder: workspace ? getComputedStyle(workspace).borderTopWidth : "missing",
        conversationWidth: conversation?.getBoundingClientRect().width ?? 0,
        composerBorder: composer ? getComputedStyle(composer).borderTopWidth : "missing",
        composerVisible: Boolean(composerRect && conversationRect
          && composerRect.height > 0
          && composerRect.bottom <= conversationRect.bottom + 1
          && composerRect.top >= conversationRect.top),
        historyOverflow: history ? getComputedStyle(history).overflowY : "missing",
        opposingMessages: Boolean(incoming && own
          && incoming.getBoundingClientRect().left < own.getBoundingClientRect().left),
        constrainedMessages: Boolean(incoming && own && conversationRect
          && incoming.getBoundingClientRect().width <= conversationRect.width * 0.92 + 1
          && own.getBoundingClientRect().width <= conversationRect.width * 0.92 + 1),
        currentLabel: main?.querySelector('[aria-current="page"]')?.textContent?.includes("Current") ?? false,
        liveStatusVisible: Boolean(liveStatus && liveStatus.getBoundingClientRect().height > 0
          && /Live|Connecting|Reconnecting/.test(liveStatus.textContent ?? "")),
        shortestControl: Math.min(...visibleControls.map((control) => control.getBoundingClientRect().height)),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          || document.body.scrollWidth > document.documentElement.clientWidth,
        pageOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
      };
    });
    assert.notEqual(layout.mainClass, "", `${viewport.mode} Chat CSS module class was empty.`);
    assert.notEqual(layout.heroClass, "", `${viewport.mode} Chat header CSS module class was empty.`);
    assert.equal(layout.heroBorder, "1px", `${viewport.mode} Chat header border was not applied.`);
    assert.equal(layout.workspaceBorder, "1px", `${viewport.mode} conversation workspace border was not applied.`);
    assert.ok(layout.conversationWidth > 300, `${viewport.mode} conversation panel became impractically narrow.`);
    assert.equal(layout.composerBorder, "1px", `${viewport.mode} composer border was not applied.`);
    assert.equal(layout.composerVisible, true, `${viewport.mode} composer was not visible inside the workspace.`);
    assert.equal(layout.historyOverflow, "auto", `${viewport.mode} message history does not scroll independently.`);
    assert.equal(layout.opposingMessages, true, `${viewport.mode} own and incoming messages do not oppose.`);
    assert.equal(layout.constrainedMessages, true, `${viewport.mode} message bubbles are not width-constrained.`);
    assert.equal(layout.currentLabel, true, `${viewport.mode} active room relies on color alone.`);
    assert.equal(layout.liveStatusVisible, true, `${viewport.mode} live connection status is not visibly labelled.`);
    assert.equal(layout.overflow, false, `${viewport.mode} Chat layout overflowed horizontally.`);
    assert.equal(layout.pageOverflow, false, `${viewport.mode} Chat layout escaped the viewport.`);
    assert.ok(layout.workspaceHeight >= viewport.height * 0.6, `${viewport.mode} header left too little room for conversation.`);
    assert.ok(layout.heroHeight < viewport.height * 0.2, `${viewport.mode} header is disproportionately tall.`);
    if (viewport.width > 760) {
      assert.equal(layout.workspaceDisplay, "grid");
      assert.notEqual(layout.workspaceColumns, "none");
      assert.notEqual(layout.sidebarDisplay, "none");
      assert.equal(layout.sidebarOverflow, "auto");
      assert.equal(layout.pickerDisplay, "none");
    } else {
      assert.equal(layout.sidebarDisplay, "none");
      assert.notEqual(layout.pickerDisplay, "none");
      assert.ok(layout.shortestControl >= 44, `${viewport.mode} contains a touch target shorter than 44px.`);
    }
    if (viewport.mode === "desktop") {
      await captureEvidence(page, "01-desktop-global-room.png");
    } else if (viewport.mode === "mobile") {
      await captureEvidence(page, "04-mobile-conversation-390x844.png");
      const picker = page.locator("#chat-room-select").locator("xpath=../..");
      const path = join(SCREENSHOT_DIRECTORY, "05-mobile-room-selector.png");
      await picker.screenshot({ path });
      evidencePaths.push(path);
    }
  }
  await page.setViewportSize({ width: 720, height: 450 });
  await page.locator("#chat-message").scrollIntoViewIfNeeded();
  const zoomEquivalent = await page.evaluate(() => {
    const composer = document.querySelector<HTMLElement>("#chat-message");
    const rect = composer?.getBoundingClientRect();
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      composerReachable: Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight),
      roomPickerVisible: Boolean(document.querySelector<HTMLElement>("#chat-room-select")?.getBoundingClientRect().height),
    };
  });
  assert.equal(zoomEquivalent.horizontalOverflow, false, "200% effective viewport overflowed horizontally.");
  assert.equal(zoomEquivalent.composerReachable, true, "Composer was not reachable at a 200% effective viewport.");
  assert.equal(zoomEquivalent.roomPickerVisible, true, "Room selection was lost at a 200% effective viewport.");
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
    await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
    if (PRODUCTION_MODE) await runCompiledProductionBuild();
    server = spawn(process.execPath, [
      "node_modules/next/dist/bin/next",
      PRODUCTION_MODE ? "start" : "dev",
      "--port",
      String(PORT),
    ], {
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
    const contextC = await browser.newContext();
    const adminContext = await browser.newContext();
    const rolelessContext = await browser.newContext();
    const pageA = await login(contextA, fixture.userAEmail);
    const pageB = await login(contextB, fixture.userBEmail);
    const pageC = await login(contextC, fixture.userCEmail);
    // Better Auth intentionally permits only three production sign-ins per
    // ten-second window. Keep the acceptance identities realistic instead of
    // disabling that production protection for the browser rehearsal.
    if (PRODUCTION_MODE) await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_100));
    const adminPage = await login(adminContext, fixture.adminEmail);
    const rolelessPage = await login(rolelessContext, fixture.rolelessEmail);
    for (const [name, page] of [["G.O.D.", pageA], ["Player B", pageB], ["Player C", pageC], ["Admin", adminPage]] as const) {
      assert.equal(
        await page.locator('main a[href="/chat"]').count(),
        1,
        `${name} Paths did not expose exactly one Crossroads entry.`,
      );
    }
    assert.equal(await rolelessPage.locator('main a[href="/chat"]').count(), 0);
    assert.equal(await rolelessPage.evaluate(async () => (await fetch("/api/chat/live?room=crossroads")).status), 403);
    await rolelessContext.close();

    let successfulStaticAssets = 0;
    const failedStaticAssets: Array<{ status: number; url: string }> = [];
    pageA.on("response", (response) => {
      if (!response.url().includes("/_next/static/")) return;
      if (response.status() >= 400) failedStaticAssets.push({ status: response.status(), url: response.url() });
      else successfulStaticAssets += 1;
    });
    const visualRoomUrl = `${BASE_URL}/chat?room=${encodeURIComponent(fixture.visualRoomSlug)}`;
    await Promise.all([pageA.goto(visualRoomUrl), pageB.goto(visualRoomUrl), pageC.goto(visualRoomUrl), adminPage.goto(visualRoomUrl)]);
    await Promise.all([
      pageA.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
      pageB.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
      pageC.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
      adminPage.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
    ]);
    assert.equal(await pageA.evaluate(async () => (await fetch("/api/chat/live?room=missing-room")).status), 404);
    assert.ok(successfulStaticAssets > 0, "The Chat route did not load a successful compiled static asset.");
    assert.deepEqual(failedStaticAssets, [], "The Chat route requested a failing static asset.");
    await verifyActualChatLayout(pageA);

    await pageA.locator('aside[aria-label="Chat rooms"]').getByRole("button", { name: "New Message" }).click();
    await pageA.getByRole("dialog", { name: "Start a Conversation" }).waitFor();
    await assertDirectPanelFits(pageA, 390, 844, "mobile");
    await assertDirectPanelFits(pageA, 720, 450, "200% effective viewport");
    await pageA.setViewportSize({ width: 1440, height: 900 });
    await captureEvidence(pageA, "06-direct-message-panel.png");
    await pageA.getByRole("button", { name: "Close new message panel" }).click();

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

    const adminModerationMessage = `${MARKER} global Admin moderation target`;
    await submitMessage(pageB, adminModerationMessage);
    const adminTarget = adminPage.locator("li", { hasText: adminModerationMessage });
    await adminTarget.waitFor({ timeout: 15_000 });
    const adminModerationMessageId = await adminTarget.getAttribute("data-message-id");
    assert.ok(adminModerationMessageId, "The Admin moderation target had no stable message identity.");
    await adminTarget.getByRole("button", { name: "Remove", exact: true }).click();
    const adminReason = adminTarget.getByRole("textbox", { name: "Reason for removal" });
    await adminReason.fill("Browser-verified global Admin moderation");
    await adminTarget.getByRole("button", { name: "Confirm", exact: true }).click();
    await pageB.locator(`li[data-message-id="${adminModerationMessageId}"]`).getByText("Message removed", { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal(await pageB.getByText(adminModerationMessage, { exact: true }).count(), 0);

    await Promise.all([
      pageA.goto(`${BASE_URL}/chat?room=${encodeURIComponent(fixture.campaignSlug)}`),
      pageB.goto(`${BASE_URL}/chat?room=${encodeURIComponent(fixture.campaignSlug)}`),
      pageC.goto(`${BASE_URL}/chat?room=${encodeURIComponent(fixture.campaignSlug)}`),
    ]);
    await Promise.all([
      pageA.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
      pageB.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
      pageC.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 }),
    ]);
    assert.equal(
      await adminPage.locator(`option[value="${fixture.campaignSlug}"]`).count(),
      0,
      "An unrelated Admin + G.O.D. discovered a private Campaign room.",
    );
    assert.equal(
      await adminPage.evaluate(async (slug) => (await fetch(`/api/chat/live?room=${encodeURIComponent(slug)}`)).status, fixture.campaignSlug),
      404,
      "An unrelated Admin + G.O.D. subscribed to a private Campaign room.",
    );
    // User B authored the global moderation target immediately before this
    // room transition. Honor the product's one-message-per-second throttle.
    await pageB.waitForTimeout(1_100);
    const campaignMessage = `${MARKER} Campaign Player message`;
    await submitMessage(pageB, campaignMessage);
    const campaignMessageForA = pageA.locator("li", { hasText: campaignMessage });
    const campaignMessageForB = pageB.locator("li", { hasText: campaignMessage });
    const campaignMessageForC = pageC.locator("li", { hasText: campaignMessage });
    await Promise.all([
      campaignMessageForA.waitFor({ timeout: 15_000 }),
      campaignMessageForC.waitFor({ timeout: 15_000 }),
    ]);
    await pageA.setViewportSize({ width: 1440, height: 900 });
    await captureEvidence(pageA, "02-desktop-campaign-room.png");
    const campaignMessageId = await campaignMessageForB.getAttribute("data-message-id");
    assert.ok(campaignMessageId, "The Campaign message did not expose its stable message identity.");
    assert.equal(
      await campaignMessageForC.getByRole("button", { name: /^(Delete|Remove)$/ }).count(),
      0,
      "An ordinary Campaign Player received moderation controls for another User's message.",
    );
    await campaignMessageForA.getByRole("button", { name: "Remove", exact: true }).click();
    await campaignMessageForA.getByText("Remove this message as moderator?", { exact: true }).waitFor();
    const moderationReason = campaignMessageForA.getByRole("textbox", { name: "Reason for removal" });
    await moderationReason.fill("  Browser-verified Campaign moderation  ");
    await captureEvidence(pageA, "07-campaign-moderation-confirmation.png");
    await pageA.setViewportSize({ width: 390, height: 844 });
    const mobileModeration = await campaignMessageForA.evaluate((message) => {
      const conversation = message.closest<HTMLElement>('section[aria-label="Selected conversation"]');
      const messageRect = message.getBoundingClientRect();
      const conversationRect = conversation?.getBoundingClientRect();
      const input = message.querySelector<HTMLElement>("input");
      const controls = Array.from(message.querySelectorAll<HTMLElement>("button, input"));
      return {
        withinConversation: Boolean(conversationRect
          && messageRect.left >= conversationRect.left
          && messageRect.right <= conversationRect.right),
        inputWithinMessage: Boolean(input
          && input.getBoundingClientRect().left >= messageRect.left
          && input.getBoundingClientRect().right <= messageRect.right),
        shortestControl: Math.min(...controls.map((control) => control.getBoundingClientRect().height)),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert.equal(mobileModeration.withinConversation, true, "Mobile moderation card escaped the conversation.");
    assert.equal(mobileModeration.inputWithinMessage, true, "Mobile moderation reason overflowed its message card.");
    assert.ok(mobileModeration.shortestControl >= 44, "Mobile moderation control is shorter than 44px.");
    assert.equal(mobileModeration.horizontalOverflow, false, "Mobile moderation caused horizontal overflow.");
    await pageA.setViewportSize({ width: 1440, height: 900 });
    await campaignMessageForA.getByRole("button", { name: "Confirm", exact: true }).click();
    const campaignRedactedForB = pageB.locator(`li[data-message-id="${campaignMessageId}"]`);
    const campaignRedactedForC = pageC.locator(`li[data-message-id="${campaignMessageId}"]`);
    await campaignRedactedForB.getByText("Message removed", { exact: true }).waitFor({ timeout: 15_000 });
    await campaignRedactedForC.getByText("Message removed", { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal((await campaignRedactedForB.innerText()).includes(campaignMessage), false);

    const renamedCampaign = "Crossroads Live Campaign Renamed";
    await renameCampaignAndNotify(pool, fixture.campaignId, fixture.campaignSlug, renamedCampaign);
    await Promise.all([pageA, pageB, pageC].map((page) => page.waitForFunction(
      ({ roomSlug, roomName }) => {
        const option = document.querySelector<HTMLOptionElement>(`option[value="${roomSlug}"]`);
        return option?.textContent?.trim() === roomName;
      },
      { roomSlug: fixture.campaignSlug, roomName: renamedCampaign },
      { timeout: 15_000 },
    )));
    assert.equal(new URL(pageA.url()).searchParams.get("room"), fixture.campaignSlug);

    await removeCampaignMembershipAndNotify(pool, fixture.campaignId, USER_B_ID);
    await pageB.waitForURL((url) => (
      url.pathname === "/chat" && url.searchParams.get("room") === "crossroads"
    ), { timeout: 20_000 });
    await pageB
      .getByRole("region", { name: "Selected conversation" })
      .getByRole("heading", { name: "The Crossroads", exact: true })
      .waitFor();
    assert.equal(await pageB.locator(`option[value="${fixture.campaignSlug}"]`).count(), 0);
    assert.equal(await pageB.getByText(campaignMessage, { exact: true }).count(), 0);

    await removeFinalRoleAndNotify(pool, USER_C_ID);
    await pageC.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
    assert.equal(await pageC.locator("[data-chat-workspace]").count(), 0);
    assert.equal(await pageC.getByText(campaignMessage, { exact: true }).count(), 0);

    await pool.query("insert into user_role (user_id,role) values ($1,'player')", [USER_C_ID]);
    await pageC.goto(`${BASE_URL}/chat`);
    await pageC.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 });
    await pool.query("delete from session where user_id=$1", [USER_C_ID]);
    await pageC.waitForTimeout(250);
    if (new URL(pageC.url()).pathname === "/chat") {
      try {
        await pageC.getByRole("button", { name: "Refresh Messages", exact: true }).click();
      } catch (error) {
        if (new URL(pageC.url()).pathname !== "/login") throw error;
      }
    }
    await pageC.waitForURL((url) => url.pathname === "/login", { timeout: 20_000 });
    assert.equal(await pageC.locator("[data-chat-workspace]").count(), 0);
    assert.equal(await pageC.getByText(sharedMessage, { exact: true }).count(), 0);

    await pageA.getByRole("button", { name: "New Message" }).click();
    await pageA.locator("#direct-user-search").fill("Live Browser B");
    await pageA.getByRole("button", { name: "Search", exact: true }).click();
    await pageA.getByRole("button", { name: /Live Browser B.*Open conversation/ }).click();
    await pageA.getByRole("heading", { name: "Live Browser B" }).waitFor({ timeout: 15_000 });
    const directRoomSlug = new URL(pageA.url()).searchParams.get("room");
    assert.ok(directRoomSlug, "The direct conversation did not expose its stable room slug.");
    const directRoomForB = pageB.locator('aside[aria-label="Chat rooms"]').getByRole("button", { name: /Live Browser A/ });
    await directRoomForB.waitFor({ timeout: 15_000 });
    assert.equal(await adminPage.locator(`option[value="${directRoomSlug}"]`).count(), 0);
    assert.equal(
      await adminPage.evaluate(async (slug) => (await fetch(`/api/chat/live?room=${encodeURIComponent(slug)}`)).status, directRoomSlug),
      404,
      "An unrelated Admin + G.O.D. subscribed to a private direct conversation.",
    );
    await directRoomForB.click();
    await pageB.getByRole("heading", { name: "Live Browser A" }).waitFor({ timeout: 15_000 });
    await pageB.locator('[data-live-status="live"]').waitFor({ timeout: 15_000 });

    await pageA.locator('[data-live-status="live"]').waitFor({ timeout: 15_000 });
    await pageA.waitForTimeout(1_100);
    const directMessage = `${MARKER} private room message`;
    await submitMessage(pageA, directMessage);
    const directMessageForB = pageB.locator("li", { hasText: directMessage });
    await directMessageForB.waitFor({ timeout: 15_000 });
    assert.equal(
      await directMessageForB.getByRole("button", { name: /^(Delete|Remove)$/ }).count(),
      0,
      "A direct participant received moderation controls for the other participant's message.",
    );
    await captureEvidence(pageA, "03-desktop-direct-conversation.png");
    await adminPage.waitForTimeout(500);
    assert.equal(await adminPage.getByText(directMessage, { exact: true }).count(), 0, "A private direct message reached an unrelated room.");

    await pageB.waitForTimeout(1_100);
    const directReply = `${MARKER} private reply`;
    await submitMessage(pageB, directReply);
    const directReplyForA = pageA.locator("li", { hasText: directReply });
    await directReplyForA.waitFor({ timeout: 15_000 });
    assert.equal(
      await directReplyForA.getByRole("button", { name: /^(Delete|Remove)$/ }).count(),
      0,
      "A direct participant received moderation controls for the other participant's message.",
    );
    const directReplyForB = pageB.locator("li", { hasText: directReply });
    const directReplyId = await directReplyForB.getAttribute("data-message-id");
    assert.ok(directReplyId, "The direct reply did not expose its stable message identity.");
    await directReplyForB.getByRole("button", { name: "Delete", exact: true }).click();
    await directReplyForB.getByRole("button", { name: "Confirm", exact: true }).click();
    await pageA.locator(`li[data-message-id="${directReplyId}"]`).getByText("Message removed", { exact: true }).waitFor({ timeout: 15_000 });

    const terminatedConnections = await pool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where application_name = $1",
      [LIVE_APPLICATION_NAME],
    );
    assert.ok(terminatedConnections.rowCount && terminatedConnections.rowCount >= 2, "The two live browser sessions did not own dedicated PostgreSQL listeners.");
    await pageA.locator('[data-live-status="reconnecting"]').waitFor({ timeout: 15_000 });
    await pageA.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 });

    await pageA.goto(`${BASE_URL}/chat?room=${encodeURIComponent(fixture.emptyRoomSlug)}`);
    await pageA.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 });
    await pageA.getByText("No messages yet", { exact: true }).waitFor();
    await captureEvidence(pageA, "08-empty-conversation.png");

    await pageA.goto(`${BASE_URL}/chat?room=${encodeURIComponent(fixture.archivedRoomSlug)}`);
    await pageA.locator('[data-live-status="live"]').waitFor({ timeout: 20_000 });
    await pageA.getByText("Archived conversation", { exact: true }).waitFor();
    assert.equal(await pageA.locator("#chat-message").count(), 0, "Archived room still exposed the composer.");
    await captureEvidence(pageA, "09-archived-conversation.png");

    await Promise.all([contextA.close(), contextB.close(), contextC.close(), adminContext.close()]);
    assert.equal(await waitForLiveConnectionCleanup(pool), 0, "SSE PostgreSQL connections remained after browser contexts closed.");

    console.log(JSON.stringify({
      passed: true,
      serverMode: PRODUCTION_MODE ? "compiled-production" : "development",
      verified: [
        "unauthenticated and roleless SSE rejection",
        "authorized room SSE",
        "single-entry Paths navigation for G.O.D., Player, and Admin roles",
        "two-session live post",
        "two-session live deletion redaction",
        "global Admin moderation with required reason",
        "Campaign creator moderation with required reason",
        "ordinary Campaign Player moderation denial",
        "unrelated Admin + G.O.D. Campaign denial",
        "live Campaign rename with stable room slug",
        "Campaign membership live fallback without retained room data",
        "final-role revocation clears Chat and redirects to access",
        "expired session clears Chat and redirects to login",
        "live direct-room directory refresh",
        "direct-room two-participant live delivery and self-deletion",
        "direct-participant cross-moderation denial",
        "unrelated Admin + G.O.D. direct-room denial",
        "unrelated-room event isolation",
        "SSE reconnect",
        "dedicated connection cleanup",
        "five-viewport real-route computed styling",
        "safe fixture-only visual evidence for all requested states",
      ],
      screenshotDirectory: SCREENSHOT_DIRECTORY,
      screenshots: evidencePaths,
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
