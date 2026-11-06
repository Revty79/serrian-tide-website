import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { RegionalFixture } from "./worlds-regional-editing-fixture";

/** Initial production UI probe only; not the complete Stage 7A acceptance. */
export async function historyBrowserChecks({ f, browser, context, page, base, sourceHash }: { f: RegionalFixture; browser: Browser; context: BrowserContext; page: Page; base: string; sourceHash: string }) {
  if(process.env.SERRIAN_HISTORY_CRAFT_PLACEMENT_ONLY==="1"){await(await import("./worlds-native-history-craft-placement-browser")).nativeCraftPlacementBrowser({f,browser,context,base,sourceHash});return;}
  if(process.env.SERRIAN_HISTORY_NAVIGATION_ONLY==="1"){await(await import("./worlds-native-history-navigation-browser")).nativeNavigationBrowser({f,browser,context,base,sourceHash});return;}
  if(process.env.SERRIAN_HISTORY_NARRATIVE_BROWSER==="1"){await(await import("./worlds-native-history-narrative-browser")).nativeNarrativeBrowser({f,browser,context,base,sourceHash});return;}
  const rows = (await f.pool.query("select id from world_atlas_map where world_id=$1 and name='Historical numerical World'", [f.world])).rows;
  assert.equal(rows.length, 1); const mapId = rows[0].id;
  const failures: { path: string; status: number; body: string }[] = [];
  const responses:Promise<void>[]=[];
  page.on("response", response => { if (response.url().includes("historicalAtlas=") && response.status() >= 400) responses.push(response.text().then(body => {failures.push({ path: new URL(response.url()).pathname, status: response.status(), body });})); });
  await page.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${mapId}`, { waitUntil: "networkidle" });
  const canvas = page.getByLabel("Terrain map canvas", { exact: true });
  await canvas.waitFor({ state: "visible" });
  await page.waitForTimeout(1000);
  const open=async()=>{const buttons=page.getByRole("button",{name:"History / Era",exact:true});for(let i=0;i<await buttons.count();i++){const box=await buttons.nth(i).boundingBox();if(box&&box.y>=105&&box.y+box.height<=(page.viewportSize()?.height??1000)&&await buttons.nth(i).evaluate(el=>{const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===el||!!top&&el.contains(top);})){await buttons.nth(i).click();return;}}throw Error("A visible in-workspace History / Era action is required");};
  const camera=async()=>canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return {zoom:c.dataset.zoom,x:c.dataset.viewX,y:c.dataset.viewY,visibleWidth:c.dataset.visibleWidthMetres,width:c.width,height:c.height};});
  const initialCamera=await camera();assert.ok(Number(initialCamera.zoom)>0);
  const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await open();
  const dialog = page.getByRole("dialog", { name: "History / Era", exact: true }); await dialog.waitFor({ state: "visible" });
  assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), before, "Opening historical controls preserves page position");
  await dialog.getByRole("button",{name:"Close History",exact:true}).click();
  assert.deepEqual(await camera(),initialCamera,"Opening/closing history retains the exact camera and canvas dimensions");
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),before);
  await open();await dialog.waitFor({state:"visible"});
  await dialog.getByLabel("Atlas year", { exact: true }).fill("100");
  await dialog.getByRole("button", { name: "Open Year", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await canvas.waitFor({ state: "visible" });
  assert.match(await page.getByTestId("atlas-date-context").innerText(), /Year 100/);
  await open();
  await dialog.getByRole("button", { name: "Edit This Appearance", exact: true }).click();
  await dialog.waitFor({ state: "hidden" }); await canvas.waitFor({ state: "visible" });
  assert.match(await page.getByTestId("atlas-date-context").innerText(), /Editing/);
  await canvas.evaluate(el=>{(el as HTMLElement).dataset.historySmokeIdentity="same mounted editor";});
  const choices=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/worlds/${f.world}/atlas-history`&&r.request().method()==="GET");
  await open();await choices;await page.waitForTimeout(100);
  assert.equal(await canvas.getAttribute("data-history-smoke-identity"),"same mounted editor","Refreshing source choices must keep the mounted editor and draft");
  await dialog.getByRole("button",{name:"View This Appearance",exact:true}).click();await dialog.waitFor({state:"hidden"});await canvas.waitFor({state:"visible"});
  assert.match(await page.getByTestId("atlas-date-context").innerText(),/Read-only/);
  await open();await dialog.getByRole("button",{name:"Edit This Appearance",exact:true}).click();await dialog.waitFor({state:"hidden"});await canvas.waitFor({state:"visible"});
  assert.match(await page.getByTestId("atlas-date-context").innerText(),/Editing/);
  await open();
  await dialog.getByLabel("Atlas year", { exact: true }).fill("300");
  await dialog.getByRole("button", { name: "Open Year", exact: true }).click();
  await page.getByRole("heading", { name: "Historical appearance unknown", exact: true }).waitFor();
  assert.equal(await canvas.count(), 0);
  await page.getByRole("button", { name: "View Current Map as Read-only Reference", exact: true }).click();
  await canvas.waitFor({ state: "visible" });
  assert.match(await page.getByText("Current map reference. Historical coverage remains unknown; this view is read-only.", { exact: true }).innerText(), /unknown/);
  await page.screenshot({ path: path.join(f.out, "historical-reference-desktop.png") });
  const badge=page.getByTestId("atlas-date-context");
  await badge.scrollIntoViewIfNeeded();
  await badge.evaluate(el=>{if(el.scrollWidth>el.clientWidth)throw Error("The date and timeline badge is clipped");});
  assert.match(await badge.innerText(),/Year 300.*unknown/i);
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(500);
  await badge.scrollIntoViewIfNeeded();
  await badge.evaluate(el=>{const r=el.getBoundingClientRect();if(r.width<1||r.left<0||r.right>innerWidth||el.scrollWidth>el.clientWidth)throw Error("The phone date/timeline badge must remain visible");});
  assert.ok((await canvas.boundingBox())!.height>=400,"Phone drawing canvas keeps the accepted 400px minimum");
  await page.screenshot({path:path.join(f.out,"historical-reference-phone.png")});
  const phoneBefore=await page.evaluate(()=>({x:scrollX,y:scrollY}));
  await open(); await dialog.waitFor({state:"visible"});
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),phoneBefore);
  await dialog.getByRole("button",{name:"Close History",exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),phoneBefore);

  await page.getByRole("button",{name:"Expand editor",exact:true}).click();await page.waitForTimeout(500);
  const expanded=page.getByRole("region",{name:"Heightmap editor",exact:true});await expanded.waitFor();
  assert.equal(await expanded.getAttribute("data-expanded"),"1");
  const expandedBefore=await page.evaluate(()=>({x:scrollX,y:scrollY})),expandedCamera=await camera();
  await open();await dialog.waitFor({state:"visible"});
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),expandedBefore);
  await dialog.getByRole("button",{name:"Close History",exact:true}).click();
  assert.equal(await expanded.getAttribute("data-expanded"),"1");assert.deepEqual(await camera(),expandedCamera);
  await badge.evaluate(el=>{const r=el.getBoundingClientRect(),old=(el as HTMLElement).style.pointerEvents;(el as HTMLElement).style.pointerEvents="auto";const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);(el as HTMLElement).style.pointerEvents=old;if(top!==el&&!el.contains(top))throw Error("The expanded date/timeline badge is covered by another panel");});
  await page.screenshot({path:path.join(f.out,"historical-reference-phone-expanded.png")});
  await Promise.all(responses); assert.deepEqual(failures, []);
  await writeFile(path.join(f.out, "historical-smoke-browser.json"), JSON.stringify({ passed: true, sourceHash, browser: browser.version(), historicalYearAndReadOnlyEditingControls: true, missingCoverageUnknown: true, deliberateCurrentReference: true, openingControlsPreservesPagePosition: true, requestFailures: failures, fullStage7AAcceptance: false, sharedDatabaseAccess: false }, null, 2));
  if(process.env.SERRIAN_HISTORY_INTEGRATION_BROWSER==="1")await(await import("./worlds-history-integration-browser")).worldsIntegrationBrowserChecks({f,browser,context,page,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_TRANSPORT_BROWSER==="1")await(await import("./worlds-history-transport-browser")).historicalTransportBrowser({f,context,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_COMPARISON_BROWSER==="1")await(await import("./worlds-history-comparison-browser")).nativeComparisonBrowser({f,browser,context,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_CREATION_BROWSER==="1")await(await import("./worlds-history-creation-browser")).historicalCreationBrowser({f,browser,context,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_FAMILY_CREATION_BROWSER==="1")await(await import("./worlds-history-family-creation-browser")).nativeFamilyCreationBrowser({f,browser,context,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_TERRITORY_BROWSER==="1")await(await import("./worlds-history-territory-browser")).nativeTerritoryBrowser({f,browser,context,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_CONTEXT_BROWSER==="1")await(await import("./worlds-history-context-browser")).nativeContextBrowser({f,browser,context,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_NAVIGATION_BROWSER==="1")await(await import("./worlds-native-history-navigation-browser")).nativeNavigationBrowser({f,browser,context,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_CRAFT_PLACEMENT_BROWSER==="1")await(await import("./worlds-native-history-craft-placement-browser")).nativeCraftPlacementBrowser({f,browser,context,base,sourceHash});
  if(process.env.SERRIAN_HISTORY_FINAL_BROWSER==="1"){
    const names=["historical-smoke-browser.json","worlds-integration-browser.json","historical-transport-browser.json","historical-comparison-browser.json","historical-native-creation-browser.json","historical-family-creation-browser.json","native-territory-browser.json","native-context-browser.json","native-navigation-browser.json","native-craft-placement-browser.json"];
    for(const name of names){const receipt=JSON.parse(await readFile(path.join(f.out,name),"utf8"));assert.equal(receipt.passed,true,name);assert.equal(receipt.sourceHash,sourceHash,name+" must match the exact built source");}
    await writeFile(path.join(f.out,"historical-combined-browser.json"),JSON.stringify({passed:true,sourceHash,scope:"Complete historical UI and Worlds integration browser suite; inherited/performance/database/narrative receipts are separate",receipts:names,sharedDatabaseAccess:false,ownerAcceptance:false,physicalDeviceAcceptance:false},null,2));
  }

}
