import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import type pg from "pg";
import {sculpt,createGrid,readTile,terrainGeometry,terrainSettingsSchema} from "../src/features/worlds/terrain";
import {protectionGrid} from "../src/features/worlds/terrain-source";
export async function checkPass6Database(options:{pool:pg.Pool;world:string;foreign:string}){
 await (await import("./worlds-atlas-pass5-db-checks")).checkPass5Database(options);
 const {changeTerrain:change,getTerrain:read}=await import("../src/features/worlds/terrain-service"),{world}=options,settings=terrainSettingsSchema.parse({gridWidth:64,gridHeight:64,widthKm:64,heightKm:32}),shape=terrainGeometry(settings),made=await change("world-god",world,{action:"create",requestId:randomUUID(),name:"Physical brush persistence",initial:"ocean",settings}),get=async()=>(await read("world-god",world,{mapId:made.id})).document!,original=await get(),base=createGrid(original.baseElevation,original.tiles,shape),grid=base.slice(),before=new Map<number,number>();
 const touched=sculpt(grid,32,32,{tool:"raise",radius:24,radiusMetres:4000,strength:1000},before,shape),command={action:"save",mapId:made.id,requestId:randomUUID(),revision:1,seaLevel:0,tiles:[...touched].map(k=>readTile(grid,k,shape))},saved=await change("world-god",world,command);assert.equal(saved.revision,2);assert.deepEqual(await change("world-god",world,command),saved);let doc=await get();assert.deepEqual(createGrid(doc.baseElevation,doc.tiles,shape),grid);assert.deepEqual(doc.settings,settings);const mask=protectionGrid(doc.protection??[],64,64);for(const [i,z] of before)if(grid[i]!==z)assert.equal(mask[i],1);
 for(const extra of [{measurement:{points:[{x:0,y:0},{x:100,y:0}]}},{measurementPreferences:{distance:"mi"}},{source:{kind:"manual",units:"ft"}}])await assert.rejects(change("world-god",world,{...command,...extra,requestId:randomUUID(),revision:2}));assert.equal((await get()).revision,2);
 await change("world-god",world,{...command,requestId:randomUUID(),revision:2,tiles:[...touched].map(k=>readTile(base,k,shape))});doc=await get();assert.deepEqual(createGrid(doc.baseElevation,doc.tiles,shape),base);assert.deepEqual(doc.origin,original.origin);assert.equal(doc.revision,3);
 console.log("PASS Pass 6 database: physical samples use existing immutable/manual saves, protection, retry and exact undo; preferences/measurements rejected as authoritative payloads");
}
