import {claimOwnedWorldPage} from "./worlds-owned-world-api";
/** Native UI interruption, regional and worker checks; HTTP requests only read evidence. */
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import type {BrowserContext,Page,Locator} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {regionalFixtureIds as ids} from "./worlds-regional-editing-fixture";
import {terrainTool} from "./worlds-terrain-browser-ui";
import {createGrid,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";
import {regionAreaContainsPoint} from "../src/features/worlds/terrain-region-geometry";
import {settledAdvancedCanvas} from "./worlds-advanced-browser-checks";
export async function advancedTerrainSafety({f,context,page:p,base}:{f:RegionalFixture;context:BrowserContext;page:Page;base:string}){
 const seed=JSON.parse(await readFile(f.out+"/advanced-database.json","utf8")),api=base+"/api/worlds/"+f.world,
  url=base+"/worlds/"+f.world+"?tab=atlas&terrainMap=",groups:string[]=[],measurements:unknown[]=[];
 const get=async(path:string)=>{const r=await context.request.get(api+path);assert.equal(r.status(),200,await r.text());return r.json();};
 const document=async(map=seed.browserMap)=>(await get("/terrain?terrainMap="+map)).document as TerrainDocument;
 const input=async(d:Locator,label:string,value:number)=>d.getByLabel(label,{exact:true}).fill(String(value));
 const push=async(text:string)=>{groups.push(text);console.log("PASS",text);await writeFile(f.out+"/advanced-safety-progress.json",JSON.stringify({groups,measurements},null,2));};
 const open=async(kind="Erode Selected Area",discard=true)=>{
  await terrainTool(p,"raise");const panel=p.getByRole("complementary",{name:"Tool panel",exact:true}),summary=panel.getByText("Landforms & areas",{exact:true});
  if(!await summary.isVisible())await p.getByRole("button",{name:"Tools",exact:true}).click();
  if(!await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await summary.click();
  await panel.getByRole("button",{name:kind,exact:true}).click();const d=p.getByRole("dialog",{name:kind,exact:true});await d.waitFor();
  const retained=d.getByRole("button",{name:"Discard Retained Settings",exact:true});if(discard&&await retained.count())await retained.click();return d;
 };
 const prepare=async(d:Locator)=>{
  await d.getByRole("button",{name:"Prepare Preview",exact:true}).click();
  await d.locator("[data-advanced-changed]").evaluate(async e=>{const end=performance.now()+30000;while(Number(e.getAttribute("data-advanced-changed"))<=0){if(performance.now()>end)throw Error("No numerical preview: "+e.parentElement?.textContent);await new Promise(r=>setTimeout(r,30));}});
 };
 const canvas=p.getByLabel("Terrain map canvas",{exact:true});
 const fineURL=url+seed.regionalMap+"&terrainDetail="+seed.fine;
 const fineRead=async()=>{const index=await get("/terrain/refinements?terrainMap="+seed.regionalMap),fine=index.refinements.find((r:{id:string})=>r.id===seed.fine),
  tiles=await get("/terrain/refinements?terrainMap="+seed.regionalMap+"&refinement="+seed.fine+"&lod=0&keys="+Array.from({length:fine.gridWidth*fine.gridHeight/1024},(_,i)=>i).join(","));
  return {index,fine,grid:createGrid(0,tiles.tiles.map((t:{x:number;y:number;samples:number[]})=>({x:t.x,y:t.y,samples:t.samples})),terrainGeometry({gridWidth:fine.gridWidth,gridHeight:fine.gridHeight,widthKm:fine.frame.width/1000,heightKm:fine.frame.height/1000,wrap:false,minElevation:-20000,maxElevation:20000}))};
 };
 await p.goto(fineURL);if((await f.pool.query("select to_regclass('public.world_access_participant') is not null ok")).rows[0].ok)await claimOwnedWorldPage(p,base);await canvas.waitFor();await p.getByTestId("terrain-active-detail").filter({hasText:"Shared contained numerical detail"}).waitFor({state:"attached"});
 let d=await open();const originalFine=await fineRead(),parentBefore=await document(ids.parent);
 await input(d,"Duration (erosion steps)",40);await d.getByLabel("Protect existing manual heights",{exact:true}).uncheck();
 await d.getByRole("button",{name:"Prepare Preview",exact:true}).click();const cancel=d.getByRole("button",{name:"Cancel Processing",exact:true});await cancel.waitFor();
 const cancelStart=performance.now();await cancel.click();await cancel.waitFor({state:"hidden"});const cancelMs=performance.now()-cancelStart;assert.ok(cancelMs<1500);
 assert.equal(await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).isDisabled(),true);assert.deepEqual((await fineRead()).grid,originalFine.grid);measurements.push({workerCancellationMs:cancelMs});
 await d.getByRole("button",{name:"Keep settings & Close",exact:true}).click();
 await push("Worker cancellation stops a 65,536-cell regional erosion proposal and leaves accepted samples exact");

 await p.goto(fineURL+"&terrainWorker=off");if((await f.pool.query("select to_regclass('public.world_access_participant') is not null ok")).rows[0].ok)await claimOwnedWorldPage(p,base);await canvas.waitFor();await p.getByTestId("terrain-active-detail").filter({hasText:"Shared contained numerical detail"}).waitFor({state:"attached"});d=await open();
 await input(d,"Duration (erosion steps)",40);await d.getByLabel("Protect existing manual heights",{exact:true}).uncheck();
 await d.getByRole("button",{name:"Prepare Preview",exact:true}).click();await d.locator('[data-advanced-backend="Cooperative main-thread fallback"]').waitFor();
 let dc=d.getByLabel("Terrain map canvas",{exact:true});await dc.focus();const start=performance.now();for(let i=0;i<10;i++)await p.keyboard.press(i%2?"ArrowLeft":"ArrowRight");const keyboardMs=performance.now()-start;assert.ok(keyboardMs<1500);
 const fallbackCancel=d.getByRole("button",{name:"Cancel Processing",exact:true});if(await fallbackCancel.isVisible())await fallbackCancel.click();else await d.getByRole("button",{name:"Reject Preview",exact:true}).click();
 assert.deepEqual((await fineRead()).grid,originalFine.grid);measurements.push({fallbackTenKeyboardPansMs:keyboardMs});
 await d.getByRole("button",{name:"Operation",exact:true}).click();await input(d,"Duration (erosion steps)",12);
 await d.getByRole("button",{name:"Choose Area",exact:true}).click();await d.getByLabel("Operation selection method",{exact:true}).selectOption("points");await d.getByRole("button",{name:"Draw Selected Area",exact:true}).click();
 const point=async(x:number,y:number)=>{const b=(await dc.boundingBox())!,v=await dc.evaluate(e=>({x:Number(e.dataset.viewX),y:Number(e.dataset.viewY),s:Number(e.dataset.zoom)}));await p.mouse.click(b.x+v.x+x*v.s,b.y+v.y+y*v.s);};
 // Both native preview and persisted outlines use canonical World metres.
 for(const [x,y]of [[72000,42000],[83000,42000]])await point(x,y);
 await p.reload();if((await f.pool.query("select to_regclass('public.world_access_participant') is not null ok")).rows[0].ok)await claimOwnedWorldPage(p,base);await canvas.waitFor();await p.getByTestId("terrain-active-detail").filter({hasText:"Shared contained numerical detail"}).waitFor({state:"attached"});d=await open("Erode Selected Area",false);
 await d.getByRole("button",{name:"Recover Operation Settings",exact:true}).click();await d.getByRole("button",{name:"Choose Area",exact:true}).click();dc=d.getByLabel("Terrain map canvas",{exact:true});
 assert.equal(await d.getByLabel("Operation selection method",{exact:true}).inputValue(),"points");
 for(const [x,y]of [[83000,53000],[72000,53000]])await point(x,y);
 await d.getByRole("button",{name:"Finish Selected Outline",exact:true}).click();
 await d.getByRole("button",{name:"Operation",exact:true}).click();await prepare(d);
 await p.mouse.move(0,0);await settledAdvancedCanvas(dc);await d.screenshot({path:f.out+"/regional-erosion-polygon.png"});
 await d.getByLabel("I reviewed the affected geography",{exact:true}).check();
 const [accepted]=await Promise.all([p.waitForResponse(r=>r.request().method()==="POST"&&r.url().includes("/refinements?")),d.getByRole("button",{name:"Accept Numerical Change",exact:true}).click()]);assert.equal(accepted.status(),200,await accepted.text());await d.waitFor({state:"hidden"});
 const changed=await fineRead(),source=(await get("/terrain/refinements?terrainMap="+seed.regionalMap+"&refinement="+seed.fine+"&keys=0")).source;
 assert.ok(changed.fine.revision>originalFine.fine.revision);assert.ok(changed.grid.some((v,i)=>v!==originalFine.grid[i]));
 const area=source?.advanced?.operation.selection??{frame:{x:72000,y:42000,width:11000,height:11000}};
 for(let i=0;i<changed.grid.length;i++){const q={x:70000+i%256*62.5,y:40000+Math.floor(i/256)*62.5};if(!regionAreaContainsPoint(area,q,{width:200000,height:120000,wrap:false}))assert.equal(changed.grid[i],originalFine.grid[i]);}
 await p.getByRole("button",{name:"Return to World Map",exact:true}).click();await p.waitForURL(u=>u.searchParams.get("terrainMap")===ids.parent);await canvas.waitFor();
 assert.deepEqual(await document(ids.parent),parentBefore);const i=changed.grid.findIndex((v,i)=>v!==originalFine.grid[i]),q={x:70000+i%256*62.5,y:40000+Math.floor(i/256)*62.5},sample=await get("/terrain/refinements?terrainMap="+ids.parent+"&action=sample&points="+encodeURIComponent(JSON.stringify([q])));
 assert.equal(sample.points[0].sourceId,seed.fine);assert.equal(sample.points[0].elevation,changed.grid[i]);await canvas.focus();await p.screenshot({path:f.out+"/regional-erosion-parent-world.png"});
 await push("Forced worker-unavailable fallback stays interactive; unfinished native polygon recovers after reload, saves in the Region, preserves exact outside samples and appears at identical coordinates in the canonical parent World");

 await p.goto(url+seed.browserMap);if((await f.pool.query("select to_regclass('public.world_access_participant') is not null ok")).rows[0].ok)await claimOwnedWorldPage(p,base);await canvas.waitFor();d=await open("Create Volcano");
 await input(d,"Volcano centre east (m)",45000);await input(d,"Volcano centre south (m)",28000);await input(d,"Volcano radius (m)",7000);await input(d,"Crater / caldera diameter (m)",3000);
 await input(d,"Height above existing land (m)",0);await d.getByRole("button",{name:"Prepare Preview",exact:true}).click();await d.getByRole("alert").filter({hasText:/Height|heightM|Too small/}).waitFor();assert.equal(await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).isDisabled(),true);
 await input(d,"Height above existing land (m)",800);await prepare(d);const beforeLost=await document();let packet:string|undefined,done!:()=>void;const dropped=new Promise<void>(r=>{done=r;});
 const pattern="**/terrain";await p.route(pattern,async route=>{if(route.request().method()!=="POST"||packet){await route.continue();return;}packet=route.request().postData()!;const r=await route.fetch();assert.equal(r.status(),200,await r.text());await route.abort("failed");done();});
 await d.getByLabel("I reviewed the affected geography",{exact:true}).check();await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).click();await dropped;await p.unroute(pattern);
 const retry=p.getByRole("button",{name:"Retry terrain save",exact:true});await retry.waitFor();const acceptedOnce=await document();assert.equal(acceptedOnce.revision,beforeLost.revision+1);
 let retryPacket:string|undefined;await p.route(pattern,async route=>{if(route.request().method()==="POST")retryPacket=route.request().postData()!;await route.continue();});
 const retried=p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname.endsWith("/terrain"));
 await retry.click();assert.equal((await retried).status(),200);await retry.waitFor({state:"hidden"});await p.unroute(pattern);assert.equal(retryPacket,packet);assert.deepEqual(await document(),acceptedOnce);
 await push("Invalid physical parameters cannot preview; accepted-but-lost numerical save retains the exact original request and retry creates one immutable revision");

 d=await open("Create Volcano");await input(d,"Volcano centre east (m)",47000);await input(d,"Volcano centre south (m)",28000);await d.getByLabel("Protect existing manual heights",{exact:true}).uncheck();await prepare(d);
 const collaboration=(await f.pool.query("select to_regclass('public.world_access_participant') is not null ok")).rows[0].ok;
 const other=await context.newPage();other.on("dialog",v=>v.accept());await other.goto(url+seed.browserMap);if(collaboration)await claimOwnedWorldPage(other,base);await other.getByLabel("Terrain map canvas",{exact:true}).waitFor();await terrainTool(other,"raise");
 const oc=other.getByLabel("Terrain map canvas",{exact:true}),b=(await oc.boundingBox())!;const response=other.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname.endsWith("/terrain"));
 await other.mouse.move(b.x+b.width*.7,b.y+b.height*.5);await other.mouse.down();await other.mouse.move(b.x+b.width*.7+5,b.y+b.height*.5+3,{steps:3});await other.mouse.up();assert.equal((await response).status(),200);
 const concurrent=await document();await p.bringToFront();await p.evaluate(()=>dispatchEvent(new Event("focus")));await p.locator('[role="alert"]').filter({hasText:"Accepted numerical sources changed"}).waitFor({state:"attached"});
 if(collaboration){
  // A second tab must explicitly take control; the original proposal becomes read-only and remains exportable.
  assert.equal(await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).isDisabled(),true);
 }else{
  await d.getByLabel("I reviewed the affected geography",{exact:true}).check();await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).click();await d.getByRole("alert").filter({hasText:"active source changed"}).waitFor();
 }
 assert.deepEqual(await document(),concurrent);
 const download=p.waitForEvent("download");await d.getByRole("button",{name:"Export Operation Settings",exact:true}).click();await(await download).saveAs(f.out+"/retained-conflict-settings.json");await d.getByRole("button",{name:"Keep settings & Close",exact:true}).click();await other.close();
 await push("A second native editor's sculpt is retained; the stale proposal stays recoverable/exportable and cannot overwrite the newer accepted terrain");
 await writeFile(f.out+"/advanced-safety.json",JSON.stringify({passed:true,groups,measurements,sharedDatabaseAccess:false},null,2));
}
