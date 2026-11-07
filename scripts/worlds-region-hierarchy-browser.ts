import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import type {Browser,BrowserContext,Page} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {regionalFixtureIds as ids} from "./worlds-regional-editing-fixture";
import {stable,click} from "./worlds-regional-editing-browser-checks";
import {chooseTerrainMap,visibleTerrainPoint} from "./worlds-terrain-browser-ui";
import {claimOwnedWorldPage} from "./worlds-owned-world-api";

type Options={f:RegionalFixture;browser:Browser;context:BrowserContext;page:Page;base:string;errors:string[];groups:string[]};
export async function hierarchyBrowser(o:Options){
 if(process.env.SERRIAN_HIERARCHY_NAVIGATION_ONLY==="1")return(await import("./worlds-atlas-map-navigation-browser")).mapNavigationBrowser(o);
 const {f,page:p,context,base,groups}=o,api=`${base}/api/worlds/${f.world}/terrain`,url=(id:string)=>`${base}/worlds/${f.world}?tab=atlas&terrainMap=${id}`,canvas=p.getByLabel("Terrain map canvas",{exact:true}),browser=p.getByRole("dialog",{name:"Map browser",exact:true}),created:Record<string,string>={};
 const read=async()=>{const response=await context.request.get(api+"/hierarchy");assert.equal(response.status(),200,await response.text());return response.json();};
 const ready=async()=>{await canvas.waitFor();await stable(p);await p.getByRole("button",{name:/^Current Map:/}).waitFor();};
 const settleCanvas=async()=>{await canvas.evaluate(async c=>{const start=performance.now();let previous="",frames=0;while(performance.now()-start<5000){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const b=c.getBoundingClientRect(),value=JSON.stringify([b.x,b.y,b.width,b.height]);frames=value===previous?frames+1:0;previous=value;if(frames>=12&&performance.now()-start>=400)return;}throw Error("The native canvas layout did not settle");});};
 const switchTo=async(id:string)=>{await chooseTerrainMap(p,id);await p.waitForURL(u=>u.searchParams.get("terrainMap")===id);await ready();};
 const paintAt=async(x:number,y:number,ground=true)=>{
  const at=await visibleTerrainPoint(p,{x,y}),accepted=ground?p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname===`/api/worlds/${f.world}/terrain/materials`):undefined;
  assert.equal(await p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.getAttribute("aria-label"),at),"Terrain map canvas","The retained paint journey must reach the actual canvas");
  await p.mouse.move(at.x,at.y);await p.mouse.down();await p.waitForTimeout(80);await p.mouse.move(at.x+3,at.y+2,{steps:3});await p.mouse.up();
  if(accepted){const response=await accepted;assert.equal(response.status(),200,await response.text());}
 };
 const draw=async(name:string,polygon:number[][],elsewhere=false)=>{
  const sub=await p.getByRole("button",{name:"Create Subregion",exact:true}).count()>0;
  await p.getByRole("button",{name:sub?"Create Subregion":"Create New Region",exact:true}).first().click();
  const continuation=p.getByRole("button",{name:"Continue Creating Region",exact:true});await continuation.or(p.getByRole("button",{name:"Freehand",exact:true})).first().waitFor();if(await continuation.isVisible())await continuation.click();
  await p.getByRole("button",{name:"Freehand",exact:true}).click();await p.getByLabel("Regional map name",{exact:true}).fill(name);
  if(elsewhere)await p.getByRole("button",{name:"Draw Elsewhere on World",exact:true}).click();
  const parent=await p.getByLabel("Organize under",{exact:true}).inputValue();
  // The retained fixture now has both sidebars and live Town captions. Use the
  // real hide/pan controls to expose the complete original geographic outline;
  // no drawing point may land on a sidebar, caption or floating zoom control.
  for(const name of ["Tools","Options"]){const toggle=p.getByRole("button",{name,exact:true});if(await toggle.getAttribute("aria-expanded")==="true")await toggle.click();}
  await visibleTerrainPoint(p,{x:polygon[0][0],y:polygon[0][1]});
  const center={x:(Math.min(...polygon.map(v=>v[0]))+Math.max(...polygon.map(v=>v[0])))/2,y:(Math.min(...polygon.map(v=>v[1]))+Math.max(...polygon.map(v=>v[1])))/2},box=(await canvas.boundingBox())!,view=await canvas.evaluate(c=>({x:Number(c.dataset.viewX),y:Number(c.dataset.viewY),scale:Number(c.dataset.zoom)})),start={x:box.x+box.width*.45,y:box.y+box.height*.65},dx: number=box.width*.5-view.x-center.x*view.scale,dy: number=box.height*.6-view.y-center.y*view.scale;
  assert.equal(await p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.getAttribute("aria-label"),start),"Terrain map canvas");
  await p.keyboard.down("Space");try{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(start.x+dx,start.y+dy,{steps:5});await p.mouse.up();}finally{await p.keyboard.up("Space");}
  await stable(p);const drawingBox=(await canvas.boundingBox())!,drawingView=await canvas.evaluate(c=>({x:Number(c.dataset.viewX),y:Number(c.dataset.viewY),scale:Number(c.dataset.zoom)})),positions=polygon.map(([x,y])=>({x:drawingBox.x+drawingView.x+x*drawingView.scale,y:drawingBox.y+drawingView.y+y*drawingView.scale}));
  for(const at of positions)assert.equal(await p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.getAttribute("aria-label"),at),"Terrain map canvas","Every retained polygon vertex must reach the actual canvas");
  await p.mouse.move(positions[0].x,positions[0].y);await p.mouse.down();for(const at of positions.slice(1))await p.mouse.move(at.x,at.y,{steps:4});await p.mouse.up();
  const options=p.getByRole("button",{name:"Options",exact:true});if(await options.getAttribute("aria-expanded")==="false")await options.click();
  await p.getByRole("button",{name:"Review & Save Region",exact:true}).click();const review=p.getByRole("region",{name:"Save Region review",exact:true});await review.waitFor();assert.match(await review.innerText(),new RegExp(name));
  if(elsewhere){assert.ok(parent);await p.getByRole("status").filter({hasText:"extends outside its organizing parent"}).waitFor();}
  await p.screenshot({path:`${f.out}/preview-${name.replaceAll(" ","-")}.png`});
  const saved=p.waitForResponse(r=>r.request().method()==="POST"&&r.url().includes("/terrain/regions?"));await review.getByRole("button",{name:"Save & Open Region",exact:true}).click();const response=await saved;assert.equal(response.status(),200,await response.text());const id=(await response.json()).id;created[name]=id;await p.waitForURL(u=>u.searchParams.get("terrainMap")===id);await ready();
  const tools=p.getByRole("button",{name:"Tools",exact:true});if(await tools.getAttribute("aria-expanded")==="false")await tools.click();
  const nodes=(await read()).nodes,node=nodes.find((n:{id:string})=>n.id===id);assert.equal(node.organizingParentId,parent||null);assert.equal(node.sourceWorldMapId,ids.parent);
  return id;
 };
 await p.goto(url(ids.parent));await claimOwnedWorldPage(p,base);await ready();assert.ok(await p.getByRole("button",{name:"Switch Map",exact:true}).isVisible());
 await p.getByRole("button",{name:"Paint",exact:true}).click();await p.getByLabel("Ground material",{exact:true}).selectOption("sand");await p.getByLabel(/^Paint brush size/).fill("1");
 await p.waitForFunction(()=>document.querySelector('[aria-label="Everyday Atlas editing"]')?.getAttribute("aria-busy")==="false");
 await paintAt(50000,45000);await p.getByLabel("Ground material",{exact:true}).selectOption("rock");await paintAt(55000,45000);
 // Explicitly wait for paint acknowledgement before starting another document.
 await p.waitForFunction(()=>document.querySelector('[data-testid="paint-status"]')?.textContent?.match(/saved/i));
 const groundRead=await context.request.get(api+"/materials?terrainMap="+ids.parent);assert.equal(groundRead.status(),200);const acceptedGround=await groundRead.json();for(const material of ["sand","rock"])assert.ok(acceptedGround.layer.strokes.some((stroke:{material:string})=>stroke.material===material));
 await p.getByLabel("Paint layer",{exact:true}).selectOption("vegetation");await p.getByLabel("Vegetation type",{exact:true}).selectOption("woodland");await p.getByLabel(/^Paint brush size/).fill("1");await paintAt(50000,48000,false);const environmentSaved=p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname===`/api/worlds/${f.world}/terrain/environment`);await p.getByRole("button",{name:"Save Changes",exact:true}).click();assert.equal((await environmentSaved).status(),200);await p.waitForFunction(()=>document.querySelector('[data-testid="paint-status"]')?.textContent?.match(/saved/i));
 await p.getByLabel("Vegetation type",{exact:true}).selectOption({label:"Grassland"});groups.push("Visible everyday Sand/Rock and forest/grassland controls remain immediate");
 const us=await draw("United States",[[40000,25000],[100000,25000],[119000,45000],[110000,85000],[70000,90000],[42000,68000]]);
 await p.getByText("Painting vegetation: Grassland",{exact:true}).waitFor();assert.equal(await p.getByLabel(/^Paint brush size/).inputValue(),"1");
 const utah=await draw("Utah",[[60000,40000],[85000,40000],[85000,52000],[80000,52000],[80000,65000],[60000,65000]]);
 const crumbs=p.getByRole("navigation",{name:"Map breadcrumbs",exact:true}).first();assert.match(await crumbs.innerText(),/United States[\s\S]*Utah/);await crumbs.getByRole("button",{name:"United States",exact:true}).click();await p.waitForURL(u=>u.searchParams.get("terrainMap")===us);await ready();
 const alaska=await draw("Alaska",[[150000,10000],[174000,14000],[178000,28000],[158000,35000],[148000,22000]],true);await switchTo(utah);
 const county=await draw("Salt Lake County",[[65000,45000],[75000,45000],[75000,55000],[65000,55000]]);
 const local=await draw("Local Region",[[68000,48000],[70000,48000],[70000,50000],[68000,50000]]);
 await p.screenshot({path:`${f.out}/nested-map-header.png`});groups.push("A-C: native freehand country, state, distant Alaska, county and local region; accepted hierarchy and original geographic source");
 await p.getByRole("button",{name:"Switch Map",exact:true}).click();await browser.getByLabel("Search maps",{exact:true}).fill("Alaska");await browser.getByRole("button",{name:/^Alaska/}).click();await p.waitForURL(u=>u.searchParams.get("terrainMap")===alaska);await ready();
 await p.getByRole("button",{name:"Paint",exact:true}).click();await p.getByLabel("Paint layer",{exact:true}).selectOption("ground");await p.getByLabel("Ground material",{exact:true}).selectOption("sand");await p.getByLabel(/^Paint brush size/).fill("1");await p.waitForFunction(()=>document.querySelector('[aria-label="Everyday Atlas editing"]')?.getAttribute("aria-busy")==="false");await paintAt(162000,22000);await p.waitForFunction(()=>document.querySelector('[data-testid="paint-status"]')?.textContent?.match(/saved/i));await p.getByRole("button",{name:"Return to Parent Region",exact:true}).click();await p.waitForURL(u=>u.searchParams.get("terrainMap")===us);await ready();
 // Reorganization uses the visible browser, preserving immutable geography and old rectangles.
 const original=(await f.pool.query("select * from world_map_region where map_id=$1",[ids.a])).rows[0];await switchTo(ids.a);await p.getByRole("button",{name:"Switch Map",exact:true}).click();await browser.getByText("Change organizing parent",{exact:true}).click();await browser.getByLabel("Move under region",{exact:true}).selectOption(us);const move=p.waitForResponse(r=>r.request().method()==="POST"&&r.url().includes("/hierarchy?"));await browser.getByRole("button",{name:"Save Parent",exact:true}).click();assert.equal((await move).status(),200);await browser.getByRole("status").filter({hasText:"Organizing parent saved"}).waitFor();assert.deepEqual((await f.pool.query("select * from world_map_region where map_id=$1",[ids.a])).rows[0],original);await browser.getByRole("button",{name:"Close map browser",exact:true}).click();
 groups.push("D: existing rectangular region reorganized using visible controls; immutable region row and source exact");
 // Independent World created from the immediate browser action.
 await p.getByRole("button",{name:"Switch Map",exact:true}).click();await browser.getByRole("button",{name:"Create World Map",exact:true}).click();await p.getByLabel("Map name",{exact:true}).waitFor();
 await p.getByRole("button",{name:"Close editor",exact:true}).click();
 const second=randomUUID(),createdWorld=await context.request.post(api,{headers:{Origin:base},data:{action:"create",requestId:second,name:"Second World",initial:"land",settings:{widthKm:200,heightKm:120,gridWidth:128,gridHeight:128,minElevation:-20000,maxElevation:20000}}});assert.equal(createdWorld.status(),200,await createdWorld.text());
 await p.reload();await claimOwnedWorldPage(p,base);await ready();await switchTo(second);await switchTo(ids.parent);await switchTo(utah);await switchTo(alaska);await switchTo(local);
 const worldName=(await read()).nodes.find((n:{id:string})=>n.id===ids.parent).name;await p.getByRole("navigation",{name:"Map breadcrumbs",exact:true}).first().getByRole("button",{name:worldName,exact:true}).click();await p.waitForURL(u=>u.searchParams.get("terrainMap")===ids.parent);await ready();
 await p.getByRole("button",{name:"Create New Region",exact:true}).click();await p.getByRole("button",{name:"Point-by-Point",exact:true}).click();await click(p,30000,20000);await chooseTerrainMap(p,alaska);
 const pending=p.getByRole("region",{name:"Pending Work",exact:true});await pending.waitFor();assert.match(await pending.innerText(),/Current map/);assert.match(await pending.innerText(),/You want to open: Alaska/);await pending.getByRole("button",{name:"Discard region changes",exact:true}).click();await pending.getByRole("button",{name:"Continue to Alaska",exact:true}).click();await p.waitForURL(u=>u.searchParams.get("terrainMap")===alaska);await ready();groups.push("Supplement 1-8: direct Worlds/siblings/deep search and breadcrumbs; retained destination with explicit pending discard and Continue to Alaska");
 // Separate browser context reopens every saved level; no session-only hierarchy.
 const reopened=await o.browser.newContext({storageState:await context.storageState(),viewport:{width:1440,height:1000}}),q=await reopened.newPage();for(const id of [us,utah,alaska,county,local]){await q.goto(url(id));await q.getByRole("button",{name:/^Current Map:/}).waitFor();assert.match(await q.getByRole("navigation",{name:"Map breadcrumbs",exact:true}).first().innerText(),new RegExp((await read()).nodes.find((n:{id:string})=>n.id===id).name));}await reopened.close();
 if(process.env.SERRIAN_HIERARCHY_RECOVERY==="1")await(await import("./worlds-region-hierarchy-recovery-browser")).hierarchyRecoveryBrowser(o);
 const layouts=[];for(const [width,height]of [[1440,1000],[1366,768],[820,1180],[390,844]]){await p.setViewportSize({width,height});await p.goto(url(utah));await claimOwnedWorldPage(p,base);await ready();await p.getByRole("button",{name:"Expand editor",exact:true}).click();await p.getByRole("button",{name:"Exit expanded editor",exact:true}).click();for(const expanded of [false,true]){if(expanded)await p.getByRole("button",{name:"Expand editor",exact:true}).click();for(const name of ["Tools","Options"]){const control=p.getByRole("button",{name,exact:true});if(await control.getAttribute("aria-expanded")==="true")await control.click();}await settleCanvas();const before=await canvas.boundingBox();const beforeCamera=await canvas.evaluate(c=>({x:c.dataset.viewX,y:c.dataset.viewY,scale:c.dataset.zoom})),beforePageY=await p.evaluate(()=>scrollY);assert.ok(before);assert.ok(before.height>=(width>640?500:height/2)-1);const current=p.getByRole("button",{name:/^Current Map:/});await current.focus();await p.keyboard.press("Enter");await browser.waitFor();await browser.getByLabel("Search maps",{exact:true}).fill("Local Region");await browser.getByRole("button",{name:/^Local Region/}).waitFor();await p.screenshot({path:`${f.out}/browser-${width}-${expanded}.png`});await p.keyboard.press("Escape");assert.ok(await canvas.isVisible());await settleCanvas();const after=await canvas.boundingBox();assert.deepEqual(after,before);assert.deepEqual(await canvas.evaluate(c=>({x:c.dataset.viewX,y:c.dataset.viewY,scale:c.dataset.zoom})),beforeCamera,"Opening/closing the real browser preserves the exact camera");assert.equal(await p.evaluate(()=>scrollY),beforePageY,"Opening/closing the real browser preserves page position");layouts.push({width,height,expanded,canvas:after});}}
 groups.push("F and supplement 9-10: fresh browser context, deep-map reopen, closed panels, expanded mode, desktop/tablet/phone, keyboard modal dismissal and original canvas minima");
 await writeFile(`${f.out}/hierarchy-browser.json`,JSON.stringify({passed:true,created,layouts,visibleControlsOnlyForJourneys:true,numericalSourcePreserved:true,sharedDatabaseAccess:false,physicalDeviceClaim:false,ownerAcceptance:false},null,2));
}
