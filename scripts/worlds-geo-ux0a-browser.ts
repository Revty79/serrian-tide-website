/** Production-mode v1/v2 compatibility browser proof in owned disposable targets. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import sharp from "sharp";
import { ownedPool, ux0aEnvironment, UX0A_DIRECTORY } from "./worlds-geo-ux0a-harness";

const screenshots = "docs/screenshots/worlds-geo-ux0a/foundation";
async function main() {
  const e = await ux0aEnvironment(), pool = await ownedPool(e, "compat"), f = JSON.parse(await readFile(path.join(UX0A_DIRECTORY, "legacy-fixture.json"), "utf8"));
  const drawings = (await pool.query("select content from world_atlas_drawing where map_id=$1 order by sort_order", [f.map])).rows.map(row => row.content), placed = drawings.find(d => d.version === 2 && d.type === "symbol"); assert.ok(placed);
  await pool.end(); await mkdir(screenshots, { recursive: true });
  const checkout = path.join(UX0A_DIRECTORY, "runtime-checkout"), base = `http://127.0.0.1:${e.appPort}`, log = createWriteStream(path.join(UX0A_DIRECTORY, "browser-server.log"));
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(e.appPort)], { cwd: checkout, windowsHide: true, env: { ...process.env, NODE_ENV: "production", DATABASE_URL: e.compat, SERRIAN_RASTER_ROOT: e.assetRoot, BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: "UX0A-owned-disposable-auth-secret-only", SERRIAN_TEST_NEXT_DIST_DIR: ".next-geo-ux0a", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const errors: string[] = [], results: string[] = [];
  try {
    let ready = false; for (let i = 0; i < 100; i++) { assert.equal(server.exitCode, null); try { if ((await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Task server starting. */ } await new Promise(resolve => setTimeout(resolve, 300)); } assert.ok(ready);
    browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const login = async (context: BrowserContext, id: string) => { const response = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${id}@example.invalid`, password: "UX0A-Disposable-Only-Password!" } }); assert.equal(response.status(), 200, await response.text()); };
    const open = async (page: Page) => {
      await page.goto(`${base}/worlds/${f.world}`); await page.getByRole("button", { name: "Atlas", exact: true }).click();
      await page.getByRole("button", { name: "Open Retained legacy source", exact: true }).click();
      const edit = page.getByRole("button", { name: "Edit map", exact: true }); if (await edit.isVisible()) await edit.click();
      await page.getByRole("application", { name: "Editable map canvas" }).waitFor();
    };
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); await login(desktop, e.users.owner);
    const page = await desktop.newPage(); page.on("pageerror", error => errors.push(error.message)); await open(page);
    const canvas = page.getByRole("application", { name: "Editable map canvas" });
    await canvas.locator(`[data-drawing="${placed.id}"] use`).waitFor();
    assert.equal(await canvas.locator("[data-missing-artwork]").count(), 0); assert.equal(await canvas.locator("[data-illustrated-terrain]").count(), 1);
    const position = await canvas.evaluate((node, point) => { const matrix = (node as SVGSVGElement).getScreenCTM()!; const result = new DOMPoint(point.x, point.y).matrixTransform(matrix); return { x: result.x, y: result.y }; }, placed.point);
    await page.mouse.click(position.x, position.y); await page.getByLabel("Drawing name", { exact: true }).fill("Browser retained v2 city"); await page.getByRole("button", { name: "Apply drawing changes", exact: true }).click();
    const saved = page.waitForResponse(response => response.url().includes(`/api/worlds/${f.world}/atlas`) && response.request().method() === "POST"); await page.getByRole("button", { name: "Save map", exact: true }).click(); assert.equal((await saved).status(), 200);
    await page.getByRole("status").filter({ hasText: "Map saved." }).waitFor(); results.push("actual desktop edit/apply/save retains v2 source and persistent city identity");
    await page.getByRole("region", { name: "Map Studio", exact: true }).screenshot({ path: `${screenshots}/desktop-v1-v2.png` });
    await page.getByRole("navigation", { name: "Studio tools" }).getByRole("button", { name: "Export", exact: true }).click();
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export PNG", exact: true }).click(); const image = await download; const png = path.join(UX0A_DIRECTORY, "v2-map-export.png"); await image.saveAs(png);
    const exported = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); let shaded = 0;
    for (let i = 0; i < exported.data.length; i += 4) if (exported.data[i] === 139 && exported.data[i + 1] === 147 && exported.data[i + 2] === 135) shaded++;
    assert.ok(shaded > 100, "Export contains the original vector artwork's shaded mountain pixels"); await sharp(png).png().toFile(`${screenshots}/v1-v2-map-export.png`); results.push("actual website PNG export resolves pinned vector definitions into visible original artwork");
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await login(phone, e.users.owner);
    const mobile = await phone.newPage(); mobile.on("pageerror", error => errors.push(error.message)); await open(mobile);
    assert.equal(await mobile.getByRole("application", { name: "Editable map canvas" }).locator(`[data-drawing="${placed.id}"] use`).count(), 1);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobile.getByRole("region", { name: "Map Studio", exact: true }).screenshot({ path: `${screenshots}/touch-browser-v1-v2.png` }); results.push("390px touch-browser reopen retains exact v2 artwork with bounded page width; not physical-device proof");
    const check = await ownedPool(e, "compat"); try { const current = (await check.query("select geography_id,content from world_atlas_drawing where id=$1", [placed.id])).rows[0]; assert.equal(current.geography_id, placed.geographyId); assert.equal(current.content.name, "Browser retained v2 city"); assert.deepEqual(current.content.assetRef, placed.assetRef); } finally { await check.end(); }
    assert.deepEqual(errors, []); await writeFile(path.join(UX0A_DIRECTORY, "browser-results.json"), JSON.stringify({ passed: true, groups: results, browser: browser.version(), exportBytes: (await readFile(png)).length, originalMountainShadePixels: shaded, errors, scope: "Foundation compatibility only; full UX-0A creation/recovery/performance/art acceptance pending" }, null, 2));
    console.log(`PASS ${results.length} actual production-browser foundation groups`);
    await phone.close(); await desktop.close();
  } finally {
    if (browser) await browser.close();
    if (server.pid && server.exitCode === null) execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    log.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
