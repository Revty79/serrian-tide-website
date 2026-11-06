import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { RegionalFixture } from "./worlds-regional-editing-fixture";
import { worldContextUrl } from "../src/features/worlds/world-atlas-context";
import type { NativeMapTarget } from "../src/features/worlds/native-map-history";
import {atlasRecordViewBinding} from "../src/features/worlds/atlas-record-view";
import {assetImageUrl} from "../src/features/worlds/atlas-assets";

export async function worldsIntegrationBrowserChecks({ f, browser, context, page, base, sourceHash }: { f: RegionalFixture; browser: Browser; context: BrowserContext; page: Page; base: string; sourceHash: string }) {
  const receipt = JSON.parse(await readFile(path.join(f.out, "worlds-atlas-integration.json"), "utf8")); assert.equal(receipt.passed, true);
  const data = receipt.fixture as { worldId: string; timelineId: string; target: NativeMapTarget; townMap: NativeMapTarget; townId: string; placeId: string; shopId: string; branchId: string; eventId: string; records: Record<string, string>; retainedOrganizationVersion: string };
  assert.equal(data.worldId, f.world);
  const linked=await readFile(path.join(f.out,"native-linked-families.json"),"utf8").then(raw=>JSON.parse(raw).fixture as {floorId:string;levelId:string},()=>undefined);
  const canvasName=(id:string)=>id===linked?.floorId?"Building floor canvas":id===linked?.levelId?"Underground map canvas":id===data.townMap.id?"Town Map canvas":"Terrain map canvas";
  const journeys: unknown[] = [], failures: { status: number; url: string; body: string }[] = [], responseReads: Promise<void>[] = [],clientErrors:string[]=[];
  const watched=new WeakSet<Page>();
  const watch = (p: Page) => {if(watched.has(p))return;watched.add(p);p.on("pageerror",error=>clientErrors.push(error.stack??error.message));p.on("console",message=>{if(message.type()==="error")clientErrors.push(message.text());});p.on("response", response => { if (/\/api\/worlds\//.test(response.url()) && response.status() >= 400) responseReads.push(response.text().then(body => { failures.push({ status: response.status(), url: new URL(response.url()).pathname, body }); })); });};
  context.on("page",watch);
  watch(page);
  const view = (year: number) => ({ worldId: f.world, timelineId: data.timelineId, year, review: false, ordinary: false });
  const openPanel = async (p: Page) => {
    const controls = p.getByRole("button", { name: "Related Worlds Records", exact: true });
    for (let i = 0; i < await controls.count(); i++) if (await controls.nth(i).isVisible()) { await controls.nth(i).click(); return p.getByRole("dialog", { name: "Related Worlds Records", exact: true }); }
    for(const name of ["Tools","Settings","Options"]){const toggle=p.getByRole("button",{name,exact:true});for(let i=0;i<await toggle.count();i++)if(await toggle.nth(i).isVisible()){await toggle.nth(i).click();for(let j=0;j<await controls.count();j++)if(await controls.nth(j).isVisible()){await controls.nth(j).click();return p.getByRole("dialog",{name:"Related Worlds Records",exact:true});}}}
    throw Error("A native Related Worlds Records action must be visible");
  };
  const openTab = async (p: Page, href: import("playwright-core").Locator) => {
    const [result] = await Promise.all([p.context().waitForEvent("page"),href.click()]);
    watch(result); await result.waitForLoadState("networkidle"); return result;
  };
  const cases = [
    { name: "event", year: 100, id: data.eventId, query: { tab: "history", entry: data.eventId }, map: data.target.id, source: "Harbor founded" },
    { name: "Town", year: 100, id: data.townId, query: { tab: "towns", town: data.townId }, map: data.townMap.id, source: "Integration Harbor" },
    { name: "Shop branch", year: 100, id: data.shopId, query: { tab: "towns", townSection: "shops", worldRecord: data.shopId }, map: data.townMap.id, source: "Original Harbor Shop" },
    { name: "organization HQ", year: 100, id: data.records.organization, query: { tab: "organizations", entity: data.records.organization, loreVersion: data.retainedOrganizationVersion }, map: data.townMap.id, source: "Harbor Guild HQ" },
    { name: "Individual", year: 100, id: data.records.individual, query: { tab: "individuals", entity: data.records.individual }, map: data.target.id, source: "Harbor Keeper" },
    { name: "Story", year: 100, id: data.records.story, query: { tab: "stories", entity: data.records.story }, map: data.target.id, source: "Harbor Story" },
    { name: "culture", year: 100, id: data.records.culture, query: { tab: "peoples", entity: data.records.culture }, map: data.target.id, source: "Harbor Culture" },
    { name: "population", year: 500, id: data.records.population, query: { tab: "peoples", entity: data.records.population }, map: data.target.id, source: "Later Harbor Population" },
    { name: "Realm", year: 100, id: data.records.realm, query: { tab: "cosmology", entity: data.records.realm }, map: data.target.id, source: "Mapped Harbor Realm" },
    { name: "political entity", year: 100, id: data.records.polity, query: { tab: "politics", entity: data.records.polity }, map: data.target.id, source: "Harbor Polity" },
    ...linked?[
      {name:"organization interior",year:100,id:data.records.organization,query:{tab:"organizations",entity:data.records.organization,loreVersion:data.retainedOrganizationVersion},map:linked.floorId,source:"Harbor Guild HQ"},
      {name:"organization cellar",year:100,id:data.records.organization,query:{tab:"organizations",entity:data.records.organization,loreVersion:data.retainedOrganizationVersion},map:linked.levelId,source:"Harbor Guild HQ"},
    ]:[],
  ];
  for (const layout of [{ width: 1440, height: 1000, name: "desktop" }, { width: 390, height: 844, name: "phone" }]) {
    const layoutContext=await browser.newContext({viewport:{width:layout.width,height:layout.height},storageState:await context.storageState()});layoutContext.on("page",watch);
    const page=await layoutContext.newPage();
    try{
    for (const journey of cases) {
      await page.goto(base + worldContextUrl(view(journey.year), journey.query), { waitUntil: "networkidle" });
      const details = journey.name === "Shop branch" ? page.getByRole("article", { name: "Shop: Original Harbor Shop", exact: true }) : journey.name === "event" ? page.getByRole("dialog", { name: "Harbor founded", exact: true }) : page;
      await details.locator("summary").filter({ hasText: /^Find in Atlas$/ }).filter({visible:true}).first().click();
      const find = details.getByRole("region", { name: "Find in Atlas", exact: true });
      const links = find.getByRole("link", { name: "Show in Atlas", exact: true });
      await links.first().waitFor();
      let chosen: import("playwright-core").Locator | undefined;
      for (let i = 0; i < await links.count(); i++) { const href = new URL((await links.nth(i).getAttribute("href"))!, base); if (["townMap","terrainMap","interiorFloor","undergroundLevel"].some(key=>href.searchParams.get(key)===journey.map)) { chosen = links.nth(i); break; } }
      assert.ok(chosen, `${journey.name} must lead to its actual native map identity`);
      const mapped = await openTab(page, chosen);
      try {
        const canvas = mapped.getByLabel(canvasName(journey.map), { exact: true });
        await canvas.waitFor();
        assert.deepEqual(mapped.viewportSize(),{width:layout.width,height:layout.height},"Every destination retains the actual phone/desktop viewport");
        assert.ok((await canvas.boundingBox())!.height>=400,"Native drawing canvas retains its unchanged 400px minimum");
        const url = new URL(mapped.url()); assert.equal(url.searchParams.get("atlasYear"), String(journey.year)); assert.equal(url.searchParams.get("timeline"), data.timelineId);
        assert.match(await mapped.getByTestId("atlas-date-context").innerText(), new RegExp(`Year ${journey.year}`));
        const related = await openPanel(mapped); await related.waitFor();
        const originals = related.getByRole("link", { name: "Open original World record", exact: true }); await originals.first().waitFor();
        let original: import("playwright-core").Locator | undefined;
        for (let i = 0; i < await originals.count(); i++) { const href = new URL((await originals.nth(i).getAttribute("href"))!, base); if (["entry", "entity", "town", "worldRecord"].some(key => href.searchParams.get(key) === journey.id)) { original = originals.nth(i); break; } }
        assert.ok(original, `${journey.name} must return to the same original identity`);
        const record = await openTab(mapped, original);
        try {
          await record.getByRole("heading",{name:journey.source,exact:true}).first().waitFor();
          assert.equal(new URL(record.url()).searchParams.get("atlasYear"), String(journey.year));
          const returnRoot=journey.name==="event"?record.getByRole("dialog",{name:journey.source,exact:true}):record;
          const returnLink = returnRoot.getByRole("link", { name: "Return to saved World / Atlas view", exact: true }); await returnLink.waitFor();
          const returnUrl = new URL((await returnLink.getAttribute("href"))!, base); assert.ok(returnUrl.searchParams.has("atlasView")); assert.equal(returnUrl.searchParams.get("atlasYear"), String(journey.year));
          if(journey.name==="event"||journey.name==="Shop branch"){
            const restored=await openTab(record,returnLink);
            try{
              const restoredCanvas=restored.getByLabel(canvasName(journey.map),{exact:true});await restoredCanvas.waitFor();
              const capture=()=>restored.evaluate(()=>{const event=new CustomEvent<{view?:unknown}>("atlas:capture-view",{detail:{}});dispatchEvent(event);return event.detail.view as {x:number;y:number;scale:number}|undefined;});
              const expected=JSON.parse(returnUrl.searchParams.get("atlasView")!) as {x:number;y:number;scale:number};
              let actual=await capture();for(let i=0;i<20&&(!actual||Math.abs(actual.x-expected.x)>1e-7||Math.abs(actual.y-expected.y)>1e-7||Math.abs(actual.scale-expected.scale)>1e-9);i++){await restored.waitForTimeout(100);actual=await capture();}
              assert.ok(actual);assert.ok(Math.abs(actual.x-expected.x)<1e-7&&Math.abs(actual.y-expected.y)<1e-7&&Math.abs(actual.scale-expected.scale)<1e-9,"A real map return preserves exact camera centre and scale");
            }finally{await restored.close();}
          }
          assert.equal(await page.locator("body").isVisible(), true, "The original World record stays open during map browsing");
        } finally { await record.close(); }
        journeys.push({ layout: layout.name, journey: journey.name, year: journey.year, recordId: journey.id, mapId: journey.map, sameTimelineAndYearAndOriginalIdentity: true });
      } catch(error){
        const prefix=path.join(f.out,`integration-failure-${layout.name}-${journey.name.replace(/\W+/g,"-")}`);
        await mapped.screenshot({path:prefix+".png",fullPage:true}).catch(()=>{});
        await writeFile(prefix+".txt",mapped.url()+"\n"+await mapped.locator("body").innerText());
        await Promise.all(responseReads);await writeFile(prefix+".json",JSON.stringify({journeys,failures,clientErrors},null,2));
        throw error;
      } finally { await mapped.close(); }
    }
    }finally{await layoutContext.close();}
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + worldContextUrl(view(100), { tab: "individuals", entity: data.records.unknown }), { waitUntil: "networkidle" });
  await page.locator("summary").filter({ hasText: /^Find in Atlas$/ }).filter({visible:true}).click();
  await page.getByText("No geographic relationship or map representation is established here. Saved records remain available; no location has been inferred.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Show in Atlas", exact: true }).count(), 0);
  await page.screenshot({ path: path.join(f.out, "worlds-integration-no-location.png") });
  const privateArt=JSON.parse(await readFile(path.join(f.out,"historical-private-artwork.json"),"utf8"));assert.equal(privateArt.passed,true);
  const admin=await browser.newContext({viewport:{width:390,height:844}});admin.on("page",watch);
  try{
    const login=await admin.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:{email:"world-admin@example.invalid",password:"Regional-Editing-Only-Password!"}});assert.equal(login.status(),200);
    const adminPage=await admin.newPage(),url=new URL(worldContextUrl({...view(100),review:true},{tab:"atlas",townMap:data.townMap.id}),base);
    url.searchParams.set("atlasView",JSON.stringify({binding:atlasRecordViewBinding(url),kind:"local",x:40,y:40,scale:10}));
    const [image]=await Promise.all([adminPage.waitForResponse(response=>{const u=new URL(response.url());return u.pathname.endsWith("/assets/image")&&u.searchParams.get("asset")===privateArt.assetId&&u.searchParams.get("version")==="1";}),adminPage.goto(url.href,{waitUntil:"networkidle"})]);
    assert.equal(image.status(),200);await adminPage.getByLabel("Town Map canvas",{exact:true}).waitFor();
    assert.equal(await adminPage.getByRole("button",{name:"Save Changes",exact:true}).isDisabled(),true);
    const denied=await admin.request.get(base+assetImageUrl(f.world,privateArt.assetId,2,"128",true));assert.equal(denied.status(),404);
    await adminPage.screenshot({path:path.join(f.out,"historical-private-artwork-admin-phone.png")});
  }finally{await admin.close();}
  await page.goto(base+worldContextUrl({...view(100),ordinary:true},{tab:"peoples",entity:data.records.culture}),{waitUntil:"networkidle"});
  await page.getByRole("heading",{name:"Harbor Culture",exact:true}).waitFor();
  await page.locator("summary").filter({hasText:/^Find in Atlas$/}).filter({visible:true}).first().click();
  await page.getByText("Atlas positions are unavailable in ordinary-knowledge views. Only authorized World relationships are shown.",{exact:true}).waitFor();
  assert.equal(await page.getByRole("link",{name:"Show in Atlas",exact:true}).count(),0);assert.equal((await page.locator("body").innerText()).includes("Protected Harbor Identity"),false);
  await Promise.all(responseReads); assert.deepEqual(failures, []);assert.deepEqual(clientErrors,[]);
  await writeFile(path.join(f.out, "worlds-integration-browser.json"), JSON.stringify({ passed: true, sourceHash, browser: browser.version(), journeys, noLocationExplanation: true, exactSourceAndReturnContext: true,actualPhoneDestinationViewports:true,actualReturnCameraCentreAndScale:true,adminPhoneHistoricalPrivateImageVersion1:true,adminUnusedImageVersion2Denied:true,ordinaryPositionsWithheld:true, requestFailures: failures, wholeStageAcceptanceRecordedSeparately:true, otherCoverageReceipts:["native-territory-browser.json","native-context-browser.json","native-navigation-browser.json"], sharedDatabaseAccess: false }, null, 2));
}
