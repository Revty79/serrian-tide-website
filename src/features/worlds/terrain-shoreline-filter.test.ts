import assert from "node:assert/strict";
import test from "node:test";
import {terrainGeometry,applyPatch} from "./terrain";
import {prepareTerrainOperation,prepareTerrainOperationAsync,terrainOperationSchema,type TerrainOperation} from "./terrain-operations";

const shape=terrainGeometry({gridWidth:96,gridHeight:64,widthKm:96,heightKm:32,wrap:true,minElevation:-12000,maxElevation:12000});
const area={kind:"area",area:{x:20,y:12,width:24,height:40},tool:"minimum",target:600,amount:1,strength:100,passes:1,feather:0} satisfies TerrainOperation;
function coast(){const base=new Int16Array(96*64).fill(200);for(let y=0;y<64;y++)for(let x=0;x<32;x++)base[y*96+x]=-500;return base;}

test("land-only edits retain saved shore supports while changing inland heights, with exact patch undo/redo",()=>{
 const base=coast(),before=base.slice(),r=prepareTerrainOperation(base,shape,{...area,heightFilter:{mode:"above",level:0,preserveBoundary:true}});
 for(let y=0;y<64;y++)for(let x=0;x<=32;x++)assert.equal(r.grid[y*96+x],base[y*96+x]);
 assert.equal(r.grid[20*96+33],600);assert.equal(r.grid[0],-500);assert.deepEqual(base,before);
 const accepted=r.grid.slice();applyPatch(r.grid,r.patch,"before",shape);assert.deepEqual(r.grid,base);applyPatch(r.grid,r.patch,"after",shape);assert.deepEqual(r.grid,accepted);
});

test("below-sea edits protect their shore supports and use the saved nonzero sea level",()=>{
 const base=coast();for(let i=0;i<base.length;i++)base[i]+=700;
 const r=prepareTerrainOperation(base,shape,{...area,tool:"maximum",target:-1000,heightFilter:{mode:"at-or-below",level:700,preserveBoundary:true}});
 for(let y=0;y<64;y++){assert.equal(r.grid[y*96+31],200);for(let x=32;x<96;x++)assert.equal(r.grid[y*96+x],900);}
 assert.equal(r.grid[20*96+30],-1000);
 base[20*96+31]=700;assert.equal(prepareTerrainOperation(base,shape,{...area,tool:"maximum",target:-1000,heightFilter:{mode:"at-or-below",level:700,preserveBoundary:true}}).grid[20*96+31],700);
});

test("wrapping seams and diagonal neighbors are protected without vertical wrapping",()=>{
 const base=new Int16Array(96*64).fill(200);base[20*96+95]=-500;base[30*96+30]=-500;base[63*96+50]=-500;
 const op={...area,area:{x:0,y:0,width:96,height:64},heightFilter:{mode:"above",level:0,preserveBoundary:true}} satisfies TerrainOperation;
 const wrapped=prepareTerrainOperation(base,shape,op);assert.equal(wrapped.grid[20*96],200);assert.equal(wrapped.grid[19*96],200);assert.equal(wrapped.grid[29*96+29],200);assert.equal(wrapped.grid[50],600);
 const flat=prepareTerrainOperation(base,{...shape,wrap:false},op);assert.equal(flat.grid[20*96],600);assert.equal(flat.grid[20*96+94],200);
});

test("polygon exclusions, protected heights and multi-pass smoothing remain exact with async parity",async()=>{
 const base=coast(),blocked=new Uint8Array(base.length);base[20*96+36]=1800;blocked[20*96+36]=1;
 const op={kind:"polygon-area",points:[{x:20,y:12},{x:44,y:12},{x:44,y:52},{x:20,y:52}],holes:[[{x:38,y:24},{x:42,y:24},{x:42,y:30},{x:38,y:30}]],tool:"smooth",target:600,amount:1,strength:100,feather:0,passes:5,heightFilter:{mode:"above",level:0,preserveBoundary:true}};
 const checked=terrainOperationSchema.parse(op),r=prepareTerrainOperation(base,shape,checked,undefined,blocked),asyncResult=await prepareTerrainOperationAsync(base,shape,checked,undefined,blocked);
 assert.deepEqual(asyncResult.grid,r.grid);for(let y=0;y<64;y++)assert.equal(r.grid[y*96+32],200);assert.equal(r.grid[20*96+36],1800);assert.equal(r.grid[26*96+40],200);assert.equal(r.grid[10*96+35],200);assert.ok(r.changed>0);
 const abort=new AbortController();abort.abort();await assert.rejects(prepareTerrainOperationAsync(base,shape,checked,undefined,blocked,undefined,undefined,abort.signal),{name:"AbortError"});assert.equal(base[20*96+36],1800);
});

test("path operations preserve the same coastline and legacy absent/false filters retain exact old output",()=>{
 const base=coast(),path={kind:"ridge",points:[{x:25,y:20},{x:45,y:20}],radius:8,height:1200,hardness:1} satisfies TerrainOperation;
 const r=prepareTerrainOperation(base,shape,{...path,heightFilter:{mode:"above",level:0,preserveBoundary:true}});assert.equal(r.grid[20*96+32],200);assert.equal(r.grid[20*96+35],1400);assert.equal(r.grid[20*96+31],-500);
 for(const op of [area,path]){const legacy=prepareTerrainOperation(base,shape,{...op,heightFilter:{mode:"above",level:0}}),off=prepareTerrainOperation(base,shape,{...op,heightFilter:{mode:"above",level:0,preserveBoundary:false}});assert.deepEqual(off,legacy);assert.notEqual(legacy.grid[20*96+32],200);}
 assert.throws(()=>terrainOperationSchema.parse({...area,heightFilter:{mode:"above",level:0,preserveBoundary:"true"}}));
});
