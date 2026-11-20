import test from "node:test";
import assert from "node:assert/strict";
import {prepareSavedElevations,prepareSavedElevationsAsync,SAVED_ELEVATION_TILE_LIMIT,type SavedElevationPreview} from "./terrain-saved-elevations";
const shape={width:64,height:64,tileSize:32,displayWidth:6400,displayHeight:3200,min:-10000,max:10000,wrap:true};
const identity={worldId:"00000000-0000-4000-8000-000000000001",mapId:"00000000-0000-4000-8000-000000000002",terrainId:"00000000-0000-4000-8000-000000000003",headRevision:9,sourceState:"9/fine:3",waterRevision:4};
function fixture(){const base=new Int16Array(4096).fill(200),before=Array<number>(1024).fill(200),after=before.slice();after[33]=700;after[67]=-50;return {base,packet:{...identity,width:64,height:64,targetRevision:8,changed:2,tiles:[{x:1,y:0,before,after}]} satisfies SavedElevationPreview};}
test("native saved tiles produce an exact ordinary patch without mutating the current grid or packet",()=>{
 const {base,packet}=fixture(),original=structuredClone(packet),r=prepareSavedElevations(base,shape,packet,identity);
 assert.equal(r.changed,2);assert.deepEqual([...r.patch.indices],[97,163]);assert.deepEqual([...r.patch.before],[200,200]);assert.deepEqual([...r.patch.after],[700,-50]);assert.equal(r.grid[97],700);assert.equal(r.grid[163],-50);
 for(let i=0;i<base.length;i++){assert.equal(base[i],200);if(i!==97&&i!==163)assert.equal(r.grid[i],200);}
 assert.deepEqual(packet,original);assert.deepEqual(r.frame,{x:3300,y:50,width:300,height:100});
});
test("saved comparison refuses every stale identity and current-grid mismatch",()=>{
 const {base,packet}=fixture();
 for(const field of ["worldId","mapId","terrainId","headRevision","sourceState","waterRevision"] as const){const bad={...packet,[field]:typeof packet[field]==="number"?Number(packet[field])+1:field.endsWith("Id")?"00000000-0000-4000-8000-000000000099":"other"};assert.throws(()=>prepareSavedElevations(base,shape,bad,identity),/changed/);}
 base[96]=201;assert.throws(()=>prepareSavedElevations(base,shape,packet,identity),/current elevations changed/);assert.equal(base[97],200);
});
test("saved comparison refuses incomplete, duplicate, out-of-frame and finer-protected replacements atomically",()=>{
 const {base,packet}=fixture();
 assert.throws(()=>prepareSavedElevations(base,shape,{...packet,changed:3},identity),/summary is incomplete/);
 assert.throws(()=>prepareSavedElevations(base,shape,{...packet,tiles:[packet.tiles[0],packet.tiles[0]]},identity),/duplicate/);
 assert.throws(()=>prepareSavedElevations(base,shape,{...packet,tiles:[{...packet.tiles[0],x:2}]},identity),/out-of-range/);
 assert.throws(()=>prepareSavedElevations(base,shape,{...packet,width:32},identity),/active World/);
 assert.throws(()=>prepareSavedElevations(base,shape,{...packet,targetRevision:10},identity),/active World/);
 const blocked=new Uint8Array(base.length);blocked[163]=1;assert.throws(()=>prepareSavedElevations(base,shape,packet,identity,blocked),/finer terrain/);
 assert.throws(()=>prepareSavedElevations(base,shape,packet,identity,new Uint8Array(1)),/protection is unavailable/);
 const after=packet.tiles[0].after.slice();after[33]=10001;assert.throws(()=>prepareSavedElevations(base,shape,{...packet,tiles:[{...packet.tiles[0],after}]},identity),/height range/);assert(base.every(v=>v===200));
});
test("saved comparison enforces its native tile and sample contract and supports a zero-change comparison",()=>{
 const {base,packet}=fixture();assert.equal(SAVED_ELEVATION_TILE_LIMIT,256);
 assert.throws(()=>prepareSavedElevations(base,shape,{...packet,tiles:Array(257).fill(packet.tiles[0])},identity));
 assert.throws(()=>prepareSavedElevations(base,shape,{...packet,tiles:[{...packet.tiles[0],before:[200]}]},identity));
 assert.throws(()=>prepareSavedElevations(base,shape,{...packet,externalUrl:"file:///not-native"},identity));
 const r=prepareSavedElevations(base,shape,{...packet,changed:0,tiles:[]},identity);assert.equal(r.changed,0);assert.equal(r.frame,undefined);assert.deepEqual(r.grid,base);
});
test("cooperative saved comparison is exact and pre-cancellation changes no input",async()=>{
 const {base,packet}=fixture(),sync=prepareSavedElevations(base,shape,packet,identity),asyncResult=await prepareSavedElevationsAsync(base,shape,packet,identity);assert.deepEqual(asyncResult,sync);
 const c=new AbortController();c.abort();await assert.rejects(prepareSavedElevationsAsync(base,shape,packet,identity,undefined,c.signal),/cancelled/);assert(base.every(v=>v===200));
});
