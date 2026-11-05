import assert from "node:assert/strict";
import test from "node:test";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {advancedOperationSchema,type AdvancedOperation,type VolcanoOperation} from "./terrain-advanced-spec";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import type {TerrainGeometry} from "./terrain";
import {prepareTerrainOperation} from "./terrain-operations";

const shape:TerrainGeometry={width:64,height:64,tileSize:32,displayWidth:6400,displayHeight:6400,min:-12000,max:12000,wrap:false};
const selection={frame:{x:0,y:0,width:6400,height:6400}};
const context=():AdvancedTerrainContext=>({frame:selection.frame,world:{width:6400,height:6400,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]});
const cone:VolcanoOperation={kind:"volcano",selection,preserveManual:true,strength:100,centre:{x:3200,y:3200},form:"cratered",radiusM:1800,heightM:1200,craterDiameterM:800,craterDepthM:700,profile:1,blendM:300,summitEastM:0,summitSouthM:0};
const erosion:Extract<AdvancedOperation,{kind:"erosion"}>={kind:"erosion",selection:{frame:{x:1000,y:1000,width:4000,height:4000}},preserveManual:true,strength:80,model:"runoff",iterations:12,direction:90,directionInfluence:1,deposition:true,maxDepthM:150,reposeDegrees:20,featherM:200};
const slope=()=>Int16Array.from({length:4096},(_,i)=>1600-Math.floor(i/64)*12+i%64*3);
const river=()=>{const c=context();c.water.edges.push({id:"river",from:"source",to:"sink",name:"Retained river description",points:[{x:2000,y:1000},{x:2000,y:5000}],drainageM2:40000,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null});return c;};
const channel:Extract<AdvancedOperation,{kind:"river-channel"}>={kind:"river-channel",selection,preserveManual:true,strength:100,riverId:"river",course:"segment",first:0,last:null,widthM:400,depthM:40,bankSoftness:.7,smoothing:.5};
test("native operation admission retains ordinary manual sources and rejects invalid advanced geometry",()=>{
  assert.throws(()=>advancedOperationSchema.parse({...cone,radiusM:-1}));
  assert.throws(()=>advancedOperationSchema.parse({...cone,craterDiameterM:4000}));
  assert.throws(()=>advancedOperationSchema.parse({...cone,summitEastM:1700}));
  assert.throws(()=>advancedOperationSchema.parse({...erosion,iterations:41}));
});
test("volcano is a real numerical cone and lower crater, not a decorative symbol",()=>{
  const base=new Int16Array(4096).fill(200),r=prepareAdvancedTerrain(base,shape,cone,context());
  assert.equal(base[32*64+32],200);assert.ok(r.grid[32*64+36]>r.grid[32*64+32]);
  assert.ok(r.grid[32*64+36]>900);assert.equal(r.grid[0],200);assert.ok(r.metrics.addedM3>0);
  assert.ok(r.metrics.workingBytes<=32*1024*1024);
  assert.deepEqual(prepareTerrainOperation(base,shape,cone,undefined,undefined,context()).patch,r.patch);
});
test("all five profiles are deterministic and crater/blend controls change actual heights",()=>{
  const base=new Int16Array(4096).fill(200),hashes=new Set<string>();
  for(const form of ["cone","shield","composite","cratered","caldera"] as const){
    const op={...cone,form,craterDiameterM:form==="cone"?0:cone.craterDiameterM,craterDepthM:form==="cone"?0:cone.craterDepthM};
    const a=prepareAdvancedTerrain(base,shape,op,context()),b=prepareAdvancedTerrain(base,shape,op,context());
    assert.deepEqual(a.grid,b.grid);hashes.add(Buffer.from(a.grid.buffer).toString("base64"));
  }
  assert.equal(hashes.size,5);
  assert.notDeepEqual(prepareAdvancedTerrain(base,shape,{...cone,blendM:0},context()).grid,prepareAdvancedTerrain(base,shape,cone,context()).grid);
});
test("polygon bounds, manual protection, finer detail, water and settlements retain exact heights",()=>{
  const base=new Int16Array(4096).fill(200),c=context(),manual=new Uint8Array(4096),blocked=new Uint8Array(4096);
  manual[32*64+32]=1;blocked[30*64+32]=1;c.sites.push({id:"town",x:3600,y:3200});
  base[31*64+31]=-10;
  const selected={frame:{x:2000,y:2000,width:2400,height:2400},footprint:{version:1 as const,kind:"polygon" as const,parts:[[{x:2000,y:2000},{x:4400,y:2000},{x:3200,y:4400}]]}};
  const r=prepareAdvancedTerrain(base,shape,{...cone,selection:selected},c,blocked,manual);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(x<20||x>44||y<20||y>44)assert.equal(r.grid[y*64+x],base[y*64+x]);
  for(const i of [32*64+32,30*64+32,32*64+36,31*64+31])assert.equal(r.grid[i],base[i]);
  assert.ok(r.metrics.protected>=2);assert.ok(r.metrics.siteProtected>0);assert.ok(r.metrics.waterProtected>0);
  assert.ok(prepareAdvancedTerrain(base,shape,{...cone,selection:selected,preserveManual:false},c,blocked,manual).grid[32*64+32]!==base[32*64+32]);
});
test("river carving lowers only its physical corridor and leaves route identity/description intact",()=>{
  const base=slope(),c=river(),before=JSON.stringify(c.water),r=prepareAdvancedTerrain(base,shape,channel,c);
  assert.ok(r.grid[30*64+20]<base[30*64+20]);assert.equal(r.grid[30*64+30],base[30*64+30]);
  for(let i=0;i<4096;i++)assert.ok(r.grid[i]<=base[i]);
  assert.equal(JSON.stringify(c.water),before);assert.ok(r.metrics.removedM3>0);assert.equal(r.metrics.addedM3,0);assert.ok(r.metrics.maxLoweringM<=channel.depthM);
});
test("carving rejects uphill, fictional, missing, narrow and out-of-source courses",()=>{
  const c=river(),base=slope();base[30*64+20]=5000;
  assert.throws(()=>prepareAdvancedTerrain(base,shape,channel,c),/uphill/);
  assert.throws(()=>prepareAdvancedTerrain(slope(),shape,{...channel,widthM:1},c),/native sample/);
  c.water.edges[0].flowKind="exception";assert.throws(()=>prepareAdvancedTerrain(slope(),shape,channel,c),/fictional/);
  assert.throws(()=>prepareAdvancedTerrain(slope(),shape,{...channel,riverId:"missing"},c),/saved river/);
});
test("erosion transports downhill material with distinguishable direction, duration and deposition",()=>{
  const base=slope(),original=base.slice(),r=prepareAdvancedTerrain(base,shape,erosion,context());
  assert.deepEqual(base,original);assert.ok(r.metrics.removedM3>0&&r.metrics.addedM3>0);
  assert.notDeepEqual(r.grid,prepareAdvancedTerrain(base,shape,{...erosion,direction:270},context()).grid);
  assert.notDeepEqual(r.grid,prepareAdvancedTerrain(base,shape,{...erosion,iterations:2},context()).grid);
  const out=prepareAdvancedTerrain(base,shape,{...erosion,deposition:false},context());
  assert.equal(out.metrics.addedM3,0);assert.ok(out.metrics.removedM3>0);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(x<10||x>50||y<10||y>50)assert.equal(r.grid[y*64+x],base[y*64+x]);
});
test("thermal erosion obeys repose threshold instead of averaging flat or shallow ground",()=>{
  const base=slope(),r=prepareAdvancedTerrain(base,shape,{...erosion,model:"thermal",reposeDegrees:60},context());
  assert.equal(r.metrics.changed,0);
  base[32*64+32]=4000;
  const changed=prepareAdvancedTerrain(base,shape,{...erosion,model:"thermal",reposeDegrees:20},context());
  assert.ok(changed.grid[32*64+32]<4000);assert.ok(changed.metrics.addedM3>0);
});
test("regional physical frame is authoritative and neighbouring samples remain exact",()=>{
  const base=new Int16Array(4096).fill(200),c=context();c.world={width:20000,height:20000,wrap:false};c.frame={x:7000,y:6000,width:6400,height:6400};
  const op={...cone,selection:{frame:c.frame},centre:{x:10200,y:9200}};
  const r=prepareAdvancedTerrain(base,shape,op,c);assert.ok(r.grid[32*64+32]!==base[32*64+32]);assert.equal(r.grid[0],200);
  assert.throws(()=>prepareAdvancedTerrain(base,shape,{...op,centre:{x:3000,y:3000}},c),/centre|no native samples/);
});
test("numerical eruption requires retained volcano provenance and collapse is bounded",()=>{
  const c=context(),id="91000000-0000-4000-8000-000000000001",base=prepareAdvancedTerrain(new Int16Array(4096).fill(200),shape,cone,c).grid;
  c.volcanoes=[{id,revision:2,sourceId:null,operation:cone}];
  const op:Extract<AdvancedOperation,{kind:"eruption"}>={kind:"eruption",selection,preserveManual:false,strength:100,volcanoId:id,effect:"collapse",source:cone.centre,extentM:600,widthM:200,magnitudeM:200,steps:100};
  const r=prepareAdvancedTerrain(base,shape,op,c);assert.ok(r.grid[32*64+32]<base[32*64+32]);assert.equal(r.grid[0],base[0]);
  assert.throws(()=>prepareAdvancedTerrain(base,shape,op,context()),/authored volcano/);
});
test("lava deposits follow existing gradients and stop at a sink without forcing uphill",()=>{
  const c=context(),id="91000000-0000-4000-8000-000000000001",base=slope();c.volcanoes=[{id,revision:2,sourceId:null,operation:cone}];
  const op:Extract<AdvancedOperation,{kind:"eruption"}>={kind:"eruption",selection,preserveManual:false,strength:100,volcanoId:id,effect:"lava",source:{x:3200,y:3200},extentM:1500,widthM:300,magnitudeM:25,steps:100};
  const r=prepareAdvancedTerrain(base,shape,op,c);assert.ok(r.metrics.addedM3>0);assert.equal(r.metrics.removedM3,0);
  assert.equal(r.grid[0],base[0]);assert.ok(r.metrics.notices.some(n=>n.includes("accepted pre-eruption gradients")));
  assert.throws(()=>prepareAdvancedTerrain(new Int16Array(4096).fill(200),shape,op,c),/sink/);
});
test("fallback yields, matches worker numerics and honours cancellation",async()=>{
  const base=slope(),signal=new AbortController();let turns=0;
  const timer=setInterval(()=>{turns++;},0);
  try{const a=await prepareAdvancedTerrainAsync(base,shape,erosion,context());assert.deepEqual(a.grid,prepareAdvancedTerrain(base,shape,erosion,context()).grid);}
  finally{clearInterval(timer);}
  assert.ok(turns>0);
  signal.abort();await assert.rejects(prepareAdvancedTerrainAsync(base,shape,erosion,context(),undefined,undefined,undefined,signal.signal),/cancel/i);
});
test("seam-crossing volcano keeps a bounded canonical affected area",()=>{
  const c=context();c.world.wrap=true;
  const op={...cone,centre:{x:50,y:3200},radiusM:800,craterDiameterM:200,craterDepthM:100,blendM:100};
  const r=prepareAdvancedTerrain(new Int16Array(4096).fill(200),{...shape,wrap:true},op,c);
  assert.ok(r.grid[32*64]>200&&r.grid[32*64+63]>200);
  assert.ok(r.metrics.affected!.width<2000);assert.equal(r.grid[32*64+32],200);
  assert.throws(()=>prepareAdvancedTerrain(new Int16Array(4096).fill(200),{...shape,wrap:true},{...op,centre:{x:6400,y:3200}},c),/canonical/);
});
test("a narrow channel never becomes a canyon beside a steep bank",()=>{
  const base=slope();for(let y=0;y<64;y++)base[y*64+21]+=4000;
  const r=prepareAdvancedTerrain(base,shape,channel,river());
  assert.ok(r.metrics.changed>0);assert.ok(r.metrics.maxLoweringM<=channel.depthM);
  assert.equal(r.grid[32*64+30],base[32*64+30]);
});
test("oversized erosion rejects without downsampling or mutating accepted terrain",()=>{
  const large={...shape,width:1024,height:1024},base=new Int16Array(1048576).fill(200),before=base.slice();
  assert.throws(()=>prepareAdvancedTerrain(base,large,{...erosion,selection},context()),/smaller area/);
  assert.deepEqual(base,before);
});
test("cancellation interrupts a running cooperative erosion proposal",async()=>{
  const s={...shape,width:256,height:256},base=Int16Array.from({length:65536},(_,i)=>3000-Math.floor(i/256)*5+i%256),
    before=base.slice(),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),0);
  try{await assert.rejects(prepareAdvancedTerrainAsync(base,s,{...erosion,selection,iterations:40},context(),undefined,undefined,undefined,abort.signal),/cancel/i);}
  finally{clearTimeout(timer);}
  assert.deepEqual(base,before);
});

test("settlements at wrapped/east and southern edges protect their nearest native supports",()=>{
  const c=context();c.world.wrap=true;c.sites=[{id:"corner-town",x:6399,y:6399}];
  const base=new Int16Array(4096).fill(1000),op={...cone,preserveManual:false,centre:{x:50,y:6300},radiusM:400,heightM:500,craterDiameterM:0,craterDepthM:0,blendM:0},
    r=prepareAdvancedTerrain(base,{...shape,wrap:true},op,c);
  assert.ok(r.metrics.changed>0);assert.ok(r.metrics.siteProtected>0);
  for(const y of [62,63])for(const x of [63,0,1])assert.equal(r.grid[y*64+x],base[y*64+x]);
});

test("polygon erosion feathers at the drawn edge and leaves outside samples exact",()=>{
  const base=slope(),op={...erosion,preserveManual:false,deposition:false,direction:180,directionInfluence:0,featherM:300,
    selection:{frame:{x:1000,y:1000,width:4000,height:4000},footprint:{version:1 as const,kind:"polygon" as const,parts:[[{x:1000,y:1000},{x:5000,y:1000},{x:3000,y:5000}]]}}},
    r=prepareAdvancedTerrain(base,shape,op,context());
  assert.equal(r.grid[30*64+20],base[30*64+20]);
  assert.equal(r.grid[30*64+19],base[30*64+19]);
  assert.ok(r.grid[30*64+30]<base[30*64+30]);
});
