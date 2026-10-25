import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type pg from "pg";
import {terrainSettingsSchema,terrainGeometry,createGrid,readTile} from "../src/features/worlds/terrain";
import {presetRecipe,protectionGrid,type TerrainSource} from "../src/features/worlds/terrain-source";
import {generateTerrain,regenerateArea} from "../src/features/worlds/terrain-generation";
export async function checkPass5Database(options:{pool:pg.Pool;world:string;foreign:string}){
 await (await import("./worlds-atlas-pass4-db-checks")).checkPass4Database(options);
 const {world,foreign,pool}=options,{changeTerrain:change,getTerrain:read}=await import("../src/features/worlds/terrain-service"),settings=terrainSettingsSchema.parse({widthKm:1000000,heightKm:1000000,gridWidth:64,gridHeight:64,minElevation:-20000,maxElevation:20000}),shape=terrainGeometry(settings),recipe=presetRecipe("continent","Explicit physical source"),grid=generateTerrain(shape,recipe,0).grid;
 const tiles=(g:Int16Array)=>Array.from({length:g.length/1024},(_,k)=>readTile(g,k,shape)),command={action:"create",requestId:randomUUID(),name:"Physical source identity",initial:"generated",settings,seaLevel:0,source:{kind:"generated",recipe},tiles:tiles(grid)},before=(await read("world-god",world)).maps.length;
 await assert.rejects(change("world-god",world,command),/acknowledge/);assert.equal((await read("world-god",world)).maps.length,before);
 await assert.rejects(change("world-god",world,{...command,source:{...command.source,scaleAcknowledged:true,recipe:{...recipe,mountainHeightM:25000}}}),/bounds/);
 const acceptedCommand={...command,source:{...command.source,scaleAcknowledged:true}},made=await change("world-god",world,acceptedCommand);assert.deepEqual(await change("world-god",world,acceptedCommand),made);
 const get=async()=>(await read("world-god",world,{mapId:made.id})).document!;let doc=await get();assert.deepEqual(doc.origin,acceptedCommand.source);assert.deepEqual(createGrid(doc.baseElevation,doc.tiles,shape),grid);assert.equal(doc.settings.widthKm,1000000);
 for(const actor of ["other-god","world-admin","world-player"])await assert.rejects(change(actor,world,{...acceptedCommand,requestId:randomUUID()}));await assert.rejects(change("world-god",foreign,{...acceptedCommand,requestId:randomUUID()}));
 await assert.rejects(change("world-god",world,{...acceptedCommand,requestId:randomUUID(),relief:{mode:"physical",exaggeration:80}}));assert.equal((await get()).revision,1);
 const manual=grid.slice();manual[32*64+32]++;await change("world-god",world,{action:"save",requestId:randomUUID(),mapId:made.id,revision:1,seaLevel:0,tiles:[readTile(manual,3,shape)]});doc=await get();const protectedCells=protectionGrid(doc.protection??[],64,64);assert.equal(protectedCells[32*64+32],1);
 const nextRecipe={...recipe,continentWidthKm:200000,mountainLengthKm:80000,mountainWidthKm:10000,mountainSpacingKm:50000,coastScaleKm:4000,coastalPlainKm:4000,geographicScale:"custom" as const},area={x:10,y:10,width:44,height:44},next=generateTerrain(shape,nextRecipe,0).grid,regenerated=regenerateArea(manual,next,shape,area,protectedCells,true,2).grid,source:TerrainSource={kind:"regenerated",recipe:nextRecipe,area,preserveManual:true,feather:2},save={action:"save",requestId:randomUUID(),mapId:made.id,revision:2,seaLevel:0,source,tiles:tiles(regenerated)};
 await assert.rejects(change("world-god",world,save),/acknowledge/);assert.equal((await get()).revision,2);
 const acknowledged={...save,source:{...source,scaleAcknowledged:true}},regen=await change("world-god",world,acknowledged);assert.equal(regen.revision,3);assert.deepEqual(await change("world-god",world,acknowledged),regen);doc=await get();assert.deepEqual(doc.origin,acceptedCommand.source);assert.deepEqual(doc.source,acknowledged.source);assert.deepEqual(createGrid(doc.baseElevation,doc.tiles,shape),regenerated);assert.equal(regenerated[32*64+32],manual[32*64+32]);
 await assert.rejects(change("world-god",world,{...acknowledged,requestId:randomUUID()}),(e:unknown)=>(e as {status:number}).status===409);
 const history=(await pool.query("select revision,source from world_terrain_version where terrain_id=$1 order by revision",[doc.terrainId])).rows;assert.equal(history.length,3);assert.deepEqual(history[0].source,acceptedCommand.source);await assert.rejects(pool.query("delete from world_terrain_version where terrain_id=$1",[doc.terrainId]));
 console.log("PASS Pass 5 database: v1 compatibility, physical source/acknowledgement, height bounds, no view-state writes, exact retry, immutable origin/history, protected regeneration and authorization");
}
