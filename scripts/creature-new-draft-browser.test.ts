import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import pg from "pg";
import { chromium } from "playwright-core";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const databaseUrl = new URL(connectionString);
const hostname = databaseUrl.hostname.replace(/^\[|\]$/g, "");
if (!["localhost", "127.0.0.1", "::1"].includes(hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Creature browser validation is restricted to a loopback _dev database.");
}

const PORT = 3136;
const BASE_URL = `http://localhost:${PORT}`;
const DIST_DIRECTORY = ".next-creature-new-browser";
const PREFIX = "creature-new-browser-";
const PASSWORD = "Creature-New-Browser-Only!";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function cleanup(pool: pg.Pool, userId: string): Promise<void> {
  await pool.query("delete from creatures where created_by_user_id=$1", [userId]);
  await pool.query(`delete from "user" where id=$1`, [userId]);
}

async function cleanupStale(pool: pg.Pool): Promise<void> {
  const users = await pool.query<{ id: string }>(`select id from "user" where id like $1`, [`${PREFIX}%`]);
  for (const { id } of users.rows) await cleanup(pool, id);
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Next dev did not become ready.");
}

async function main(): Promise<void> {
  const distPath = resolve(process.cwd(), DIST_DIRECTORY);
  if (dirname(distPath) !== resolve(process.cwd()) || basename(distPath) !== DIST_DIRECTORY) throw new Error("The isolated Creature browser build directory is unsafe.");
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  const pool = new pg.Pool({ connectionString });
  const userId = `${PREFIX}${Date.now()}`;
  const email = `${userId}@example.invalid`;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await cleanupStale(pool);
    const password = await hashPassword(PASSWORD);
    await pool.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,'Creature Browser G.O.D.',$2,true,$1,$1)`, [userId, email]);
    await pool.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${userId}-credential`, userId, password]);
    await pool.query("insert into user_role (user_id,role) values ($1,'god')", [userId]);

    const baseline = await pool.query<{ creature_count: number; newest_update: string | null; npc_count: number; occurrence_count: number }>(`select
      (select count(*)::int from creatures where created_by_user_id<>$1) creature_count,
      (select max(updated_at)::text from creatures where created_by_user_id<>$1) newest_update,
      (select count(*)::int from campaign_creature_npc_profile) npc_count,
      (select count(*)::int from campaign_session_encounter_participant where participant_kind='creature' and creature_snapshot_json is not null) occurrence_count`, [userId]);
    const beforeOwn = await pool.query<{ count: number }>("select count(*)::int count from creatures where created_by_user_id=$1", [userId]);
    assert.equal(beforeOwn.rows[0]?.count, 0);

    await rm(distPath, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      env: { ...process.env, BETTER_AUTH_URL: BASE_URL, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: DIST_DIRECTORY },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined });
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[name="username"]').fill(email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^Enter$/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto(`${BASE_URL}/heavens/creatures`);
    await page.getByRole("button", { name: "New Creature" }).waitFor();
    assert.deepEqual(await page.evaluate(() => ({ randomUUID: typeof crypto.randomUUID, getRandomValues: typeof crypto.getRandomValues })), {
      randomUUID: "undefined",
      getRandomValues: "function",
    });

    await page.getByRole("button", { name: "New Creature" }).click();
    await page.getByText("NEW CREATURE DRAFT", { exact: true }).waitFor();
    assert.match(await page.getByRole("button", { name: "Overview" }).getAttribute("class") ?? "", /is-active/);
    const name = page.getByLabel("Canonical Name");
    assert.equal(await name.inputValue(), "");
    assert.equal((await pool.query<{ count: number }>("select count(*)::int count from creatures where created_by_user_id=$1", [userId])).rows[0]?.count, 0);

    await name.fill("Hotfix Browser Creature");
    await page.getByRole("button", { name: "Save Creature" }).click();
    await page.getByText("Hotfix Browser Creature was saved.", { exact: true }).waitFor();
    const saved = await pool.query<{ canonical_id: string }>("select canonical_id from creatures where created_by_user_id=$1", [userId]);
    assert.equal(saved.rows.length, 1);
    assert.match(saved.rows[0]!.canonical_id, /^CREATURE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);

    await page.getByRole("button", { name: "New Creature" }).click();
    await page.getByText("NEW CREATURE DRAFT", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Canonical Name").inputValue(), "");
    await page.getByLabel("Canonical Name").fill("Unsaved Creature Name");
    await page.getByRole("button", { name: "New Creature" }).click();
    await page.getByRole("button", { name: "Keep Editing" }).waitFor();
    await page.getByRole("button", { name: "Keep Editing" }).click();
    assert.equal(await page.getByLabel("Canonical Name").inputValue(), "Unsaved Creature Name");
    await page.getByRole("button", { name: "New Creature" }).click();
    await page.getByRole("button", { name: "Discard Changes" }).click();
    assert.equal(await page.getByLabel("Canonical Name").inputValue(), "");
    assert.match(await page.getByRole("button", { name: "Overview" }).getAttribute("class") ?? "", /is-active/);
    assert.equal((await pool.query<{ count: number }>("select count(*)::int count from creatures where created_by_user_id=$1", [userId])).rows[0]?.count, 1);

    await page.reload();
    await page.evaluate(() => {
      Object.defineProperty(Crypto.prototype, "getRandomValues", { configurable: true, value: undefined });
    });
    await page.getByRole("button", { name: "New Creature" }).click();
    await page.getByRole("alert").filter({ hasText: "This browser cannot create a temporary Creature ID" }).waitFor();
    await page.getByText("Select a Creature or begin a new one.", { exact: true }).waitFor();

    const after = await pool.query<{ creature_count: number; newest_update: string | null; npc_count: number; occurrence_count: number }>(`select
      (select count(*)::int from creatures where created_by_user_id<>$1) creature_count,
      (select max(updated_at)::text from creatures where created_by_user_id<>$1) newest_update,
      (select count(*)::int from campaign_creature_npc_profile) npc_count,
      (select count(*)::int from campaign_session_encounter_participant where participant_kind='creature' and creature_snapshot_json is not null) occurrence_count`, [userId]);
    assert.deepEqual(after.rows, baseline.rows);
    console.log(JSON.stringify({
      rootCause: "crypto.randomUUID unavailable with getRandomValues fallback",
      workflows: ["empty editor", "clean saved Creature", "dirty Keep Editing", "dirty Discard Changes", "no pre-save row", "server-assigned ID", "visible initialization failure", "existing Creature and NPC snapshot stability"],
    }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolveStop) => {
        const timeout = setTimeout(resolveStop, 2_000);
        server!.once("exit", () => { clearTimeout(timeout); resolveStop(); });
      });
    }
    await cleanup(pool, userId).catch((error) => console.error(error));
    await pool.end();
    await rm(distPath, { recursive: true, force: true });
    await writeFile(tsconfigPath, tsconfigBefore);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
