/** Full-library service/SQL/history/privacy proof in a newly owned technical fixture only. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {ownedPool,UX0A_DIRECTORY,ux0aSnapshot} from "./worlds-geo-ux0a-harness";
import {draftOf} from "../src/features/worlds/atlas";
import {latestIslandAssets,assetReference} from "../src/features/worlds/island-assets";
import type {MapDrawing} from "../src/features/worlds/cartography";

async function main(){
 const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"library-performance-current.json"),"utf8")),e=f.environment,pool=await ownedPool(e,"empty");process.env.DATABASE_URL=e.empty;process.env.SERRIAN_RASTER_ROOT=e.assetRoot;
 const [a,h,app]=await Promise.all([import("../src/features/worlds/atlas-service"),import("../src/features/worlds/map-state-service"),import("../src/db")]);const groups:string[]=[];
 const check=async(name:string,run:()=>Promise<void>)=>{await run();groups.push(name);console.log("PASS",name);};
 try{
  let bundle=await a.getAtlas(e.users.owner,f.world),map=bundle.maps.find(m=>m.id===f.map)!,draft=draftOf(map,bundle.geographies);
  await check("unchanged 0132 accepts all 14 pinned subjects and mixed terrain; v1 remains valid",async()=>{
   assert.equal(Number((await pool.query("select count(*) n from drizzle.__drizzle_migrations")).rows[0].n),133);
   for(const drawing of draft.drawings!)assert.equal((await pool.query("select world_atlas_drawing_valid($1::jsonb) valid",[JSON.stringify(drawing)])).rows[0].valid,true);
   const old:MapDrawing={version:1,type:"symbol",id:randomUUID(),name:"Retained legacy decoration",archived:false,geographyId:null,kind:"pine",point:{x:100,y:100},scale:1,rotation:0,style:"ink"};assert.equal((await pool.query("select world_atlas_drawing_valid($1::jsonb) valid",[JSON.stringify(old)])).rows[0].valid,true);
   for(const bad of [{...old,version:2},{...old,extra:true},{...old,point:{x:Infinity,y:100}}])assert.equal((await pool.query("select world_atlas_drawing_valid($1::jsonb) valid",[JSON.stringify(bad)])).rows[0].valid,false);
  });
  await check("server rejects forged hill/wetland slots, place roles, links and missing revisions atomically",async()=>{
   for(const asset of latestIslandAssets.filter(a=>a.kind==="hill"||a.kind==="wetland")){
    const original=draft.drawings!.find(d=>d.version===2&&d.type==="symbol"&&d.assetRef.assetId===asset.id)! as Extract<MapDrawing,{version:2;type:"symbol"}>;
    const bad=[{...original,kind:asset.legacySymbolKind==="pine"?"mountain":"pine"},{...original,role:"place",geographyId:f.place},{...original,geographyId:f.place},{...original,assetRef:{...assetReference(asset),assetRevision:999}}];
    for(const forged of bad){const before=await ux0aSnapshot(pool);await assert.rejects(()=>a.changeAtlas(e.users.owner,f.world,{action:"save",id:map.id,revision:map.revision,draft:{...draft,drawings:draft.drawings!.map(d=>d.id===original.id?forged:d)}}));assert.deepEqual(await ux0aSnapshot(pool),before);}
   }
  });
  let stateId="",versionId="",retained:unknown;
  await check("immutable historical payload retains all 14 exact pins after baseline revision and archive",async()=>{
   await h.changeMapState(e.users.owner,f.world,{action:"create",mapId:map.id,timelineId:f.timeline,sourceVersionId:null,baselineRevision:map.revision,details:{name:`Full library pin ${Date.now()}`,startYear:30,endYear:40,account:"Disposable complete-library compatibility proof",protected:true}});
   const states=await h.getMapStates(e.users.owner,f.world,map.id,f.timeline),state=states.states.find(s=>s.startYear===30)!;assert.ok(state);stateId=state.id;versionId=state.versionId;retained=(await pool.query("select payload from world_map_state_version where id=$1",[versionId])).rows[0].payload;
   const subject=draft.drawings!.find(d=>d.version===2&&d.type==="symbol"&&d.assetRef.assetId==="hill-low")!;await a.changeAtlas(e.users.owner,f.world,{action:"save",id:map.id,revision:map.revision,draft:{...draft,drawings:draft.drawings!.map(d=>d.id===subject.id?{...d,archived:true}:d)}});
   assert.deepEqual((await pool.query("select payload from world_map_state_version where id=$1",[versionId])).rows[0].payload,retained);
   const historical=await h.getMapStates(e.users.owner,f.world,map.id,f.timeline,{stateId,versionId});const pinned=historical.bundle.maps.find(m=>m.id===map.id)!;
   assert.deepEqual(pinned.drawings,draft.drawings);assert.deepEqual(pinned.presentation,draft.presentation);
   bundle=await a.getAtlas(e.users.owner,f.world);map=bundle.maps.find(m=>m.id===map.id)!;await a.changeAtlas(e.users.owner,f.world,{action:"save",id:map.id,revision:map.revision,draft});bundle=await a.getAtlas(e.users.owner,f.world);map=bundle.maps.find(m=>m.id===map.id)!;draft=draftOf(map,bundle.geographies);
  });
  await check("ordinary history filters protected appearance; foreign/player reads and Administrator edits fail",async()=>{
   const ordinary=await h.getMapStates(e.users.owner,f.world,map.id,f.timeline,{ordinary:true});assert.ok(!ordinary.states.some(s=>s.id===stateId));await assert.rejects(()=>h.getMapStates(e.users.owner,f.world,map.id,f.timeline,{ordinary:true,stateId,versionId}));
   for(const actor of [e.users.foreign,e.users.player]){const before=await ux0aSnapshot(pool);await assert.rejects(()=>a.getAtlas(actor,f.world));await assert.rejects(()=>a.changeAtlas(actor,f.world,{action:"save",id:map.id,revision:map.revision,draft}));assert.deepEqual(await ux0aSnapshot(pool),before);}
   const review=await a.getAtlas(e.users.admin,f.world,true);assert.equal(review.canEdit,false);const before=await ux0aSnapshot(pool);await assert.rejects(()=>a.changeAtlas(e.users.admin,f.world,{action:"save",id:map.id,revision:map.revision,draft}));assert.deepEqual(await ux0aSnapshot(pool),before);
  });
  const hash=createHash("sha256").update(await readFile("drizzle/0132_worlds_atlas_starter_library.sql")).digest("hex");await writeFile("docs/screenshots/worlds-geo-ux0a/full-library/service-results.json",JSON.stringify({passed:true,groups,migrations:133,migration0132Sha256:hash,subjects:14,history:{stateId,versionId,allPinsAndOriginalPayloadPreserved:true},database:new URL(e.empty).pathname.slice(1),sharedDatabaseAccess:false},null,2));
 }finally{await pool.end();await app.pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
