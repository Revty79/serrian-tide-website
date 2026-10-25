import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import reference from "./terrain-sample-mode-reference.json";
import {sculpt,terrainGeometry,terrainSettingsSchema,type Brush} from "./terrain";
import {prepareTerrainOperation} from "./terrain-operations";
import {TerrainStroke} from "./terrain-stroke";
import {physicalSizeAssessment,physicalBrushGeometry} from "./terrain-physical-brush";
const hash=(g:Int16Array)=>createHash("sha256").update(new Uint8Array(g.buffer)).digest("hex");
test("every retained sample-mode brush and landform matches the eighteen pre-Pass-6 hashes",()=>{
 for(const wrap of [false,true]){const s=terrainGeometry(terrainSettingsSchema.parse({gridWidth:128,gridHeight:96,widthKm:10000,heightKm:6000,minElevation:-20000,maxElevation:20000,wrap})),base=Int16Array.from({length:s.width*s.height},(_,i)=>Math.round(900*Math.sin(i%s.width*.19)+700*Math.cos(Math.floor(i/s.width)*.11)));
  for(const tool of ["raise","lower","smooth","level","coast-land","coast-water","coast-smooth"] as const){const g=base.slice(),brush:Brush={tool,radius:24,strength:150,hardness:.3,target:500,seaLevel:0,coastHeight:150,coastBand:500},before=new Map<number,number>();for(const [x,y] of [[3,20],[17,27],[50,40],[93,60],[126,50]])sculpt(g,x,y,brush,before,s);assert.equal(hash(g),reference[`${tool}:${wrap}` as keyof typeof reference]);}
  for(const kind of ["ridge","valley"] as const)assert.equal(hash(prepareTerrainOperation(base,s,{kind,points:[{x:4,y:30},{x:24,y:36},{x:75,y:42},{x:124,y:60}],radius:16,height:1500,hardness:.25}).grid),reference[`${kind}:${wrap}` as keyof typeof reference]);
 }
});
const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:128,gridHeight:128,widthKm:256,heightKm:128}));
test("physical brush influence is circular in metres despite unequal sample spacing",()=>{
 const grid=new Int16Array(128*128),before=new Map<number,number>();sculpt(grid,64,64,{tool:"raise",radius:24,radiusMetres:10000,strength:1000},before,shape);assert.deepEqual(physicalBrushGeometry(shape,10000),{x:5,y:10,metres:10000,spacing:{x:2000,y:1000}});assert.equal(grid[64*128+67],grid[70*128+64]);assert.equal(grid[64*128+68],grid[72*128+64]);assert.equal(grid[64*128+69],0);assert.equal(grid[74*128+64],0);assert.ok(grid[64*128+64]>0);
});
test("all physical brushes preserve bounds and a wrapped circle reaches both sides",()=>{
 for(const tool of ["raise","lower","smooth","level","coast-land","coast-water","coast-smooth"] as const){const s={...shape,wrap:true},g=Int16Array.from({length:128*128},(_,i)=>i%2?500:-500),before=new Map<number,number>();sculpt(g,0,64,{tool,radius:24,radiusMetres:10000,strength:250,target:1000,seaLevel:0,coastHeight:150,coastBand:1000},before,s);assert.ok(before.size>0);assert.ok([...before.keys()].some(i=>i%128>123),tool);assert.ok([...before.keys()].some(i=>i%128<5),tool);assert.ok(g.every(z=>z>=s.min&&z<=s.max));}
});
test("physical stroke spacing remains gap-free with a single exact undo patch and cancellation",()=>{
 const g=new Int16Array(128*128),stroke=new TerrainStroke(g,shape,{tool:"raise",radius:24,radiusMetres:4000,strength:1000},{x:10,y:64});stroke.enqueue({x:110,y:64});while(stroke.pending)stroke.advance(5);const patch=stroke.finish();for(let x=10;x<=110;x++)assert.ok(g[64*128+x]>0,`gap at ${x}`);assert.equal(new Set(patch.indices).size,patch.indices.length);for(let n=0;n<patch.indices.length;n++)g[patch.indices[n]]=patch.before[n];assert.ok(g.every(v=>v===0));const cancelled=new TerrainStroke(g,shape,{tool:"raise",radius:24,radiusMetres:8000,strength:1000},{x:20,y:60});cancelled.advance();assert.ok(g.some(v=>v!==0));cancelled.cancel();assert.ok(g.every(v=>v===0));
});
test("physical ridge widths use metre-space segment projection and remain one numerical patch",()=>{
 const base=new Int16Array(128*128),r=prepareTerrainOperation(base,shape,{kind:"ridge",points:[{x:30,y:30},{x:90,y:30}],radius:16,radiusMetres:10000,height:2000,hardness:0});assert.equal(r.grid[30*128+60],2000);assert.equal(r.grid[36*128+60],Math.round(2000*(1-.6*.6)**2));assert.equal(r.grid[40*128+60],0);assert.equal(r.grid[30*128+25],0);assert.ok(base.every(v=>v===0));assert.equal(r.patch.indices.length,r.changed);const valley=prepareTerrainOperation(base,shape,{kind:"valley",points:[{x:30,y:30},{x:90,y:30}],radius:16,radiusMetres:10000,height:2000,hardness:0});for(let i=0;i<base.length;i++)assert.equal(valley.grid[i]+r.grid[i],0);
});
test("unresolved or over-budget physical sizes retain the request and require explicit adjustment",()=>{
 const s=terrainGeometry(terrainSettingsSchema.parse({gridWidth:1024,gridHeight:1024,widthKm:1000000,heightKm:1000000})),a=physicalSizeAssessment(s,1000),adjusted=physicalSizeAssessment(s,1000,"minimum");assert.equal(a.spacing.x,976562.5);assert.equal(a.requestedDiameter,1000);assert.equal(a.valid,false);assert.equal(adjusted.requestedDiameter,1000);assert.equal(adjusted.diameter,1953125);assert.equal(adjusted.valid,true);assert.equal(physicalSizeAssessment(s,1e9).tooLarge,true);assert.equal(physicalBrushGeometry(s,500),null);const g=new Int16Array(1024*1024);sculpt(g,500,500,{tool:"raise",radius:24,radiusMetres:500,strength:1000},new Map(),s);assert.ok(g.every(v=>v===0));
});

test("unsupported physical stroke requests are rejected before queuing numerical work",()=>{assert.throws(()=>new TerrainStroke(new Int16Array(128*128),shape,{tool:"raise",radius:24,radiusMetres:.001,strength:100},{x:0,y:0}),/supported physical/);});
