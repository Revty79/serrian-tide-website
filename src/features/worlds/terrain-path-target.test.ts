import assert from "node:assert/strict";
import test from "node:test";
import {prepareTerrainOperation,type TerrainOperation} from "./terrain-operations";
import {terrainGeometry,terrainSettingsSchema,applyPatch} from "./terrain";
const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:96,gridHeight:64,minElevation:-2000,maxElevation:5000}));
const path={kind:"ridge",points:[{x:10,y:20},{x:40,y:20}],radius:5,height:1000,hardness:0} satisfies TerrainOperation;

test("targeted ridges approach a bound across varying bases and retain existing peaks, protection and outside cells",()=>{
 const base=new Int16Array(96*64).fill(500),blocked=new Uint8Array(base.length);base[20*96+15]=4000;base[20*96+16]=-500;blocked[20*96+17]=1;
 const before=base.slice(),r=prepareTerrainOperation(base,shape,{...path,target:3000,heightFilter:{mode:"above",level:0}},undefined,blocked);
 assert.equal(r.grid[20*96+15],4000);assert.equal(r.grid[20*96+16],-500);assert.equal(r.grid[20*96+17],500);assert.equal(r.grid[20*96+18],3000);assert.ok(r.grid[22*96+18]>500&&r.grid[22*96+18]<3000);assert.equal(r.grid[0],500);assert.deepEqual(base,before);
 const accepted=r.grid.slice();applyPatch(r.grid,r.patch,"before",shape);assert.deepEqual(r.grid,base);applyPatch(r.grid,r.patch,"after",shape);assert.deepEqual(r.grid,accepted);
 assert.throws(()=>prepareTerrainOperation(base,shape,{...path,target:6000}),/saved map/);
});

test("negative ridge targets preserve shallow shelves and islands; targeted valleys preserve deeper terrain",()=>{
 const base=new Int16Array(96*64).fill(-1800);base[20*96+15]=-500;base[20*96+16]=100;
 const ridge=prepareTerrainOperation(base,shape,{...path,target:-1000,heightFilter:{mode:"at-or-below",level:0}});assert.equal(ridge.grid[20*96+14],-1000);assert.equal(ridge.grid[20*96+15],-500);assert.equal(ridge.grid[20*96+16],100);
 const valley=prepareTerrainOperation(base,shape,{...path,kind:"valley",target:-1500});assert.equal(valley.grid[20*96+14],-1800);assert.equal(valley.grid[20*96+15],-1500);assert.equal(valley.grid[20*96+16],-1500);assert.equal(valley.grid[0],-1800);
});

test("omitting a path target retains the exact relative operation and segment overlaps do not accumulate",()=>{
 const base=new Int16Array(96*64).fill(500),simple=prepareTerrainOperation(base,shape,path),overlap=prepareTerrainOperation(base,shape,{...path,points:[...path.points,...path.points]});
 assert.equal(simple.grid[20*96+20],1500);assert.deepEqual(simple.grid,overlap.grid);
 const valley=prepareTerrainOperation(base,shape,{...path,kind:"valley"});assert.equal(valley.grid[20*96+20],-500);
});
