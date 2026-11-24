import assert from "node:assert/strict";
import test from "node:test";
import {preserveProfileJoins} from "./terrain-profile-joins";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {advancedOperationSchema,advancedTerrainCellBytes,advancedTerrainSampleSteps,ADVANCED_TERRAIN_LIMITS,type AdvancedOperation} from "./terrain-advanced-spec";
import {planProfileWindow,copyProfileWindow,prepareWindowedProfile} from "./terrain-profile-window";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {parseAdvancedDraft} from "./terrain-advanced-recovery";
import type {TerrainGeometry} from "./terrain";

const shape:TerrainGeometry={width:64,height:64,tileSize:32,displayWidth:640,displayHeight:480,min:-12000,max:12000,wrap:false};
const context=(s=shape):AdvancedTerrainContext=>({frame:{x:0,y:0,width:s.displayWidth,height:s.displayHeight},world:{width:s.displayWidth,height:s.displayHeight,wrap:s.wrap},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]});
type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;
const operation=(mode:Profile["mode"]="maximum"):Profile=>({kind:"landform-profile",mode,preserveManual:false,strength:100,hardness:0,endBlendM:0,featherM:15,selection:{frame:{x:40,y:40,width:550,height:380}},points:[{x:80,y:260,elevationM:mode==="minimum"?2800:800,widthM:230},{x:540,y:260,elevationM:mode==="minimum"?3000:700,widthM:250}]});
const field=()=>Int16Array.from({length:4096},(_,i)=>1500+i%64*6-Math.floor(i/64)*3);
function violations(base:Int16Array,grid:Int16Array,s=shape){
  let count=0;const sx=s.displayWidth/s.width,sy=s.displayHeight/s.height;
  for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)for(const[ex,ey]of[[1,0],[0,1],[1,1],[-1,1]]){
    let xx=x+ex;const yy=y+ey;if(yy>=s.height||!s.wrap&&(xx<0||xx>=s.width))continue;xx=(xx+s.width)%s.width;
    const i=y*s.width+x,j=yy*s.width+xx,limit=Math.max(Math.abs(base[i]-base[j]),Math.floor(Math.hypot(ex*sx,ey*sy)));
    if(Math.abs(grid[i]-grid[j])>limit)count++;
  }return count;
}
for(const mode of["minimum","maximum"] as const)test(`optional ${mode} profile withholds only the effect needed for complete eight-neighbour joins`,()=>{
  const base=field(),copy=base.slice(),op=operation(mode),legacy=prepareAdvancedTerrain(base,shape,op,context()),result=prepareAdvancedTerrain(base,shape,{...op,preserveGradualJoins:true},context());
  assert(violations(base,legacy.grid)>0);assert.equal(violations(base,result.grid),0);assert(result.metrics.changed>0);
  for(let i=0;i<base.length;i++)if(mode==="maximum")assert(result.grid[i]>=legacy.grid[i]&&result.grid[i]<=base[i]);else assert(result.grid[i]<=legacy.grid[i]&&result.grid[i]>=base[i]);
  assert(result.metrics.notices.some(n=>n.includes("Gradual native-grid joins")));assert.deepEqual(base,copy);
});
test("absent and false gradual-join flags retain the entire legacy numerical result",()=>{
  const base=field(),op=operation();assert.deepEqual(prepareAdvancedTerrain(base,shape,op,context()),prepareAdvancedTerrain(base,shape,{...op,preserveGradualJoins:false},context()));
  assert.equal(advancedTerrainCellBytes(op),64);assert.equal(advancedTerrainCellBytes({...op,preserveGradualJoins:false}),64);
});
test("fixed sea, lake beds, finer sources, manual and settlement supports stay exact",()=>{
  const base=field(),blocked=new Uint8Array(4096),manual=new Uint8Array(4096),c=context(),at=(x:number,y:number)=>y*64+x;
  base[at(25,30)]=-500;blocked[at(32,30)]=1;manual[at(35,30)]=1;c.sites.push({id:"site",x:400,y:225});
  c.water.lakes=[{id:"lake",name:"Fixed basin",rings:[[{x:170,y:200},{x:210,y:200},{x:210,y:250},{x:170,y:250}]],levelM:0,seed:{x:190,y:225},spillM:null,condition:"dry",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
  const op={...operation(),preserveManual:true,preserveGradualJoins:true},before=JSON.stringify(c),result=prepareAdvancedTerrain(base,shape,op,c,blocked,manual);
  for(const[x,y]of[[25,30],[24,29],[26,31],[32,30],[35,30],[40,30],[39,29],[41,31],[19,30]])assert.equal(result.grid[at(x,y)],base[at(x,y)]);
  assert.equal(violations(base,result.grid),0);assert.equal(JSON.stringify(c),before);
});
test("maximum-first envelope equals an independent repeated-relaxation oracle, including old cliffs and wrapping",()=>{
  let random=912381;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random;};
  for(const wrap of[false,true])for(const sign of[1,-1] as const)for(let trial=0;trial<24;trial++){
    const s={...shape,width:8,height:7,displayWidth:24,displayHeight:35,wrap},base=Int16Array.from({length:56},()=>1000+next()%120),candidate=Int16Array.from(base,v=>v-sign*(next()%70)),weights=Float32Array.from(base,()=>next()%5?1:0),indices=Uint32Array.from(base,(_,i)=>i),actual=base.slice(),expected=base.slice();
    for(let i=0;i<56;i++)if(weights[i])expected[i]=candidate[i];
    let changed=true,rounds=0;while(changed){changed=false;assert(++rounds<1000);for(let y=0;y<7;y++)for(let x=0;x<8;x++){
      const i=y*8+x;if(!weights[i])continue;for(let ey=-1;ey<=1;ey++)for(let ex=-1;ex<=1;ex++){
        if(!ex&&!ey)continue;let xx=x+ex;const yy=y+ey;if(yy<0||yy>=7||!wrap&&(xx<0||xx>=8))continue;xx=(xx+8)%8;const j=yy*8+xx,limit=Math.max(Math.abs(base[i]-base[j]),Math.floor(Math.hypot(ex*3,ey*5))),floor=sign*expected[j]-limit;
        if(floor>sign*expected[i]){expected[i]=sign*floor;changed=true;}
      }
    }}
    let visits=0;const work=preserveProfileJoins(base,actual,s,indices,weights,i=>weights[i]?i:-1,k=>candidate[k],sign,3,5,()=>{visits++;return false;});for(;;)if(work.next().done)break;
    assert.deepEqual(actual,expected);assert.equal(violations(base,actual,s),0);assert(visits<=26*56);
  }
});
test("whole and cropped native windows keep identical guarded heights and immutable base buffers",async()=>{
  const s={...shape,width:1024,height:1024,displayWidth:10240,displayHeight:7680},c=context(s),base=Int16Array.from({length:1024*1024},(_,i)=>1600+i%1024%64*5-Math.floor(i/1024)%64*2),op={...operation(),preserveGradualJoins:true},w=planProfileWindow(s,op,c,{shared:true,processingArea:{...op.selection.frame}})!;
  const copy=base.slice(),whole=prepareAdvancedTerrain(base,s,op,c),cropped=await prepareWindowedProfile(copyProfileWindow(base,w),s,op,c,w),joined=base.slice();for(let i=0;i<cropped.patch.indices.length;i++)joined[cropped.patch.indices[i]]=cropped.patch.after[i];
  assert.deepEqual(joined,whole.grid);assert.deepEqual(cropped.patch.before,whole.patch.before);assert.deepEqual(cropped.patch.after,whole.patch.after);assert.deepEqual(base,copy);
});
test("guard admission reserves its exact buffers and work without enlarging any existing limit",()=>{
  const op={...operation(),preserveGradualJoins:true};
  assert.equal(advancedTerrainCellBytes(op),72);assert.equal(advancedTerrainSampleSteps(op,262144),27*262144);
  const full={...shape,width:1024,height:1024,displayWidth:10240,displayHeight:7680},c=context(full),tooMuch={...op,selection:{frame:{x:0,y:0,width:5110,height:3832.5}},points:Array.from({length:8},(_,i)=>({x:100+i*100,y:1000,elevationM:1000,widthM:300}))};
  assert(advancedTerrainSampleSteps(tooMuch,262144)>ADVANCED_TERRAIN_LIMITS.work);
  assert.throws(()=>prepareAdvancedTerrain(new Int16Array(1024*1024).fill(1500),full,tooMuch,c),/smaller area|sample-steps/);
  const native={...shape,width:2048,height:1024,displayWidth:20480,displayHeight:7680},nativeContext=context(native),large={...op,selection:{frame:{x:1000,y:750,width:5110,height:3832.5}}};
  assert.equal(planProfileWindow(native,{...large,preserveGradualJoins:false},nativeContext),null);assert(planProfileWindow(native,large,nativeContext));
});
test("guarded async work is deterministic, cancellable and strictly bound to a one-way operation",async()=>{
  const base=field(),op={...operation(),preserveGradualJoins:true},expected=prepareAdvancedTerrain(base,shape,op,context());assert.deepEqual((await prepareAdvancedTerrainAsync(base,shape,op,context())).grid,expected.grid);
  const signal=new AbortController();let turns=0;await assert.rejects(prepareAdvancedTerrainAsync(base,shape,op,context(),undefined,undefined,()=>{if(++turns===2)signal.abort();},signal.signal),{name:"AbortError"});
  assert.throws(()=>advancedOperationSchema.parse({...op,mode:"shape"}));assert.throws(()=>advancedOperationSchema.parse({...op,mode:"upper-envelope",envelopeBaseM:200}));
  const packet={version:1,mapId:"92000000-0000-4000-8000-000000000001",sourceId:null,revision:3,operation:op,visualOnly:false};assert.deepEqual(parseAdvancedDraft(JSON.stringify(packet),packet.mapId,null),packet);
});
test("sub-metre integer grids may withhold the complete local effect without changing fixed supports",()=>{
  const s={...shape,width:8,height:8,displayWidth:4,displayHeight:4},base=new Int16Array(64).fill(200),grid=base.slice(),indices=Uint32Array.from(base,(_,i)=>i),weights=Float32Array.from(base,(_,i)=>i%8>0&&i%8<7&&i>=8&&i<56?1:0),work=preserveProfileJoins(base,grid,s,indices,weights,i=>weights[i]?i:-1,()=>100,1,.5,.5,()=>false);
  for(;;)if(work.next().done)break;assert.deepEqual(grid,base);
});
