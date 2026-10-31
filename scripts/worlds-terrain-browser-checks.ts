import {chooseTerrainMap} from "./worlds-terrain-browser-ui";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const imageHash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
import { writeFile } from "node:fs/promises";
import type { Browser, BrowserContext, Page } from "playwright-core";
import {createGrid,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";
const gridHash=(document:TerrainDocument)=>imageHash(Buffer.from(createGrid(document.baseElevation,document.tiles,terrainGeometry(document.settings)).buffer));
type Options = { browser: Browser; god: BrowserContext; base: string; world: string; foreign: string; out: string; errors: string[]; restart: () => Promise<void> };
async function rendered(p: Page) { await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))); await p.locator('canvas[aria-label="Terrain map canvas"][data-render-pending="0"]').waitFor(); }
async function sculpt(p: Page, tool: string, a: [number, number], b: [number, number]) {
  await p.getByRole("button", { name: tool, exact: true }).click();
  const canvas = p.getByLabel("Terrain map canvas", { exact: true }); await canvas.scrollIntoViewIfNeeded(); const box = (await canvas.boundingBox())!;
  await p.mouse.move(box.x + box.width * a[0], box.y + box.height * a[1]); await p.mouse.down(); await p.mouse.move(box.x + box.width * b[0], box.y + box.height * b[1], { steps: 20 }); await p.mouse.up(); await rendered(p);
}
export async function checkTerrainBrowser({ browser, god, base, world, foreign, out, errors, restart }: Options) {
  const p = await god.newPage(); p.setDefaultTimeout(20000); p.on("pageerror", e => { errors.push(e.message); console.log("TERRAIN PAGE ERROR",e.message); });
  try {
  console.log("CHECK terrain opening and creation");
  await p.goto(`${base}/worlds/${world}`);
  await p.getByRole("navigation", { name: "World workspace", exact: true }).getByRole("button", { name: "Atlas", exact: true }).click();
  await p.getByRole("button", { name: "Create flat world", exact: true }).click(); let dialog = p.getByRole("dialog", { name: "Create flat world", exact: true });
  await dialog.getByLabel("Map name", { exact: true }).fill("The First Shore"); await dialog.getByRole("button", { name: "Create map", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  const canvas = p.getByLabel("Terrain map canvas", { exact: true }); await rendered(p);
  const mapId = new URL(p.url()).searchParams.get("terrainMap")!; assert.ok(mapId);
  const get = async (id = mapId) => { const r = await god.request.get(`${base}/api/worlds/${world}/terrain?terrainMap=${id}`); assert.equal(r.status(), 200); return (await r.json()).document; };
  assert.equal((await get()).baseElevation, -500);
  console.log("CHECK terrain sculpting and viewport");
  await p.getByRole("slider", { name: "Brush strength: 150", exact: true }).fill("900");
  await sculpt(p, "Raise", [.28, .48], [.65, .35]); await sculpt(p, "Raise", [.35, .45], [.58, .4]); await sculpt(p, "Lower", [.53, .48], [.65, .55]); await sculpt(p, "Smooth", [.35, .43], [.62, .4]);
  const desktopMetrics=await p.getByTestId("terrain-performance").textContent();
  await p.mouse.move(1,1); const beforeUndo = imageHash(await canvas.screenshot()); await p.getByRole("button", { name: "Undo", exact: true }).click(); await rendered(p); const afterUndo = imageHash(await canvas.screenshot()); assert.notEqual(beforeUndo, afterUndo); await p.getByRole("button", { name: "Redo", exact: true }).click(); await rendered(p); assert.equal(imageHash(await canvas.screenshot()), beforeUndo);
  await p.getByLabel("Sea level (m)", { exact: true }).fill("100"); await rendered(p); assert.equal((await get()).seaLevel, 0, "sea-level preview is not accepted before Save");
  const zoom = Number(await canvas.getAttribute("data-zoom")); await p.getByRole("button", { name: "Zoom in", exact: true }).click(); assert.ok(Number(await canvas.getAttribute("data-zoom")) > zoom); await p.getByRole("button", { name: "Pan right", exact: true }).click(); await p.getByRole("button", { name: "Fit map", exact: true }).click(); assert.ok(Math.abs(Number(await canvas.getAttribute("data-zoom")) - zoom) < .001);
  await p.getByRole("button", { name: "Save terrain", exact: true }).click(); await p.getByTestId("terrain-revision").filter({ hasText: "2" }).waitFor(); const accepted = await get(); assert.equal(accepted.seaLevel, 100); assert.ok(accepted.tiles.length); assert.ok(accepted.tiles.some((t: { samples: number[] }) => t.samples.some(v => v > 100)));
  await p.getByRole("button", { name: "Overview", exact: true }).first().click(); await p.getByRole("button", { name: "Atlas", exact: true }).first().click(); await rendered(p); assert.deepEqual((await get()).tiles, accepted.tiles);
  await restart(); await p.reload(); await rendered(p); assert.deepEqual((await get()).tiles, accepted.tiles);
  console.log("CHECK terrain recovery after application restart");
  await p.screenshot({ path: `${out}/terrain-desktop.png`, fullPage: true });
  await sculpt(p, "Raise", [.4, .5], [.45, .5]);
  // Unsaved navigation cancellation and actual browser recovery after reload.
  p.once("dialog", d => d.dismiss()); await p.getByRole("button", { name: "Overview", exact: true }).first().click(); assert.equal(new URL(p.url()).searchParams.get("tab"), "atlas");
  await p.getByRole("status").filter({ hasText: "Draft recovered automatically" }).waitFor();
  p.once("dialog", d => d.accept()); await p.reload(); await p.getByRole("button", { name: "Restore draft", exact: true }).click(); await rendered(p); await p.getByRole("button", { name: "Save terrain", exact: true }).click(); await p.getByTestId("terrain-revision").filter({ hasText: "3" }).waitFor();
  // Server accepted the request but its response was lost. Retrying must append once.
  const beforeLostSave = await get();
  await sculpt(p, "Lower", [.5, .5], [.55, .5]);
  await p.route(`**/api/worlds/${world}/terrain*`, async route => { if (route.request().method() !== "POST") return route.continue(); await route.fetch(); await route.abort("failed"); });
  await p.getByRole("button", { name: "Save terrain", exact: true }).click(); await p.getByRole("alert").filter({ hasText: "connection failed" }).waitFor(); assert.equal((await get()).revision, 4); await p.unroute(`**/api/worlds/${world}/terrain*`);
  await p.getByRole("button", { name: "Undo", exact: true }).click();
  await p.getByRole("button", { name: "Retry terrain save", exact: true }).click(); await p.getByTestId("terrain-revision").filter({ hasText: "4" }).waitFor(); assert.equal((await get()).revision, 4);
  await p.getByRole("button", {name:"Save terrain",exact:true}).click();await p.getByTestId("terrain-revision").filter({hasText:"5"}).waitFor();assert.equal(gridHash(await get()),gridHash(beforeLostSave));
  console.log("CHECK terrain competing saves");
  // Concurrent accepted save cannot be overwritten by this older draft.
  const other = await god.newPage(); await other.goto(p.url()); await rendered(other); await sculpt(other, "Raise", [.35, .5], [.4, .5]); await other.getByRole("button", { name: "Save terrain", exact: true }).click(); await other.getByTestId("terrain-revision").filter({ hasText: "6" }).waitFor();
  await sculpt(p, "Raise", [.6, .5], [.65, .5]); await p.getByRole("button", { name: "Save terrain", exact: true }).click(); await p.getByRole("alert").filter({ hasText: "newer terrain revision" }).waitFor(); assert.equal((await get()).revision, 6); await p.screenshot({ path: `${out}/terrain-conflict.png`, fullPage: true });
  p.once("dialog", d => d.accept()); await p.getByRole("button", { name: "Load saved map", exact: true }).click(); await rendered(p); await p.getByTestId("terrain-revision").filter({ hasText: "6" }).waitFor(); await other.close();
  await p.getByRole("button", { name: "Create flat world", exact: true }).click(); dialog = p.getByRole("dialog", { name: "Create flat world", exact: true }); await dialog.getByLabel("Map name", { exact: true }).fill("The Level Plain"); await dialog.getByLabel("Starting surface", { exact: true }).selectOption("land"); await dialog.getByRole("button", { name: "Create map", exact: true }).click(); await rendered(p); const landId = new URL(p.url()).searchParams.get("terrainMap")!; assert.equal((await get(landId)).baseElevation, 500); assert.notEqual(mapId, landId);
  await chooseTerrainMap(p,mapId); await rendered(p); assert.equal((await get()).revision, 6);
  const metrics = await p.getByTestId("terrain-performance").textContent();
  console.log("CHECK terrain phone and authorization");
  // Browser without WebGL/GPU: this editor uses ordinary CPU Canvas2D.
  const phone = await browser.newContext({ storageState: await god.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const mobile = await phone.newPage(); mobile.on("pageerror", e => errors.push(e.message)); await mobile.goto(`${base}/worlds/${world}?tab=atlas&terrainMap=${mapId}`); await rendered(mobile);
  await mobile.getByRole("button", { name: "Raise", exact: true }).tap(); const touchCanvas = mobile.getByLabel("Terrain map canvas", { exact: true }); await touchCanvas.scrollIntoViewIfNeeded(); const bounds = (await touchCanvas.boundingBox())!; await mobile.touchscreen.tap(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5); await rendered(mobile);
  await mobile.getByRole("button", { name: "Save terrain", exact: true }).tap(); await mobile.getByTestId("terrain-revision").filter({ hasText: "7" }).waitFor(); assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await mobile.screenshot({ path: `${out}/terrain-phone.png`, fullPage: true });
  const phoneMetrics = await mobile.getByTestId("terrain-performance").textContent(); await phone.close();
  for (const [actor, status] of [["anonymous", 401], ["world-player", 403], ["other-god", 404], ["world-admin", 404]] as const) { const c = await browser.newContext(); if (actor !== "anonymous") { const r = await c.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${actor}@example.invalid`, password: "Worlds-Test-Only-Password!" } }); assert.equal(r.status(), 200); } const r = await c.request.get(`${base}/api/worlds/${world}/terrain?terrainMap=${mapId}`); assert.equal(r.status(), status); if (actor === "world-admin") { const review = await c.request.get(`${base}/api/worlds/${world}/terrain?review=1&terrainMap=${mapId}`); assert.equal(review.status(), 200); assert.equal((await review.json()).canEdit, false); const a = await c.newPage(); await a.goto(`${base}/worlds/${world}?tab=atlas&terrainMap=${mapId}&review=1`); await rendered(a); assert.equal(await a.getByRole("button", { name: "Save terrain", exact: true }).count(), 0); assert.equal((await c.request.post(`${base}/api/worlds/${world}/terrain?review=1`, { headers: { Origin: base }, data: {} })).status(), 403); } await c.close(); }
  assert.equal((await god.request.get(`${base}/api/worlds/${foreign}/terrain`)).status(), 404);
  assert.equal((await god.request.get(`${base}/api/worlds/${world}/terrain?ordinary=1&terrainMap=${mapId}`)).status(), 404);
  assert.equal((await god.request.post(`${base}/api/worlds/${world}/terrain`, { headers: { Origin: "https://foreign.invalid" }, data: {} })).status(), 403);
  await writeFile(`${out}/terrain-results.json`, JSON.stringify({ mapId, landId, acceptanceJourney: true, applicationRestartPersistence:true, recoverReload: true, navigationCancellation: true, lostResponseRetry: true, undoAfterLostResponsePreserved:true, concurrentSaveProtected: true, desktop: "1440×1000", phone: "390×844 touch emulation", physicalPhone: false, desktopMetrics, metrics, phoneMetrics }, null, 2) + "\n");
  await p.close(); console.log("PASS terrain desktop and phone journeys, recovery, lost-response retry and concurrency");
  }catch(error){await p.screenshot({path:`${out}/terrain-failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${out}/terrain-failure.txt`,`${p.url()}\n${await p.locator("body").innerText().catch(()=>"")}`);throw error;}
}
