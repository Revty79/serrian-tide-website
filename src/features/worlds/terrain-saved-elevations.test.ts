import test from "node:test";
import assert from "node:assert/strict";
import {prepareSavedElevations,prepareSavedElevationsAsync,savedElevationWindowMeta,SAVED_ELEVATION_TILE_LIMIT,type SavedElevationPreview} from "./terrain-saved-elevations";
import {detailViewPlan} from "./terrain-detail-presentation";
import type {RefinementMeta} from "./terrain-refinement";
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

test("fine-source comparison binds the exact source and refuses root, other-source or omitted identities",()=>{
 const {base,packet}=fixture(),refinementId="00000000-0000-4000-8000-000000000004",expected={...identity,refinementId},fine={...packet,refinementId};
 assert.equal(prepareSavedElevations(base,shape,fine,expected).changed,2);
 assert.throws(()=>prepareSavedElevations(base,shape,fine,identity),/changed/);
 assert.throws(()=>prepareSavedElevations(base,shape,packet,expected),/changed/);
 assert.throws(()=>prepareSavedElevations(base,shape,{...fine,refinementId:"00000000-0000-4000-8000-000000000005"},expected),/changed/);
});

test("fine previews borrow the complete4096-square source and copy only the bounded native window",()=>{
 const s={...shape,width:4096,height:4096},base=new Int16Array(4096*4096).fill(200),before=Array<number>(1024).fill(200),after=before.slice();after[17]=800;
 const packet={...identity,refinementId:"00000000-0000-4000-8000-000000000004",width:4096,height:4096,targetRevision:8,changed:1,tiles:[{x:100,y:90,before,after}]},r=prepareSavedElevations(base,s,packet,packet,undefined,true);
 assert.deepEqual(r.window,{x:3200,y:2880,width:32,height:32});assert.equal(r.grid.length,1024);assert.equal(r.grid[17],800);assert.deepEqual([...r.patch.indices],[2880*4096+3217]);assert(base.every(z=>z===200));
 const far={x:0,y:0,before,after};assert.throws(()=>prepareSavedElevations(base,s,{...packet,changed:2,tiles:[packet.tiles[0],far]},packet,undefined,true),/spans too much terrain/);assert(base.every(z=>z===200));
 const empty=prepareSavedElevations(base,s,{...packet,changed:0,tiles:[]},packet,undefined,true);assert.equal(empty.window,undefined);assert.equal(empty.grid.length,0);
});

test("binary saved preview windows retain exact positions and integer native LOD at close and distant views",()=>{
 const source:RefinementMeta={id:"00000000-0000-4000-8000-000000000004",worldId:identity.worldId,mapId:identity.mapId,terrainId:identity.terrainId,parentId:null,parentRevision:3,revision:9,name:"Retained native source",level:1,frame:{x:1234.5,y:678.25,width:100000,height:50000},gridWidth:4096,gridHeight:4096,overviewLevels:7,updatedAt:""},original=structuredClone(source);
 for(const[width,height,expected]of [[32,32,0],[128,128,2],[128,64,1],[256,512,3]]){
  const window={x:512,y:1024,width,height},meta=savedElevationWindowMeta(source,window,7);assert.equal(meta.overviewLevels,expected);assert.equal(meta.frame.x,source.frame.x+12500);assert.equal(meta.frame.y,source.frame.y+12500);assert.equal(meta.parentId,source.id);assert.equal(meta.parentRevision,source.revision);
  for(const scale of [1,.1,.02,.01]){const world={...shape,width:2048,height:2048,displayWidth:200000,displayHeight:200000},plans=detailViewPlan([meta],{left:meta.frame.x,right:meta.frame.x+meta.frame.width,top:meta.frame.y,bottom:meta.frame.y+meta.frame.height,width:meta.frame.width*scale,height:meta.frame.height*scale,scale},world);
   assert(plans.length);for(const plan of plans){assert(Number.isInteger(plan.lod));assert(meta.gridWidth%(32*2**plan.lod)===0);assert(meta.gridHeight%(32*2**plan.lod)===0);}}
 }
 assert.deepEqual(source,original);for(const w of [{x:1,y:0,width:32,height:32},{x:0,y:0,width:0,height:32},{x:4096,y:0,width:32,height:32},{x:0,y:0,width:1024,height:512},{x:0,y:0,width:96,height:96},{x:0,y:0,width:96,height:64}])assert.throws(()=>savedElevationWindowMeta(source,w,7),/unchanged native source/);
});

test("irregular changed areas pad with exact native neighbors without exceeding the same window cap",()=>{
 const s={...shape,width:4096,height:4096},base=new Int16Array(4096*4096).fill(200),before=Array<number>(1024).fill(200),after=before.slice();after[17]=800;
 const packet={...identity,width:4096,height:4096,targetRevision:8,changed:2,tiles:[{x:46,y:46,before,after},{x:48,y:48,before,after}]},result=prepareSavedElevations(base,s,packet,identity,undefined,true);
 assert.deepEqual(result.window,{x:1472,y:1472,width:128,height:128});assert.equal(result.grid.length,16384);assert.equal(result.grid.filter(v=>v===800).length,2);assert.equal(result.patch.indices.length,2);assert(base.every(v=>v===200));
 const nearEdge={...packet,tiles:[{x:125,y:125,before,after},{x:127,y:127,before,after}]},edge=prepareSavedElevations(base,s,nearEdge,identity,undefined,true);assert.deepEqual(edge.window,{x:3968,y:3968,width:128,height:128});assert.equal(edge.grid.filter(v=>v===800).length,2);
 const tooWide={...packet,tiles:[{x:32,y:32,before,after},{x:55,y:41,before,after}]};assert.throws(()=>prepareSavedElevations(base,s,tooWide,identity,undefined,true),/spans too much terrain/);assert(base.every(v=>v===200));
});
