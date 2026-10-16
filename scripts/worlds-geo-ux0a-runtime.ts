/** Explicitly owned production browser target; never loads shared environment files. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import { ownedPool, ux0aEnvironment, UX0A_DIRECTORY,type Environment } from "./worlds-geo-ux0a-harness";

export async function islandRuntime(target: "empty" | "compat", label: string, environment?:Environment) {
  const e = environment??await ux0aEnvironment(), pool = await ownedPool(e, target); await pool.end();
  const checkoutName=process.env.SERRIAN_UX0A_CHECKOUT??"runtime-checkout";
  assert.ok(["runtime-checkout","runtime-checkout-library","runtime-checkout-overview"].includes(checkoutName));
  const base = `http://127.0.0.1:${e.appPort}`, log = createWriteStream(path.join(UX0A_DIRECTORY, `${label}-server.log`));
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(e.appPort)], {
    cwd: path.join(UX0A_DIRECTORY, checkoutName), windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: e[target], SERRIAN_RASTER_ROOT: e.assetRoot, BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: "UX0A-owned-disposable-auth-secret-only", SERRIAN_TEST_NEXT_DIST_DIR: ".next-geo-ux0a", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const close = async () => {
    if (browser) await browser.close();
    if (server.pid && server.exitCode === null) {
      try { execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }); }
      catch { if(server.exitCode===null)server.kill(); } // Restricted Windows runners may deny taskkill's process-tree query.
    }
    if(server.exitCode===null)await new Promise<void>(resolve=>{const timer=setTimeout(resolve,3000);server.once("exit",()=>{clearTimeout(timer);resolve();});});
    log.end();
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(server.exitCode, null, "Owned application must still be running");
      try { if ((await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Starting owned server. */ }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.ok(ready);
    browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const login = async (context: BrowserContext, id = e.users.owner) => {
      const response = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${id}@example.invalid`, password: "UX0A-Disposable-Only-Password!" } });
      assert.equal(response.status(), 200, await response.text());
    };
    return { e, base, browser, login, close, serverPid: server.pid! };
  } catch (error) { await close(); throw error; }
}
