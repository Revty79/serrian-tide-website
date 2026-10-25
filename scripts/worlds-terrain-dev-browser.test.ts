/** Real LOCAL DEV HTTP persistence, with a temporary owner test session.
 * Starts/restarts ONLY its own full-website dev process, never the owner's server.
 * Retains the verification World archived and removes the temporary session.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import dotenv from "dotenv";
import pg from "pg";
import { serializeSignedCookie } from "better-call";
import { chromium, type Browser, type Page } from "playwright-core";
const out = "docs/screenshots/worlds-terrain-pass1", privateOut = "artifacts/worlds-terrain-pass1";
async function freePort() { const s = createServer(); await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); const a = s.address(); assert.ok(a && typeof a === "object"); await new Promise<void>(r => s.close(() => r())); return a.port; }
async function rendered(p: Page) { await p.locator('canvas[aria-label="Terrain map canvas"][data-render-pending="0"]').waitFor(); }
async function stroke(p: Page, tool: string, x: number) { await p.getByRole("button", { name: tool, exact: true }).click(); const canvas = p.getByLabel("Terrain map canvas", { exact: true }); await canvas.scrollIntoViewIfNeeded(); const b = (await canvas.boundingBox())!; await p.mouse.move(b.x + b.width * x, b.y + b.height * .5); await p.mouse.down(); await p.mouse.move(b.x + b.width * (x + .12), b.y + b.height * .45, { steps: 15 }); await p.mouse.up(); await rendered(p); }
async function main() {
  assert.ok(process.argv.includes("--verify-dev"));
  const env = dotenv.parse(await readFile(".env.local")), url = new URL(env.DATABASE_URL); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.pathname, "/serrian_tide_dev");
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL }), appPort = await freePort(), base = `http://127.0.0.1:${appPort}`, checkout = path.resolve(privateOut, "checkout"), root = path.resolve(env.SERRIAN_TERRAIN_ROOT || "storage/world-terrain");
  const sessionId = `atlas-dev-check-${randomUUID()}`, token = randomUUID() + randomUUID(), log = createWriteStream(`${privateOut}/dev-browser.log`);
  const environment: NodeJS.ProcessEnv = { ...process.env, ...env, NODE_ENV: "development", BETTER_AUTH_URL: base, SERRIAN_TERRAIN_ROOT: root, SERRIAN_TEST_NEXT_DIST_DIR: ".next-terrain-dev-verification", NEXT_TELEMETRY_DISABLED: "1" };
  let server: ChildProcess | undefined, browser: Browser | undefined, page: Page | undefined;
  const stop = () => { if (server?.pid && server.exitCode === null) execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }); };
  async function start() { server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(appPort)], { cwd: checkout, env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); server.stdout!.pipe(log, { end: false }); server.stderr!.pipe(log, { end: false }); const deadline = Date.now() + 180000; while (true) { assert.equal(server.exitCode, null); try { if ((await fetch(`${base}/login`)).ok) break; } catch {} assert.ok(Date.now() < deadline, "DEV app did not become ready"); await new Promise(r => setTimeout(r, 300)); } }
  try {
    assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n, 134);
    const [owner] = (await pool.query("select w.owner_id id from world w where w.archived_at is null and exists(select 1 from user_role r where r.user_id=w.owner_id and r.role in ('god','admin')) order by w.created_at limit 1")).rows; assert.ok(owner, "Choose a verified DEV owner before running this check");
    const originalWorlds = (await pool.query("select id,to_jsonb(w) row from world w order by id")).rows;
    // The retained auth schema stores UTC in timestamp-without-time-zone fields.
    // Explicit ISO UTC values avoid depending on the DEV server's session zone.
    await pool.query("insert into session(id,expires_at,token,updated_at,user_id,user_agent) values($1,$2,$3,$4,$5,'Atlas Pass 1 local DEV verification')", [sessionId, new Date(Date.now()+30*60*1000).toISOString(), token, new Date().toISOString(), owner.id]);
    await start(); browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true }); const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const signed = await serializeSignedCookie("better-auth.session_token", token, env.BETTER_AUTH_SECRET, { path: "/" }), cookieValue = signed.split(";")[0].slice("better-auth.session_token=".length); await context.addCookies([{ name: "better-auth.session_token", value: cookieValue, url: base, httpOnly: true, sameSite: "Lax" }]);
    const created = await context.request.post(`${base}/api/worlds`, { headers: { Origin: base }, data: { name: "Atlas Pass 1 DEV verification — archived test fixture" } }); assert.equal(created.status(), 200, await created.text()); const world = (await created.json()).id;
    page = await context.newPage(); page.setDefaultTimeout(60000); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); await page.goto(`${base}/worlds/${world}?tab=atlas`); await page.getByRole("button", { name: "Create flat world", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Create flat world", exact: true }); await dialog.getByLabel("Map name", { exact: true }).fill("Durable DEV terrain verification"); await dialog.getByRole("button", { name: "Create map", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); await rendered(page);
    const mapId = new URL(page.url()).searchParams.get("terrainMap")!, mapUrl = page.url(), get = async () => { const r = await context.request.get(`${base}/api/worlds/${world}/terrain?terrainMap=${mapId}`); assert.equal(r.status(), 200); return (await r.json()).document; };
    await page.getByRole("slider", { name: "Brush strength: 150", exact: true }).fill("900"); await stroke(page, "Raise", .38); await page.getByLabel("Sea level (m)", { exact: true }).fill("50"); await page.getByRole("button", { name: "Save terrain", exact: true }).click(); await page.getByTestId("terrain-revision").filter({ hasText: "2" }).waitFor(); const accepted = await get(); assert.ok(accepted.tiles.length);
    await page.close(); stop(); await start(); page = await context.newPage(); page.setDefaultTimeout(60000); await page.goto(mapUrl); await rendered(page); const reopened = await get(); assert.deepEqual(reopened.tiles, accepted.tiles); assert.equal(reopened.seaLevel, 50);
    await stroke(page, "Lower", .5); await page.getByRole("button", { name: "Undo", exact: true }).click(); await rendered(page); assert.deepEqual((await get()).tiles, accepted.tiles); await page.getByRole("button", { name: "Redo", exact: true }).click(); await page.getByRole("button", { name: "Save terrain", exact: true }).click(); await page.getByTestId("terrain-revision").filter({ hasText: "3" }).waitFor(); const continued = await get(); assert.notDeepEqual(continued.tiles, accepted.tiles);
    const refs = (await pool.query("select sha256,bytes,encoding from world_terrain_tile where terrain_id=$1", [continued.terrainId])).rows; for (const ref of refs) { const bytes = await readFile(path.join(root, "objects", ref.sha256.slice(0, 2), `${ref.sha256}.i16`)); assert.equal(bytes.length, ref.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), ref.sha256); }
    await page.screenshot({ path: `${out}/terrain-real-dev.png`, fullPage: true }); const worldResponse = await context.request.get(`${base}/api/worlds/${world}`), version = (await worldResponse.json()).world.revision; assert.equal((await context.request.patch(`${base}/api/worlds/${world}`, { headers: { Origin: base }, data: { action: "archive", revision: version } })).status(), 200);
    for (const old of originalWorlds) assert.deepEqual((await pool.query("select to_jsonb(w) row from world w where id=$1", [old.id])).rows[0].row, old.row); assert.deepEqual(errors, []);
    await mkdir(out, { recursive: true }); const result = { passed: true, database: "serrian_tide_dev", actualDevHttpWorkflow: true, temporaryOwnerSession: true, ownerRolesUnchanged: true, ownDevelopmentAppRestarted: true, ownerDevelopmentServerUntouched: true, numericalTilesExactAfterRestart: true, continuedEditing: true, undoPreservesAcceptedTerrain: true, revision: continued.revision, verifiedTileReferences: refs.length, verificationWorld: world, mapId, verificationWorldArchived: true, preexistingWorldRowsUnchanged: true, privateTerrainRoot: "storage/world-terrain (or configured SERRIAN_TERRAIN_ROOT)", productionAccess: false };
    await writeFile(`${out}/dev-browser-results.json`, JSON.stringify(result, null, 2) + "\n"); console.log("PASS", JSON.stringify(result));
  } catch (error) { if (page) await page.screenshot({ path: `${privateOut}/dev-failure.png`, fullPage: true }).catch(() => {}); throw error; }
  finally { await browser?.close(); stop(); log.end(); await pool.query("delete from session where id=$1 and token=$2", [sessionId, token]); await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "DEV browser check failed"); process.exitCode = 1; });
