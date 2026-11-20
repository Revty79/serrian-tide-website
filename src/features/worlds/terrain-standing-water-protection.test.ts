import test from "node:test";
import assert from "node:assert/strict";
import {EMPTY_HYDROLOGY,type HydroLayer} from "./terrain-hydrology";
import {standingWaterProtection} from "./terrain-standing-water-protection";
import {prepareTerrainOperation,prepareTerrainOperationAsync,type TerrainOperation} from "./terrain-operations";
import {prepareTerrainOperationJob} from "./terrain-operation-engine";
import type {AdvancedTerrainContext} from "./terrain-advanced";
const shape={width:32,height:32,tileSize:32,displayWidth:3200,displayHeight:3200,min:-10000,max:10000,wrap:false};
const rings=[[{x:840,y:840},{x:2240,y:840},{x:2240,y:2240},{x:840,y:2240}]];
const water={...EMPTY_HYDROLOGY,visible:false,opacity:0,lakes:[{id:"saved",name:"Saved construction bed",condition:"standing",levelM:3810,rings}]} as HydroLayer;
const context:AdvancedTerrainContext={world:{width:3200,height:3200,wrap:false},frame:{x:0,y:0,width:3200,height:3200},seaLevel:100,water,sites:[],volcanoes:[]};
const operation:TerrainOperation={kind:"area",area:{x:0,y:0,width:32,height:32},tool:"minimum",target:1000,amount:1,strength:100,passes:1,feather:0,heightFilter:{mode:"above",level:100,preserveBoundary:true}};
test("saved lake construction beds and eight-neighbor supports stay exact above a different sea level",()=>{
 const base=new Int16Array(1024).fill(200),before=base.slice(),guard=standingWaterProtection(shape,context),r=prepareTerrainOperation(base,shape,{...operation,preserveStandingWater:true},undefined,undefined,context);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(r.grid[y*32+x],x>=8&&x<=23&&y>=8&&y<=23?200:1000);
 assert.deepEqual(base,before);assert(guard.protected(10*32+10));assert(!guard.protected(2*32+2));assert.equal(water.lakes![0].levelM,3810);
});
test("legacy absent and explicit false retain the original result, and missing protected context refuses",()=>{
 const base=new Int16Array(1024).fill(200),a=prepareTerrainOperation(base,shape,operation),b=prepareTerrainOperation(base,shape,{...operation,preserveStandingWater:false},undefined,undefined,context);
 assert.deepEqual(a.grid,b.grid);assert.deepEqual(a.patch,b.patch);assert.equal(a.grid[10*32+10],1000);
 assert.throws(()=>prepareTerrainOperation(base,shape,{...operation,preserveStandingWater:true}),/standing-water geometry is required/);
});
test("wetlands and island exclusions use saved geometry even when their display is hidden",()=>{
 const island=[{x:1200,y:1200},{x:1800,y:1200},{x:1800,y:1800},{x:1200,y:1800}],wet={...water,lakes:water.lakes!.map(l=>({...l,rings:[...rings,island]})),features:[{id:"wet",kind:"wetland",rings:[[{x:2500,y:200},{x:3000,y:200},{x:3000,y:600},{x:2500,y:600}]]}]} as HydroLayer,
  guard=standingWaterProtection(shape,{...context,water:wet});
 assert(!guard.protected(15*32+15));assert(guard.protected(10*32+10));assert(guard.protected(3*32+27));assert(!guard.protected(27*32+27));
});
test("wrapped shores and unequal fine source frames retain the World-space convention",()=>{
 const crossed={...water,lakes:water.lakes!.map(l=>({...l,rings:[[{x:3000,y:800},{x:200,y:800},{x:200,y:2200},{x:3000,y:2200}]]}))},wrapContext={...context,world:{...context.world,wrap:true},water:crossed},guard=standingWaterProtection({...shape,wrap:true},wrapContext);
 assert(guard.protected(12*32));assert(guard.protected(12*32+31));assert(!guard.protected(12*32+16));
 const fine={...shape,displayWidth:1600,displayHeight:800},f=standingWaterProtection(fine,{...context,frame:{x:800,y:800,width:1600,height:800}});
 assert(f.protected(12*32+10));assert(!f.protected(12*32+31));
});
test("worker and fallback use the same accepted water geometry and cancellation preserves input",async()=>{
 const base=new Int16Array(1024).fill(200),op={...operation,preserveStandingWater:true},r=prepareTerrainOperation(base,shape,op,undefined,undefined,context),job=await prepareTerrainOperationJob({base:base.slice().buffer,shape,operation:op,context});
 assert.deepEqual(new Int16Array(job.grid),r.grid);const abort=new AbortController();abort.abort();await assert.rejects(prepareTerrainOperationAsync(base,shape,op,undefined,undefined,context,undefined,abort.signal),/cancel/i);assert(base.every(v=>v===200));
});
test("polygon, ridge and valley operations retain the same saved beds and adjacent supports",()=>{
 const base=new Int16Array(1024).fill(200),polygon={kind:"polygon-area" as const,points:[{x:0,y:0},{x:31,y:0},{x:31,y:31},{x:0,y:31}],tool:"minimum" as const,target:1000,amount:1,strength:100,passes:1,feather:0,preserveStandingWater:true};
 for(const op of [polygon,...(["ridge","valley"] as const).map(kind=>({kind,points:[{x:0,y:15},{x:31,y:15}],radius:12,height:700,hardness:1,preserveStandingWater:true}))]){
  const r=prepareTerrainOperation(base,shape,op,undefined,undefined,context);assert(r.changed>0);
  for(let y=8;y<=23;y++)for(let x=8;x<=23;x++)assert.equal(r.grid[y*32+x],200);
 }
 assert(base.every(v=>v===200));
});
test("standing-water cache remains bounded across a maximum source and refuses excess geometry work",()=>{
 const large={...shape,width:4096,height:4096,displayWidth:409600,displayHeight:409600},guard=standingWaterProtection(large,{...context,world:{width:409600,height:409600,wrap:false},frame:{x:0,y:0,width:409600,height:409600}});
 for(let y=0;y<4096;y+=32)for(let x=0;x<4096;x+=32)guard.protected(y*4096+x);
 assert.equal(guard.diagnostics().cachedTiles,256);assert.equal(guard.diagnostics().cacheLimit,256);
 const circle=Array.from({length:8192},(_,i)=>({x:1600+1500*Math.cos(i/8192*Math.PI*2),y:1600+1500*Math.sin(i/8192*Math.PI*2)})),complex={...water,lakes:water.lakes!.map(l=>({...l,rings:[circle]}))},small={...shape,width:64,height:64},bounded=standingWaterProtection(small,{...context,water:complex});
 assert.throws(()=>{for(let i=0;i<4096;i++)bounded.protected(i);},/8,388,608/);
});
