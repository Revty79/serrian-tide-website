import assert from "node:assert/strict";
import test from "node:test";
import {terrainGeometry,terrainSettingsSchema} from "./terrain";
import {initializeRefinement,rootFrame,type RefinementMeta} from "./terrain-refinement";
import {expandedRefinementProtection,initializeExpandedRefinement,refinementExpansionFrame,refinementExpansionSchema,restoreRetainedRefinement} from "./terrain-refinement-expansion";

const world=terrainGeometry(terrainSettingsSchema.parse({widthKm:3.2,heightKm:3.2,gridWidth:640,gridHeight:384,wrap:true}));
const parent={...world,width:64,height:64};
const meta:RefinementMeta={id:"synthetic-detail",worldId:"synthetic-world",terrainId:"synthetic-terrain",mapId:"synthetic-map",name:"Synthetic accepted detail",parentId:null,parentRevision:3,revision:7,level:1,frame:{x:800,y:800,width:400,height:800},gridWidth:32,gridHeight:64,overviewLevels:0,updatedAt:""};
const growth={gridWidth:64,gridHeight:128,columnsToWest:32,rowsToNorth:64};

test("coverage expansion keeps every accepted sample at the same physical position and inherits only the added area",async()=>{
 const base=Int16Array.from({length:4096},(_,i)=>i%64+2*Math.floor(i/64));
 const old=Int16Array.from({length:2048},(_,i)=>(i*271%40001)-20000),before=old.slice(),parentBefore=base.slice();
 const {grid,frame}=await initializeExpandedRefinement(old,meta,base,parent,rootFrame(parent),world,growth);
 const inherited=initializeRefinement(base,parent,rootFrame(parent),frame,64,128,world);
 let retained=0,added=0;
 for(let y=0;y<128;y++)for(let x=0;x<64;x++){
  const inside=x>=32&&y>=64;
  assert.equal(grid[y*64+x],inside?old[(y-64)*32+x-32]:inherited[y*64+x]);
  if(inside){retained++;assert.equal(frame.x+x*frame.width/64,meta.frame.x+(x-32)*meta.frame.width/32);assert.equal(frame.y+y*frame.height/128,meta.frame.y+(y-64)*meta.frame.height/64);}else added++;
 }
 assert.equal(retained,2048);assert.equal(added,6144);assert.deepEqual(old,before);assert.deepEqual(base,parentBefore);
});

test("tile-aligned expansion preserves wrapping positions across the World seam",()=>{
 const current={...meta,frame:{x:3100,y:800,width:200,height:400}};
 const frame=refinementExpansionFrame(current,growth,parent,rootFrame(parent),world);
 assert.equal(frame.x,2900);assert.equal(frame.width,400);
 for(let x=0;x<32;x++)assert.equal((frame.x+(x+32)*frame.width/64)%3200,(current.frame.x+x*current.frame.width/32)%3200);
});

test("east-only growth retains fractional accepted origins without renormalizing their sample positions",()=>{
 const current={...meta,frame:{...meta.frame,x:800.1,y:800.1}},eastOnly={gridWidth:64,gridHeight:64,columnsToWest:0,rowsToNorth:0};
 const frame=refinementExpansionFrame(current,eastOnly,parent,rootFrame(parent),world);
 assert.equal(frame.x,current.frame.x);assert.equal(frame.y,current.frame.y);
});

test("expansion refuses lost samples, partial-tile movement, unchanged dimensions and fixed-edge crossings",()=>{
 assert.throws(()=>refinementExpansionFrame(meta,{...growth,gridWidth:32},parent,rootFrame(parent),world),/complete accepted/);
 assert.throws(()=>refinementExpansionFrame(meta,{...growth,columnsToWest:1},parent,rootFrame(parent),world),/32-sample/);
 assert.throws(()=>refinementExpansionFrame(meta,{...growth,gridWidth:32,gridHeight:64,columnsToWest:0,rowsToNorth:0},parent,rootFrame(parent),world),/larger/);
 assert.throws(()=>refinementExpansionFrame({...meta,frame:{...meta.frame,y:200}},growth,parent,rootFrame(parent),world),/fixed/);
 assert.throws(()=>refinementExpansionFrame(meta,{...growth,gridHeight:32},parent,rootFrame(parent),world),/reducing/);
});

test("expansion retains manual protection and creates an inherited collar around the enlarged grid",()=>{
 const old=Uint8Array.from({length:2048},(_,i)=>+(i%7===0));
 const result=expandedRefinementProtection(old,meta,growth);
 for(let y=0;y<64;y++)for(let x=0;x<32;x++)assert.equal(result[(y+64)*64+x+32],x>=28||y>=60?1:old[y*32+x]);
 assert.equal(result[0],1);assert.equal(result[20*64+20],0);assert.equal(old[11],0);
});

test("advanced expansion requires deliberate confirmation and rejects undocumented fields",()=>{
 const c={action:"expand",requestId:"11111111-1111-4111-8111-111111111111",mapId:"22222222-2222-4222-8222-222222222222",refinementId:"33333333-3333-4333-8333-333333333333",revision:7,parentRevision:3,previewHash:"a".repeat(64),...growth,gridWidth:4096};
 assert.equal(refinementExpansionSchema.safeParse(c).success,false);
 assert.equal(refinementExpansionSchema.safeParse({...c,advancedConfirmed:true}).success,true);
 assert.equal(refinementExpansionSchema.safeParse({...c,advancedConfirmed:true,skipProtection:true}).success,false);
});

test("cancelled expansion returns no accepted grid and leaves its inputs exact",async()=>{
 const controller=new AbortController();controller.abort();
 const base=new Int16Array(4096).fill(-500),old=new Int16Array(2048).fill(237);
 await assert.rejects(initializeExpandedRefinement(old,meta,base,parent,rootFrame(parent),world,growth,undefined,controller.signal),/abort/i);
 assert.ok(old.every(v=>v===237));assert.ok(base.every(v=>v===-500));
});

test("restoring an older revision restores its physical area without discarding new coverage",()=>{
 const frame=refinementExpansionFrame(meta,growth,parent,rootFrame(parent),world),current={...meta,frame,gridWidth:64,gridHeight:128,revision:8},now=Int16Array.from({length:8192},(_,i)=>i%1103),old=Int16Array.from({length:2048},(_,i)=>-i),result=restoreRetainedRefinement(now,current,old,meta,world);
 for(let y=0;y<128;y++)for(let x=0;x<64;x++)assert.equal(result[y*64+x],x>=32&&y>=64?old[(y-64)*32+x-32]:now[y*64+x]);
 assert.notEqual(result,now);assert.equal(now[64*64+32],(64*64+32)%1103);
 assert.throws(()=>restoreRetainedRefinement(now,current,old,{...meta,frame:{...meta.frame,width:401}},world),/spacing/);
 assert.throws(()=>restoreRetainedRefinement(now,current,old,{...meta,frame:{...meta.frame,x:801}},world),/aligned/);
});
