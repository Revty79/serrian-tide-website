import assert from "node:assert/strict";
import test from "node:test";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {advancedOperationSchema,type AdvancedOperation} from "./terrain-advanced-spec";
import {prepareTerrainOperation} from "./terrain-operations";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {parseAdvancedDraft} from "./terrain-advanced-recovery";
import type {TerrainGeometry} from "./terrain";
const shape:TerrainGeometry={width:64,height:64,tileSize:32,displayWidth:12800,displayHeight:6400,min:-12000,max:12000,wrap:false};
const context=():AdvancedTerrainContext=>({frame:{x:0,y:0,width:12800,height:6400},world:{width:12800,height:6400,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]});
type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;
const operation=():Profile=>({kind:"landform-profile",selection:{frame:{x:0,y:0,width:12800,height:6400}},preserveManual:false,strength:100,mode:"shape",hardness:0,endBlendM:0,featherM:0,points:[{x:2000,y:3200,elevationM:3000,widthM:1200},{x:6000,y:3200,elevationM:5500,widthM:2400},{x:10000,y:3200,elevationM:4000,widthM:1600}]});
const at=(x:number,y:number)=>y*64+x;
test("original uniform ridge cannot lower an existing crest; variable native shape raises and lowers",()=>{
  const base=new Int16Array(4096).fill(6000),legacy=prepareTerrainOperation(base,shape,{kind:"ridge",points:[{x:10,y:32},{x:50,y:32}],radius:8,radiusMetres:1200,height:1,target:4000,hardness:0});
  assert.deepEqual(legacy.grid,base);
  const result=prepareAdvancedTerrain(base,shape,operation(),context());
  assert.equal(result.grid[at(10,32)],3000);assert.equal(result.grid[at(30,32)],5500);assert.equal(result.grid[at(50,32)],4000);
  assert.equal(result.grid[at(0,0)],6000);assert.deepEqual(base,new Int16Array(4096).fill(6000));
});
test("variable full widths use physical space on unequal sample axes",()=>{
  const base=new Int16Array(4096).fill(200),r=prepareAdvancedTerrain(base,shape,operation(),context());
  assert.equal(r.grid[at(10,39)],200);assert(r.grid[at(30,39)]>200);
  assert.equal(r.grid[at(30,44)],200);assert(r.grid[at(30,43)]>200);
});
test("minimum and maximum profile modes preserve the retained side and crossovers",()=>{
  const base=new Int16Array(4096).fill(4500),op=operation();
  const minimum=prepareAdvancedTerrain(base,shape,{...op,mode:"minimum"},context()),maximum=prepareAdvancedTerrain(base,shape,{...op,mode:"maximum"},context());
  assert.equal(minimum.grid[at(10,32)],4500);assert.equal(minimum.grid[at(30,32)],5500);
  assert.equal(maximum.grid[at(10,32)],3000);assert.equal(maximum.grid[at(30,32)],4500);
});
test("sea interpolation supports, lake beds, finer sources, settlements and manual heights stay exact",()=>{
  const base=new Int16Array(4096).fill(200),c=context(),op=operation(),blocked=new Uint8Array(4096),manual=new Uint8Array(4096);
  base[at(29,32)]=-500;blocked[at(40,32)]=1;manual[at(45,32)]=1;c.sites.push({id:"site",x:7000,y:3200});
  c.water.lakes=[{id:"lake",name:"Native lake",rings:[[{x:3800,y:3000},{x:4600,y:3000},{x:4600,y:3500},{x:3800,y:3500}]],levelM:0,seed:{x:4200,y:3200},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
  const r=prepareAdvancedTerrain(base,shape,{...op,preserveManual:true},c,blocked,manual);
  for(let y=31;y<=33;y++)for(let x=28;x<=30;x++)assert.equal(r.grid[at(x,y)],base[at(x,y)]);
  for(const x of [20,21,22,34,35,36,40,45])assert.equal(r.grid[at(x,32)],200);
  assert(r.grid[at(47,32)]>200);assert(r.metrics.waterProtected>0);assert(r.metrics.protected>0);assert(r.metrics.siteProtected>0);
});
test("profile ends and selected boundary blend into the accepted field without changing outside",()=>{
  const base=new Int16Array(4096).fill(200),op=operation();op.endBlendM=2000;op.featherM=1000;op.selection={frame:{x:1000,y:2500,width:10000,height:1500}};
  const r=prepareAdvancedTerrain(base,shape,op,context());
  assert.equal(r.grid[at(10,32)],200);assert.equal(r.grid[at(50,32)],200);assert(r.grid[at(20,32)]>200);
  assert.equal(r.grid[at(30,25)],200);assert.equal(r.grid[at(30,24)],200);assert.equal(r.grid[at(30,40)],200);
});
test("continuous segment blending avoids a target jump at equal-weight crossings",()=>{
  const op=operation();op.points=[{x:2000,y:2000,elevationM:3000,widthM:2000},{x:10000,y:4400,elevationM:3000,widthM:2000},{x:10000,y:2000,elevationM:5000,widthM:2000},{x:2000,y:4400,elevationM:5000,widthM:2000}];
  const base=new Int16Array(4096).fill(200),r=prepareAdvancedTerrain(base,shape,op,context());
  assert(Math.abs(r.grid[at(30,32)]-4000)<=1);assert(r.grid[at(30,32)]<=5000);
  assert(Math.abs(r.grid[at(30,31)]-r.grid[at(30,33)])<500);
});
test("wrapped profile equals the same physical path away from the seam",()=>{
  const s={...shape,wrap:true},c=context();c.world.wrap=true;
  const op=operation();op.points=[{x:12000,y:3200,elevationM:3000,widthM:1600},{x:800,y:3200,elevationM:5000,widthM:1600}];
  const base=new Int16Array(4096).fill(200),r=prepareAdvancedTerrain(base,s,op,c),shifted={...op,points:op.points.map(p=>({...p,x:(p.x+6400)%12800}))},other=prepareAdvancedTerrain(base,s,shifted,c);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(r.grid[at(x,y)],other.grid[at((x+32)%64,y)]);
});
test("native preview rejects unresolved widths, duplicate points, unsupported bounds and excessive work",()=>{
  const base=new Int16Array(4096).fill(200),op=operation();
  for(const invalid of [{...op,points:op.points.map(p=>({...p,widthM:399}))},{...op,points:[op.points[0],op.points[0]]},{...op,endBlendM:5000},{...op,points:op.points.map(p=>({...p,elevationM:13000}))}])assert.throws(()=>prepareAdvancedTerrain(base,shape,invalid,context()));
  assert.throws(()=>advancedOperationSchema.parse({...op,points:op.points.map(p=>({...p,hidden:1}))}));
  const wide={...shape,width:512,height:512},w=context();assert.throws(()=>prepareAdvancedTerrain(new Int16Array(512*512).fill(200),wide,{...op,points:Array.from({length:128},(_,i)=>({...op.points[0],x:100+i}))},w),/sample-steps/);
});
test("cooperative preview is deterministic, cancellable and preserves both input and context",async()=>{
  const base=new Int16Array(4096).fill(200),c=context(),before=structuredClone(c),op=operation();
  assert.deepEqual(await prepareAdvancedTerrainAsync(base,shape,op,c),prepareAdvancedTerrain(base,shape,op,c));assert.deepEqual(c,before);
  const controller=new AbortController();controller.abort();await assert.rejects(prepareAdvancedTerrainAsync(base,shape,op,c,undefined,undefined,undefined,controller.signal),/cancelled/);assert.deepEqual(base,new Int16Array(4096).fill(200));
});
test("unfinished native profile drafts recover without authorizing an incomplete preview",()=>{
  const mapId="00000000-0000-4000-8000-000000000001",op={...operation(),points:[]},raw=JSON.stringify({version:1,mapId,sourceId:null,revision:1,operation:op,visualOnly:false});
  assert.deepEqual(parseAdvancedDraft(raw,mapId,null).operation,op);assert.throws(()=>advancedOperationSchema.parse(op));
});

test("a smaller manual edit rectangle retains manual heights outside it and hard supports inside it",()=>{
  const base=new Int16Array(4096).fill(200),c=context(),blocked=new Uint8Array(4096),manual=new Uint8Array(4096);
  for(const x of [10,21,22,24,25,30,34,35])manual[at(x,32)]=1;
  blocked[at(22,32)]=1;
  base[at(25,32)]=-500;
  c.sites.push({id:"retained-site",x:6000,y:3200});

  const op:Profile={
    ...operation(),preserveManual:true,
    manualEditArea:{x:4000,y:3100,width:3000,height:300},
  };
  const result=prepareAdvancedTerrain(base,shape,op,c,blocked,manual);

  for(const x of [10,22,24,25,30,35])assert.equal(result.grid[at(x,32)],base[at(x,32)]);
  for(const x of [21,34,46])assert(result.grid[at(x,32)]>base[at(x,32)]);
  assert(result.metrics.notices.includes("2 earlier manual heights changed within the smaller rectangle."));
});

test("manual edit rectangles validate bounds and recover unfinished settings without authorizing a preview",()=>{
  const base=new Int16Array(4096).fill(200),c=context(),op:Profile={
    ...operation(),preserveManual:true,selection:{frame:{x:1000,y:1000,width:10000,height:4000}},
    manualEditArea:{x:4000,y:2800,width:1100,height:400},
  };
  assert.deepEqual(advancedOperationSchema.parse(op),op);
  assert.throws(()=>advancedOperationSchema.parse({...op,preserveManual:false}),/Keep manual protection enabled/);
  for(const area of [op.selection.frame,{x:800,y:3000,width:1100,height:400},{x:10400,y:3000,width:1100,height:400}]){
    assert.throws(()=>prepareAdvancedTerrain(base,shape,{...op,manualEditArea:area},c),/smaller than and inside/);
  }

  const mapId="00000000-0000-4000-8000-000000000001";
  const unfinished={...op,manualEditArea:{x:4000,y:2800,width:0,height:0}};
  const raw=JSON.stringify({version:1,mapId,sourceId:null,revision:1,operation:unfinished,visualOnly:false});
  assert.deepEqual(parseAdvancedDraft(raw,mapId,null).operation,unfinished);
  assert.throws(()=>advancedOperationSchema.parse(unfinished));
});

test("manual edit rectangles use canonical World metres across the wrap seam",()=>{
  const c=context();
  c.world.wrap=true;
  const wrapShape={...shape,wrap:true};
  const base=new Int16Array(4096).fill(200),manual=new Uint8Array(4096);
  for(const x of [0,1,60,62,63])manual[at(x,32)]=1;
  const op:Profile={
    ...operation(),preserveManual:true,selection:{frame:{x:11600,y:2800,width:2400,height:800}},
    manualEditArea:{x:12400,y:3100,width:600,height:300},
    points:[{x:11800,y:3200,elevationM:3000,widthM:1200},{x:800,y:3200,elevationM:3500,widthM:1200}],
  };
  const result=prepareAdvancedTerrain(base,wrapShape,op,c,undefined,manual);
  for(const x of [0,62,63])assert(result.grid[at(x,32)]>base[at(x,32)]);
  for(const x of [1,60])assert.equal(result.grid[at(x,32)],base[at(x,32)]);
});
