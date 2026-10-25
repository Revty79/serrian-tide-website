import assert from "node:assert/strict";
import test from "node:test";
import {terrainGeometry,terrainSettingsSchema,sculpt,applyPatch,brushWeight,type Brush} from "./terrain";
import {prepareTerrainOperation,type TerrainOperation} from "./terrain-operations";
import {TerrainStroke} from "./terrain-stroke";
const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:96,gridHeight:64,minElevation:-1000,maxElevation:3000}));
test("level approaches its target from either side, with hard/soft edges and saved bounds",()=>{
 for(const start of [-500,2000]){const grid=new Int16Array(96*64).fill(start);sculpt(grid,40,30,{tool:"level",radius:12,strength:250,target:700,hardness:.4},new Map(),shape);assert.equal(grid[30*96+40],700);assert.equal(grid[0],start);assert.ok(Math.abs(grid[30*96+50]-700)<Math.abs(start-700));}
 assert.equal(brushWeight(.6),(.64)**2);assert.equal(brushWeight(.6,.8),1);
 const g=new Int16Array(96*64).fill(0);sculpt(g,40,30,{tool:"level",radius:12,strength:1000,target:9000},new Map(),shape);assert.equal(g[30*96+40],3000);
});
test("coastal brushes change the numerical sea intersection while retaining higher land and deeper water",()=>{
 const grid=new Int16Array(96*64).fill(-500),b:Brush={tool:"coast-land",radius:12,strength:250,seaLevel:100,coastHeight:200};sculpt(grid,40,30,b,new Map(),shape);assert.equal(grid[30*96+40],300);grid[30*96+40]=2000;sculpt(grid,40,30,b,new Map(),shape);assert.equal(grid[30*96+40],2000);sculpt(grid,40,30,{...b,tool:"coast-water"},new Map(),shape);assert.equal(grid[30*96+40],-100);grid[30*96+40]=-900;sculpt(grid,40,30,{...b,tool:"coast-water"},new Map(),shape);assert.equal(grid[30*96+40],-900);
 const before=grid.slice();sculpt(grid,40,30,{...b,tool:"coast-smooth",coastBand:100},new Map(),shape);assert.equal(grid[30*96+40],before[30*96+40]);
});
test("continuous queued strokes are gap-free, wrapped, bounded, exactly undoable and cancellable",()=>{
 for(const wrap of [false,true]){const s={...shape,wrap},grid=new Int16Array(96*64),initial=grid.slice(),stroke=new TerrainStroke(grid,s,{tool:"raise",radius:3,strength:200},{x:wrap?94:5,y:30});stroke.enqueue({x:wrap?3:85,y:30});let batches=0;while(stroke.pending){stroke.advance(.1);assert.ok(++batches<1000);}const patch=stroke.finish();assert.ok(patch.indices.length);if(wrap){assert.ok(grid[30*96+95]>0);assert.ok(grid[30*96]>0);assert.equal(grid[30*96+50],0);}else for(let x=5;x<=85;x++)assert.ok(grid[30*96+x]>0);applyPatch(grid,patch,"before",s);assert.deepEqual(grid,initial);applyPatch(grid,patch,"after",s);
 const cancel=new TerrainStroke(grid,s,{tool:"lower",radius:16,strength:100},{x:20,y:20}),saved=grid.slice();cancel.enqueue({x:70,y:20});cancel.advance();cancel.cancel();assert.deepEqual(grid,saved);}
});
test("ridge and valley paths blend continuously, do not accumulate at joins, and wrap by the shortest segment",()=>{
 const base=new Int16Array(96*64).fill(500),ridge:TerrainOperation={kind:"ridge",points:[{x:10,y:30},{x:45,y:30},{x:80,y:30}],radius:8,height:1000,hardness:0};const r=prepareTerrainOperation(base,shape,ridge);for(let x=10;x<=80;x++)assert.equal(r.grid[30*96+x],1500);assert.equal(r.grid[0],500);assert.ok(r.grid[34*96+45]>500&&r.grid[34*96+45]<1500);assert.equal(base[30*96+45],500);assert.equal(prepareTerrainOperation(base,shape,{...ridge,kind:"valley",height:3000}).grid[30*96+45],-1000);
 const wrapped=prepareTerrainOperation(base,{...shape,wrap:true},{...ridge,points:[{x:92,y:30},{x:4,y:30}]}).grid;assert.equal(wrapped[30*96],1500);assert.equal(wrapped[30*96+48],500);
});
test("every selected-area operation leaves all outside samples exact and makes one reversible patch",()=>{
 const base=Int16Array.from({length:96*64},(_,i)=>Math.round(Math.sin(i)*400)),area={x:15,y:12,width:40,height:35};for(const tool of ["level","raise","lower","smooth"] as const){const r=prepareTerrainOperation(base,shape,{kind:"area",area,tool,target:500,amount:200,strength:100,passes:4,feather:3});assert.ok(r.changed);for(let y=0;y<64;y++)for(let x=0;x<96;x++)if(x<15||x>=55||y<12||y>=47)assert.equal(r.grid[y*96+x],base[y*96+x]);const accepted=r.grid.slice();applyPatch(r.grid,r.patch,"before",shape);assert.deepEqual(r.grid,base);applyPatch(r.grid,r.patch,"after",shape);assert.deepEqual(r.grid,accepted);}
 assert.throws(()=>prepareTerrainOperation(base,shape,{kind:"area",area:{x:90,y:0,width:20,height:2},tool:"level",target:0,amount:1,strength:100,passes:1,feather:0}));
});
