import assert from "node:assert/strict";
import test from "node:test";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {advancedOperationSchema,type AdvancedOperation} from "./terrain-advanced-spec";
import {parseAdvancedDraft} from "./terrain-advanced-recovery";
import {terrainSourceSchema} from "./terrain-source";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import type {TerrainGeometry} from "./terrain";
const shape:TerrainGeometry={width:64,height:64,tileSize:32,displayWidth:12800,displayHeight:6400,min:-12000,max:12000,wrap:false};
const context=():AdvancedTerrainContext=>({frame:{x:0,y:0,width:12800,height:6400},world:{width:12800,height:6400,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]});
type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;
const operation=():Profile=>({kind:"landform-profile",selection:{frame:{x:0,y:0,width:12800,height:6400}},preserveManual:false,strength:100,mode:"upper-envelope",envelopeBaseM:200,hardness:0,endBlendM:1000,featherM:0,points:[{x:2000,y:3200,elevationM:6500,widthM:4800},{x:10000,y:3200,elevationM:6500,widthM:4800}]});
const at=(x:number,y:number)=>y*64+x;

test("an explicit envelope caps old raised land outside the path and retains lower authored interior",()=>{
  const base=new Int16Array(4096).fill(4000),op=operation();base[at(30,32)]=6000;base[at(31,32)]=1000;
  const {envelopeBaseM:unused,...legacy}=op;void unused;
  const old=prepareAdvancedTerrain(base,shape,{...legacy,mode:"maximum"},context());assert.deepEqual(old.grid,base);
  const before=base.slice(),r=prepareAdvancedTerrain(base,shape,op,context());
  assert.equal(r.grid[at(0,0)],200);assert.equal(r.grid[at(30,32)],6000);assert.equal(r.grid[at(31,32)],1000);
  assert.equal(r.grid[at(32,32)],4000);assert(r.metrics.changed>0);
  for(let i=0;i<base.length;i++)assert(r.grid[i]<=base[i]);assert.deepEqual(base,before);
});

test("the ceiling follows physical cross sections and tapers to the base at native ends",()=>{
  const r=prepareAdvancedTerrain(new Int16Array(4096).fill(4000),shape,operation(),context());
  // 1,200 m from a 2,400 m radius: 200 + 6,300 * (1 - 0.5^2)^2.
  assert.equal(r.grid[at(30,44)],3744);assert.equal(r.grid[at(30,56)],200);
  assert.equal(r.grid[at(10,32)],200);assert.equal(r.grid[at(50,32)],200);
  assert(r.grid[at(15,32)]>200);assert(r.grid[at(15,32)]<=4000);
});

test("concave polygon exclusions and all samples outside the selected area remain exact; nested areas still refuse",()=>{
  const op=operation();op.selection={frame:{x:1000,y:500,width:10000,height:5500},footprint:{version:1,kind:"polygon",parts:[[{x:1000,y:500},{x:11000,y:500},{x:11000,y:2000},{x:4000,y:2000},{x:4000,y:6000},{x:1000,y:6000}]]}};
  const base=new Int16Array(4096).fill(4000),r=prepareAdvancedTerrain(base,shape,op,context());
  assert.equal(r.grid[at(0,0)],4000);assert.equal(r.grid[at(30,32)],4000);assert.equal(r.grid[at(10,7)],200);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(x*200<1000||x*200>11000||y*100<500||y*100>6000)assert.equal(r.grid[at(x,y)],4000);
  const nested={...op,selection:{...op.selection,footprint:{version:1 as const,kind:"polygon" as const,parts:[[{x:1000,y:500},{x:11000,y:500},{x:11000,y:6000},{x:1000,y:6000}],[{x:4000,y:2000},{x:4000,y:4000},{x:8000,y:4000},{x:8000,y:2000}]]}}};assert.throws(()=>prepareAdvancedTerrain(base,shape,nested,context()),/Holes are not supported/);
});

test("envelope strength and selection feather blend without moving the selected boundary",()=>{
  const op={...operation(),strength:50,featherM:1000},base=new Int16Array(4096).fill(4000),r=prepareAdvancedTerrain(base,shape,op,context());
  assert.equal(r.grid[at(10,0)],4000);assert.equal(r.grid[at(10,5)],3050);assert.equal(r.grid[at(0,32)],4000);
});

test("sea supports, saved water, finer terrain, settlements and protected manual land survive the complete-area cap",()=>{
  const base=new Int16Array(4096).fill(4000),c=context(),op={...operation(),preserveManual:true},blocked=new Uint8Array(4096),manual=new Uint8Array(4096);
  base[at(2,32)]=-500;blocked[at(15,48)]=1;manual[at(20,48)]=1;c.sites.push({id:"retained-site",x:6000,y:5000});
  c.water.lakes=[{id:"retained-lake",name:"Retained lake",rings:[[{x:6000,y:1000},{x:7000,y:1000},{x:7000,y:1800},{x:6000,y:1800}]],levelM:3810,seed:{x:6500,y:1400},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
  for(let y=11;y<18;y++)for(let x=31;x<35;x++)base[at(x,y)]=200;
  const before=structuredClone(c),r=prepareAdvancedTerrain(base,shape,op,c,blocked,manual);
  for(let y=31;y<=33;y++)for(let x=1;x<=3;x++)assert.equal(r.grid[at(x,y)],base[at(x,y)]);
  for(let y=11;y<18;y++)for(let x=31;x<35;x++)assert.equal(r.grid[at(x,y)],200);
  for(const[x,y]of [[15,48],[20,48],[30,50],[29,49],[31,51]])assert.equal(r.grid[at(x,y)],4000);
  assert(r.metrics.waterProtected>0&&r.metrics.protected>0&&r.metrics.siteProtected>0);assert.deepEqual(c,before);
});

test("wrapped envelopes have the same native result away from the seam",()=>{
  const s={...shape,wrap:true},c=context();c.world.wrap=true;
  const op=operation();op.endBlendM=0;op.points=[{x:12000,y:3200,elevationM:6500,widthM:1600},{x:800,y:3200,elevationM:6500,widthM:1600}];
  const base=new Int16Array(4096).fill(4000),r=prepareAdvancedTerrain(base,s,op,c),shifted={...op,points:op.points.map(p=>({...p,x:(p.x+6400)%12800}))},other=prepareAdvancedTerrain(base,s,shifted,c);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(r.grid[at(x,y)],other.grid[at((x+32)%64,y)]);
});

test("explicit bases, map limits, sea datums and unchanged cell/work/memory bounds are authoritative",()=>{
  const op=operation(),base=new Int16Array(4096).fill(4000);
  assert.throws(()=>advancedOperationSchema.parse({...op,envelopeBaseM:undefined}),/explicit base/);
  assert.throws(()=>advancedOperationSchema.parse({...op,mode:"shape"}),/belongs only/);
  for(const invalid of [{...op,envelopeBaseM:0},{...op,envelopeBaseM:13000},{...op,envelopeBaseM:7000}])assert.throws(()=>prepareAdvancedTerrain(base,shape,invalid,context()));
  const negative=context();negative.seaLevel=-500;const belowSea=prepareAdvancedTerrain(base,shape,{...op,envelopeBaseM:-100},negative);assert.equal(belowSea.grid[0],-100);
  const dense={...shape,width:512,height:512};assert.throws(()=>prepareAdvancedTerrain(new Int16Array(512*512).fill(4000),dense,{...op,points:Array.from({length:128},(_,i)=>({x:100+i*90,y:3200,elevationM:6500,widthM:2400}))},context()),/sample-steps/);
  const big={...shape,width:4096,height:4096};assert.throws(()=>prepareAdvancedTerrain(new Int16Array(4096*4096).fill(4000),big,{...op,selection:{frame:{x:2000,y:2000,width:100,height:100}}},context()),/32 MiB/);
});

test("cooperative envelope execution and cancellation preserve inputs and accepted source provenance",async()=>{
  const base=new Int16Array(4096).fill(4000),op=operation(),c=context(),before=structuredClone(c),r=prepareAdvancedTerrain(base,shape,op,c);
  assert.deepEqual(await prepareAdvancedTerrainAsync(base,shape,op,c),r);assert.deepEqual(c,before);assert(base.every(v=>v===4000));
  const controller=new AbortController();controller.abort();await assert.rejects(prepareAdvancedTerrainAsync(base,shape,op,c,undefined,undefined,undefined,controller.signal),/cancelled/);
  const source={kind:"manual",advanced:{version:1,contextPin:"a".repeat(64),operation:op,effect:{changed:r.metrics.changed,affected:op.selection}}};assert.deepEqual(terrainSourceSchema.parse(JSON.parse(JSON.stringify(source))),source);
  const mapId="00000000-0000-4000-8000-000000000001",draft={...op,points:[],envelopeBaseM:undefined},raw=JSON.stringify({version:1,mapId,sourceId:null,revision:1,operation:draft,visualOnly:false});
  const recovered=parseAdvancedDraft(raw,mapId,null).operation;assert.equal(recovered.kind,"landform-profile");if(recovered.kind!=="landform-profile")assert.fail("Expected a retained profile draft");assert.equal(recovered.mode,"upper-envelope");assert.throws(()=>advancedOperationSchema.parse(draft));
});
