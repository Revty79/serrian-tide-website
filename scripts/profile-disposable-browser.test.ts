import { runCatalogPassThreeBrowserChecks } from "./catalog-pass-three-browser-checks";
import { runCatalogPassFourBrowserChecks } from "./catalog-pass-four-browser-checks";
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { chromium, type Page, type Route } from "playwright-core";

const labels = ["Races", "Creatures", "Skills", "Derived Abilities", "Equipment", "Inventory"];
const defaults = labels.map(() => "canon-and-mine");
const password = "Profile-Browser-Only-Password!";
const group = (page: Page, label: string) => page.getByRole("group", { name: label, exact: true });

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function selected(page: Page) {
  return Promise.all(labels.map(async (label) => {
    assert.equal(await group(page, label).locator("input:checked").count(), 1);
    return group(page, label).locator("input:checked").inputValue();
  }));
}

async function save(page: Page, label: string, choice: string) {
  await group(page, label).getByRole("radio", { name: choice, exact: true }).check();
  await group(page, label).getByRole("status").filter({ hasText: /^Saved\.$/ }).waitFor();
}

async function login(page: Page, baseUrl: string, identity: string) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Username or Email").fill(`profile-${identity}@example.invalid`);
  await page.locator('input[name="password"]').fill(password);
  async function submit() {
    const signingIn = page.waitForResponse((response) => response.url().includes("/api/auth/sign-in/"));
    await page.getByRole("button", { name: /^Enter$/ }).click();
    return signingIn;
  }
  let response = await submit();
  if (response.status() === 429) {
    // Many fixture logins share loopback. Honor the production limiter rather than disabling it.
    const retryAfter = Number(response.headers()["x-retry-after"]);
    assert.ok(Number.isFinite(retryAfter) && retryAfter >= 0 && retryAfter <= 30);
    await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
    response = await submit();
  }
  assert.equal(response.ok(), true, `Test sign-in failed (${response.status()}): ${response.ok() ? "" : await response.text()}`);
  try {
    await page.waitForURL(`${baseUrl}/access`, { timeout: 10_000 });
  } catch {
    throw new Error(`Test sign-in did not reach Access: ${page.url()}\n${await page.locator("body").innerText()}\nCookie names: ${(await page.context().cookies()).map((cookie) => cookie.name).join(", ")}`);
  }
}

async function runBuild(environment: NodeJS.ProcessEnv) {
  const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env: environment, stdio: "inherit", windowsHide: true });
  await new Promise<void>((resolve, reject) => {
    build.once("error", reject);
    build.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Production build exited with ${code}.`)));
  });
}

async function main() {
  const configLineEnding = (await readFile("tsconfig.json", "utf8")).includes("\r\n") ? "\r\n" : "\n";
  const tempParent = path.resolve(tmpdir());
  const temporaryRoot = path.resolve(await mkdtemp(path.join(tempParent, "serrian-profile-browser-")));
  const data = path.join(temporaryRoot, "data");
  const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const executable = (name: string) => path.join(postgresBin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const databasePort = await freePort();
  const appPort = await freePort();
  const baseUrl = `http://localhost:${appPort}`;
  const databaseUrl = `postgresql://postgres@127.0.0.1:${databasePort}/serrian_profile_browser_dev`;
  const artifactRoot = path.resolve("artifacts/guidance");
  const distName = `artifacts/guidance/profile-build-${appPort}`;
  const distPath = path.resolve(distName);
  const screenshots = path.join(artifactRoot, "profile-pass-two");
  let pool: pg.Pool | undefined;
  let started = false;
  let server: ChildProcess | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const errors: string[] = [];
  try {
    execFileSync(executable("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(executable("pg_ctl"), ["-D", data, "-l", path.join(temporaryRoot, "postgres.log"), "-o", `-p ${databasePort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${databasePort}/postgres` });
    await pool.query("create database serrian_profile_browser_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    const hashed = await hashPassword(password);
    for (const identity of ["player", "god", "admin", "none", "all"]) {
      const id = `profile-${identity}`;
      await pool.query('insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$1,$2)', [id, `Profile ${identity}`, `${id}@example.invalid`]);
      await pool.query("insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())", [`${id}-credential`, id, hashed]);
      for (const role of identity === "all" ? ["admin", "god", "player"] : identity === "none" ? [] : [identity]) await pool.query("insert into user_role (user_id,role) values ($1,$2)", [id, role]);
    }
    for (const [name, creator, source] of [["Profile Own Race", "profile-all", null], ["Profile Foreign Race", "profile-god", null], ["Profile Imported Race", null, "existing-source"]]) {
      await pool.query("insert into races (name,created_by_user_id,source_system,size) values ($1,$2,$3,'Medium')", [name, creator, source]);
    }
    const campaign = (await pool.query(`insert into campaign (name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id) values ('Profile Campaign',100,100,10,10,100,0,'Credits','Assigned',0,'profile-all') returning id`)).rows[0];
    const environment: NodeJS.ProcessEnv = {
      ...process.env, DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET: "profile-browser-only-secret-not-for-real-accounts",
      SERRIAN_TEST_NEXT_DIST_DIR: distName, NEXT_TELEMETRY_DISABLED: "1",
    };
    delete environment.NODE_TEST_CONTEXT;
    await runBuild(environment);
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(appPort)], { env: environment, stdio: "inherit", windowsHide: true });
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.equal(server.exitCode, null, "The isolated app must remain running.");
      try { if ((await fetch(`${baseUrl}/login`)).ok) { ready = true; break; } } catch { /* Starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, "The isolated app must become ready.");
    browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/profile`);
    await page.waitForURL(`${baseUrl}/login`);
    assert.equal(await page.getByRole("group", { name: "Races", exact: true }).count(), 0);
    console.log("PASS: anonymous Profile access redirects to login.");

    for (const identity of ["player", "god", "admin", "none"]) {
      const roleContext = await browser.newContext();
      const rolePage = await roleContext.newPage();
      rolePage.on("pageerror", (error) => errors.push(error.message));
      await login(rolePage, baseUrl, identity);
      await rolePage.getByRole("link", { name: "Profile", exact: true }).click();
      await rolePage.getByRole("heading", { name: "Profile", exact: true }).waitFor();
      assert.deepEqual(await selected(rolePage), defaults);
      assert.equal(await rolePage.getByRole("region", { name: "Account", exact: true }).locator("input").count(), 0);
      assert.equal((await pool.query("select count(*)::int n from user_catalog_preferences where user_id=$1", [`profile-${identity}`])).rows[0].n, 0);
      await roleContext.close();
    }
    console.log("PASS: Player, G.O.D., Administrator, and roleless accounts see six defaults without backfill.");

    await login(page, baseUrl, "player");
    await page.goto(`${baseUrl}/realms`);
    await page.locator('.authenticated-navigation a[href="/profile"]:visible').click();
    await page.getByRole("heading", { name: "Profile", exact: true }).waitFor();
    await save(page, "Races", "Mine Only");
    const expected = ["mine", ...defaults.slice(1)];
    assert.deepEqual(await selected(page), expected);
    await page.reload();
    assert.deepEqual(await selected(page), expected);
    await save(page, "Equipment", "Canon Only");
    await save(page, "Inventory", "Mine Only");
    expected[4] = "canon"; expected[5] = "mine";
    assert.deepEqual(await selected(page), expected);
    assert.equal(await page.getByRole("button", { name: /save/i }).count(), 0);
    const stored = (await pool.query("select * from user_catalog_preferences where user_id='profile-player'")).rows[0];
    assert.equal(stored.race_visibility, "mine");
    assert.equal(stored.equipment_visibility, "canon");
    assert.equal(stored.inventory_visibility, "mine");
    console.log("PASS: autosave changes only its catalog and survives reload; Equipment and Inventory remain independent.");

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let requests = 0;
    const hold = async (route: Route) => {
      if (route.request().method() === "POST" && route.request().postData()?.includes('"catalog":"skill"')) { requests += 1; await gate; }
      await route.continue();
    };
    await page.route("**/profile", hold);
    try {
      const request = page.waitForRequest((entry) => entry.method() === "POST" && Boolean(entry.postData()?.includes('"catalog":"skill"')));
      await group(page, "Skills").getByRole("radio", { name: "Mine Only", exact: true }).check();
      await request;
      await group(page, "Skills").getByRole("status").filter({ hasText: "Saving" }).waitFor();
      for (const radio of await group(page, "Skills").getByRole("radio").all()) assert.equal(await radio.isDisabled(), true);
      assert.equal(await group(page, "Derived Abilities").getByRole("radio").first().isEnabled(), true);
      await group(page, "Derived Abilities").getByRole("radio", { name: "Canon Only", exact: true }).check();
      release();
      await group(page, "Skills").getByRole("status").filter({ hasText: "Saved." }).waitFor();
      await group(page, "Derived Abilities").getByRole("status").filter({ hasText: "Saved." }).waitFor();
      expected[2] = "mine"; expected[3] = "canon";
      assert.deepEqual(await selected(page), expected);
      assert.equal(requests, 1);
    } finally { release(); await page.unroute("**/profile", hold); }
    const fail = async (route: Route) => route.request().method() === "POST" ? route.abort("failed") : route.continue();
    await page.route("**/profile", fail);
    await group(page, "Races").getByRole("radio", { name: "Canon Only", exact: true }).check();
    await group(page, "Races").getByRole("alert").waitFor();
    assert.deepEqual(await selected(page), expected);
    assert.equal(await group(page, "Races").getByRole("status").count(), 0);
    assert.equal((await pool.query("select race_visibility from user_catalog_preferences where user_id='profile-player'")).rows[0].race_visibility, "mine");
    await page.unroute("**/profile", fail);
    await save(page, "Races", "Canon Only");
    await save(page, "Races", "Mine Only");
    await group(page, "Creatures").getByRole("radio", { name: "Canon + Mine", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await group(page, "Creatures").getByRole("status").filter({ hasText: "Saved." }).waitFor();
    expected[1] = "mine";
    assert.deepEqual(await selected(page), expected);
    console.log("PASS: pending rows reject repeats, other rows save independently, failed saves restore selection, retry and keyboard selection work.");

    await page.locator('.authenticated-navigation button:visible').filter({ hasText: "Log Out" }).click();
    await page.waitForURL(`${baseUrl}/login`);
    await page.goto(`${baseUrl}/profile`);
    await page.waitForURL(`${baseUrl}/login`);
    await login(page, baseUrl, "god");
    await page.goto(`${baseUrl}/profile`);
    assert.deepEqual(await selected(page), defaults, "Another account must not inherit the previous user's preferences.");
    await page.locator('.authenticated-navigation button:visible').filter({ hasText: "Log Out" }).click();
    await page.waitForURL(`${baseUrl}/login`);
    await login(page, baseUrl, "player");
    await page.goto(`${baseUrl}/profile`);
    assert.deepEqual(await selected(page), expected);
    console.log("PASS: actual logout/login preserves preferences and switching accounts does not leak choices.");

    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, "profile-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator("fieldset label").evaluateAll((elements) => elements.every((element) => element.getBoundingClientRect().height >= 44)), true);
    await page.screenshot({ path: path.join(screenshots, "profile-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Help with this page" }).click();
    await page.getByRole("dialog", { name: "Your Profile" }).waitFor();
    await page.getByLabel("Find a field or topic").fill("existing Campaigns");
    await page.getByRole("heading", { name: "Browsing and existing Campaigns" }).waitFor();
    await page.getByRole("dialog", { name: "Your Profile" }).press("Escape");
    await page.getByRole("dialog", { name: "Your Profile" }).waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "Help with this page" }).evaluate((element) => element === document.activeElement), true);
    await page.goto(`${baseUrl}/realms`);
    await page.getByText("Navigate", { exact: true }).click();
    await page.locator('.authenticated-navigation a[href="/profile"]:visible').click();
    await page.waitForURL(`${baseUrl}/profile`);
    assert.equal(await page.locator(".authenticated-navigation details[open]").count(), 0);
    assert.deepEqual(await selected(page), expected);
    await page.getByText("Navigate", { exact: true }).click();
    await page.locator('.authenticated-navigation button:visible').filter({ hasText: "Log Out" }).click();
    await page.waitForURL(`${baseUrl}/login`);
    console.log("PASS: 390px controls, guidance, mobile Profile navigation, disclosure closing and logout work.");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, baseUrl, "all");
    for (const route of ["/admin", "/heavens", "/realms"]) {
      await page.goto(`${baseUrl}${route}`);
      await page.locator('.authenticated-navigation a[href="/profile"]:visible').click();
      await page.waitForURL(`${baseUrl}/profile`);
      await page.locator(".authenticated-navigation summary:visible").filter({ hasText: "Switch Path" }).click();
      await page.locator(`.authenticated-navigation a[href="${route}"]:visible`).click();
      await page.waitForURL(`${baseUrl}${route}`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByText("Navigate", { exact: true }).click();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".authenticated-navigation details[open]").count(), 0);
      await page.getByText("Navigate", { exact: true }).click();
      await page.locator('.authenticated-navigation a[href="/profile"]:visible').click();
      await page.waitForURL(`${baseUrl}/profile`);
      await page.getByText("Navigate", { exact: true }).click();
      await page.locator(`.authenticated-navigation a[href="${route}"]:visible`).click();
      await page.waitForURL(`${baseUrl}${route}`);
      assert.equal(await page.locator(".authenticated-navigation details[open]").count(), 0);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    console.log("PASS: all three paths retain desktop/mobile Profile links and Switch Path navigation.");

    await page.goto(`${baseUrl}/profile`);
    await save(page, "Races", "Mine Only");
    await page.goto(`${baseUrl}/heavens/races`);
    for (const name of ["Profile Own Race", "Profile Foreign Race", "Profile Imported Race"]) await page.getByText(name, { exact: true }).waitFor();
    assert.equal(await page.getByRole("radio", { name: "Mine Only", exact: true }).isChecked(), true);
    await page.getByText(/Browsing keeps the full catalog/).waitFor();
    await page.goto(`${baseUrl}/heavens/campaigns?campaign=${campaign.id}`);
    await page.getByRole("button", { name: "Allowed Races", exact: true }).click();
    for (const name of ["Profile Own Race", "Profile Foreign Race", "Profile Imported Race"]) await page.getByRole("checkbox", { name: `Select ${name}`, exact: true }).waitFor();
    assert.equal((await pool.query("select count(*)::int n from races where is_system_canon")).rows[0].n, 0);
    assert.deepEqual(errors, []);
    console.log("PASS: the activation guard preserves the unclassified Race catalog and Campaign references; preferences alone cannot promote content.");
    await runCatalogPassThreeBrowserChecks({ page, pool, databaseUrl, baseUrl, screenshots, login });
    await runCatalogPassFourBrowserChecks({ page, pool, baseUrl, screenshots, login });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      else { server.kill(); await new Promise<void>((resolve) => server!.once("exit", () => resolve())); }
    }
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(executable("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(path.dirname(temporaryRoot), tempParent);
    assert.ok(path.basename(temporaryRoot).startsWith("serrian-profile-browser-"));
    await rm(temporaryRoot, { recursive: true, force: true });
    assert.equal(path.dirname(distPath), artifactRoot);
    assert.equal(path.basename(distPath), `profile-build-${appPort}`);
    await rm(distPath, { recursive: true, force: true });
    // Remove only this run's generated TypeScript includes, retaining any unrelated edits.
    const config = JSON.parse(await readFile("tsconfig.json", "utf8")) as { include: string[] };
    config.include = config.include.filter((entry) => !entry.startsWith(`${distName}/`));
    await writeFile("tsconfig.json", `${JSON.stringify(config, null, 2)}\n`.replaceAll("\n", configLineEnding));
    const nextEnv = await readFile("next-env.d.ts", "utf8");
    await writeFile("next-env.d.ts", nextEnv.replaceAll(`./${distName}/types/`, "./.next/types/"));
  }
}

main().then(() => console.log("PASS: all Profile/catalog browser assertions and disposable cleanup completed."))
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; });
