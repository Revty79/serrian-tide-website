import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type pg from "pg";
import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import { draftOf } from "../src/features/worlds/atlas";
import type { AtlasBundle } from "../src/features/worlds/atlas";
import { entryDraftOf } from "../src/features/worlds/client-api";
import { atlasServiceChecks, atlasBrowserChecks } from "./worlds-atlas-checks";
import { cartographyServiceChecks, cartographyBrowserChecks } from "./worlds-cartography-checks";
import { generationServiceChecks, generationBrowserChecks } from "./worlds-generation-checks";
import { connectedGeographyServiceChecks, connectedGeographyBrowserChecks } from "./worlds-connected-geography-checks";
import { settlementServiceChecks, settlementBrowserChecks } from "./worlds-settlement-checks";
import { interiorServiceChecks, interiorBrowserChecks } from "./worlds-interior-checks";
import { dungeonServiceChecks, dungeonBrowserChecks } from "./worlds-dungeon-checks";
import { repairHBrowserChecks } from "./worlds-repair-h-checks";

export type RepairIFixtures={
  atlas:Awaited<ReturnType<typeof atlasServiceChecks>>;
  cartography:Awaited<ReturnType<typeof cartographyServiceChecks>>;
  generation:Awaited<ReturnType<typeof generationServiceChecks>>;
  connected:Awaited<ReturnType<typeof connectedGeographyServiceChecks>>;
  settlement:Awaited<ReturnType<typeof settlementServiceChecks>>;
  interior:Awaited<ReturnType<typeof interiorServiceChecks>>;
  dungeon:Awaited<ReturnType<typeof dungeonServiceChecks>>;
};
export async function repairIFixtures(pool:pg.Pool):Promise<RepairIFixtures>{
  const worlds=await import("../src/features/worlds/world-service"),service=await import("../src/features/worlds/atlas-service");
  const foreign=await worlds.createWorld("other-god",{name:"I private independent Atlas"});
  const atlas=await atlasServiceChecks(service,worlds,pool,foreign);
  const mapId=await service.changeAtlas("other-god",foreign,{action:"create",name:"The Valdorian Atlas",description:"Retained editable source fixture",scope:"world"});
  let bundle=await service.getAtlas("other-god",foreign),map=bundle.maps.find(m=>m.id===mapId)!;const featureId=randomUUID(),geographyId=randomUUID(),draft=draftOf(map,bundle.geographies);
  draft.features=[{id:featureId,geographyId,archived:false,geometry:{version:1,type:"polygon",points:[[200,200],[1100,120],[1600,300],[1500,850],[900,1050],[300,950]].map(([x,y])=>({id:randomUUID(),x,y}))}}];draft.geographies=[{id:geographyId,revision:null,name:"Valdoria (3A)",description:"Original saved continent",kind:"continent",parentId:null}];
  await service.changeAtlas("other-god",foreign,{action:"save",id:mapId,revision:map.revision,draft});
  const cartography=await cartographyServiceChecks(service,pool,{worldId:foreign,mapId,featureId,geographyId},atlas.worldId);
  const generation=await generationServiceChecks(service,pool,foreign,atlas.worldId);
  const connected=await connectedGeographyServiceChecks(service,worlds,pool,foreign);
  const settlement=await settlementServiceChecks(service,worlds,pool,foreign);
  const interior=await interiorServiceChecks(service,worlds,pool,foreign);
  const dungeon=await dungeonServiceChecks(service,pool,interior,foreign);
  bundle=await service.getAtlas("other-god",foreign);map=bundle.maps.find(m=>m.id===mapId)!;assert.equal(map.features[0].id,featureId);
  return {atlas,cartography,generation,connected,settlement,interior,dungeon};
}
async function signIn(context:BrowserContext,base:string,user="world-god"){const response=await context.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:`${user}@example.invalid`,password:"Worlds-Test-Only-Password!"}});assert.equal(response.status(),200,await response.text());}
async function openAtlas(page:Page,base:string,worldId:string){await page.goto(`${base}/worlds/${worldId}?tab=atlas`);await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(b=>Object.keys(b).some(k=>k.startsWith("__reactProps$"))));await page.getByRole("button",{name:"Atlas",exact:true}).click();await page.getByRole("heading",{name:"Atlas",exact:true}).waitFor();await page.getByRole("button",{name:"New map",exact:true}).waitFor();}
type HelpReceipt={view:string;label:string;help:string;method:string};
async function auditHelp(root:Locator,page:Page,touch:boolean,view:string,receipts:HelpReceipt[]){
  const fields=root.locator("[data-field-guidance]");for(let i=0;i<await fields.count();i++){
    const field=fields.nth(i);if(!await field.isVisible())continue;
    const label=(await field.getAttribute("data-field-guidance"))!,details=field.locator("details"),summary=details.locator("summary");
    const staticHelp=(await field.locator('[role="note"]').textContent())?.trim(),method=touch?"native touch":"keyboard";
    if(receipts.some(r=>r.view.split("/")[0]===view.split("/")[0]&&r.method===method&&r.label===label&&r.help===staticHelp))continue;
    const values=()=>field.locator("input,select,textarea").evaluateAll(nodes=>nodes.map(n=>({value:(n as HTMLInputElement).value,checked:(n as HTMLInputElement).checked})));
    const before=await values();await summary.scrollIntoViewIfNeeded();if(await details.getAttribute("open")!==null)await summary.click();
    if(touch)await summary.tap();else{await summary.focus();await summary.press(i%2?"Space":"Enter");}
    const note=field.getByRole("note");await note.waitFor();const help=(await note.innerText()).trim();assert.ok(help.length>=30,`${view}/${label} needs useful guidance.`);assert.deepEqual(await values(),before);
    await summary.press("Escape");assert.equal(await details.getAttribute("open"),null);assert.ok(await summary.evaluate(n=>n===document.activeElement));
    receipts.push({view,label,help,method:touch?"native touch":"keyboard"});
  }
}
async function guidanceChecks(browser:Browser,base:string,pool:pg.Pool,f:RepairIFixtures,directory:string){
  const receipts:HelpReceipt[]=[],before=await sourceSnapshot(pool),errors:string[]=[];
  const overflow=async(page:Page)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=page.viewportSize()!.width+1,"Atlas must fit the configured viewport.");
  for(const touch of [false,true]){
    const view=touch?"phone":"desktop",context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:900},isMobile:touch,hasTouch:touch,extraHTTPHeaders:{"X-Forwarded-For":touch?"198.51.100.241":"198.51.100.240"}});await signIn(context,base);const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    const audit=async(root:Locator,state:string)=>{await auditHelp(root,page,touch,`${view}/${state}`,receipts);await overflow(page);};
    const click=async(root:Locator,name:string)=>{const button=root.getByRole("button",{name,exact:true});if(touch)await button.tap();else await button.click();};
    const expand=async(root:Locator,title:string)=>{const summary=root.locator("summary").filter({hasText:new RegExp(`^${title}$`)});if(await summary.locator("..").getAttribute("open")===null)await summary.click();};
    try{
      await openAtlas(page,base,f.connected.worldId);await click(page.getByRole("main"),"Generate map");let root=page.getByRole("region",{name:"Generate a World map"});await audit(root,"generator");
      await expand(root,"Advanced geography settings");await expand(root,"Place major features");await audit(root,"generator-advanced");
      await root.getByLabel("Creation method",{exact:true}).selectOption("describe");await audit(root,"generator-description");
      await root.getByLabel("Describe the geography",{exact:true}).fill("One large continent in the north. Three islands off the eastern shore. A city called Dawnport.");await click(root,"Interpret description");await root.getByRole("heading",{name:"Review the geographic plan",exact:true}).waitFor();await audit(root,"generator-limits");page.once("dialog",d=>d.accept());await click(root,"Map library");
      const read=async(worldId:string,mapId:string)=>{const response=await context.request.get(`${base}/api/worlds/${worldId}/atlas?map=${mapId}`);assert.equal(response.status(),200);return await response.json() as AtlasBundle;};
      const source=await read(f.connected.worldId,f.connected.mapId),map=source.maps.find(m=>m.id===f.connected.mapId)!;
      await openAtlas(page,base,f.connected.worldId);await click(page.getByRole("main"),`Open ${map.name}`);root=page.getByRole("region",{name:"Map editor"});await expand(root,"Style and layers");await expand(root,"Map information");await audit(root,"cartography");
      for(const tool of ["Draw landmass","Place location","Freehand coast","Sculpt coast","Paint terrain","Draw path","Place symbol","Place label"]){await click(root,tool);await audit(root,`tool-${tool}`);}
      await click(root,"Select");const land=source.geographies.find(g=>g.id===map.features[0].geographyId)!;await click(root,land.name);await click(root,"Edit points");await root.getByLabel("Boundary point",{exact:true}).selectOption({index:1});await audit(root,"coast-points");
      for(const kind of ["terrain","path"]){const index=map.drawings!.findIndex(d=>d.type===kind),drawing=map.drawings![index],button=root.getByRole("heading",{name:"Cartographic drawings",exact:true}).locator("xpath=following-sibling::div[1]").getByRole("button").nth(index);assert.equal(await button.innerText(),drawing.name);if(touch)await button.tap();else await button.click();await click(root,"Edit points");await root.getByLabel("Drawing point",{exact:true}).selectOption({index:1});await audit(root,`saved-${kind}`);}
      await page.screenshot({path:`${directory}/${view}-cartography-help.png`,fullPage:false});await overflow(page);
      await signIn(context,base,"other-god");const art=await read(f.cartography.worldId,f.cartography.mapId),artMap=art.maps.find(m=>m.id===f.cartography.mapId)!;await openAtlas(page,base,f.cartography.worldId);await click(page.getByRole("main"),`Open ${artMap.name}`);root=page.getByRole("region",{name:"Map editor"});
      for(const kind of ["symbol","label"]){const index=artMap.drawings!.findIndex(d=>d.type===kind),drawing=artMap.drawings![index];assert.ok(drawing,"Run the cartography checkpoint once before guidance to reuse its real saved symbols and labels.");const button=root.getByRole("heading",{name:"Cartographic drawings",exact:true}).locator("xpath=following-sibling::div[1]").getByRole("button").nth(index);assert.equal(await button.innerText(),drawing.name);if(touch)await button.tap();else await button.click();await audit(root,`saved-${kind}`);}
      await signIn(context,base);
      for(const [kind,worldId,mapId]of [["settlement",f.settlement.worldId,f.settlement.mapId],["interior",f.interior.worldId,f.interior.maps[0]],["dungeon",f.dungeon.worldId,f.dungeon.maps[0]]] as const){
        const bundle=await read(worldId,mapId),map=bundle.maps.find(m=>m.id===mapId)!;await openAtlas(page,base,worldId);await click(page.getByRole("main"),`Open ${map.name}`);root=page.getByRole("main");await audit(root,kind);
        if(kind==="settlement"){
          for(const entityKind of ["building","district","street","landmark"]){const entity=map.settlementEntities!.find(e=>e.kind===entityKind)!,name=bundle.geographies.find(g=>g.id===entity.geographyId)!.name;await click(root,name);await audit(root,`settlement-${entityKind}`);}
          const entity=map.settlementEntities!.find(e=>e.kind==="building")!,name=bundle.geographies.find(g=>g.id===entity.geographyId)!.name;await click(root,name);await click(root,"Edit points");await root.getByLabel("Object point",{exact:true}).selectOption({index:1});await audit(root,"settlement-points");
        }else{
          if(kind==="dungeon")await expand(root,"Dungeon grid");await audit(root,`${kind}-grid`);
          const entities=kind==="dungeon"?map.dungeonEntities!:map.interiorEntities!;
          for(const entityKind of kind==="dungeon"?["room","corridor","opening","transition"]:["room","opening","transition"]){const entity=entities.find(e=>e.kind===entityKind&&e.name)!;await click(root,entity.name);await audit(root,`${kind}-${entityKind}`);}
          const entity=entities.find(e=>e.kind==="room")!;await click(root,entity.name);await click(root,"Edit points");await root.getByLabel("Boundary point",{exact:true}).selectOption({index:1});await audit(root,`${kind}-points`);
        }
        await page.screenshot({path:`${directory}/${view}-${kind}-help.png`,fullPage:false});
      }
    }catch(error){await page.screenshot({path:`${directory}/${view}-guidance-failure.png`}).catch(()=>{});throw error;}finally{await writeFile(`${directory}/i-author-help.json`,JSON.stringify(receipts,null,2)+"\n");await context.close();}
  }
  assert.deepEqual(await sourceSnapshot(pool),before,"Reading tool guidance must retain every saved shape, source, identity, revision and History version.");assert.deepEqual(errors,[]);console.log(`PASS ${receipts.length} keyboard/native-touch author guidance interactions with saved-source preservation.`);
}
async function privacyChecks(browser:Browser,base:string,pool:pg.Pool,f:{dungeon:Pick<RepairIFixtures["dungeon"],"worldId"|"maps">},directory:string){
  const worlds=await import("../src/features/worlds/world-service"),timelines=await import("../src/features/worlds/branching-history-service"),atlas=await import("../src/features/worlds/atlas-service"),milestones=await import("../src/features/worlds/atlas-milestone-service");
  const worldId=f.dungeon.worldId,world=await worlds.getWorld("world-god",worldId),primary=world.selectedTimeline.id,bundle=await atlas.getAtlas("world-god",worldId,false,f.dungeon.maps[0]),map=bundle.maps.find(m=>m.id===f.dungeon.maps[0])!,place=map.dungeonEntities!.find(e=>e.kind==="room"&&e.visibility==="ordinary")!;
  const existing=(await pool.query("select id from world_timeline where world_id=$1 and name='I alternate place account'",[worldId])).rows[0];
  const alternate=existing?.id??await timelines.changeTimeline("world-god",worldId,{action:"create",parentRevision:world.selectedTimeline.revision,draft:{name:"I alternate place account",description:"Separate authored account",explanation:"Different history after Year 100",parentId:primary,divergenceYear:100}});
  for(const [timeline,title,visibility]of [[primary,"I public place account","ordinary"],[primary,"I_PROTECTED_PLACE_HISTORY","protected"],[alternate,"I alternate place account","ordinary"]] as const){const saved=await milestones.placeMilestones("world-god",worldId,timeline,place.id);if(!saved.events.some(e=>e.title===title))await milestones.savePlaceMilestone("world-god",worldId,{timelineId:timeline,geographyId:place.id,geographyRevision:saved.place.revision,requestId:randomUUID(),eventType:"Discovery",draft:{...entryDraftOf(),title,account:`Authored ${title}`,visibility,notes:"I_PRIVATE_HISTORY_NOTES",time:{version:1,scale:"world-year",kind:"known",year:200}}});}
  const before=await sourceSnapshot(pool),errors:string[]=[],results:unknown[]=[];
  for(const touch of [false,true]){const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:900},isMobile:touch,hasTouch:touch,extraHTTPHeaders:{"X-Forwarded-For":touch?"198.51.100.247":"198.51.100.246"}});await signIn(context,base);const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    try{for(const [timeline,ordinary,title,absent]of [[primary,false,"I public place account","I alternate place account"],[alternate,false,"I alternate place account","I public place account"],[primary,true,"I public place account","I_PROTECTED_PLACE_HISTORY"]] as const){
      const url=`${base}/worlds/${worldId}?tab=atlas&timeline=${timeline}&atlas=${map.id}&place=${place.id}${ordinary?"&ordinary=1":""}`;await page.goto(url);const trigger=page.getByRole("button",{name:`Historical milestones: ${place.name}`,exact:true});await trigger.waitFor();if(touch)await trigger.tap();else await trigger.click();const dialog=page.locator("dialog[open]");await dialog.getByRole("heading",{name:place.name,exact:true}).waitFor();await dialog.getByRole("heading",{name:title,exact:true}).waitFor();assert.ok(!(await dialog.innerText()).includes(absent));
      if(ordinary){assert.ok(!(await page.getByRole("main").innerText()).includes("I_PRIVATE_HISTORY_NOTES"));assert.equal(await dialog.getByRole("button",{name:/^Edit milestone/}).count(),0);const response=await context.request.get(`${base}/api/worlds/${worldId}/atlas/milestones?timeline=${timeline}&place=${place.id}&ordinary=1`);assert.equal(response.status(),200);const raw=await response.text();assert.ok(!raw.includes("I_PROTECTED_PLACE_HISTORY")&&!raw.includes("I_PRIVATE_HISTORY_NOTES"));}
      else{await dialog.getByRole("button",{name:`Edit milestone: ${title}`,exact:true}).click();const summary=dialog.locator("summary").filter({hasText:/^Reliability, eras and protected knowledge$/});await summary.click();const help:HelpReceipt[]=[];await auditHelp(dialog,page,touch,`${touch?"phone":"desktop"}/place-history`,help);await writeFile(`${directory}/${touch?"phone":"desktop"}-${timeline}-history-help.json`,JSON.stringify(help,null,2));await dialog.getByRole("button",{name:"Cancel milestone",exact:true}).click();}
      await page.screenshot({path:`${directory}/${touch?"phone":"desktop"}-${ordinary?"ordinary":timeline===primary?"primary":"alternate"}-place-history.png`});await dialog.getByRole("button",{name:"Close place history",exact:true}).click();await dialog.waitFor({state:"hidden"});assert.ok(await trigger.evaluate(n=>n===document.activeElement));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=page.viewportSize()!.width+1);results.push({touch,timeline,ordinary});
    }}finally{await context.close();}
  }
  for(const [user,status]of [["other-god",404],["world-player",403],["anonymous",401],["world-admin",404]] as const){const context=await browser.newContext({extraHTTPHeaders:{"X-Forwarded-For":`198.51.100.${user==="anonymous"?251:user==="world-admin"?252:user==="other-god"?253:254}`}});try{if(user!=="anonymous")await signIn(context,base,user);const api=`${base}/api/worlds/${worldId}/atlas`,response=await context.request.get(`${api}?map=${map.id}`);assert.equal(response.status(),status);assert.match(response.headers()["cache-control"],/no-store/);assert.ok(!(await response.text()).includes(place.name));const write=await context.request.post(api,{headers:{Origin:base},data:{action:"create",name:"Unauthorized",description:"",scope:"world"}});assert.equal(write.status(),status);
    if(user==="world-admin"){const review=await context.request.get(`${api}?map=${map.id}&review=1`);assert.equal(review.status(),200);assert.equal((await review.json()).canEdit,false);assert.equal((await context.request.post(`${api}?review=1`,{headers:{Origin:base},data:{action:"create",name:"Unauthorized",description:"",scope:"world"}})).status(),404);const page=await context.newPage();await page.goto(`${base}/worlds/${worldId}?tab=atlas&atlas=${map.id}&review=1`);await page.getByRole("region",{name:"Map explorer"}).waitFor();assert.equal(await page.getByRole("button",{name:"Edit map",exact:true}).count(),0);await page.screenshot({path:`${directory}/administrator-map-review.png`});}
    results.push({user,status});}finally{await context.close();}}
  assert.deepEqual(await sourceSnapshot(pool),before,"Reading author/ordinary/alternate/review contexts must preserve geometry, original provenance and immutable History.");assert.deepEqual(errors,[]);await writeFile(`${directory}/i-privacy-results.json`,JSON.stringify({results,errors},null,2)+"\n");console.log("PASS Atlas primary/alternate/ordinary place accounts, native help/focus, role boundaries and immutable source preservation.");
}
async function sourceSnapshot(pool:pg.Pool){const result:Record<string,unknown>={};for(const table of ["world_atlas_map","world_atlas_feature","world_atlas_drawing","world_geography","world_atlas_connection","world_settlement_entity","world_settlement_membership","world_atlas_settlement_shape","world_interior_floor","world_interior_entity","world_atlas_interior_shape","world_dungeon_site","world_dungeon_level","world_dungeon_entity","world_atlas_dungeon_shape","world_history_version"]){result[table]=(await pool.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows;}return result;}
/** A small fixture and only the affected readers, for the long-title wrapping correction. */
export async function historyTabChecks(browser:Browser,base:string,pool:pg.Pool,directory:string){
  const worlds=await import("../src/features/worlds/world-service"),worldId=await worlds.createWorld("world-god",{name:"I History tab navigation"}),primary=(await worlds.getWorld("world-god",worldId)).selectedTimeline.id;
  const entryId=await worlds.changeHistory("world-god",worldId,{entity:"entry",action:"save",timelineId:primary,draft:{...entryDraftOf(),title:"I retained historical account",account:"An existing account remains readable across tab switches.",time:{version:1,scale:"world-year",kind:"known",year:200}}});
  const before=await sourceSnapshot(pool),results:unknown[]=[];
  for(const touch of [false,true]){
    const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:900},hasTouch:touch,isMobile:touch,extraHTTPHeaders:{"X-Forwarded-For":touch?"198.51.100.158":"198.51.100.159"}});await signIn(context,base);const page=await context.newPage(),errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    try{await page.goto(`${base}/worlds/${worldId}?tab=history&timeline=${primary}&entry=${entryId}`);await page.getByRole("dialog").getByRole("heading",{name:"I retained historical account",exact:true}).waitFor();await page.getByRole("button",{name:"Close historical details",exact:true}).click();const nav=page.getByRole("navigation",{name:"World workspace",exact:true});
      for(const name of ["Chronology","Calendars","History","Chronology","Calendars","History"]){const button=nav.getByRole("button",{name:name==="History"?/^History/:name,exact:name!=="History"});if(touch)await button.tap();else await button.click();if(name==="History")await page.getByRole("button",{name:"New entry",exact:true}).waitFor();else await page.getByRole("heading",{name,exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get("timeline"),primary);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=page.viewportSize()!.width+1);assert.equal(await page.locator("dialog[open]").count(),0);}
      await page.reload();await page.getByRole("button",{name:"New entry",exact:true}).waitFor();await page.goto(`${base}/worlds/${worldId}?tab=history&timeline=${primary}&entry=${entryId}`);await page.getByRole("dialog").getByRole("heading",{name:"I retained historical account",exact:true}).waitFor();await page.screenshot({path:`${directory}/${touch?"phone":"desktop"}-history-tab-return.png`});assert.deepEqual(errors,[]);results.push({touch,historyChronologyCalendarsReturn:true,retainedTimeline:true,reloadAndAccountRead:true,errors});
    }finally{await context.close();}
  }
  assert.deepEqual(await sourceSnapshot(pool),before);await writeFile(`${directory}/i-history-tab-navigation.json`,JSON.stringify({results,unchangedSources:true},null,2)+"\n");console.log("PASS desktop/native History → Chronology → Calendars → History, reload and retained account reads; timeline and immutable History unchanged.");
}
export async function placeHistoryLayoutChecks(browser:Browser,base:string,pool:pg.Pool,directory:string){
  const worlds=await import("../src/features/worlds/world-service"),atlas=await import("../src/features/worlds/atlas-service");
  const worldId=await worlds.createWorld("world-god",{name:"I long-title place-history layout"});
  const mapId=await atlas.changeAtlas("world-god",worldId,{action:"create-dungeon",geographyId:null,draft:{name:"I saved dungeon",description:"A minimal layout fixture",classification:"",parentId:null},level:{name:"Entry level",description:"",classification:"",label:"",order:null,elevation:""},mapName:"I saved room map"});
  const bundle=await atlas.getAtlas("world-god",worldId,false,mapId),map=bundle.maps.find(m=>m.id===mapId)!,placeId=randomUUID(),draft=draftOf(map,bundle.geographies);
  draft.dungeonEntities=[{id:placeId,revision:null,kind:"room",name:"Entry hall",description:"A saved ordinary place",classification:"",geographyId:placeId,visibility:"ordinary",privateNotes:""}];
  draft.dungeonShapes=[{version:1,id:randomUUID(),entityId:placeId,archived:false,variant:"area",points:[[100,100],[500,100],[500,400],[100,400]].map(([x,y])=>({id:randomUUID(),x,y}))}];
  draft.geographies=[{id:placeId,revision:null,name:"Entry hall",description:"A saved ordinary place",kind:"location",context:"dungeon",parentId:map.geographyId!}];
  await atlas.changeAtlas("world-god",worldId,{action:"save",id:mapId,revision:map.revision,draft});
  await privacyChecks(browser,base,pool,{dungeon:{worldId,maps:[mapId]}},directory);
  const before=await sourceSnapshot(pool),primary=(await worlds.getWorld("world-god",worldId)).selectedTimeline.id,measurements:unknown[]=[];
  for(const [view,width,height,touch]of [["desktop",1440,900,false],["wide",1920,1080,false],["phone",390,844,true],["short-phone",390,320,true],["constrained",800,600,false]] as const){
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,extraHTTPHeaders:{"X-Forwarded-For":`198.51.100.${160+measurements.length}`}});await signIn(context,base);const page=await context.newPage();
    try{await page.goto(`${base}/worlds/${worldId}?tab=atlas&timeline=${primary}&atlas=${mapId}&place=${placeId}`);const trigger=page.getByRole("button",{name:"Historical milestones: Entry hall",exact:true});if(touch)await trigger.tap();else await trigger.click();const dialog=page.locator("dialog[open]"),title=dialog.getByRole("heading",{name:"I_PROTECTED_PLACE_HISTORY",exact:true});await title.waitFor();
      const metrics=await dialog.evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth};});assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,"Long History titles must not make their dialog scroll sideways.");assert.ok(Math.abs(metrics.x+metrics.width/2-width/2)<=2);assert.ok(metrics.y>=0&&metrics.y+metrics.height<=height+1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=width+1);assert.equal(await title.innerText(),"I_PROTECTED_PLACE_HISTORY");
      await title.scrollIntoViewIfNeeded();await page.screenshot({path:`${directory}/${view}-long-place-history-title.png`});
      await dialog.getByRole("button",{name:"Edit milestone: I public place account",exact:true}).click();await dialog.getByLabel("Milestone title",{exact:true}).fill("I unsaved historical account");page.once("dialog",d=>d.dismiss());await page.keyboard.press("Escape");assert.ok(await dialog.isVisible());assert.equal(await dialog.getByLabel("Milestone title",{exact:true}).inputValue(),"I unsaved historical account");
      const close=dialog.getByRole("button",{name:"Close place history",exact:true});await close.scrollIntoViewIfNeeded();const bounds=await close.boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=height+1);page.once("dialog",d=>d.accept());if(touch)await close.tap();else await close.click();await dialog.waitFor({state:"hidden"});assert.ok(await trigger.evaluate(n=>n===document.activeElement));measurements.push({view,viewport:{width,height},...metrics,restoredFocus:true});
    }finally{await context.close();}
  }
  assert.deepEqual(await sourceSnapshot(pool),before);await writeFile(`${directory}/i-place-history-layout.json`,JSON.stringify({measurements,unchangedSources:true},null,2)+"\n");console.log("PASS long place-history titles, five viewport bounds, native help/focus and historical dirty-draft safeguards; source unchanged.");
}
async function layoutChecks(browser:Browser,base:string,pool:pg.Pool,f:RepairIFixtures,directory:string,baseline:boolean){
  const measurements:unknown[]=[],receipts:HelpReceipt[]=[],before=await sourceSnapshot(pool),errors:string[]=[];
  for(const [view,width,height,touch]of [["desktop",1440,900,false],["wide",1920,1080,false],["phone",390,844,true],["short-phone",390,320,true],["constrained",800,600,false]] as const){
    const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,extraHTTPHeaders:{"X-Forwarded-For":`198.51.100.${210+measurements.length%30}`}});await signIn(context,base);const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    try{
      for(const [kind,worldId,button]of [["blank-map",f.atlas.worldId,"New map"],["geography",f.atlas.worldId,"New geography"],["connections",f.connected.worldId,"Connect Aetheria world chart"],["floor",f.interior.worldId,"New interior floor"],["dungeon",f.interior.worldId,"New dungeon"]] as const){
        await openAtlas(page,base,worldId);const trigger=page.getByRole("button",{name:button,exact:true});if(touch)await trigger.tap();else await trigger.click();const dialog=page.locator("dialog[open]");await dialog.waitFor();
        const geometry=await dialog.evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,margin:s.margin,position:s.position,focused:node.contains(document.activeElement),pageWidth:document.documentElement.scrollWidth,innerWidth};});measurements.push({view,kind,viewport:{width,height},...geometry});
        if(!baseline){assert.ok(Math.abs(geometry.x+geometry.width/2-width/2)<=2,`${view}/${kind} must be centered.`);assert.ok(geometry.x>=0&&geometry.x+geometry.width<=width+1);assert.ok(geometry.height<=height&&geometry.y>=0&&geometry.y+geometry.height<=height+1);assert.ok(geometry.scrollWidth<=geometry.clientWidth+1,`${view}/${kind} must not scroll sideways.`);assert.ok(geometry.pageWidth<=width+1,`${view}/${kind} must not widen the viewport.`);assert.ok(geometry.focused);if(kind==="connections"&&width>=1000)assert.ok(geometry.width>=700,"Connection choices need useful desktop width.");await auditHelp(dialog,page,touch,`${view}/${kind}`,receipts);}
        const close=dialog.getByRole("button",{name:kind==="connections"?"Close connections":"Cancel",exact:true});await close.scrollIntoViewIfNeeded();if(!baseline){const bounds=await close.boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=height+1,"Cancel stays reachable after scrolling.");}
        if(view==="desktop"||view==="phone")await page.screenshot({path:`${directory}/${view}-${kind}.png`});
        if(!baseline&&(view==="desktop"||view==="phone")){
          if(kind==="connections"){const field=dialog.getByLabel("Represented place",{exact:true}),current=await field.inputValue(),next=(await field.locator("option").evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value))).find(value=>value!==current)!;await field.selectOption(next);page.once("dialog",d=>d.dismiss());await page.keyboard.press("Escape");assert.ok(await dialog.isVisible());assert.equal(await field.inputValue(),next);}
          else{const field=dialog.locator('input:not([type="checkbox"]):not([type="number"])').first();await field.fill(`I unsaved ${kind} draft`);page.once("dialog",d=>d.dismiss());await page.keyboard.press("Escape");assert.ok(await dialog.isVisible());assert.equal(await field.inputValue(),`I unsaved ${kind} draft`);}
          page.once("dialog",d=>d.accept());
        }
        await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});const restoredFocus=await trigger.evaluate(n=>n===document.activeElement);if(!baseline)assert.ok(restoredFocus,"Native modal dismissal restores the opening control.");
        measurements.push({view,kind,restoredFocus});await writeFile(`${directory}/i-dialog-layout.json`,JSON.stringify({baseline,measurements,errors},null,2)+"\n");
      }
    }catch(error){await page.screenshot({path:`${directory}/${view}-layout-failure.png`}).catch(()=>{});throw error;}finally{await context.close();}
  }
  assert.deepEqual(await sourceSnapshot(pool),before,"Opening dialogs and reading help must preserve all saved maps, sources, identities and History.");assert.deepEqual(errors,[]);
  await writeFile(`${directory}/i-dialog-layout.json`,JSON.stringify({baseline,measurements,errors},null,2)+"\n");await writeFile(`${directory}/i-layout-help.json`,JSON.stringify(receipts,null,2)+"\n");console.log(`PASS I ${baseline?"baseline measurement":"dialog layout, native focus and help"} at five viewports.`);
}
export async function repairIBrowserChecks(browser:Browser,base:string,pool:pg.Pool,f:RepairIFixtures,directory:string,baseline:boolean){
  await mkdir(directory,{recursive:true});const phases=baseline?["layout"]:(process.env.SERRIAN_REPAIR_I_PHASES??"layout,atlas,cartography,guidance,generation,connections,settlement,interior,dungeon,privacy,history").split(","),completed:string[]=[];let phase="";
  try{for(phase of phases){
    const captures=`${directory}/${phase}`;await mkdir(captures,{recursive:true});
    if(phase==="layout")await layoutChecks(browser,base,pool,f,directory,baseline);
    else if(phase==="guidance")await guidanceChecks(browser,base,pool,f,directory);
    else if(phase==="privacy")await privacyChecks(browser,base,pool,f,directory);
    else if(phase==="atlas"){const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true,extraHTTPHeaders:{"X-Forwarded-For":"198.51.100.201"}});try{await signIn(context,base);await atlasBrowserChecks(await context.newPage(),context,base,f.atlas,captures);}finally{await context.close();}}
    else if(phase==="cartography")await cartographyBrowserChecks(browser,base,f.cartography,captures);
    else if(phase==="generation")await generationBrowserChecks(browser,base,f.generation,captures,captures);
    else if(phase==="connections")await connectedGeographyBrowserChecks(browser,base,f.connected,pool,captures);
    else if(phase==="settlement")await settlementBrowserChecks(browser,base,f.settlement,pool,captures);
    else if(phase==="interior")await interiorBrowserChecks(browser,base,f.interior,pool,captures);
    else if(phase==="dungeon")await dungeonBrowserChecks(browser,base,f.dungeon,pool,captures);
    else if(phase==="history"){const original=process.env.SERRIAN_REPAIR_H_PHASES;process.env.SERRIAN_REPAIR_H_PHASES="transitions";try{await repairHBrowserChecks(browser,base,pool,captures);}finally{if(original===undefined)delete process.env.SERRIAN_REPAIR_H_PHASES;else process.env.SERRIAN_REPAIR_H_PHASES=original;}}
    else throw new Error(`Unknown focused I phase: ${phase}`);
    completed.push(phase);await writeFile(`${directory}/i-checkpoints.json`,JSON.stringify({completed},null,2)+"\n");console.log(`PASS I ${phase} checkpoint.`);
  }}catch(error){await writeFile(`${directory}/i-checkpoints.json`,JSON.stringify({completed,failedPhase:phase,error:String(error)},null,2)+"\n");throw error;}
}
