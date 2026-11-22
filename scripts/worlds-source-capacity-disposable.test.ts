/** Ephemeral synthetic Worlds only. Never loads owner configuration or Earth geography. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {cp,mkdir,readFile,readdir,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {withCollaborationFixture,publicTableDigests,type CollaborationFixture} from "./worlds-collaboration-fixture";
import {restoreTerrainBackup} from "./terrain-backup-restore";
import type {TerrainDocument} from "../src/features/worlds/terrain";
process.env.SERRIAN_COLLAB_OUT??=`artifacts/collaboration-s7b-source-capacity-database-${Date.now()}`;
type Seed={mapId:string;world:string;actor:string;root:TerrainDocument};
const digest=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
async function files(root:string):Promise<{name:string;sha256:string}[]>{
 let names:string[];try{names=await readdir(root,{recursive:true});}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error;}
 const result=[];for(const name of names.sort()){const file=path.join(root,name);if((await stat(file)).isFile())result.push({name,sha256:digest(await readFile(file))});}return result;
}
async function roots(f:CollaborationFixture){return {terrain:await files(f.terrainRoot),artwork:await files(f.assetRoot),raster:await files(path.join(f.root,"raster"))};}
async function createRoot(f:CollaborationFixture,actor:string,world:string):Promise<Seed>{
 const terrain=await import("../src/features/worlds/terrain-service"),mapId=randomUUID();
 await terrain.changeTerrain(actor,world,{action:"create",requestId:mapId,name:"Owned complete-index terrain",initial:"land",settings:{gridWidth:128,gridHeight:128,widthKm:128,heightKm:128,wrap:false}});
 return {actor,world,mapId,root:(await terrain.getTerrain(actor,world,{mapId})).document!};
}
async function createFine(s:Seed,n:number){
 const detail=await import("../src/features/worlds/terrain-refinement-service"),requestId=randomUUID(),grid=new Int16Array(1024).fill(s.root.baseElevation);
 const command={action:"create",requestId,mapId:s.mapId,parentId:null,parentRevision:s.root.revision,name:"Owned native area "+n,frame:{x:1000+n%16*7000,y:1000+Math.floor(n/16)*7000,width:1000,height:1000},gridWidth:32,gridHeight:32,previewHash:digest(new Uint8Array(grid.buffer))};
 await detail.createRefinement(s.actor,s.world,command);return requestId;
}
let seed:Seed|undefined,oldTables:Record<string,string>|undefined,oldFiles:Awaited<ReturnType<typeof roots>>|undefined,oldIndex:unknown,oldFrameFunction="",oldRegionConstraint="";
async function beforeSourceCapacityUpgrade(f:CollaborationFixture){
 seed=await createRoot(f,"collab-owner-a",f.worldA);const detail=await import("../src/features/worlds/terrain-refinement-service");
 for(let n=0;n<128;n++)await createFine(seed,n);
 const index=await detail.getRefinements(seed.actor,seed.world,seed.mapId);assert.equal(index.refinementLimit,128);assert.equal(index.refinementCount,128);assert.equal(index.refinements.length,128);
 const before=await publicTableDigests(f.pool);await assert.rejects(createFine(seed,128),/128/);assert.deepEqual(await publicTableDigests(f.pool),before);
 const sql=await readFile("drizzle/0167_atlas_source_capacity.sql","utf8"),client=await f.pool.connect();
 oldFrameFunction=(await client.query("select pg_get_functiondef('world_terrain_refinement_frame_valid()'::regprocedure) value")).rows[0].value;
 oldRegionConstraint=(await client.query("select pg_get_constraintdef(oid) value from pg_constraint where conname='world_map_region_valid'")).rows[0].value;
 try{await client.query("begin");for(const statement of sql.split("--> statement-breakpoint"))await client.query(statement);assert.equal((await client.query("select public.world_refinement_capacity_schema() capacity")).rows[0].capacity,256);await assert.rejects(client.query("select owned_capacity_deliberate_rollback()"));await client.query("rollback");}finally{await client.query("rollback");client.release();}
 assert.equal((await f.pool.query("select to_regprocedure('public.world_refinement_capacity_schema()') value")).rows[0].value,null);
 assert.deepEqual(await publicTableDigests(f.pool),before);oldTables=before;oldFiles=await roots(f);oldIndex=index.refinements;
 await writeFile(path.join(f.out,"legacy-capacity-and-rollback.json"),JSON.stringify({passed:true,legacy128Accepted129Refused:true,deliberate0167RollbackExact:true,allPublicRowsExact:true,ownerEnvironmentAccess:false},null,2));
}
withCollaborationFixture(async f=>{
 assert(seed&&oldTables&&oldFiles&&oldIndex);const s=seed,detail=await import("../src/features/worlds/terrain-refinement-service"),region=await import("../src/features/worlds/terrain-region-service"),terrain=await import("../src/features/worlds/terrain-service"),groups:string[]=[];
 const pass=async(name:string)=>{groups.push(name);console.log("PASS "+name);await writeFile(path.join(f.out,"progress.json"),JSON.stringify({groups},null,2));};
 assert.deepEqual(await publicTableDigests(f.pool),oldTables);assert.deepEqual(await roots(f),oldFiles);
 assert.equal((await f.pool.query("select pg_get_functiondef('world_terrain_refinement_frame_valid()'::regprocedure) value")).rows[0].value.replace(">=256",">=128"),oldFrameFunction);
 assert.equal((await f.pool.query("select pg_get_constraintdef(oid) value from pg_constraint where conname='world_map_region_valid'")).rows[0].value.replace("16384","8192"),oldRegionConstraint);
 let index=await detail.getRefinements(s.actor,s.world,s.mapId);assert.deepEqual(index.refinements,oldIndex);assert.equal(index.refinementLimit,256);
 await pass("Populated167-to168 upgrade preserves every old public row, three storage roots,128 source frames/pins/grids and all prior validator predicates");
 for(let n=128;n<256;n++)await createFine(s,n);
 index=await detail.getRefinements(s.actor,s.world,s.mapId);assert.equal(index.refinements.length,256);assert.equal(index.refinementCount,256);assert.equal(index.refinementLimit,256);assert(index.sourceState!.length>8192);
 const complete=index,tableBeforeRefusal=await publicTableDigests(f.pool);await assert.rejects(createFine(s,256),/256/);assert.deepEqual(await publicTableDigests(f.pool),tableBeforeRefusal);
 for(const meta of index.refinements){const value=await detail.getRefinementTiles(s.actor,s.world,s.mapId,meta.id,{lod:0,keys:[0]});assert.equal(value.tiles.length,1);assert(value.tiles[0].samples.every((z:number)=>z===s.root.baseElevation));assert.equal(value.refinement.parentRevision,s.root.revision);}
 await pass("Complete256-source readback retains every native sample and parent pin;257th creation refuses without a partial index");
 const regionId=randomUUID(),regional={action:"create-region",requestId:regionId,parentMapId:s.mapId,terrainId:s.root.terrainId,parentRevision:s.root.mapRevision??1,sourceRevision:s.root.revision,sourceState:index.sourceState,name:"Owned all-source regional view",frame:{x:0,y:0,width:128000,height:128000}};
 assert.equal((await region.createRegionalMap(s.actor,s.world,regional)).id,regionId);assert.equal((await f.pool.query("select initial_source_state from world_map_region where map_id=$1",[regionId])).rows[0].initial_source_state,index.sourceState);
 const regionalIndex=await detail.getRefinements(s.actor,s.world,regionId);assert.equal(regionalIndex.refinementCount,256);assert.equal(regionalIndex.refinements.length,256);assert.equal(regionalIndex.sourceState,index.sourceState);
 const target=index.refinements[128],tile=(await detail.getRefinementTiles(s.actor,s.world,regionId,target.id,{lod:0,keys:[0]})).tiles[0],changed={x:tile.x,y:tile.y,samples:tile.samples.slice()};changed.samples[16*32+16]++;
 const save={action:"save",requestId:randomUUID(),mapId:regionId,revision:target.revision,seaLevel:s.root.seaLevel,sourceState:index.sourceState,tiles:[changed],source:{kind:"manual"}};
 const accepted=await detail.saveRefinement(s.actor,s.world,target.id,save);assert.equal(accepted.revision,2);assert.deepEqual(await detail.saveRefinement(s.actor,s.world,target.id,save),accepted);
 index=await detail.getRefinements(s.actor,s.world,regionId);assert(index.sourceState!.length>8192);
 await detail.restoreRefinement(s.actor,s.world,target.id,{action:"restore",requestId:randomUUID(),mapId:regionId,revision:2,targetRevision:1,sourceState:index.sourceState});
 assert.deepEqual((await detail.getRefinementTiles(s.actor,s.world,regionId,target.id,{lod:0,keys:[0]})).tiles[0].samples,tile.samples);
 index=await detail.getRefinements(s.actor,s.world,regionId);
 await detail.restoreRefinement(s.actor,s.world,target.id,{action:"restore",requestId:randomUUID(),mapId:regionId,revision:3,targetRevision:2,sourceState:index.sourceState});
 assert.deepEqual((await detail.getRefinementTiles(s.actor,s.world,regionId,target.id,{lod:0,keys:[0]})).tiles[0].samples,changed.samples);
 index=await detail.getRefinements(s.actor,s.world,s.mapId);assert.deepEqual(index.refinements.filter(m=>m.id!==target.id),complete.refinements.filter(m=>m.id!==target.id));
 assert.deepEqual((await terrain.getTerrain(s.actor,s.world,{mapId:s.mapId})).document,s.root);
 await pass("Long exact source state persists in a real regional record and native save/idempotent retry/Undo/Redo preserve Root and255 other sources");
 const history=await import("../src/features/worlds/native-map-history-service"),nativeRead=await import("../src/features/worlds/native-map-history-context"),nativeTerrain=await import("../src/features/worlds/native-map-history-terrain-read"),nativeWrite=await import("../src/features/worlds/native-map-history-write"),nativeFine=await import("../src/features/worlds/native-map-history-terrain-write");
 const timelineId=(await f.pool.query("select id from world_timeline where world_id=$1 and is_primary",[s.world])).rows[0].id as string,targetMap={kind:"terrain" as const,id:s.mapId},beforePrepare=await publicTableDigests(f.pool);
 const beforePrepareWorlds=(await f.pool.query<{id:string;value:Record<string,unknown>}>("select id,to_jsonb(w) value from world w order by id")).rows,beforePrepareAudits=(await f.pool.query<{id:string;value:Record<string,unknown>}>("select id,to_jsonb(a) value from world_access_audit a order by id")).rows;
 const prepared=await history.getNativeMapHistory(s.actor,s.world,targetMap,timelineId,{prepareBaseline:true});assert(prepared.baselinePin);
 const afterPrepare=await publicTableDigests(f.pool);for(const table of Object.keys(beforePrepare))if(table!=="world"&&table!=="world_access_audit")assert.equal(afterPrepare[table],beforePrepare[table],table);
 const afterPrepareWorlds=(await f.pool.query<{id:string;value:Record<string,unknown>}>("select id,to_jsonb(w) value from world w order by id")).rows;assert.equal(afterPrepareWorlds.length,beforePrepareWorlds.length);
 for(const prior of beforePrepareWorlds){const current=afterPrepareWorlds.find(row=>row.id===prior.id)!;assert(current);if(prior.id!==s.world)assert.deepEqual(current,prior);else{const {updated_at:oldActivity,...oldWorld}=prior.value,{updated_at:newActivity,...newWorld}=current.value;assert.deepEqual(newWorld,oldWorld);assert(Date.parse(String(newActivity))>=Date.parse(String(oldActivity)));}}
 const afterPrepareAudits=(await f.pool.query<{id:string;value:Record<string,unknown>}>("select id,to_jsonb(a) value from world_access_audit a order by id")).rows;assert.equal(afterPrepareAudits.length,beforePrepareAudits.length+1);for(const prior of beforePrepareAudits)assert.deepEqual(afterPrepareAudits.find(row=>row.id===prior.id),prior);
 const addedAudit=afterPrepareAudits.filter(row=>!beforePrepareAudits.some(prior=>prior.id===row.id));assert.equal(addedAudit.length,1);assert.equal(addedAudit[0].value.world_id,s.world);assert.equal(addedAudit[0].value.actor_id,s.actor);assert.equal(addedAudit[0].value.action,"content-write");assert.equal(addedAudit[0].value.outcome,"accepted");
 const appearanceCommand={action:"create",requestId:randomUUID(),target:targetMap,timelineId,sourceVersionId:null,baselinePin:prepared.baselinePin,details:{name:"Owned complete256-source appearance",startYear:100,endYear:100,account:"Exact synthetic full-capacity recovery and read-only consumer test",protected:false}},appearance=await history.changeNativeMapHistory(s.actor,s.world,appearanceCommand);assert.equal(typeof appearance.id,"string");assert.deepEqual(await history.changeNativeMapHistory(s.actor,s.world,appearanceCommand),appearance);
 const scope={target:targetMap,timelineId,stateId:appearance.id as string,year:100,edit:false},historical=await nativeRead.withNativeHistoryRead(s.actor,s.world,scope,{},async(tx,context)=>{
  const retained=await nativeTerrain.nativeAllRefinementIndex(tx,context);assert.equal(retained.refinements.length,256);assert.equal(retained.refinementCount,256);assert.equal(retained.refinementLimit,256);assert.equal(retained.sourceState,index.sourceState);assert.equal(retained.canEdit,false);const byId=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;assert.deepEqual([...retained.refinements].sort(byId),[...index.refinements].sort(byId));
  for(const meta of retained.refinements){const original=await detail.getRefinementTiles(s.actor,s.world,s.mapId,meta.id,{lod:0,keys:[0]}),dated=await nativeTerrain.readNativeRefinement(tx,context,meta.id,{lod:0,keys:[0]});assert.deepEqual(dated.tiles[0].samples,original.tiles[0].samples);assert.equal(dated.refinement.parentRevision,original.refinement.parentRevision);assert.equal(dated.canEdit,false);}
  const hydrology=await nativeTerrain.nativeHydrologySources(tx,context);assert.equal(hydrology.sources.length,257);return retained;
 });assert(historical.sourceState!.length>8192);
 const refusedHistorical={action:"create",requestId:randomUUID(),mapId:s.mapId,parentId:null,parentRevision:s.root.revision,name:"Owned refused historical257",frame:{x:120000,y:120000,width:1000,height:1000},gridWidth:32,gridHeight:32,previewHash:digest(new Uint8Array(new Int16Array(1024).fill(s.root.baseElevation).buffer))},beforeHistoricalRefusal=await publicTableDigests(f.pool),request={requestId:refusedHistorical.requestId,endpoint:"terrain/refinements",command:refusedHistorical};
 await assert.rejects(nativeWrite.withNativeHistoryWrite(s.actor,s.world,scope,request,(tx,context)=>nativeFine.createNativeRefinement(tx,context,refusedHistorical)),/read-only/);
 await assert.rejects(nativeWrite.withNativeHistoryWrite(s.actor,s.world,{...scope,edit:true},request,(tx,context)=>nativeFine.createNativeRefinement(tx,context,refusedHistorical)),/256/);
 assert.deepEqual(await publicTableDigests(f.pool),beforeHistoricalRefusal);assert.deepEqual(await detail.getRefinements(s.actor,s.world,s.mapId),index);
 await pass("A dated appearance captures and reopens all256 exact sources and257 hydrology pins; read-only writes and historical257th creation refuse without changes");
 const beforeBad=await publicTableDigests(f.pool);
 await assert.rejects(detail.getRefinements("collab-owner-b",s.world,s.mapId));await assert.rejects(region.createRegionalMap(s.actor,s.world,{...regional,requestId:randomUUID(),sourceState:index.sourceState!.slice(0,8192)}),/changed/);
 assert.deepEqual(await publicTableDigests(f.pool),beforeBad);
 await pass("Foreign-owner and truncated-vector requests refuse without losing or accepting any source");
 const second=await createRoot(f,"collab-owner-b",f.worldB);for(let n=0;n<255;n++)await createFine(second,n);
 const prior=(await detail.getRefinements(second.actor,second.world,second.mapId)).refinements,race=await Promise.allSettled([createFine(second,255),createFine(second,256)]);
 assert.equal(race.filter(v=>v.status==="fulfilled").length,1);assert.equal(race.filter(v=>v.status==="rejected").length,1);
 const raced=await detail.getRefinements(second.actor,second.world,second.mapId);assert.equal(raced.refinements.length,256);for(const meta of prior)assert.deepEqual(raced.refinements.find(m=>m.id===meta.id),meta);
 await assert.rejects(f.pool.query("insert into world_terrain_refinement select (jsonb_populate_record(null::world_terrain_refinement,to_jsonb(r)||jsonb_build_object('id',$1::text,'name','Owned direct capacity refusal','x_metres',120000,'y_metres',120000))).* from world_terrain_refinement r where terrain_id=$2 limit 1",[randomUUID(),second.root.terrainId]),/refinement limit reached/);
 await pass("Competing final-source creations serialize to exactly256; the independent SQL insertion guard also refuses257");
 const allTables=await publicTableDigests(f.pool),allFiles=await roots(f),ledger=(await f.pool.query("select * from drizzle.__drizzle_migrations order by id")).rows;assert.equal(ledger.length,168);
 const dump=path.join(f.out,"capacity-independent.dump");f.runPostgres("pg_dump",["-Fc","-f",dump,"--dbname",f.databaseUrl]);
 const url=new URL(f.restoredUrl),bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin";
 await restoreTerrainBackup({pgRestore:path.join(bin,"pg_restore.exe"),psql:path.join(bin,"psql.exe"),dump,sql:path.join(f.out,"capacity-restored.sql"),host:url.hostname,port:Number(url.port),user:url.username,database:url.pathname.slice(1),singleTransaction:true,streaming:true});
 const restored=new pg.Pool({connectionString:f.restoredUrl});try{
  assert.deepEqual(await publicTableDigests(restored),allTables);assert.deepEqual((await restored.query("select * from drizzle.__drizzle_migrations order by id")).rows,ledger);
  assert.equal((await restored.query("select public.world_refinement_capacity_schema() capacity")).rows[0].capacity,256);
  assert.equal((await restored.query("select count(*)::int n from world_terrain_refinement")).rows[0].n,512);
 }finally{await restored.end();}
 const copy=path.join(f.out,"independent-three-roots");await mkdir(copy);
 for(const[name,source]of [["terrain",f.terrainRoot],["artwork",f.assetRoot],["raster",path.join(f.root,"raster")]] as const){const targetRoot=path.join(copy,name);assert(targetRoot.startsWith(copy+path.sep));try{await cp(source,targetRoot,{recursive:true,errorOnExist:true,force:false});}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;await mkdir(targetRoot);}}
 assert.deepEqual({terrain:await files(path.join(copy,"terrain")),artwork:await files(path.join(copy,"artwork")),raster:await files(path.join(copy,"raster"))},allFiles);
 await pass("Independent database restore retains all512 native grids/history/pins and exact168-entry ledger; all three copied roots hash-identically");
 const results={passed:true,groups,legacy128Gate:true,capacity256:true,sourceStateCharacters:index.sourceState!.length,allPriorDataExact:true,independentRestoredSources:512,ledger:168,numericalAndPacketLimitsUnchanged:true,ownerEnvironmentAccessed:false};
 await writeFile(path.join(f.out,"results.json"),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
},{beforeSourceCapacityUpgrade}).catch(error=>{console.error(error);process.exitCode=1;});
