import test from "node:test";
import assert from "node:assert/strict";
import {EMPTY_HYDROLOGY,type HydroLayer} from "./terrain-hydrology";
import {TERRAIN} from "./terrain";
import {waterSurfaceReader,waterSurfaceKey} from "./terrain-water-surface";
import {terrainSurfaceSampler} from "./terrain-surface-field";
const world={...TERRAIN,width:32,height:32,displayWidth:3200,displayHeight:3200,wrap:false};
const rings=[[{x:840,y:840},{x:2240,y:840},{x:2240,y:2240},{x:840,y:2240}]];
const water={...EMPTY_HYDROLOGY,visible:true,opacity:1,lakes:[{id:"test",name:"Test",condition:"standing",levelM:3810,rings}]} as HydroLayer;
const grid=()=>{const a=new Int16Array(1024).fill(4000);for(let y=9;y<=22;y++)for(let x=9;x<=22;x++)a[y*32+x]=200;return a;};
test("shading is independent of submerged ground; raw ground and dry sample values stay exact",()=>{
 const a=grid(),before=a.slice(),read=(x:number,y:number)=>a[Math.max(0,Math.min(31,y))*32+Math.max(0,Math.min(31,x))],surface=waterSurfaceReader(read,world,world,water,0);
 assert.equal(surface(10,10),3810);assert.equal(surface(8,10),4000);assert.deepEqual(a,before);
 const sample=terrainSurfaceSampler(a,world,undefined,water,0),first=sample(830,1500);a[15*32+9]=3750;const next=terrainSurfaceSampler(a,world,undefined,water,0)(830,1500);assert.deepEqual(next,first);assert.equal(surface(9,15),3810);a[15*32+9]=4200;assert.equal(surface(9,15),4200,"No cached heights survive in-place native edits");
});
test("hidden/transparent/dry/potential lakes retain the exact original sampler and changes invalidate geometry key",()=>{
 const read=()=>200;assert.equal(waterSurfaceReader(read,world,world,undefined,0),read);assert.equal(waterSurfaceReader(read,world,world,{...water,visible:false},0),read);assert.equal(waterSurfaceReader(read,world,world,{...water,opacity:0},0),read);for(const condition of ["dry","potential"] as const)assert.equal(waterSurfaceReader(read,world,world,{...water,lakes:water.lakes!.map(l=>({...l,condition}))},0),read);
 assert.notEqual(waterSurfaceKey(water),waterSurfaceKey({...water,lakes:water.lakes!.map(l=>({...l,levelM:3800}))}));assert.equal(waterSurfaceKey({...water,authoredPins:[]} as HydroLayer),waterSurfaceKey(water));
});
test("standing-lake islands remain dry authority; a negative water datum projects without assuming zero",()=>{
 const island=[{x:1100,y:1100},{x:1400,y:1100},{x:1400,y:1400},{x:1100,y:1400}],w={...water,lakes:water.lakes!.map(l=>({...l,levelM:-100,rings:[...rings,island]}))};const read=()=>-200,s=waterSurfaceReader(read,world,world,w,-300);assert.equal(s(10,10),-100);assert.equal(s(12,12),-200);
});
test("true sea and dry coast support are preserved even when a high standing outline crosses them",()=>{
 const a=grid();a[15*32+7]=-500;const read=(x:number,y:number)=>a[Math.max(0,Math.min(31,y))*32+Math.max(0,Math.min(31,x))],s=waterSurfaceReader(read,world,world,water,0);assert.equal(s(7,15),-500);assert.equal(s(9,15),200);assert.equal(s(11,15),3810);
});
test("wrapped standing surfaces and finer physical frames use the same immutable World geometry",()=>{
 const w={...world,wrap:true},cross={...water,lakes:water.lakes!.map(l=>({...l,rings:[[{x:3000,y:800},{x:200,y:800},{x:200,y:2200},{x:3000,y:2200}]]}))},read=()=>200,s=waterSurfaceReader(read,w,w,cross,0);assert.equal(s(0,12),3810);assert.equal(s(32,12),3810);assert.equal(s(16,12),200);
 const fine={...world,width:32,height:32,displayWidth:1600,displayHeight:1600},f=waterSurfaceReader(read,fine,world,water,0,{x:800,y:800,width:1600,height:1600});assert.equal(f(4,4),3810);assert.equal(f(0,0),200);
});
test("missing borrowed coastal neighbors retain raw ground rather than inventing an interpolated surface",()=>{const read=(x:number,y:number)=>x===8&&y===10?undefined:200;assert.equal(waterSurfaceReader(read,world,world,water,0)(10,10),200);});

test("an unresolved mapped island below sea level is dry geometry, not an unmapped ocean neighbor",()=>{const a=grid();for(let y=9;y<=22;y++)for(let x=9;x<=22;x++)a[y*32+x]=-200;const island=[{x:1150,y:1150},{x:1250,y:1150},{x:1250,y:1250},{x:1150,y:1250}],w={...water,lakes:water.lakes!.map(l=>({...l,levelM:-100,rings:[...rings,island]}))};const read=(x:number,y:number)=>a[y*32+x],surface=waterSurfaceReader(read,world,world,w,0);assert.equal(surface(11,12),-100);assert.equal(surface(12,12),-200);assert.equal(a[12*32+11],-200);});

test("a high standing lake never raises another lake or unrelated dry ground to its level",()=>{const a=new Int16Array(1024).fill(200),read=(x:number,y:number)=>a[y*32+x],low={...water.lakes![0],levelM:0},high={...low,id:"second",levelM:3810,rings:[[{x:2440,y:840},{x:3040,y:840},{x:3040,y:2240},{x:2440,y:2240}]]},w={...water,lakes:[low,high]},surface=waterSurfaceReader(read,world,world,w,0);assert.equal(surface(10,10),200);assert.equal(surface(27,10),3810);assert.equal(surface(1,1),200);a[10*32+27]=4000;assert.equal(surface(27,10),4000);});

test("geometry-cache pressure never retains heights or hides a newly missing coastal support",()=>{
 const shape={...world,width:128,height:128,displayWidth:12800,displayHeight:12800},a=new Int16Array(128*128).fill(200),w={...water,lakes:water.lakes!.map(l=>({...l,rings:[[{x:3040,y:2040},{x:9840,y:2040},{x:9840,y:10840},{x:3040,y:10840}]]}))};let missing=-1;
 const surface=waterSurfaceReader((x,y)=>y*128+x===missing?undefined:a[y*128+x],shape,shape,w,0);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++)assert.equal(surface(x,y),x>=31&&x<=98&&y>=21&&y<=108?3810:200);
 a[64*128+64]=4200;assert.equal(surface(64,64),4200);a[64*128+64]=200;assert.equal(surface(64,64),3810);
 a[64*128+29]=-500;assert.equal(surface(31,64),200);a[64*128+29]=200;assert.equal(surface(31,64),3810);
 missing=64*128+29;assert.equal(surface(31,64),200);missing=-1;assert.equal(surface(31,64),3810);
});

test("blocked geometry memberships retain fractional positions and exact source-frame identity",()=>{
 const read=()=>200,a=waterSurfaceReader(read,world,world,water,0),b=waterSurfaceReader(read,world,world,water,0,{x:100,y:0,width:3200,height:3200});
 for(let i=0;i<200;i++){assert.equal(a(8.39,10),200);assert.equal(a(8.41,10),3810);assert.equal(a(8,10),200);assert.equal(b(8,10),3810);}
});
