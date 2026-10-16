/** Record both reported paths before presentation changes; content is created only through website controls. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownedPool, UX0A_DIRECTORY } from "./worlds-geo-ux0a-harness";
import { islandRuntime } from "./worlds-geo-ux0a-runtime";

async function main() {
  const runtime = await islandRuntime("empty", "journey-baseline"), { e, base, browser, login } = runtime;
  const dir = "docs/screenshots/worlds-geo-ux0a/baseline"; await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await login(context);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const evidence: Record<string, unknown> = { checkpoint: "1aa5d87", scope: "Reproduction before correction, not UX-0A acceptance" };
  try {
    if(process.argv.includes("legacy-only")){
      const prior=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"journey-baseline.json"),"utf8"));Object.assign(evidence,prior);await page.goto(prior.mapUrl);await page.getByRole("button",{name:"Atlas",exact:true}).click();
    }else{
    const pool = await ownedPool(e, "empty");
    try { const counts = (await pool.query("select (select count(*) from world) worlds,(select count(*) from world_atlas_map) maps")).rows[0]; evidence.initial = counts; assert.equal(Number(counts.worlds), 0); assert.equal(Number(counts.maps), 0); } finally { await pool.end(); }
    await page.goto(`${base}/worlds`); await page.getByRole("button", { name: "Create your first world", exact: true }).click();
    await page.getByLabel("World name", { exact: true }).fill("Disposable first island journey");
    await page.getByRole("dialog").getByRole("button", { name: "Create world", exact: true }).click();
    await page.getByRole("link", { name: "Open Disposable first island journey", exact: true }).click();
    evidence.worldUrl = page.url();
    await page.getByRole("button", { name: "Atlas", exact: true }).click();
    await page.getByRole("button", { name: "New map", exact: true }).click();
    await page.getByLabel("Map name", { exact: true }).fill("Source-only baseline"); await page.getByLabel("Map scale", { exact: true }).selectOption("regional");
    await page.getByRole("button", { name: "Create map", exact: true }).click();
    const canvas = page.getByRole("application", { name: "Editable map canvas" }); await canvas.waitFor();
    await page.getByRole("navigation", { name: "Studio tools" }).getByRole("button", { name: "Geography", exact: true }).click();
    await page.getByRole("button", { name: "Associate geographic surface", exact: true }).click();
    await page.getByRole("navigation", { name: "Studio tools" }).getByRole("button", { name: "Generate", exact: true }).click();
    await page.locator("[data-geographic-generator] > summary").click();
    await page.getByRole("button", { name: "Preview geographic generation", exact: true }).click();
    await page.locator("[data-generation-preview]").waitFor(); await page.getByRole("region", { name: "Map Studio", exact: true }).screenshot({ path: `${dir}/geographic-preview-before.png` });
    await page.getByRole("button", { name: "Accept generated geography", exact: true }).click();
    await canvas.locator("[data-geographic-atlas]").waitFor({ state: "attached", timeout: 1000 }).catch(() => {});
    await page.getByText(/Accepted .*geographic/).first().waitFor().catch(() => {});
    await page.getByRole("region", { name: "Map Studio", exact: true }).screenshot({ path: `${dir}/geographic-accepted-before.png` });
    evidence.mapUrl = page.url();
    await page.getByRole("button", { name: "Map library", exact: true }).click();
    }
    await page.getByRole("button", { name: "Generate map", exact: true }).click();
    await page.getByRole("button", { name: "Preview map", exact: true }).click();
    await page.getByRole("img",{name:"Generated map artwork"}).waitFor().catch(async()=>{await page.locator('svg[aria-label="Generated map artwork"]').waitFor();});
    await page.getByRole("region", { name: "Map Studio", exact: true }).screenshot({ path: `${dir}/legacy-illustrated-preview-before.png` });
    await writeFile(path.join(UX0A_DIRECTORY, "journey-baseline.json"), JSON.stringify(evidence, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(UX0A_DIRECTORY, "journey-baseline-failure.png"), fullPage: true });
    await writeFile(path.join(UX0A_DIRECTORY, "journey-baseline-state.json"), JSON.stringify({ ...evidence, url: page.url(), body: await page.locator("body").innerText() }, null, 2)); throw error;
  } finally { await runtime.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
