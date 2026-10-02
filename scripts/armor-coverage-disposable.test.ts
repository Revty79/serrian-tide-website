import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { chromium } from "playwright-core";

import { APPEARANCE_PRESETS, getAppearanceCssVariables } from "../src/features/appearance/appearance";

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

test("Armor coverage saves standard and custom locations in both catalogs", { timeout: 300_000 }, async () => {
  const parent = path.resolve(tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "serrian-armor-coverage-")));
  assert.equal(path.dirname(root), parent);
  assert.ok(path.basename(root).startsWith("serrian-armor-coverage-"));
  const data = path.join(root, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const databasePort = await freePort();
  const appPort = await freePort();
  const baseUrl = `http://localhost:${appPort}`;
  const databaseUrl = `postgresql://postgres@127.0.0.1:${databasePort}/serrian_armor_coverage_dev`;
  const distName = `.next-armor-coverage-${appPort}`;
  const distPath = path.resolve(distName);
  assert.equal(path.dirname(distPath), process.cwd());
  const tsconfigPath = path.resolve("tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  const artifacts = path.resolve("artifacts/guidance/armor-coverage");
  await mkdir(artifacts, { recursive: true });
  let started = false;
  let pool: pg.Pool | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${databasePort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${databasePort}/postgres` });
    await pool.query("create database serrian_armor_coverage_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    const userId = "armor-coverage-browser-god", password = "Armor-Coverage-Browser-Only!", email = "armor-coverage-browser@example.invalid";
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

    const button = (name: string) => page.getByRole("button", { name, exact: true });
    assert.equal((await pool.query("select count(*)::int n from armor_location_reference")).rows[0].n, 0);
    for (const scope of ["equipment", "inventory"] as const) {
      const name = `Coverage ${scope}`;
      await page.goto(`${baseUrl}/heavens/${scope}`);
      await button(scope === "equipment" ? "New Equipment" : "New Item").click();
      await page.getByLabel("Name", { exact: true }).fill(name);
      await button("Armor").click(); await button("Add Armor Profile").click();
      await page.getByLabel("Base Soak", { exact: true }).fill("3");
      const coverage = page.locator("[data-armor-coverage]");
      const select = coverage.getByLabel("Body location", { exact: true });
      assert.deepEqual(await select.locator("option").allTextContents(), ["Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg", "Groin", "Stomach", "Chest", "Other"]);
      for (const key of ["head", "right-arm", "right-leg"]) { await select.selectOption(key); await coverage.getByRole("button", { name: "Add", exact: true }).click(); }
      await coverage.getByRole("button", { name: "Add", exact: true }).click();
      await coverage.getByRole("alert").filter({ hasText: "already" }).waitFor();
      await select.selectOption("other"); await coverage.getByRole("button", { name: "Add", exact: true }).click();
      await coverage.getByRole("alert").filter({ hasText: "Enter" }).waitFor();
      await coverage.getByLabel("Other body location", { exact: true }).fill("Tail");
      await coverage.getByLabel("Other body location", { exact: true }).press("Enter");
      await coverage.getByLabel("Other body location", { exact: true }).fill(" tail ");
      await coverage.getByRole("button", { name: "Add", exact: true }).click();
      await coverage.getByRole("alert").filter({ hasText: "already" }).waitFor();
      await select.selectOption("head");
      await button("Save Item").click(); await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
      const id: number = (await pool.query("select id from items where name=$1", [name])).rows[0].id;
      const readKeys = async () => (await pool!.query("select location_code from armor_locations where item_id=$1 order by sort_order", [id])).rows.map(row => row.location_code);
      assert.deepEqual(await readKeys(), ["0", "1", "3", "4", "custom:tail"]);
      await page.reload(); await page.locator(".skill-library__row").filter({ hasText: name }).click(); await button("Armor").click();
      await coverage.getByRole("button", { name: "Remove Tail coverage", exact: true }).waitFor();
      await coverage.getByRole("button", { name: "Remove Right Arm coverage", exact: true }).click();
      await button("Save Item").click(); await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
      assert.deepEqual(await readKeys(), ["0", "3", "4", "custom:tail"]);
      // Existing lower-leg-only coverage must remain partial until the author adds the whole leg.
      await pool.query("delete from armor_locations where item_id=$1 and location_code='4'", [id]);
      await page.reload(); await page.locator(".skill-library__row").filter({ hasText: name }).click(); await button("Armor").click();
      await coverage.getByRole("button", { name: "Remove Right Lower Leg coverage", exact: true }).waitFor();
      await select.selectOption("right-leg"); await coverage.getByRole("button", { name: "Add", exact: true }).click();
      await button("Save Item").click(); await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
      assert.deepEqual([...(await readKeys())].sort(), ["0", "3", "4", "custom:tail"]);
      // Bypassing the UI must reject an unknown reference and roll back the Item save.
      await page.route("**/heavens/**", async route => {
        const request = route.request();
        if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes('"custom:Tail"')) await route.continue({ postData: request.postData()!.replaceAll('"custom:Tail"', '"unknown-body-location"') });
        else await route.continue();
      });
      await page.getByLabel("Coverage", { exact: true }).fill("Saved coverage description");
      await button("Save Item").click();
      await page.locator(".skill-editor__feedback.is-error").filter({ hasText: "body location no longer exists" }).waitFor();
      assert.deepEqual([...(await readKeys())].sort(), ["0", "3", "4", "custom:tail"]);
      await page.unrouteAll(); await button("Save Item").click(); await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
      await coverage.screenshot({ path: path.join(artifacts, `${scope}-desktop.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      await select.selectOption("other"); await coverage.getByLabel("Other body location", { exact: true }).fill("Left Wing");
      await coverage.locator('summary[aria-label="Help for Other body location"]').click();
      await coverage.screenshot({ path: path.join(artifacts, `${scope}-phone.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const control of await coverage.locator("select,input,button").all()) assert.equal(await control.evaluate(el => { const rect = el.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }), true);
      const background = await select.evaluate(el => getComputedStyle(el).backgroundColor);
      await coverage.evaluate((el, variables) => { el.setAttribute("data-appearance-theme-scope", ""); for (const [key, value] of Object.entries(variables)) (el as HTMLElement).style.setProperty(key, value); }, getAppearanceCssVariables(APPEARANCE_PRESETS.classic));
      await page.waitForTimeout(250);
      assert.notEqual(await select.evaluate(el => getComputedStyle(el).backgroundColor), background);
      await coverage.evaluate(el => { el.removeAttribute("data-appearance-theme-scope"); el.removeAttribute("style"); });
      await page.setViewportSize({ width: 1280, height: 900 });
      await button("Preview").click(); await page.getByText("Covered locations: Head, Right Leg, Tail", { exact: true }).waitFor();
      await button("Variants").click(); await page.getByPlaceholder("Variant name", { exact: true }).fill(`${name} variant`); await button("Clone as Variant").click();
      await page.getByText(`${name} variant was created as a variant.`, { exact: true }).waitFor();
      await button("Armor").click(); await coverage.getByRole("button", { name: "Remove Tail coverage", exact: true }).waitFor();
      const variant: { id: number } | undefined = (await pool.query<{ id: number }>("select id from items where name=$1 and parent_item_id=$2", [`${name} variant`, id])).rows[0]; assert.ok(variant);
      assert.equal((await pool.query("select count(*)::int n from armor_locations where item_id=$1", [variant.id])).rows[0].n, 4);
      while (await coverage.getByRole("button", { name: /^Remove .* coverage$/ }).count()) await coverage.getByRole("button", { name: /^Remove .* coverage$/ }).first().click();
      await button("Save Item").click(); await page.getByText(`${name} variant was saved.`, { exact: true }).waitFor();
      assert.equal((await pool.query("select count(*)::int n from armor_locations where item_id=$1", [variant.id])).rows[0].n, 0);
    }
    assert.equal((await pool.query("select count(*)::int n from armor_location_reference where location_code='custom:tail'")).rows[0].n, 1);
    assert.deepEqual(errors, []);
    console.log("PASS: empty-reference database, both catalogs, add/remove, duplicate validation, save/reload, partial legs, custom references, atomic server rejection, clone, clear, phone and theme checks");
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
