import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {Browser,BrowserContext} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";

export async function nativeNavigationBrowser({f,browser,context,base,sourceHash}:{f:RegionalFixture;browser:Browser;context:BrowserContext;base:string;sourceHash:string}){
  const fixture=JSON.parse(await readFile(path.join(f.out,"native-world-contexts.json"),"utf8")).fixture;
  const created=await context.request.post(`${base}/api/worlds/${f.world}/history`,{headers:{Origin:base},data:{timelineId:fixture.timelineId,entity:"era",action:"save",draft:{name:"Harbor era with unknown intervals",description:"An era is navigation, not invented map coverage",startYear:100,endYear:500,tone:"primary"}}});
  assert.equal(created.status(),200,await created.text());
  const before=(await f.pool.query("select count(*)::int n from world_map_state where world_id=$1",[f.world])).rows[0].n,receipts:unknown[]=[],errors:string[]=[];
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const network:unknown[]=[],dialogs:string[]=[];let delayedBranchRequests=0;
    const c=await browser.newContext({storageState:await context.storageState(),viewport,hasTouch:viewport.width===390}),p=await c.newPage();p.on("pageerror",e=>errors.push(e.message));p.on("requestfailed",r=>network.push({url:r.url(),failed:r.failure()?.errorText}));p.on("response",r=>{if(r.url().includes(`/api/worlds/${f.world}`))network.push({url:r.url(),status:r.status()});});
    p.on("request",r=>{if(r.url().includes(`/api/worlds/${f.world}`))network.push({event:"request",url:r.url()});});p.on("dialog",async d=>{dialogs.push(d.message());network.push({event:"unexpected-dialog",message:d.message()});await d.dismiss();});
    await p.route(`**/api/worlds/${f.world}?*`,async route=>{const u=new URL(route.request().url());network.push({event:"route-enter",url:u.href});if(u.pathname===`/api/worlds/${f.world}`&&u.searchParams.get("timeline")===fixture.branch){delayedBranchRequests++;await p.waitForTimeout(400);}network.push({event:"route-continue",url:u.href});await route.continue();});
    const nav=p.getByRole("navigation",{name:"World workspace",exact:true});
    const openHistory=async()=>{const buttons=p.getByRole("button",{name:"History / Era",exact:true});for(let i=0;i<await buttons.count();i++)if(await buttons.nth(i).isVisible()){await buttons.nth(i).click();return p.getByRole("dialog",{name:"History / Era",exact:true});}throw Error("History controls unavailable");};
    try{
      await p.goto(`${base}/worlds/${f.world}?tab=overview&terrainMap=${fixture.target.id}&timeline=${fixture.timelineId}`,{waitUntil:"networkidle"});
      const year=p.getByRole("form",{name:"World viewing year",exact:true});await year.getByLabel("World viewing year",{exact:true}).fill("100");await year.getByRole("button",{name:"View year",exact:true}).click();
      await nav.getByRole("button",{name:"Atlas",exact:true}).click();await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();assert.match(await p.getByTestId("atlas-date-context").innerText(),/Year 100/);
      await nav.getByRole("button",{name:"Overview",exact:true}).click();assert.equal(await year.getByLabel("World viewing year",{exact:true}).inputValue(),"100");
      await nav.getByRole("button",{name:"Timelines",exact:true}).click();await p.getByRole("region",{name:"Selected historical timeline",exact:true}).getByLabel("Selected timeline",{exact:true}).selectOption(fixture.branch);
      await nav.getByRole("button",{name:"Atlas",exact:true}).click();await p.getByRole("heading",{name:"Historical appearance unknown",exact:true}).waitFor();assert.equal(new URL(p.url()).searchParams.get("timeline"),fixture.branch);
      await p.getByRole("region",{name:"Selected historical timeline",exact:true}).getByLabel("Selected timeline",{exact:true}).selectOption(fixture.timelineId);await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();
      let dialog=await openHistory();const eras=dialog.getByLabel("Atlas era",{exact:true});const option=eras.locator("option").filter({hasText:/Harbor era with unknown intervals/});const eraId=await option.getAttribute("value");assert.ok(eraId);await eras.selectOption(eraId);await dialog.waitFor({state:"hidden"});await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();
      dialog=await openHistory();await dialog.getByLabel("Atlas year",{exact:true}).fill("200");await dialog.getByRole("button",{name:"Open Year",exact:true}).click();await p.getByRole("heading",{name:"Historical appearance unknown",exact:true}).waitFor();assert.equal(await p.getByLabel("Terrain map canvas",{exact:true}).count(),0);
      await p.screenshot({path:path.join(f.out,`historical-era-navigation-${viewport.width}.png`)});
      assert.ok(delayedBranchRequests>0,"The actual branch request must traverse the 400ms delay");assert.deepEqual(dialogs,[]);receipts.push({viewport,delayedBranchRequests,overviewYearToActiveAtlasAndReturn:true,actualTimelineSelectorUnknownBranch:true,rapidAtlasTabWhileTimelineResponseDelayed400ms:true,existingEraSelectsBeginningOnly:true,insideEraUncoveredYear200Unknown:true,eraId});
    }catch(e){await writeFile(path.join(f.out,`navigation-diagnostics-${viewport.width}.json`),JSON.stringify({url:p.url(),network,errors,selected:await p.getByRole("region",{name:"Selected historical timeline",exact:true}).getByLabel("Selected timeline",{exact:true}).inputValue()},null,2));await p.screenshot({path:path.join(f.out,`navigation-failure-${viewport.width}.png`)}).catch(()=>{});await writeFile(path.join(f.out,`navigation-failure-${viewport.width}.txt`),await p.locator("body").innerText());throw e;}finally{await c.close();}
  }
  assert.equal((await f.pool.query("select count(*)::int n from world_map_state where world_id=$1",[f.world])).rows[0].n,before);assert.deepEqual(errors,[]);
  await writeFile(path.join(f.out,"native-navigation-browser.json"),JSON.stringify({passed:true,sourceHash,receipts,noInventedEraMapStates:true,clientErrors:errors,sharedDatabaseAccess:false},null,2));
}
