/** Real website-created geometry and painted strokes: holes, overlapping sources, export and reopen. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ownedPool, UX0A_DIRECTORY } from "./worlds-geo-ux0a-harness";
import { islandRuntime } from "./worlds-geo-ux0a-runtime";

async function main() {
  const runtime = await islandRuntime("empty", "mask-browser"), { e, browser, login } = runtime;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); await login(context);
  const page = await context.newPage(), dir = "docs/screenshots/worlds-geo-ux0a/masking", errors: string[] = [];
  await mkdir(dir, { recursive: true }); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
  const result: Record<string, unknown> = {};
  try {
    const baseline = JSON.parse(await readFile(path.join(UX0A_DIRECTORY, "journey-baseline.json"), "utf8"));
    await page.goto(baseline.mapUrl); await page.getByRole("button", { name: "Atlas", exact: true }).click();
    const canvas = page.getByRole("application", { name: "Editable map canvas" });
    if(process.argv.includes("resume")){await page.getByRole("button",{name:"Open Website land mask proof",exact:true}).click();const edit=page.getByRole("button",{name:"Edit map",exact:true});if(await edit.isVisible())await edit.click();await canvas.waitFor();await canvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});}
    else{
    await page.getByRole("button", { name: "Create map", exact: true }).click();
    await page.getByLabel("Map name", { exact: true }).fill("Website land mask proof");
    await page.getByRole("dialog").getByRole("button", { name: "Create map", exact: true }).click();
    await canvas.waitFor();
    const position = (x: number, y: number) => canvas.evaluate((node, p) => { const a = new DOMPoint(p.x, p.y).matrixTransform((node as SVGSVGElement).getScreenCTM()!); return { x: a.x, y: a.y }; }, { x, y });
    const tap = async (points: number[][]) => { for (const [x, y] of points) { const p = await position(x, y); await page.mouse.click(p.x, p.y); } };
    const shape = async (points: number[][]) => { await tap(points); await page.getByRole("button", { name: "Complete geographic shape", exact: true }).click(); };
    const save = async () => { const refreshed=page.waitForResponse(r=>r.request().method()==="GET"&&r.url().includes("/geography?")&&r.url().includes("themes=")); const response = page.waitForResponse(r => r.url().includes("/geography/authoring") && r.request().method() === "POST"); await page.getByRole("button", { name: "Save geographic changes", exact: true }).click(); assert.equal((await response).status(), 200); await page.getByRole("status").filter({hasText:/Geographic revision .* saved/}).waitFor(); await refreshed; await canvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"}); };
    await page.getByRole("button", { name: "Associate geographic surface", exact: true }).click();
    await canvas.locator('[data-map-background="fictional-water"]').waitFor();
    await page.getByRole("button", { name: "Draw an island", exact: true }).click();
    await page.getByLabel("Geographic feature name", { exact: true }).fill("Mask mainland");
    await shape([[200, 200], [1450, 200], [1450, 1000], [200, 1000]]);
    await page.getByRole("button", { name: "Add hole to selected component", exact: true }).click();
    await shape([[500, 450], [900, 450], [900, 800], [500, 800]]); await save();
    await page.getByRole("button", { name: "Draw an island", exact: true }).click();
    await page.getByLabel("Geographic feature name", { exact: true }).fill("Island inside opening");
    await shape([[620, 550], [800, 550], [800, 700], [620, 700]]); await save();
    await page.getByRole("button", { name: "Draw an island", exact: true }).click();
    await page.getByLabel("Geographic feature name", { exact: true }).fill("Offshore companion");
    await shape([[1600, 300], [1850, 300], [1850, 800], [1600, 800]]); await save();
    await page.getByRole("navigation", { name: "Studio tools" }).getByRole("button", { name: "Artwork", exact: true }).click();
    await page.getByLabel("Artwork tool", { exact: true }).selectOption("paint"); await page.getByLabel("Terrain brush", { exact: true }).selectOption("forest");
    await page.getByLabel("Brush size", { exact: true }).fill("60"); await page.getByLabel("Mark spacing", { exact: true }).fill("70"); await page.getByLabel("Brush density", { exact: true }).fill("1");
    const start = await position(60, 620), end = await position(1940, 620); await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 40 }); await page.mouse.up();
    await page.getByRole("button", { name: "Save map", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Map saved." }).waitFor();
    }
    const forestColor = await canvas.locator('defs g[id$="-forest-0"] > g').evaluate(node => {const css=getComputedStyle(node).fill,c=document.createElement("canvas");c.width=1;c.height=1;const ctx=c.getContext("2d")!;ctx.fillStyle=css;ctx.fillRect(0,0,1,1);return {css,rgb:Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3)};});
    await page.getByRole("region", { name: "Map Studio", exact: true }).screenshot({ path: `${dir}/desktop-source-mask.png` });
    await page.getByRole("navigation", { name: "Studio tools" }).getByRole("button", { name: "Export", exact: true }).click();
    const [exported] = await Promise.all([page.waitForEvent("download"),page.getByRole("button", { name: "Download visible map PNG", exact: true }).click()]); await exported.saveAs(`${dir}/visible-source-mask.png`);
    const { data, info } = await sharp(`${dir}/visible-source-mask.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const forest = forestColor.rgb; let inside = 0, outside = 0;
    const land = (x: number, y: number) => x >= 200 && x <= 1450 && y >= 200 && y <= 1000 && !(x > 500 && x < 900 && y > 450 && y < 800) || x >= 620 && x <= 800 && y >= 550 && y <= 700 || x >= 1600 && x <= 1850 && y >= 300 && y <= 800;
    for (let y = 0; y < 1200; y++) for (let x = 0; x < 2000; x++) { const i = (y * info.width + x) * 4; if (data[i] === forest[0] && data[i + 1] === forest[1] && data[i + 2] === forest[2]) { if (land(x, y)) inside++; else outside++; } }
    assert.ok(inside > 500); assert.equal(outside, 0, "No full-color terrain pixels in sea or enclosed opening");
    const pool = await ownedPool(e, "empty"); try {
      const rows = (await pool.query("select m.id,m.presentation,d.content from world_atlas_map m join world_atlas_drawing d on d.map_id=m.id where m.name='Website land mask proof' order by m.created_at desc limit 1")).rows[0];
      assert.equal(rows.presentation.version, 2); assert.equal(rows.content.points[0].x, 60); assert.ok(rows.content.points.at(-1).x > 1900); result.mapId = rows.id; result.retainedStroke = rows.content;
    } finally { await pool.end(); }
    await page.getByRole("button",{name:"Map library",exact:true}).click(); await page.reload(); await page.getByRole("button", { name: "Atlas", exact: true }).click(); await page.getByRole("button", { name: "Open Website land mask proof", exact: true }).click();
    const edit = page.getByRole("button", { name: "Edit map", exact: true }); if (await edit.isVisible()) await edit.click();
    await canvas.locator('[data-geographic-land-mask="ready"]').waitFor({ state: "attached" });
    await page.getByRole("region", { name: "Map Studio", exact: true }).screenshot({ path: `${dir}/reopened-source-mask.png` });
    const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});await login(phone);
    const mobile=await phone.newPage();mobile.on("pageerror",error=>errors.push(error.message));
    const oldUrl=new URL(page.url());oldUrl.searchParams.delete("tab");oldUrl.searchParams.delete("atlas");await mobile.goto(oldUrl.href);
    await mobile.getByRole("button",{name:"Atlas",exact:true}).waitFor();assert.equal(await mobile.getByRole("application",{name:"Editable map canvas"}).count(),0);
    await mobile.screenshot({path:`${dir}/direct-open-before-correction.png`});result.oldEditorUrlWithoutAtlasTabOpensCanvas=false;
    await mobile.goto(page.url());
    try{await mobile.getByRole("application",{name:"Editable map canvas"}).waitFor({timeout:10000});result.directOpenNeededAtlasTab=false;}
    catch{result.directOpenNeededAtlasTab=true;await mobile.screenshot({path:`${dir}/direct-open-before-correction.png`});await mobile.getByRole("button",{name:"Atlas",exact:true}).click();}
    if(process.argv.includes("require-direct-open"))assert.equal(result.directOpenNeededAtlasTab,false,"The editor URL must reopen Atlas directly");
    const mobileCanvas=mobile.getByRole("application",{name:"Editable map canvas"});await mobileCanvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});
    await mobile.getByLabel("Artwork tool",{exact:true}).selectOption("pan");await mobile.getByRole("button",{name:"Settings",exact:true}).click();
    await mobile.getByRole("button",{name:"Zoom in",exact:true}).click();
    const boundsBefore=await mobileCanvas.getAttribute("data-geographic-bounds"),box=(await mobileCanvas.boundingBox())!,cdp=await phone.newCDPSession(mobile);
    const x=box.x+box.width*.6,y=box.y+box.height*.45;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    for(let i=1;i<=16;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-i*3,y:y+i}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await mobile.waitForFunction(previous=>document.querySelector('[aria-label="Editable map canvas"]')?.getAttribute("data-geographic-bounds")!==previous,boundsBefore);
    await mobile.getByRole("button",{name:"Fit map",exact:true}).click();await mobileCanvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await mobile.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`${dir}/touch-browser-source-mask.png`});await phone.close();
    assert.deepEqual(errors, []); Object.assign(result, { passed: true, forestColor, terrainPixelsOnLand: inside, terrainPixelsOutsideLand: outside, touchBrowser:{width:390,height:844,nativeTouchUpdates:16,physicalDevice:false}, errors, browser: browser.version(), scope: "Website-created mask proof with retained v1 brush; not finished art or full UX-0A acceptance" });
    await writeFile(path.join(UX0A_DIRECTORY, "mask-browser-results.json"), JSON.stringify(result, null, 2)); console.log("PASS website geographic mask, retained stroke, PNG and reopen");
  } catch (error) { await page.screenshot({ path: path.join(UX0A_DIRECTORY, "mask-browser-failure.png"), fullPage: true }); await writeFile(path.join(UX0A_DIRECTORY, "mask-browser-state.txt"), await page.locator("body").innerText()); throw error; }
  finally { await runtime.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
