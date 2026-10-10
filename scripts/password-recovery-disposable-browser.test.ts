import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const originalPassword = "Password-Recovery-Test-Only!";
const newPassword = "Recovered-Password-Test-Only!";
const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const executable = (name: string) => path.join(postgresBin, process.platform === "win32" ? `${name}.exe` : name);

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function signIn(context: BrowserContext, baseUrl: string, identity: string, password = originalPassword) {
  const response = await context.request.post(`${baseUrl}/api/auth/sign-in/email`, {
    headers: { Origin: baseUrl }, data: { email: `${identity}@example.invalid`, password },
  });
  assert.equal(response.status(), 200, `Test account ${identity} must be able to sign in.`);
}

async function toggle(page: Page, id: string, buttonName: string) {
  const input = page.locator(`#${id}`);
  const button = page.getByRole("button", { name: `Show ${buttonName}`, exact: true });
  await page.waitForFunction((inputId) => Object.keys(document.getElementById(inputId) ?? {}).some((key) => key.startsWith("__reactProps$")), id);
  await input.fill("Visible-Password-Test!");
  assert.equal(await input.getAttribute("type"), "password");
  await button.focus();
  await button.press("Space");
  await page.waitForFunction((inputId) => document.getElementById(inputId)?.getAttribute("type") === "text", id);
  assert.equal(await input.getAttribute("type"), "text");
  assert.equal(await input.inputValue(), "Visible-Password-Test!");
  await page.getByRole("button", { name: `Hide ${buttonName}`, exact: true }).click();
  await page.waitForFunction((inputId) => document.getElementById(inputId)?.getAttribute("type") === "password", id);
  assert.equal(await input.getAttribute("type"), "password");
}

async function main() {
  const tempParent = path.resolve(tmpdir());
  const temporaryRoot = path.resolve(await mkdtemp(path.join(tempParent, "serrian-password-recovery-")));
  const data = path.join(temporaryRoot, "data");
  const databasePort = await freePort();
  const appPort = await freePort();
  const databaseUrl = `postgresql://postgres@127.0.0.1:${databasePort}/serrian_password_recovery_test`;
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const artifactRoot = path.resolve("artifacts/guidance");
  const distName = `artifacts/guidance/password-recovery-next-${appPort}`;
  const distPath = path.resolve(distName);
  const configLineEnding = (await readFile("tsconfig.json", "utf8")).includes("\r\n") ? "\r\n" : "\n";
  await mkdir(artifactRoot, { recursive: true });
  const log = createWriteStream(path.join(artifactRoot, "password-recovery-next.log"));
  let started = false;
  let pool: pg.Pool | undefined;
  let applicationPool: pg.Pool | undefined;
  let server: ChildProcess | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const pageErrors: string[] = [];
  try {
    execFileSync(executable("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(executable("pg_ctl"), ["-D", data, "-l", path.join(temporaryRoot, "postgres.log"), "-o", `-p ${databasePort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${databasePort}/postgres` });
    await pool.query("create database serrian_password_recovery_test");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    const hashedPassword = await hashPassword(originalPassword);
    for (const role of ["player", "god", "admin", "none"]) {
      const identity = `recovery-${role}`;
      await pool.query('insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$1,$2,true,$1,$1)', [identity, `${identity}@example.invalid`]);
      await pool.query("insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())", [`${identity}-credential`, identity, hashedPassword]);
      if (role !== "none") await pool.query("insert into user_role (user_id,role) values ($1,$2)", [identity, role]);
    }
    process.env.DATABASE_URL = databaseUrl;
    const service = await import("../src/features/authorization/password-recovery-service");
    applicationPool = (await import("../src/db")).pool;
    await assert.rejects(service.replacePasswordRecoveryCodes("recovery-player", "invalid-session", originalPassword), /Sign in again/);

    const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseUrl, BETTER_AUTH_SECRET: "password-recovery-disposable-test-only-secret", SERRIAN_TEST_NEXT_DIST_DIR: distName, NEXT_TELEMETRY_DISABLED: "1" };
    await new Promise<void>((resolve, reject) => {
      const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      build.stdout!.pipe(log, { end: false });
      build.stderr!.pipe(log, { end: false });
      build.once("error", reject);
      build.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Isolated production build failed (${code}); see artifacts/guidance/password-recovery-next.log.`)));
    });
    console.log("PASS: production build against the disposable database.");
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(appPort)], { env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    server.stdout!.pipe(log);
    server.stderr!.pipe(log);
    const deadline = Date.now() + 120_000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.equal(server.exitCode, null, "The isolated app must remain running.");
      try { if ((await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(5000) })).ok) { ready = true; break; } } catch { /* Starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert.ok(ready, "The isolated app must become ready.");
    browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.10" } });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const failedRequests: string[] = [];
    page.on("requestfailed", (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    let signInSubmissions = 0;
    page.on("request", (request) => { if (request.url().includes("/api/auth/sign-in/") && request.method() === "POST") signInSubmissions++; });
    try { await toggle(page, "password", "password"); }
    catch (error) {
      console.log(JSON.stringify({ pageErrors, failedRequests, document: await page.evaluate(() => ({ ready: document.readyState, scripts: [...document.scripts].map((script) => script.src).filter(Boolean), properties: Object.keys(document.getElementById("password") ?? {}) })) }));
      throw error;
    }
    assert.equal(signInSubmissions, 0, "Toggling visibility must not submit sign-in.");
    await page.screenshot({ path: path.join(artifactRoot, "password-login-desktop.png"), fullPage: true });
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.getByLabel("Recovery code", { exact: true }).waitFor();
    await page.goto(`${baseUrl}/register`, { waitUntil: "domcontentloaded" });
    await toggle(page, "password", "password");
    await toggle(page, "confirmPassword", "confirmation password");
    assert.equal(await page.locator("#password").getAttribute("aria-describedby"), "password-rules");
    console.log("PASS: sign-in and registration show/hide controls work with the keyboard and do not submit forms.");

    const otherContext = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.11" } });
    await signIn(otherContext, baseUrl, "recovery-player");
    for (const role of ["god", "admin", "none"]) {
      const roleContext = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": `203.0.113.${20 + ["god", "admin", "none"].indexOf(role)}` } });
      await signIn(roleContext, baseUrl, `recovery-${role}`);
      const rolePage = await roleContext.newPage();
      await rolePage.goto(`${baseUrl}/profile`, { waitUntil: "domcontentloaded" });
      await rolePage.getByRole("heading", { name: "Password recovery", exact: true }).waitFor();
      await roleContext.close();
    }
    await signIn(context, baseUrl, "recovery-player");
    await page.goto(`${baseUrl}/profile`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Current password", { exact: true }).fill("incorrect-password");
    await page.getByRole("button", { name: "Generate recovery codes", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Your current password is incorrect." }).waitFor();
    assert.equal((await pool.query("select count(*)::int as n from user_password_recovery_code")).rows[0].n, 0);
    await page.getByLabel("Current password", { exact: true }).fill(originalPassword);
    await page.getByRole("button", { name: "Generate recovery codes", exact: true }).click();
    const codeList = page.getByRole("list", { name: "New password recovery codes" });
    await codeList.waitFor();
    const oldCodes = await codeList.locator("code").allTextContents();
    assert.equal(oldCodes.length, 8);
    const stored = (await pool.query("select code_hash,user_id from user_password_recovery_code")).rows;
    assert.equal(stored.length, 8);
    for (const code of oldCodes) assert.ok(!JSON.stringify(stored).includes(code.replaceAll("-", "")), "Only code hashes may be stored.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifactRoot, "password-profile-phone.png"), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download codes", exact: true }).click();
    const download = await downloadPromise;
    const downloadedPath = await download.path();
    assert.ok(downloadedPath);
    const downloaded = await readFile(downloadedPath, "utf8");
    for (const code of oldCodes) assert.ok(downloaded.includes(code));
    await page.getByRole("button", { name: "I saved my codes", exact: true }).click();
    assert.equal(await codeList.count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await codeList.count(), 0, "Saved codes must never be reloaded in plaintext.");
    await page.getByLabel("Current password", { exact: true }).fill(originalPassword);
    await page.getByRole("button", { name: "Generate new recovery codes", exact: true }).click();
    await codeList.waitFor();
    const codes = await codeList.locator("code").allTextContents();
    assert.equal(await service.redeemPasswordRecoveryCode(oldCodes[0]), null);
    const races = await Promise.all([service.redeemPasswordRecoveryCode(codes[0]), service.redeemPasswordRecoveryCode(codes[0])]);
    assert.equal(races.filter(Boolean).length, 1, "A code can be redeemed only once, even concurrently.");
    await pool.query("update verification set expires_at = now() - interval '1 minute' where value = 'recovery-player'");
    const expired = await context.request.post(`${baseUrl}/api/auth/reset-password`, { headers: { Origin: baseUrl }, data: { token: races.find(Boolean), newPassword } });
    assert.equal(expired.status(), 400);
    console.log("PASS: all account roles have recovery setup; password confirmation, hashed storage, downloads, replacement, concurrent consumption and expiry are enforced.");

    const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.30" } });
    const recoveryPage = await anonymous.newPage();
    recoveryPage.on("pageerror", (error) => pageErrors.push(error.message));
    await recoveryPage.goto(`${baseUrl}/reset-password`, { waitUntil: "domcontentloaded" });
    assert.equal(await recoveryPage.locator('input[name="newPassword"]').count(), 0);
    await recoveryPage.getByRole("link", { name: "Get help resetting your password" }).click();
    await recoveryPage.getByLabel("Recovery code", { exact: true }).fill(codes[1].toUpperCase().replaceAll("-", " "));
    await recoveryPage.getByLabel("Help for Recovery code", { exact: true }).click();
    await recoveryPage.screenshot({ path: path.join(artifactRoot, "password-recovery-guidance-phone.png"), fullPage: true });
    await recoveryPage.getByLabel("Help for Recovery code", { exact: true }).press("Escape");
    assert.equal(await recoveryPage.getByLabel("Recovery code", { exact: true }).inputValue(), codes[1].toUpperCase().replaceAll("-", " "));
    await recoveryPage.getByRole("button", { name: "Continue to reset password", exact: true }).click();
    await recoveryPage.waitForURL(/\/reset-password\?token=/);
    const usedToken = new URL(recoveryPage.url()).searchParams.get("token");
    assert.ok(usedToken);
    for (const invalidPassword of ["short", "x".repeat(129)]) {
      const invalidResponse = await anonymous.request.post(`${baseUrl}/api/auth/reset-password`, { headers: { Origin: baseUrl }, data: { token: usedToken, newPassword: invalidPassword } });
      assert.equal(invalidResponse.status(), 400, "Password length limits must be enforced by the server.");
    }
    await toggle(recoveryPage, "new-password", "new password");
    await recoveryPage.getByLabel("New password", { exact: true }).fill(newPassword);
    await recoveryPage.getByLabel("Confirm new password", { exact: true }).fill("Different-New-Password!");
    await recoveryPage.getByRole("button", { name: "Reset password", exact: true }).click();
    await recoveryPage.getByRole("alert").filter({ hasText: "Passwords do not match." }).waitFor();
    assert.ok((await pool.query("select count(*)::int as n from session where user_id = 'recovery-player'")).rows[0].n >= 2);
    await recoveryPage.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await recoveryPage.screenshot({ path: path.join(artifactRoot, "password-recovery-phone.png"), fullPage: true });
    assert.ok(await recoveryPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "The recovery form must fit a phone screen.");
    await recoveryPage.getByRole("button", { name: "Reset password", exact: true }).click();
    await recoveryPage.getByRole("status").filter({ hasText: "Your password has been reset." }).waitFor();
    assert.equal(new URL(recoveryPage.url()).search, "");
    assert.equal((await pool.query("select count(*)::int as n from session where user_id = 'recovery-player'")).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int as n from user_password_recovery_code where user_id = 'recovery-player'")).rows[0].n, 0);
    assert.equal(await (await otherContext.request.get(`${baseUrl}/api/auth/get-session`)).json(), null);
    const reuse = await anonymous.request.post(`${baseUrl}/api/auth/reset-password`, { headers: { Origin: baseUrl }, data: { token: usedToken, newPassword: originalPassword } });
    assert.equal(reuse.status(), 400);
    const oldSignIn = await anonymous.request.post(`${baseUrl}/api/auth/sign-in/email`, { headers: { Origin: baseUrl }, data: { email: "recovery-player@example.invalid", password: originalPassword } });
    assert.equal(oldSignIn.status(), 401);
    await signIn(anonymous, baseUrl, "recovery-player", newPassword);
    assert.equal((await pool.query("select role from user_role where user_id = 'recovery-player'")).rows[0].role, "player");
    console.log("PASS: anonymous recovery works at 390px; mismatch is visible, old passwords and reset-token reuse fail, all sessions and old codes are invalidated, and the new password signs in.");

    const crossOrigin = await anonymous.request.post(`${baseUrl}/api/auth/recover-password`, { headers: { Origin: "https://untrusted.example.invalid" }, data: { code: codes[2] } });
    assert.equal(crossOrigin.status(), 403);
    let finalStatus = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const attemptResponse = await anonymous.request.post(`${baseUrl}/api/auth/recover-password`, { headers: { Origin: baseUrl }, data: { code: "invalid-recovery-code" } });
      finalStatus = attemptResponse.status();
    }
    assert.equal(finalStatus, 429, "Recovery attempts must be rate limited.");
    assert.deepEqual(pageErrors, []);
    console.log("PASS: cross-origin recovery requests are rejected, repeated guesses are rate limited, and no browser runtime errors occurred.");
  } finally {
    if (browser) await browser.close();
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      else { server.kill(); await new Promise<void>((resolve) => server!.once("exit", () => resolve())); }
    }
    log.end();
    if (applicationPool) await applicationPool.end();
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(executable("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(path.dirname(temporaryRoot), tempParent);
    assert.ok(path.basename(temporaryRoot).startsWith("serrian-password-recovery-"));
    await rm(temporaryRoot, { recursive: true, force: true });
    assert.equal(path.dirname(distPath), artifactRoot);
    assert.equal(path.basename(distPath), `password-recovery-next-${appPort}`);
    await rm(distPath, { recursive: true, force: true });
    const config = JSON.parse(await readFile("tsconfig.json", "utf8")) as { include: string[] };
    config.include = config.include.filter((entry) => !entry.startsWith(`${distName}/`));
    await writeFile("tsconfig.json", `${JSON.stringify(config, null, 2)}\n`.replaceAll("\n", configLineEnding));
    const nextEnv = await readFile("next-env.d.ts", "utf8");
    await writeFile("next-env.d.ts", nextEnv.replaceAll(`./${distName}/`, "./.next/"));
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
