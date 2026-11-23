import test from "node:test";
import assert from "node:assert/strict";
import {recoveredTerrainHistory} from "./terrain-recovery-history";
import {applyPatch,type TerrainGeometry} from "./terrain";
import type {TerrainRecovery} from "./terrain-recovery";
const shape:TerrainGeometry={width:64,height:64,tileSize:32,displayWidth:10000,displayHeight:5000,wrap:false,min:-12000,max:12000};
const draft:TerrainRecovery={key:"owned-fixture",revision:8,seaLevel:0,tiles:[],savedAt:"2026-11-23T00:00:00Z"};
test("same-baseline recovery creates one exact ordinary Undo and Redo step without changing input or original request",()=>{
 const baseline=new Int16Array(4096).fill(200),grid=baseline.slice();grid[17]=1800;grid[3000]=-400;
 const recovery={...draft,pending:{requestId:"00000000-0000-4000-8000-000000000001",revision:8,seaLevel:0,tiles:[]}},original=structuredClone(recovery),entry=recoveredTerrainHistory(baseline,grid,shape,0,recovery,8)!;
 assert.deepEqual([...entry.patch!.indices],[17,3000]);assert.equal(entry.seaBefore,0);assert.equal(entry.seaAfter,0);
 const result=grid.slice();applyPatch(result,entry.patch!,"before",shape);assert.deepEqual(result,baseline);applyPatch(result,entry.patch!,"after",shape);assert.deepEqual(result,grid);assert(baseline.every(z=>z===200));assert.deepEqual(recovery,original);
});
test("already accepted and stale recovery never invent prior heights or a session Undo step",()=>{
 const baseline=new Int16Array(4096).fill(500),grid=baseline.slice();grid[17]=900;
 assert.equal(recoveredTerrainHistory(baseline,grid,shape,0,draft,9),undefined);
 const id="00000000-0000-4000-8000-000000000001",pending={requestId:id,revision:8,seaLevel:0,tiles:[]};
 assert.equal(recoveredTerrainHistory(baseline,grid,shape,0,{...draft,pending},8,id),undefined);
 assert.equal(recoveredTerrainHistory(baseline,baseline,shape,0,draft,8),undefined);
});
test("sea-only recovery is undoable and incomplete baseline grids refuse before history admission",()=>{
 const baseline=new Int16Array(4096).fill(500),recovery={...draft,seaLevel:100},entry=recoveredTerrainHistory(baseline,baseline,shape,0,recovery,8)!;
 assert.equal(entry.patch,undefined);assert.equal(entry.seaBefore,0);assert.equal(entry.seaAfter,100);
 assert.throws(()=>recoveredTerrainHistory(new Int16Array(1),baseline,shape,0,recovery,8),/Complete matching/);
 assert.throws(()=>recoveredTerrainHistory(baseline,new Int16Array(1),shape,0,recovery,8),/Complete matching/);
});
test("a recovered edit larger than the rolling sample budget retains the exact latest single step",()=>{
 const s={...shape,width:2048,height:2048},before=new Int16Array(s.width*s.height).fill(200),after=before.slice();after.fill(800,0,1_000_100);
 const entry=recoveredTerrainHistory(before,after,s,0,draft,8)!;assert.equal(entry.patch!.indices.length,1_000_100);
 const result=after.slice();applyPatch(result,entry.patch!,"before",s);assert.deepEqual(result,before);applyPatch(result,entry.patch!,"after",s);assert.deepEqual(result,after);
});
