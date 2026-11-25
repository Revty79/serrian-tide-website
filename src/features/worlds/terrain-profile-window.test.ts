import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {prepareAdvancedTerrain,type AdvancedTerrainContext} from "./terrain-advanced";
import {type AdvancedOperation,ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import type {TerrainGeometry} from "./terrain";
import {planProfileWindow,copyProfileWindow,prepareWindowedProfile,advancedResultSample,advancedResultTile,profileWindowLocalIndex,profilePreviewMeta} from "./terrain-profile-window";
import {prepareTerrainOperationJob} from "./terrain-operation-engine";
type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;
const shape:TerrainGeometry={width:4096,height:2048,tileSize:32,displayWidth:987654.32109876,displayHeight:1000000.1234567,min:-12000,max:12000,wrap:false};
const context=():AdvancedTerrainContext=>({frame:{x:12345.67890123,y:43210.98765432,width:shape.displayWidth,height:shape.displayHeight},world:{width:2000000,height:2000000,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]});
const hash=(v:Int16Array)=>createHash("sha256").update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest("hex");
function profile(c:AdvancedTerrainContext):Profile {
  const sx=c.frame.width/shape.width,sy=c.frame.height/shape.height,x=c.frame.x+800*sx,y=c.frame.y+800*sy;
  return {kind:"landform-profile",mode:"shape",preserveManual:true,strength:79,hardness:.1,endBlendM:5000,featherM:3000,
    selection:{frame:{x,y,width:120*sx,height:120*sy}},points:[{x:x+10*sx,y:y+12*sy,elevationM:3100,widthM:35000},{x:x+100*sx,y:y+110*sy,elevationM:4700,widthM:50000}]};
}
test("large profiles retain exact native arithmetic and all four effects against the unchanged whole-source kernel",async()=>{
  const c=context(),base=new Int16Array(shape.width*shape.height),blocked=new Uint8Array(base.length),manual=new Uint8Array(base.length),
    smallShape={...shape,width:2048,displayWidth:shape.displayWidth/2},smallContext={...c,frame:{...c.frame,width:c.frame.width/2}},
    small=new Int16Array(2048*2048),smallBlocked=new Uint8Array(small.length),smallManual=new Uint8Array(small.length);
  for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++)base[y*shape.width+x]=500+(x*17+y*31)%4800;
  // An accepted sea node and its interpolation supports, manual cells, a child,
  // standing water and a town test exclusions on each side of the window.
  const op=profile(c),sx=c.frame.width/shape.width,sy=c.frame.height/shape.height;
  base[850*shape.width+850]=-500;blocked[855*shape.width+855]=1;manual[860*shape.width+860]=1;
  c.sites.push({id:"town",x:c.frame.x+870*sx+.499999*sx,y:c.frame.y+870*sy});
  c.water.lakes=[{id:"lake",name:"Saved standing lake",rings:[[{x:op.selection.frame.x+70*sx,y:op.selection.frame.y+70*sy},{x:op.selection.frame.x+80*sx,y:op.selection.frame.y+70*sy},{x:op.selection.frame.x+80*sx,y:op.selection.frame.y+80*sy},{x:op.selection.frame.x+70*sx,y:op.selection.frame.y+80*sy}]],levelM:3810,seed:{x:op.selection.frame.x+75*sx,y:op.selection.frame.y+75*sy},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
  for(let y=0;y<2048;y++){small.set(base.subarray(y*4096,y*4096+2048),y*2048);smallBlocked.set(blocked.subarray(y*4096,y*4096+2048),y*2048);smallManual.set(manual.subarray(y*4096,y*4096+2048),y*2048);}
  const original=hash(base),water=JSON.stringify(c.water),sites=JSON.stringify(c.sites);
  for(const mode of ["shape","minimum","maximum","upper-envelope"] as const){
    const operation:Profile={...op,mode,...mode==="upper-envelope"?{envelopeBaseM:200}:{}},w=planProfileWindow(shape,operation,c)!;
    const actual=await prepareWindowedProfile(copyProfileWindow(base,w),shape,operation,c,w,copyProfileWindow(blocked,w),copyProfileWindow(manual,w)),
      expected=prepareAdvancedTerrain(small,smallShape,operation,smallContext,smallBlocked,smallManual);
    assert(actual.grid.length<base.length/8);assert.equal(actual.metrics.changed,expected.metrics.changed);
    assert.deepEqual(actual.metrics.affected,expected.metrics.affected);
    assert.deepEqual(actual.patch.before,expected.patch.before);assert.deepEqual(actual.patch.after,expected.patch.after);
    assert.deepEqual([...actual.patch.indices],[...expected.patch.indices].map(i=>Math.floor(i/2048)*4096+i%2048));
    assert.deepEqual(actual.metrics.notices,expected.metrics.notices);
    for(let y=w.y;y<w.y+w.height;y++)for(let x=w.x;x<w.x+w.width;x++)assert.equal(advancedResultSample(actual,y*4096+x,base[y*4096+x]),expected.grid[y*2048+x]);
    assert.equal(advancedResultSample(actual,0,base[0]),base[0]);
    const i=actual.patch.indices[0],key=Math.floor(i/4096/32)*128+Math.floor(i%4096/32),tile=advancedResultTile(actual,base,key,shape);
    for(let k=0;k<1024;k++){const global=(tile.y*32+(k>>5))*4096+tile.x*32+(k&31);assert.equal(tile.samples[k],expected.grid[Math.floor(global/4096)*2048+global%4096]);}
  }
  assert.equal(hash(base),original);assert.equal(JSON.stringify(c.water),water);assert.equal(JSON.stringify(c.sites),sites);
});

test("the maximum existing source uses bounded native windows, exact global patches and the ordinary worker protocol",async()=>{
  const s={...shape,height:4096,displayWidth:409600,displayHeight:409600},c=context();c.frame={x:0,y:0,width:409600,height:409600};
  const base=new Int16Array(4096*4096).fill(200),op:Profile={...profile(c),preserveManual:false,selection:{frame:{x:100000,y:100000,width:51100,height:51100}},endBlendM:0,featherM:0,
    points:[{x:101000,y:101000,elevationM:4000,widthM:100000},{x:150000,y:150000,elevationM:5000,widthM:100000}]},w=planProfileWindow(s,op,c)!,before=hash(base),
    input=copyProfileWindow(base,w),r=await prepareTerrainOperationJob({shape:s,operation:op,context:c,window:w,base:input.buffer as ArrayBuffer});
  assert.equal(w.width,1024);assert.equal(w.height,1024);assert(r.advancedMetrics!.workingBytes<=ADVANCED_TERRAIN_LIMITS.workingBytes);
  assert.equal(r.grid.byteLength,2*1024*1024);assert(r.changed>0);assert.equal(hash(base),before);
  for(const i of new Uint32Array(r.indices)){assert(i>=1000*4096+1000);assert(profileWindowLocalIndex(w,i)!>=0);}
  const meta=profilePreviewMeta({id:"source",worldId:"world",terrainId:"terrain",mapId:"map",name:"Saved source",parentId:null,parentRevision:1,level:1,revision:9,frame:c.frame,gridWidth:4096,gridHeight:4096,overviewLevels:7,updatedAt:"same"},w);
  assert.equal(meta.gridWidth,1024);assert.equal(meta.revision,9);assert.equal(meta.parentId,"source");
});

test("wrapped accepted frames retain canonical sample selection and unsupported work still refuses before copying",async()=>{
  const s={...shape,displayWidth:500000,displayHeight:1000000},c=context();c.frame={x:1800000,y:0,width:500000,height:1000000};c.world.wrap=true;
  const op:Profile={...profile(c),selection:{frame:{x:1990000,y:400000,width:20000,height:20000}},endBlendM:0,featherM:0,
    points:[{x:1995000,y:400000,elevationM:1500,widthM:20000},{x:5000,y:420000,elevationM:1700,widthM:20000}]},w=planProfileWindow(s,op,c)!;
  assert(w.width<4096);const r=await prepareWindowedProfile(new Int16Array(w.width*w.height).fill(200),s,op,c,w);assert(r.metrics.changed>0);
  assert.throws(()=>planProfileWindow(s,{...op,selection:{frame:{x:1800000,y:0,width:500000,height:1000000}}},c),/262,144/);
  await assert.rejects(prepareWindowedProfile(new Int16Array(w.width*w.height),s,op,c,{...w,x:w.x+32}),/does not match/);
  const bad={...op,points:[op.points[0],op.points[0]]};await assert.rejects(prepareWindowedProfile(new Int16Array(w.width*w.height),s,bad,c,planProfileWindow(s,bad,c)!),/Separate consecutive/);
});

test("cancellation retains source buffers and eligible erosion uses the bounded native workspace",async()=>{
  const c=context(),op=profile(c),w=planProfileWindow(shape,op,c)!,base=new Int16Array(w.width*w.height).fill(200),before=hash(base),abort=new AbortController();abort.abort();
  await assert.rejects(prepareWindowedProfile(base,shape,op,c,w,undefined,undefined,undefined,abort.signal),/cancel/i);assert.equal(hash(base),before);
  assert.equal(planProfileWindow({...shape,width:2048},op,c),null);
  assert.equal(planProfileWindow({...shape,wrap:true},op,c),null);
  assert(planProfileWindow(shape,{kind:"erosion",model:"thermal",iterations:1,direction:0,directionInfluence:0,deposition:true,maxDepthM:1,reposeDegrees:30,featherM:0,selection:op.selection,preserveManual:false,strength:100},c));
});

test("the bounded window applies the same manual edit rectangle as whole-source replay",async()=>{
  const c=context(),base=new Int16Array(shape.width*shape.height).fill(200),manual=new Uint8Array(base.length),blocked=new Uint8Array(base.length);
  const {frame}=profile(c).selection,sx=c.frame.width/shape.width,sy=c.frame.height/shape.height;
  const inside=860*shape.width+860,outside=860*shape.width+890,finer=860*shape.width+861;
  for(const index of [inside,outside,finer])manual[index]=1;
  blocked[finer]=1;
  const operation:Profile={
    ...profile(c),manualEditArea:{x:frame.x+45*sx,y:frame.y+45*sy,width:30*sx,height:30*sy},
  };
  const window=planProfileWindow(shape,operation,c)!;
  const result=await prepareWindowedProfile(
    copyProfileWindow(base,window),shape,operation,c,window,copyProfileWindow(blocked,window),copyProfileWindow(manual,window),
  );
  const halfWidth=shape.width/2,halfShape={...shape,width:halfWidth,displayWidth:shape.displayWidth/2};
  const halfContext={...c,frame:{...c.frame,width:c.frame.width/2}};
  const halfBase=new Int16Array(halfWidth*shape.height).fill(200),halfBlocked=new Uint8Array(halfBase.length),halfManual=new Uint8Array(halfBase.length);
  const halfIndex=(index:number)=>Math.floor(index/shape.width)*halfWidth+index%shape.width;
  for(const index of [inside,outside,finer])halfManual[halfIndex(index)]=1;
  halfBlocked[halfIndex(finer)]=1;
  const actual=prepareAdvancedTerrain(halfBase,halfShape,operation,halfContext,halfBlocked,halfManual);
  assert.equal(window.sourceWidth,shape.width);
  assert.deepEqual(result.patch.before,actual.patch.before);
  assert.deepEqual(result.patch.after,actual.patch.after);
  assert.deepEqual([...result.patch.indices].map(halfIndex),[...actual.patch.indices]);
  assert.deepEqual(result.metrics.notices,actual.metrics.notices);
  assert(advancedResultSample(result,inside,200)>200);
  for(const index of [outside,finer])assert.equal(advancedResultSample(result,index,200),200);
});
