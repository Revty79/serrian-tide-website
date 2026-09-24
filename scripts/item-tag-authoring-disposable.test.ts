import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { chromium, type Page, type Route } from "playwright-core";

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForTag(page: Page, name: string) {
  await page.waitForFunction((tag) => document.querySelector(".item-tag-editor__selected")?.textContent?.includes(tag), name);
  assert.equal(await page.getByRole("button", { name: "Save Item", exact: true }).isEnabled(), true);
}

test("Item tag creation protects Equipment and Inventory drafts through pending requests, tab changes and retry", { timeout: 300_000 }, async () => {
  const parent = path.resolve(tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "serrian-item-tags-")));
  assert.equal(path.dirname(root), parent);
  assert.ok(path.basename(root).startsWith("serrian-item-tags-"));
  const data = path.join(root, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const databasePort = await freePort();
  const appPort = await freePort();
  const baseUrl = `http://localhost:${appPort}`;
  const databaseUrl = `postgresql://postgres@127.0.0.1:${databasePort}/serrian_item_tags_dev`;
  const distName = `.next-item-tags-${appPort}`;
  const distPath = path.resolve(distName);
  assert.equal(path.dirname(distPath), process.cwd());
  const tsconfigPath = path.resolve("tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  let started = false;
  let pool: pg.Pool | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${databasePort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${databasePort}/postgres` });
    await pool.query("create database serrian_item_tags_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    const userId = "item-tag-browser-god", password = "Item-Tag-Browser-Only!", email = "item-tag-browser@example.invalid";
    await pool.query('insert into "user"(id,name,email,email_verified,username,display_username) values($1,$1,$2,true,$1,$1)', [userId, email]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [`${userId}-credential`, userId, await hashPassword(password)]);
    await pool.query("insert into user_role(user_id,role) values($1,'god')", [userId]);
    const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseUrl, SERRIAN_TEST_NEXT_DIST_DIR: distName, NEXT_TELEMETRY_DISABLED: "1" };
    delete environment.NODE_TEST_CONTEXT;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(appPort)], { env: environment, stdio: "inherit", windowsHide: true });
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.equal(server.exitCode, null, "The test app must stay running");
      try { if ((await fetch(baseUrl)).ok) { ready = true; break; } } catch { /* Starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, "The test app must become ready");
    browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Username or Email").fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /^Enter$/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));

    for (const scope of ["equipment", "inventory"] as const) {
      const itemName = `Guarded ${scope}`;
      const sharedTag = "Shared Browser Genre";
      await page.goto(`${baseUrl}/heavens/${scope}`);
      await page.getByRole("button", { name: scope === "equipment" ? "New Equipment" : "New Item", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill(itemName);
      await page.getByLabel("Description", { exact: true }).fill("Keep this unsaved description.");
      if (scope === "inventory") await page.getByRole("button", { name: "Tags", exact: true }).click();
      await page.getByLabel("New tag name", { exact: true }).fill(scope === "inventory" ? sharedTag.toLowerCase() : sharedTag);
      await page.getByRole("button", { name: "Create & Add", exact: true }).click();
      await waitForTag(page, sharedTag);
      assert.equal((await pool.query("select count(*)::int n from item_tags_catalog where lower(name)=lower($1)", [sharedTag])).rows[0].n, 1);
      await page.getByRole("button", { name: "Save Item", exact: true }).click();
      await page.getByText(`${itemName} was saved.`, { exact: true }).waitFor();
      await page.reload();
      await page.locator(".skill-library__row").filter({ hasText: itemName }).click();
      await waitForTag(page, sharedTag);
      const editedName = `${itemName} with pending edits`;
      await page.getByLabel("Name", { exact: true }).fill(editedName);
      if (scope === "inventory") await page.getByRole("button", { name: "Tags", exact: true }).click();

      const pendingTag = `Pending ${scope} tag`;
      await page.getByLabel("New tag name", { exact: true }).fill(pendingTag);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const hold = async (route: Route) => {
        if (route.request().method() === "POST" && route.request().postData()?.includes(pendingTag)) await gate;
        await route.continue();
      };
      await page.route(`**/heavens/${scope}`, hold);
      try {
        const request = page.waitForRequest((entry) => entry.method() === "POST" && Boolean(entry.postData()?.includes(pendingTag)));
        await page.getByRole("button", { name: "Create & Add", exact: true }).click();
        await request;
        await page.getByRole("status").filter({ hasText: "Creating tag" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Save Item", exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: scope === "equipment" ? "New Equipment" : "New Item", exact: true }).isDisabled(), true);
        assert.equal(await page.locator(".skill-library__row").first().isDisabled(), true);
        // Unmount the original tag editor while its request is still pending.
        await page.getByRole("button", { name: scope === "inventory" ? "Overview" : "Tags", exact: true }).click();
        await page.getByRole("button", { name: "Overview", exact: true }).click();
        assert.equal(await page.getByLabel("Name", { exact: true }).isDisabled(), true);
        assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), editedName);
        release();
        await waitForTag(page, pendingTag);
      } finally {
        release();
        await page.unroute(`**/heavens/${scope}`, hold);
      }
      assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), editedName);
      assert.equal(await page.getByLabel("Description", { exact: true }).inputValue(), "Keep this unsaved description.");
      assert.equal(await page.getByLabel("Name", { exact: true }).isEnabled(), true);
      await page.getByRole("button", { name: "Save Item", exact: true }).click();
      await page.getByText(`${editedName} was saved.`, { exact: true }).waitFor();
      await page.reload();
      await page.locator(".skill-library__row").filter({ hasText: editedName }).click();
      await waitForTag(page, pendingTag);
      assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), editedName);
      assert.equal((await pool.query("select count(*)::int n from item_tag_links l join items i on i.id=l.item_id join item_tags_catalog t on t.id=l.tag_id where i.name=$1 and t.name=$2", [editedName, pendingTag])).rows[0].n, 1);
      console.log(`PASS: ${scope} draft, tags and single persisted assignment survive delayed creation and tab changes`);
    }

    const retryTag = "Retry after tag failure";
    await page.getByLabel("New tag name", { exact: true }).fill(retryTag);
    const fail = async (route: Route) => {
      if (route.request().method() === "POST" && route.request().postData()?.includes(retryTag)) await route.abort("failed");
      else await route.continue();
    };
    await page.route("**/heavens/inventory", fail);
    await page.getByRole("button", { name: "Create & Add", exact: true }).click();
    await page.locator(".skill-editor__feedback.is-error").waitFor();
    assert.equal(await page.getByRole("button", { name: "Save Item", exact: true }).isEnabled(), true);
    assert.equal(await page.getByLabel("New tag name", { exact: true }).inputValue(), retryTag);
    assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Guarded inventory with pending edits");
    await page.unroute("**/heavens/inventory", fail);
    await page.getByRole("button", { name: "Create & Add", exact: true }).click();
    await waitForTag(page, retryTag);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log("PASS: failed creation retains input and Item draft, releases controls, and permits retry; 390px layout fits");
  } finally {
    if (browser) await browser.close();
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      else { server.kill(); await new Promise<void>((resolve) => server!.once("exit", () => resolve())); }
    }
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(existsSync(path.join(data, "postmaster.pid")), false);
    await rm(root, { recursive: true, force: true });
    await rm(distPath, { recursive: true, force: true });
    await writeFile(tsconfigPath, tsconfigBefore);
  }
});
