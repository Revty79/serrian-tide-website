/** Normal website historical-source rehearsal and HTTP role checks on the corrected maps. */
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {islandRuntime} from "./worlds-geo-ux0a-runtime";
import {ownedPool,UX0A_DIRECTORY} from "./worlds-geo-ux0a-harness";
import type {MapDrawing} from "../src/features/worlds/cartography";
import {checkShorelineSamples,CORRECTIONS_DIRECTORY} from "./worlds-geo-ux0a-composition-corrections";
async function main(){const results=[];
 for(const branch of ["manual","generated"]){
  const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,`library-${branch}-journey.json`),"utf8")),r=await islandRuntime("empty",`${branch}-correction-history`,f.environment),pool=await ownedPool(f.environment,"empty");
  try{
   const owner=await r.browser.newContext({viewport:{width:1600,height:1000}});await r.login(owner);const page=await owner.newPage(),errors:string[]=[];page.setDefaultTimeout(12000);page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>void d.accept());await page.goto(f.editorUrl);
   const tool=async(name:string)=>page.getByRole("navigation",{name:"Studio tools"}).getByRole("button",{name,exact:true}).click();
   await tool("History");await page.getByRole("button",{name:"Create appearance from displayed map",exact:true}).click();
   const protectedName=`${branch} protected correction-source rehearsal`;
   await page.getByLabel("Appearance name",{exact:true}).fill(protectedName);await page.getByLabel("Beginning World year",{exact:true}).fill("10");await page.getByLabel("Ending World year",{exact:true}).fill("20");await page.getByLabel("Historical source account",{exact:true}).fill("Disposable technical preservation check; not a claim of historical-map professional acceptance.");await page.getByLabel("Protect this entire historical appearance",{exact:true}).check();await page.getByRole("button",{name:"Save new appearance",exact:true}).click();await page.getByRole("button",{name:"Save appearance information",exact:true}).waitFor();
   const versions=async()=>(await pool.query("select id,to_jsonb(v)::text body from world_map_state_version v where map_id=$1 order by id",[f.mapId])).rows;
   const before=await versions();assert.equal(before.length,2);
   const state=(await pool.query("select state_id,source_version_id,id,timeline_id from world_map_state_version where map_id=$1 and state_id is not null",[f.mapId])).rows[0];assert.ok(state);
   await page.getByRole("region",{name:"Historical map appearances",exact:true}).screenshot({path:`${CORRECTIONS_DIRECTORY}/${branch}-history.png`});
   await page.getByRole("button",{name:"Return to shared baseline",exact:true}).click();await tool("Artwork");
   for(const rotation of [13,7]){await page.getByRole("button",{name:"Reed marsh placed subject",exact:true}).click();await page.getByLabel("Drawing rotation",{exact:true}).fill(String(rotation));await page.getByRole("button",{name:"Apply drawing changes",exact:true}).click();await page.getByRole("button",{name:"Save map",exact:true}).click();await page.getByRole("status").filter({hasText:"Map saved."}).waitFor();await page.reload();await page.getByRole("application",{name:"Editable map canvas"}).waitFor();await tool("Artwork");}
   assert.deepEqual(await versions(),before);
   await page.getByRole("application",{name:"Editable map canvas"}).locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});
   const drawings=(await pool.query("select content from world_atlas_drawing where map_id=$1",[f.mapId])).rows.map(row=>row.content as MapDrawing),river=drawings.find(d=>d.name==="The Wrenwater"),port=drawings.find(d=>d.name==="Port placed subject");assert.ok(river?.type==="path"&&port?.type==="symbol");
   const angle=port.rotation*Math.PI/180,harborPoint=(x:number,y:number)=>({x:port.point.x+port.scale*(x*Math.cos(angle)-y*Math.sin(angle)),y:port.point.y+port.scale*(x*Math.sin(angle)+y*Math.cos(angle))});
   const shorelineChecks=await checkShorelineSamples(page,[{name:"river outlet",point:river.points.at(-1)!,land:false},{name:"harbor buildings",point:harborPoint(-42,-60),land:true},{name:"harbor boat",point:harborPoint(31,44),land:false},{name:"central pier end",point:harborPoint(-10,67),land:false},...drawings.filter(d=>d.type==="label").map(d=>({name:d.name,point:d.point,land:true}))]);
   const world=new URL(f.editorUrl).pathname.split("/").at(-1),atlas=`${r.base}/api/worlds/${world}/atlas`,states=`${atlas}/states?map=${f.mapId}&timeline=${state.timeline_id}`;
   const ordinary=await owner.request.get(`${states}&ordinary=1`);assert.equal(ordinary.status(),200);assert.ok(!(await ordinary.text()).includes(protectedName));const hidden=await owner.request.get(`${states}&ordinary=1&state=${state.state_id}&version=${state.id}`);assert.equal(hidden.status(),404);
   const ordinaryAtlas=await owner.request.get(`${atlas}?map=${f.mapId}&ordinary=1`);assert.equal(ordinaryAtlas.status(),200);assert.equal((await ordinaryAtlas.json()).canEdit,false);
   const mapBefore=(await pool.query("select to_jsonb(m)::text body from world_atlas_map m where id=$1",[f.mapId])).rows;
   const checks=[];
   for(const kind of ["foreign","player","admin"] as const){const c=await r.browser.newContext();await r.login(c,f.environment.users[kind]);const read=await c.request.get(`${atlas}?map=${f.mapId}`);assert.ok([403,404].includes(read.status()));const write=await c.request.post(atlas,{headers:{Origin:r.base},data:{action:"archive-map",id:f.mapId,revision:999999}});assert.ok([403,404].includes(write.status()));checks.push({role:kind,read:read.status(),write:write.status()});if(kind==="admin"){const review=await c.request.get(`${atlas}?review=1&map=${f.mapId}`);assert.equal(review.status(),200);assert.equal((await review.json()).canEdit,false);assert.match(review.headers()["cache-control"],/private.*no-store/);}await c.close();}
   const denied=await owner.request.post(`${atlas}?ordinary=1`,{headers:{Origin:r.base},data:{action:"archive-map",id:f.mapId,revision:999999}});assert.equal(denied.status(),403);assert.deepEqual((await pool.query("select to_jsonb(m)::text body from world_atlas_map m where id=$1",[f.mapId])).rows,mapBefore);assert.deepEqual(await versions(),before);assert.deepEqual(errors,[]);
   results.push({branch,shorelineChecks,mapId:f.mapId,stateId:state.state_id,versionId:state.id,baselineSourceVersionId:state.source_version_id,immutableVersions:before.length,exactPayloadsPreservedAfterTwoBaselineSaves:true,protectedAppearanceAbsentInOrdinary:true,ordinaryPinnedVersionStatus:hidden.status(),ordinaryWrite:denied.status(),adminReviewReadOnly:true,checks,errors});
  }finally{await pool.end();await r.close();}
 }
 await writeFile(`${CORRECTIONS_DIRECTORY}/history-privacy-results.json`,JSON.stringify({passed:true,scope:"Disposable technical checks. Historical source authored through website; SQL verification read-only; role denials checked through authenticated HTTP. No all-scale historical-layout acceptance claim.",results},null,2));console.log("PASS corrected-map immutable history and ordinary/foreign/player/administrator privacy");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
