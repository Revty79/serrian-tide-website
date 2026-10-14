import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {createHmac,randomUUID} from "node:crypto";
import type pg from "pg";
import {chromium} from "playwright-core";
import {EARTH} from "./worlds-geo-b-import";

/** Exercise real protection stamps and timeline changes on NEW test fixtures. */
export async function renderingContexts(pool:pg.Pool,e:{database:string;baseUrl:string},directory:string){
  assert.match(e.database,/^serrian_geo_c_rendering_\d+$/);assert.equal((await pool.query("select current_database() name")).rows[0].name,e.database);
  const g=await import("../src/features/worlds/geographic-service"),w=await import("../src/features/worlds/world-service"),branch=await import("../src/features/worlds/branching-history-service");
  const source=(await pool.query(`select w.id world,t.id timeline,m.id map,f.id feature from world w join world_timeline t on t.world_id=w.id and t.is_primary join world_atlas_map m on m.world_id=w.id join world_geo_view view on view.map_id=m.id join world_geo_surface surface on surface.id=view.surface_id join world_geo_feature f on f.surface_id=surface.id join world_geography place on place.id=f.geography_id where w.name='Geo C1 disposable fictional thematic sources' and surface.reference->>'kind'='plane' and place.name='Original rivers' order by w.created_at desc limit 1`)).rows[0];assert.ok(source);
  let r=await g.geographicReading(EARTH.owner,source.world,source.timeline,source.map,source.feature);
  if(r.protected){await g.changeGeography(EARTH.owner,source.world,{action:"revise",requestId:randomUUID(),featureId:r.id,revision:r.revision,geometry:r.geometry,note:"Restore disposable public test precondition",protected:false});r=await g.geographicReading(EARTH.owner,source.world,source.timeline,source.map,source.feature);}
  const before=await g.geographicViewport(EARTH.owner,source.world,source.timeline,source.map,undefined,undefined,"detail",{ordinary:true});assert.ok(before.shapes.some(s=>s.id===r.id));
  await g.changeGeography(EARTH.owner,source.world,{action:"revise",requestId:randomUUID(),featureId:r.id,revision:r.revision,geometry:r.geometry,note:"Disposable current protection change",protected:true});
  const after=await g.geographicViewport(EARTH.owner,source.world,source.timeline,source.map,undefined,undefined,"detail",{ordinary:true});assert.notEqual(before.context,after.context);assert.ok(!after.shapes.some(s=>s.id===r.id));await assert.rejects(g.geographicReading(EARTH.owner,source.world,source.timeline,source.map,r.id,r.versionId,{ordinary:true}));assert.deepEqual((await g.geographicReading(EARTH.owner,source.world,source.timeline,source.map,r.id,r.versionId)).geometry,r.geometry);
  console.log("PASS actual current protection revision changes the ordinary page stamp and withholds old source");
  const bundle=await w.getWorld(EARTH.owner,source.world),alternate=bundle.timelines.find(t=>t.name==="Disposable rendering context branch")?.id??await branch.changeTimeline(EARTH.owner,source.world,{action:"create",parentRevision:bundle.selectedTimeline.revision,draft:{parentId:source.timeline,name:"Disposable rendering context branch",description:"Context isolation only",explanation:"No geographic inference",divergenceYear:100}});
  const browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
  try{
    const c=await browser.newContext({viewport:{width:1440,height:1000}}),token=randomUUID(),signature=createHmac("sha256","geo-c-task-disposable-auth-secret-only").update(token).digest("base64");await pool.query("insert into session(id,user_id,token,expires_at,updated_at) values($1,$2,$3,now()+interval '1 day',now())",[randomUUID(),EARTH.owner,token]);await c.addCookies([{name:"better-auth.session_token",value:encodeURIComponent(`${token}.${signature}`),url:e.baseUrl}]);const p=await c.newPage(),url=`${e.baseUrl}/worlds/${source.world}?tab=atlas&timeline=${source.timeline}&geography=1&geographicMap=${source.map}`;
    await p.goto(url);await p.locator('[data-geographic-ready="true"]').waitFor();const ws=p.getByRole("region",{name:"Geographic sources",exact:true});assert.ok((await ws.innerText()).includes("Original rivers"));let fail=true;
    await p.route("**/geography?**",async route=>{const q=new URL(route.request().url()).searchParams;if(q.get("timeline")===alternate&&q.has("map")){await new Promise(resolve=>setTimeout(resolve,700));if(fail){await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Disposable alternate viewport failure"})});return;}}await route.continue();});
    await p.evaluate(u=>history.pushState(null,"",u),url.replace(source.timeline,alternate));await ws.getByRole("button",{name:"Retry geographic view",exact:true}).waitFor();assert.equal(await ws.locator("svg").count(),0);assert.ok(!(await ws.innerText()).includes("Original rivers"));fail=false;await ws.getByRole("button",{name:"Retry geographic view",exact:true}).click();await p.locator('[data-geographic-ready="true"]').waitFor();assert.ok((await ws.innerText()).includes("Original rivers"));await p.unroute("**/geography?**");
    console.log("PASS timeline context change hides earlier protected names through failure and recovery");await writeFile(`${directory}/context-results.json`,JSON.stringify({passed:2,actualProtectionStampChanges:true,originalVersionPreserved:true,timelineFailedRecoveryIsolated:true},null,2));await c.close();
  }finally{await browser.close();}
}
