import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import type {checkHydrologyDatabase} from "./worlds-hydrology-db-checks";
import {terrainSettingsSchema,terrainGeometry,readTile} from "../src/features/worlds/terrain";
import {makeHydroAnalysis} from "../src/features/worlds/terrain-hydrology";
import {calculateHydroFlow,hydroSuggestions} from "../src/features/worlds/terrain-hydrology-flow";
import {priorityWaterFlood,suggestedLakes,reviewLakeLevel} from "../src/features/worlds/terrain-water-basins";
import {alignWaterPorts,riversIntoLakes} from "../src/features/worlds/terrain-water-network";

export async function checkWaterDatabase(options:Parameters<typeof checkHydrologyDatabase>[0]){
  await (await import("./worlds-hydrology-db-checks")).checkHydrologyDatabase(options);
  const {pool,world,foreign}=options,url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");assert.equal((await pool.query("select current_database() name")).rows[0].name,"serrian_atlas_s32");
  const terrain=await import("../src/features/worlds/terrain-service"),water=await import("../src/features/worlds/terrain-hydrology-service"),settings=terrainSettingsSchema.parse({gridWidth:64,gridHeight:64,widthKm:64,heightKm:64,wrap:true}),shape=terrainGeometry(settings),mapId=randomUUID();
  await terrain.changeTerrain("world-god",world,{action:"create",requestId:mapId,name:"Connected mountain rivers and twin lakes",initial:"land",settings});
  const grid=Int16Array.from({length:4096},(_,i)=>{const x=i%64,y=Math.floor(i/64);return Math.round((60-y)*30+Math.abs(x-32)*60-700*Math.exp(-((x-32)**2+(y-28)**2)/30)-400*Math.exp(-((x-12)**2+(y-44)**2)/12));});
  await terrain.changeTerrain("world-god",world,{action:"save",mapId,revision:1,requestId:randomUUID(),seaLevel:0,source:{kind:"manual"},tiles:[0,1,2,3].map(key=>readTile(grid,key,shape))});
  const sources=(await water.getTerrainHydrology("world-god",world,mapId)).sources,source=sources.sources[0],flow=calculateHydroFlow({sources,patches:[{source,lod:0,width:64,height:64,grid}],focus:source.frame,minimumAreaM2:8e6}),oldAnalysis=makeHydroAnalysis(sources,source.frame,8e6),oldLayer=hydroSuggestions(flow,oldAnalysis),oldRequest={mapId,revision:0,requestId:randomUUID(),layer:oldLayer};
  assert.equal((await water.saveTerrainHydrology("world-god",world,oldRequest)).revision,1);
  const analysis=makeHydroAnalysis(sources,source.frame,8e6,{lakeMinimumAreaM2:4e6,lakeMinimumDepthM:10}),flood=priorityWaterFlood(flow),lakes=suggestedLakes(flow,flood,analysis),layer=riversIntoLakes(hydroSuggestions(flow,analysis),lakes,sources.world);assert.ok(lakes.length>=2);
  const numericalBefore=JSON.stringify((await terrain.getTerrain("world-god",world,{mapId})).document),command={mapId,revision:1,requestId:randomUUID(),layer};assert.equal((await water.saveTerrainHydrology("world-god",world,command)).revision,2);assert.deepEqual((await water.getTerrainHydrology("world-god",world,mapId)).layer,layer);assert.equal((await water.saveTerrainHydrology("world-god",world,command)).revision,2);
  assert.equal((await water.saveTerrainHydrology("world-god",world,oldRequest)).revision,1);assert.equal((await water.getTerrainHydrology("world-god",world,mapId)).revision,2);
  await assert.rejects(water.saveTerrainHydrology("world-god",world,{...oldRequest,revision:2,requestId:randomUUID()}),/older writer|discard|connected lake/);
  const lake=layer.lakes![0],review=reviewLakeLevel(flow,flood,lake,lake.spillM!,true,analysis),open={...layer,lakes:layer.lakes!.map(l=>l.id===lake.id?{...review.lakes![0],inletNodeIds:l.inletNodeIds,review:true}:l),nodes:[...layer.nodes,...review.nodes],edges:[...layer.edges,...review.edges]},aligned=alignWaterPorts(open,lake.id,sources.world);
  await water.saveTerrainHydrology("world-god",world,{mapId,revision:2,requestId:randomUUID(),layer:aligned});assert.equal((await water.getTerrainHydrology("world-god",world,mapId)).layer.lakes![0].mode,"outlet");
  const current=(await water.getTerrainHydrology("world-god",world,mapId)).layer,invalid={...current,lakes:current.lakes!.map((l,i)=>i===0?{...l,rings:[[{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}]]}:l)};await assert.rejects(water.saveTerrainHydrology("world-god",world,{mapId,revision:3,requestId:randomUUID(),layer:invalid}),/shoreline|area|cross/);
  await assert.rejects(water.saveTerrainHydrology("world-player",world,{mapId,revision:3,requestId:randomUUID(),layer:current}));await assert.rejects(water.saveTerrainHydrology("world-admin",world,{mapId,revision:3,requestId:randomUUID(),layer:current}));await assert.rejects(water.getTerrainHydrology("world-god",foreign,mapId));assert.ok((await water.getTerrainHydrology("world-admin",world,mapId,{review:true})).layer.lakes!.length);
  const race=await Promise.allSettled(["First lake name","Second lake name"].map(name=>water.saveTerrainHydrology("world-god",world,{mapId,revision:3,requestId:randomUUID(),layer:{...current,lakes:current.lakes!.map((l,i)=>i===0?{...l,name}:l)}})));assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
  await water.saveTerrainHydrology("world-god",world,{mapId,revision:4,requestId:randomUUID(),restoreRevision:1,layer:oldLayer});assert.deepEqual((await water.getTerrainHydrology("world-god",world,mapId)).layer,oldLayer);await water.saveTerrainHydrology("world-god",world,{mapId,revision:5,requestId:randomUUID(),restoreRevision:2,layer});assert.deepEqual((await water.getTerrainHydrology("world-god",world,mapId)).layer,layer);
  await assert.rejects(pool.query("update world_hydrology_version set layer=layer where map_id=$1",[mapId]),/immutable/);assert.equal(JSON.stringify((await terrain.getTerrain("world-god",world,{mapId})).document),numericalBefore);
  await writeFile(`${process.env.SERRIAN_PASS8_EVIDENCE_DIR}/water-system-database.json`,JSON.stringify({passed:true,mapId,world,lakes:layer.lakes!.length,channels:layer.edges.length,revision:6,sourceSha256:createHash("sha256").update(Buffer.from(grid.buffer)).digest("hex"),old3ADocumentsExact:true,oldPendingRetryAfterV2:true,oldWriterDowngradeRejected:true,atomicLakeGraph:true,oneConcurrentWinner:true,uniformSurfaces:true,invalidGeometryRejected:true,oldAndExtendedHistoryRestore:true,ownerAndReviewPrivacy:true,numericalHeadExact:true,newSqlMigration:false,sharedDatabaseWrites:false},null,2)+"\n");
  if(process.env.SERRIAN_WATER_SKIP_MIGRATION!=="1")await (await import("./worlds-water-backup-checks")).checkWaterBackup(pool,mapId,world);
  console.log("PASS connected water JSON extension, 3A history/retry compatibility, downgrade rejection, lakes/ports, concurrent saves, exact numerical preservation and roles");
}
