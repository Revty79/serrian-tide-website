import assert from "node:assert/strict";
import {writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {TerrainStroke} from "../src/features/worlds/terrain-stroke";
import {applyPatch,type Brush,type TerrainGeometry} from "../src/features/worlds/terrain";
const records:unknown[]=[],shape:TerrainGeometry={width:1024,height:1024,tileSize:32,displayWidth:20000,displayHeight:40000,min:-12000,max:12000,wrap:true};
for(const tool of ["raise","lower","smooth","level","coast-land","coast-water","coast-smooth"] as const){
 const grid=Int16Array.from({length:1024*1024},(_,i)=>Math.round(Math.sin(i%1024/17)*30+Math.cos(Math.floor(i/1024)/13)*25)+(i%2?8:-8)),original=grid.slice(),brush:Brush={tool,precision:"fine",radius:12,strength:tool==="raise"||tool==="lower"?.2:25,target:50,coastHeight:50,coastBand:500},stroke=new TerrainStroke(grid,shape,brush,{x:500.3,y:500.3}),started=performance.now();let batches=0,maxBatchMs=0,maxResiduals=0;
 for(let i=0;i<160;i++)stroke.enqueue({x:500.3+i*.4,y:500.3+Math.sin(i/13)*3});
 while(stroke.pending){const start=performance.now();stroke.advance(4);maxBatchMs=Math.max(maxBatchMs,performance.now()-start);maxResiduals=Math.max(maxResiduals,stroke.residualCount);batches++;assert.ok(batches<10000);}
 const patch=stroke.finish(),elapsedMs=performance.now()-started;assert.ok(patch.indices.length>0,tool);assert.equal(stroke.residualCount,0);const after=createHash("sha256").update(new Uint8Array(grid.buffer)).digest("hex");applyPatch(grid,patch,"before",shape);assert.deepEqual(grid,original);applyPatch(grid,patch,"after",shape);assert.equal(createHash("sha256").update(new Uint8Array(grid.buffer)).digest("hex"),after);
 const cancel=new TerrainStroke(grid,shape,brush,{x:512.2,y:512.7});cancel.enqueue({x:520,y:516});while(cancel.pending)cancel.advance(4);cancel.cancel();assert.equal(createHash("sha256").update(new Uint8Array(grid.buffer)).digest("hex"),after);
 records.push({tool,elapsedMs,maxBatchMs,batches,maxResidualCells:maxResiduals,changedSamples:patch.indices.length,undoBytes:patch.indices.byteLength+patch.before.byteLength+patch.after.byteLength,exactUndoRedoCancel:true,after});
}
mkdirSync("artifacts/regions-s42-precision",{recursive:true});writeFileSync("artifacts/regions-s42-precision/performance.json",JSON.stringify({passed:true,gridSamples:1024**2,gridBytes:1024**2*2,perStrokeResidualCellCeiling:1024**2,permanentFloatGrid:false,records},null,2)+"\n");console.log(JSON.stringify({passed:true,records}));
