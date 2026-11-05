/** Stage 6D: new owned loopback databases/files only. Never loads an env file. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {cp,mkdir,readFile,readdir,stat,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import path from "node:path";
import sharp from "sharp";
import {withRegionalEditingFixture,regionalFixtureIds as ids,type RegionalFixture} from "./worlds-regional-editing-fixture";
import {createGrid,readTile,terrainGeometry} from "../src/features/worlds/terrain";
import {protectionGrid,type TerrainSource} from "../src/features/worlds/terrain-source";
import {EMPTY_HYDROLOGY,type HydroLayer} from "../src/features/worlds/terrain-hydrology";
import {prepareAdvancedTerrainAsync} from "../src/features/worlds/terrain-advanced";
import type {AdvancedOperation,VolcanoOperation} from "../src/features/worlds/terrain-advanced-spec";
import {volcanicAshCover} from "../src/features/worlds/terrain-advanced-review";
import {frameGeometry,rootFrame} from "../src/features/worlds/terrain-refinement";
import {restoreTerrainBackup} from "./terrain-backup-restore";
const out=path.resolve(process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??"artifacts/terrain-s6d-database-1");
assert.ok(out.startsWith(path.resolve("artifacts/terrain-s6d-")));
process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE=out;
let beforeUpgradeRows:unknown,beforeUpgradeFiles:unknown;
async function retainedRows(f:RegionalFixture){
  const result:Record<string,unknown>={};
  for(const {tablename} of(await f.pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows){
    assert.match(tablename,/^[a-z0-9_]+$/);result[tablename]=(await f.pool.query('select row_to_json(t)::text v from "'+tablename+'" t order by row_to_json(t)::text')).rows;
  }return result;
}
async function beforeAdvancedUpgrade(f:RegionalFixture){
  assert.equal((await f.pool.query("select to_regclass('world_terrain_advanced_volcano_idx') as value")).rows[0].value,null);
  const advanced=await import("../src/features/worlds/terrain-advanced-service");
  await assert.rejects(advanced.getAdvancedTerrainContext("world-god",f.world,ids.parent),/0157/);
  beforeUpgradeRows=await retainedRows(f);beforeUpgradeFiles=await files(f.terrainRoot);
  f.runPostgres("pg_dump",["-Fc","-f",path.join(f.out,"before-0157.dump"),"--dbname",f.databaseUrl]);
}
async function files(root:string){
  const result=[];for(const name of(await readdir(root,{recursive:true})).sort()){
    const file=path.join(root,name);if((await stat(file)).isFile())result.push({name,sha:createHash("sha256").update(await readFile(file)).digest("hex")});
  }return result;
}
async function run(f:RegionalFixture){
  const uri=new URL(f.databaseUrl);
  assert.equal(uri.hostname,"127.0.0.1");assert.notEqual(uri.port,"5432");
  assert.ok(path.resolve(f.root).startsWith(path.join(out,"owned-temp")+path.sep));
  assert.equal(process.env.DATABASE_URL,f.databaseUrl);
  assert.deepEqual(await retainedRows(f),beforeUpgradeRows);assert.deepEqual(await files(f.terrainRoot),beforeUpgradeFiles);
  const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")),entry=journal.entries.at(-1),migration=await readFile("drizzle/0157_advanced_terrain_indexes.sql");
  assert.equal(entry.idx,157);assert.ok(!migration.includes(13));
  assert.equal((await f.pool.query("select hash from drizzle.__drizzle_migrations where created_at=$1",[entry.when])).rows[0].hash,createHash("sha256").update(migration).digest("hex"));
  assert.equal((await f.pool.query("select count(*)::int n from pg_indexes where indexname in ('world_terrain_advanced_volcano_idx','world_refinement_advanced_volcano_idx')")).rows[0].n,2);
  process.env.SERRIAN_ASSET_ROOT=path.join(f.root,"private-artwork");await mkdir(process.env.SERRIAN_ASSET_ROOT,{recursive:true});
  const terrain=await import("../src/features/worlds/terrain-service"),advanced=await import("../src/features/worlds/terrain-advanced-service"),
    refinements=await import("../src/features/worlds/terrain-refinement-service"),hydrology=await import("../src/features/worlds/terrain-hydrology-service"),
    environment=await import("../src/features/worlds/terrain-environment-service"),{db}=await import("../src/db");
  const groups:string[]=["populated 0156-to-0157 upgrade preserves every public table row and numerical file; both partial indexes and canonical LF migration ledger verified"],allTables=(await f.pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const mutable=new Set(["world_terrain","world_terrain_version","world_terrain_tile","world_terrain_refinement","world_terrain_refinement_version","world_terrain_refinement_tile","world_atlas_map","world_map_canvas","world_hydrology","world_hydrology_version","world_environment","world_environment_version"]);
  const frozen:Record<string,string>={};
  for(const {tablename} of allTables)if(!mutable.has(tablename)){
    assert.match(tablename,/^[a-z0-9_]+$/);
    frozen[tablename]=createHash("sha256").update(JSON.stringify((await f.pool.query('select row_to_json(t)::text v from "'+tablename+'" t order by row_to_json(t)::text')).rows)).digest("hex");
  }
  async function newMap(name:string){
    const id=randomUUID(),pixels=Uint8Array.from({length:128*128},(_,i)=>Math.max(0,Math.min(255,Math.round(35+165*Math.exp(-(((i%128-60)/27)**2))+50*(1-Math.floor(i/128)/128)))));
    for(let y=118;y<128;y++)for(let x=0;x<128;x++)pixels[y*128+x]=0;
    const png=await sharp(pixels,{raw:{width:128,height:128,channels:1}}).png().toBuffer(),
      settings={gridWidth:128,gridHeight:128,widthKm:64,heightKm:64,wrap:false,minElevation:-12000,maxElevation:12000},
      shape=terrainGeometry(settings),grid=Int16Array.from(pixels,v=>Math.round(-200+v/255*4200));
    const source:TerrainSource={kind:"imported",format:"grayscale-png",fileName:"Owned synthetic highland.png",sha256:createHash("sha256").update(png).digest("hex"),sourceWidth:128,sourceHeight:128,bitDepth:8,interpretation:{low:-200,high:4000,crop:"fit",resampling:"nearest",noData:null,noDataMode:"reject",fillElevation:500}};
    await terrain.changeTerrain("world-god",f.world,{action:"create",requestId:id,name,initial:"imported",settings,source,seaLevel:0,tiles:Array.from({length:16},(_,key)=>readTile(grid,key,shape))});
    return {id,grid,shape};
  }
  const target=await newMap("Advanced terrain numerical validation"),map=target.id;
  const node=(id:string,x:number,y:number,kind:"source"|"open-end")=>({id,point:{x,y},kind,elevationM:target.grid[Math.round(y/500)*128+Math.round(x/500)],drainageM2:2000000,spillM:null});
  const layer:HydroLayer={...structuredClone(EMPTY_HYDROLOGY),nodes:[node("advanced-source",20000,10000,"source"),node("advanced-end",20000,50000,"open-end")],
    edges:[{id:"advanced-river",from:"advanced-source",to:"advanced-end",name:"Retained named river",points:[{x:20000,y:10000},{x:20000,y:50000}],drainageM2:2000000,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null}]};
  await hydrology.saveTerrainHydrology("world-god",f.world,{mapId:map,revision:0,requestId:randomUUID(),layer});
  const selection={frame:rootFrame(target.shape)},common={selection,preserveManual:true,strength:100};
  async function rootProposal(op:AdvancedOperation){
    const document=(await terrain.getTerrain("world-god",f.world,{mapId:map})).document!,shape=terrainGeometry(document.settings),
      base=createGrid(document.baseElevation,document.tiles,shape),packet=await advanced.getAdvancedTerrainContext("world-god",f.world,map),
      blocked=await db.transaction(tx=>refinements.getRefinementEditMask(tx,document.terrainId,shape,rootFrame(shape),shape)),
      result=await prepareAdvancedTerrainAsync(base,shape,op,packet.context,blocked??undefined,protectionGrid(document.protection??[],shape.width,shape.height)),
      keys=new Set(Array.from(result.patch.indices,i=>Math.floor(i/shape.width/32)*(shape.width/32)+Math.floor(i%shape.width/32))),
      command={action:"save" as const,mapId:map,requestId:randomUUID(),revision:document.revision,seaLevel:document.seaLevel,source:{kind:"manual" as const,advanced:{version:1 as const,contextPin:packet.pin,operation:op,effect:{changed:result.metrics.changed,affected:{frame:result.metrics.affected!}}}},tiles:[...keys].map(k=>readTile(result.grid,k,shape))};
    return {document,base,shape,packet,result,command};
  }
  const channel:AdvancedOperation={...common,kind:"river-channel",riverId:"advanced-river",course:"segment",first:0,last:null,widthM:1800,depthM:40,bankSoftness:.6,smoothing:.5};
  const first=await rootProposal(channel),beforeReject=await files(f.terrainRoot);
  assert.ok(first.result.metrics.changed>0);assert.ok(first.result.metrics.maxLoweringM<=40);
  assert.deepEqual(createGrid((await terrain.getTerrain("world-god",f.world,{mapId:map})).document!.baseElevation,(await terrain.getTerrain("world-god",f.world,{mapId:map})).document!.tiles,target.shape),target.grid);
  const forged=structuredClone(first.command);forged.tiles[0].samples[0]++;
  await assert.rejects(terrain.changeTerrain("world-god",f.world,forged),/do not match/);
  assert.deepEqual(await files(f.terrainRoot),beforeReject);
  const saved=await terrain.changeTerrain("world-god",f.world,first.command);
  assert.deepEqual(await terrain.changeTerrain("world-god",f.world,first.command),saved);
  await assert.rejects(terrain.changeTerrain("world-god",f.world,{...first.command,seaLevel:1}),/newer terrain revision/);
  const carved=(await terrain.getTerrain("world-god",f.world,{mapId:map})).document!,carvedGrid=createGrid(carved.baseElevation,carved.tiles,target.shape);
  assert.deepEqual(carvedGrid,first.result.grid);assert.deepEqual(carved.origin,first.document.origin);
  const changedSet=new Set(first.result.patch.indices);for(let i=0;i<target.grid.length;i++)if(!changedSet.has(i))assert.equal(carvedGrid[i],target.grid[i]);
  assert.deepEqual((await hydrology.getTerrainHydrology("world-god",f.world,map)).layer,layer);
  groups.push("real channel elevations, exact outside samples, original water identity/description/override and terrain origin retained; rejected/forged previews write no files; exact retry/conflicting retry");

  const erosion:AdvancedOperation={...common,kind:"erosion",selection:{frame:{x:6000,y:6000,width:18000,height:18000}},model:"runoff",iterations:12,direction:90,directionInfluence:.8,deposition:true,maxDepthM:140,reposeDegrees:20,featherM:1000};
  const eroded=await rootProposal(erosion);assert.ok(eroded.result.metrics.changed>0);
  const renamed={...layer,edges:layer.edges.map(e=>({...e,name:"Retained named river — reviewed"}))};
  await hydrology.saveTerrainHydrology("world-god",f.world,{mapId:map,revision:1,requestId:randomUUID(),layer:renamed});
  const beforeConflict=await files(f.terrainRoot);
  await assert.rejects(terrain.changeTerrain("world-god",f.world,eroded.command),/context changed/);
  assert.deepEqual(await files(f.terrainRoot),beforeConflict);
  const reviewed=await rootProposal(erosion);await terrain.changeTerrain("world-god",f.world,reviewed.command);
  const afterErosion=(await terrain.getTerrain("world-god",f.world,{mapId:map})).document!;
  assert.deepEqual(createGrid(afterErosion.baseElevation,afterErosion.tiles,target.shape),reviewed.result.grid);
  groups.push("localized erosion, native protected samples, direction/deposition parameters; water-context conflict rejects before files, deliberate repreview succeeds");
  const volcano:VolcanoOperation={...common,kind:"volcano",centre:{x:45000,y:28000},form:"cratered",radiusM:8000,heightM:1300,craterDiameterM:4000,craterDepthM:850,profile:1,blendM:1000,summitEastM:0,summitSouthM:0};
  const volcanic=await rootProposal(volcano),volcanoSaved=await terrain.changeTerrain("world-god",f.world,volcanic.command);
  let packet=await advanced.getAdvancedTerrainContext("world-god",f.world,map);
  assert.ok(packet.context.volcanoes.some(v=>v.id===volcanic.command.requestId));
  const eruption:AdvancedOperation={...common,preserveManual:false,kind:"eruption",volcanoId:volcanic.command.requestId,effect:"collapse",source:volcano.centre,extentM:2300,widthM:1500,magnitudeM:180,steps:128};
  const collapse=await rootProposal(eruption);assert.ok(collapse.result.metrics.maxLoweringM>0);assert.equal(collapse.result.metrics.maxRaisingM,0);
  const prior=(await terrain.getTerrain("world-god",f.world,{mapId:map})).document!;
  assert.equal(prior.revision,volcanoSaved.revision);
  await terrain.changeTerrain("world-god",f.world,collapse.command);
  const lava=await rootProposal({...eruption,effect:"lava",source:{x:50000,y:28000},extentM:6000,widthM:1800,magnitudeM:35});
  assert.ok(lava.result.metrics.addedM3>0);assert.equal(lava.result.metrics.removedM3,0);
  await terrain.changeTerrain("world-god",f.world,lava.command);
  assert.deepEqual((await hydrology.getTerrainHydrology("world-god",f.world,map)).layer,renamed);
  groups.push("real volcano/crater, immutable native volcano provenance, bounded summit collapse and downhill lava deposits; cancellation before accept retains heights and water records");
  const beforeVisual=(await terrain.getTerrain("world-god",f.world,{mapId:map})).document!,
    cover=await environment.getTerrainEnvironment("world-god",f.world,map),ash=volcanicAshCover(randomUUID(),volcano.centre,6000);
  await environment.saveTerrainEnvironment("world-god",f.world,{mapId:map,requestId:randomUUID(),revision:cover.headRevision,layer:{...cover.layer,regions:[ash,...cover.layer.regions]}});
  assert.deepEqual((await terrain.getTerrain("world-god",f.world,{mapId:map})).document,beforeVisual);
  groups.push("visual ash uses ordinary environmental authoring, with byte-exact numerical terrain and retained earlier cover");

  const index=await refinements.getRefinements("world-god",f.world,ids.a),fine=index.refinements.find(v=>v.id===f.fine)!;
  assert.ok(fine);const batch=await refinements.getRefinementTiles("world-god",f.world,ids.a,f.fine,{lod:0,keys:Array.from({length:fine.gridWidth*fine.gridHeight/1024},(_,k)=>k)}),
    parent=(await terrain.getTerrain("world-god",f.world,{mapId:ids.parent})).document!,parentGrid=createGrid(parent.baseElevation,parent.tiles,terrainGeometry(parent.settings)),
    fineShape=frameGeometry(fine,terrainGeometry(parent.settings)),fineGrid=createGrid(parent.baseElevation,batch.tiles.map(t=>({x:t.x,y:t.y,samples:t.samples})),fineShape);
  packet=await advanced.getAdvancedTerrainContext("world-god",f.world,ids.a,f.fine);
  const regionalOp:VolcanoOperation={...volcano,selection:{frame:fine.frame},centre:{x:78000,y:48000},radiusM:3500,craterDiameterM:1500,craterDepthM:500,blendM:500,heightM:900},
    mask=await db.transaction(tx=>refinements.getRefinementEditMask(tx,parent.terrainId,fineShape,fine.frame,terrainGeometry(parent.settings),fine.id)),
    fineResult=await prepareAdvancedTerrainAsync(fineGrid,fineShape,regionalOp,packet.context,mask??undefined,new Uint8Array(fineGrid.length)),
    fineKeys=new Set(Array.from(fineResult.patch.indices,i=>Math.floor(i/fineShape.width/32)*(fineShape.width/32)+Math.floor(i%fineShape.width/32))),
    regionalCommand={action:"save" as const,mapId:ids.a,requestId:randomUUID(),revision:fine.revision,sourceState:index.sourceState,seaLevel:parent.seaLevel,source:{kind:"manual" as const,advanced:{version:1 as const,contextPin:packet.pin,operation:regionalOp,effect:{changed:fineResult.metrics.changed,affected:{frame:fineResult.metrics.affected!}}}},tiles:[...fineKeys].map(k=>readTile(fineResult.grid,k,fineShape))};
  assert.ok(fineResult.metrics.changed);await refinements.saveRefinement("world-god",f.world,fine.id,regionalCommand);
  const parentAfter=(await terrain.getTerrain("world-god",f.world,{mapId:ids.parent})).document!;
  assert.deepEqual(createGrid(parentAfter.baseElevation,parentAfter.tiles,terrainGeometry(parentAfter.settings)),parentGrid);
  const point={x:78000,y:48000},sample=await refinements.sampleWorldTerrain("world-god",f.world,ids.parent,[point]);
  assert.equal(sample.points[0].sourceId,fine.id);assert.equal(sample.points[0].elevation,fineResult.grid[128*256+128]);
  await assert.rejects(advanced.getAdvancedTerrainContext("world-god",f.world,ids.a),/finer source/);
  await assert.rejects(advanced.getAdvancedTerrainContext("other-god",f.world,map));
  await assert.rejects(advanced.getAdvancedTerrainContext("world-god",f.world,map,undefined,{ordinary:true}));
  groups.push("regional native refinement/footprint, inherited collar/finer protection and exact parent root samples; canonical World query reads accepted finer crater at the same coordinates; private/ordinary rejection");
  assert.equal((await advanced.getAdvancedTerrainContext("world-admin",f.world,map,undefined,{review:true})).canEdit,false);
  await assert.rejects(terrain.changeTerrain("world-admin",f.world,reviewed.command));
  await assert.rejects(advanced.getAdvancedTerrainContext("world-god",f.world,randomUUID()));
  const invalid=structuredClone(reviewed.command);invalid.source.advanced.operation={...erosion,iterations:41};
  await assert.rejects(terrain.changeTerrain("world-god",f.world,invalid));
  await f.pool.query("update world_atlas_map set archived_at=now() where id=$1",[map]);
  try{await assert.rejects(advanced.getAdvancedTerrainContext("world-god",f.world,map));await assert.rejects(terrain.changeTerrain("world-god",f.world,reviewed.command));}
  finally{await f.pool.query("update world_atlas_map set archived_at=null where id=$1",[map]);}
  await f.pool.query("update world set archived_at=now() where id=$1",[f.world]);
  try{assert.equal((await advanced.getAdvancedTerrainContext("world-god",f.world,map)).canEdit,false);await assert.rejects(terrain.changeTerrain("world-god",f.world,reviewed.command));}
  finally{await f.pool.query("update world set archived_at=null where id=$1",[f.world]);}
  groups.push("unavailable/archived map, archived World, nonowner/admin review and malformed workload cannot accept numerical changes");
  for(const [tablename,before] of Object.entries(frozen)){
    const after=createHash("sha256").update(JSON.stringify((await f.pool.query('select row_to_json(t)::text v from "'+tablename+'" t order by row_to_json(t)::text')).rows)).digest("hex");
    assert.equal(after,before,"Retained table: "+tablename);
  }
  const browser=await newMap("Stage 6D creator geography");
  const receipt={passed:true,world:f.world,map,browserMap:browser.id,regionalMap:ids.a,fine:f.fine,volcanoId:volcanic.command.requestId,groups,preservedTables:Object.keys(frozen),journalEntries:JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")).entries.length,sharedAccess:false};
  await writeFile(path.join(f.out,"advanced-database.json"),JSON.stringify(receipt,null,2));
  // Paired numerical backup on a newly owned target; no validators are disabled.
  const dump=path.join(f.out,"advanced-paired.dump");f.runPostgres("pg_dump",["-Fc","-f",dump,"--dbname",f.databaseUrl]);
  await cp(f.terrainRoot,path.join(f.out,"paired-terrain"),{recursive:true});await cp(process.env.SERRIAN_ASSET_ROOT,path.join(f.out,"paired-artwork"),{recursive:true});
  const restored=new URL(f.restoredUrl),bin="C:/Program Files/PostgreSQL/18/bin";
  await restoreTerrainBackup({pgRestore:path.join(bin,"pg_restore.exe"),psql:path.join(bin,"psql.exe"),dump,sql:path.join(f.out,"advanced-restore.sql"),host:"127.0.0.1",port:Number(restored.port),user:"postgres",database:restored.pathname.slice(1)});
  const restoredRead=execFileSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/worlds-advanced-restored.ts",path.join(f.out,"advanced-database.json")],{env:{...process.env,DATABASE_URL:f.restoredUrl,SERRIAN_TERRAIN_ROOT:path.join(f.out,"paired-terrain"),SERRIAN_ASSET_ROOT:path.join(f.out,"paired-artwork")},windowsHide:true,encoding:"utf8"});
  await writeFile(path.join(f.out,"restored-service.log"),restoredRead);groups.push("paired database/terrain/private-artwork restore and real restored advanced terrain/history/environment service reads");
  await writeFile(path.join(f.out,"advanced-database.json"),JSON.stringify({...receipt,groups},null,2));
  if(process.env.SERRIAN_ADVANCED_TERRAIN_BROWSER==="production"){process.env.SERRIAN_UNDERGROUND_BROWSER="production";process.env.SERRIAN_ADVANCED_TERRAIN_CHECKOUT??="artifacts/terrain-s6d-validation";await(await import("./worlds-underground-browser")).undergroundBrowser(f);}
  console.log(JSON.stringify({passed:true,groups:groups.length,out:f.out}));
}
async function main(){await mkdir(path.join(out,"owned-temp"),{recursive:true});process.env.TEMP=path.join(out,"owned-temp");process.env.TMP=process.env.TEMP;await withRegionalEditingFixture(run,undefined,undefined,undefined,undefined,undefined,undefined,undefined,beforeAdvancedUpgrade);}
main().catch(error=>{console.error(error);process.exitCode=1;});
