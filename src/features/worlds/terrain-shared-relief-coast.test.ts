import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {sharedReliefCoastGuards,type SharedCoastSource} from "./terrain-shared-relief-coast";
import {planSharedRelief,type SharedProfile} from "./terrain-shared-relief";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";

// Original exhaustive-audit hashes: whole masks, not selected example nodes.
const golden={
 sea:["782096ec5b1be30e3099ffbed7276c86ee5a9776eb995d266c40dce4a58d0676","144f58c7ddb213457147f39d949c78008adefaf9fd6cebf2f42f8a10652ef139"],
 dry:["4fe7b59af6de3b665b67788cc2f99892ab827efae3a467342b3bb4e3bc8e5bfe","8a39d2abd3999ab73c34db2476849cddf303ce389b35826850f9a700589b4a90"],
 mixed:["782096ec5b1be30e3099ffbed7276c86ee5a9776eb995d266c40dce4a58d0676","e6b021f7c93be79d731df6aa354331bb099bc2b575d38502cc562e474e3d1a09"],
 outside:["078a8a0f6758928df2f894e535e7f879488f56d2b10a2ba511bf6f9ae8d41d5d","9376f31570a87e42195f04c6d113fd486cffda7b6a91c7253a463e87e5b68c7b"],
 wrapsea:["2c6e628e130e5b234b38c8756b198fe6921a7c0e94b4efadfcaa3ae1a3deb4f4","144f58c7ddb213457147f39d949c78008adefaf9fd6cebf2f42f8a10652ef139"],
 selfsea:["782096ec5b1be30e3099ffbed7276c86ee5a9776eb995d266c40dce4a58d0676","fffaad7cb522f1d61f1b7503866f7eca863508aa590c834b22148aff39454cfc","91699ffdd26aa6bf8cfcc8dda66c24169645334dc919d95a21087e08ff79c629"],
};
type Mode=keyof typeof golden;
function fixture(mode:Mode){
 const wx=(x:number)=>(x%40000000+40000000)%40000000,baseX=mode==="wrapsea"?39000000:10000000,
  world={width:2048,height:2048,tileSize:32,displayWidth:40000000,displayHeight:20000000,min:-12000,max:12000,wrap:true},
  sources:SharedCoastSource[]=[{id:null,revision:1,level:0,shape:world,frame:{x:0,y:0,width:40000000,height:20000000}},
   {id:"parent",revision:1,level:1,shape:{...world,width:4096,height:4096,displayWidth:3000000,displayHeight:4000000,wrap:false},frame:{x:baseX,y:10000000,width:3000000,height:4000000}},
   {id:"child",revision:1,level:2,shape:{...world,width:4096,height:4096,displayWidth:700000,displayHeight:700000,wrap:false},frame:{x:wx(baseX+1000000),y:12000000,width:700000,height:700000}}],
  operation:SharedProfile={kind:"landform-profile",selection:{frame:{x:baseX,y:10000000,width:3000000,height:4000000}},points:Array.from({length:9},(_,i)=>({x:wx(baseX+1300000+(i%2)*100000),y:10200000+i*400000,elevationM:2000,widthM:500000})),mode:"minimum",preserveManual:false,strength:100,hardness:0,endBlendM:120000,featherM:100000},
  area=mode==="selfsea"?{x:wx(baseX+1100000),y:12001000,width:100000,height:2000}:{x:wx(baseX+1100000),y:11935000,width:500000,height:65000},
  context={world:{width:world.displayWidth,height:world.displayHeight,wrap:true},seaLevel:0,water:EMPTY_HYDROLOGY,sites:[],volcanoes:[]},
  budget=planSharedRelief(sources,operation,area,context);
 const sample=(p:{x:number;y:number},s:SharedCoastSource,outside:boolean)=>{
  const x=Math.floor(wx(p.x-s.frame.x)/s.frame.width*s.shape.width),y=Math.floor((p.y-s.frame.y)/s.frame.height*s.shape.height);
  return mode==="dry"?200:mode==="outside"?(outside?-500:200):mode==="mixed"?((Math.floor(x/7)+Math.floor(y/11))%3===0?-500:200):-500;
 };
 return {world,sources,budget,sample};
}
for(const mode of Object.keys(golden) as Mode[])test(`large nested ${mode} coasts retain every exhaustive mask byte and audit step`,async()=>{
 const f=fixture(mode),before=structuredClone(f.sources);let reads=0;
 const r=await sharedReliefCoastGuards(f.budget.plans,f.sources,f.world,0,async(...args)=>{reads++;return f.sample(...args);});
 assert.deepEqual([...r.masks.values()].map(m=>createHash("sha256").update(m).digest("hex")),golden[mode]);
 assert.equal(r.visited,mode==="wrapsea"?95070:88465);assert.deepEqual(f.sources,before);
 assert(f.budget.cells<=262144&&f.budget.workingBytes<=32*1048576);
 if(mode==="sea")assert(reads<2000,`Completed coarser supports must avoid the original 88,465 tile reads; received ${reads}.`);
 if(mode==="dry")assert.equal(reads,88320,"Dry supports still require accepted reads; 145 clipped nodes cannot affect any target mask.");
});
test("in-flight cancellation remains effective while redundant fine reads are skipped",async()=>{
 const f=fixture("sea"),abort=new AbortController();let reads=0;
 await assert.rejects(sharedReliefCoastGuards(f.budget.plans,f.sources,f.world,0,async(...args)=>{if(++reads===20)abort.abort();return f.sample(...args);},abort.signal),/cancel/i);
 assert.equal(reads,20);
});
