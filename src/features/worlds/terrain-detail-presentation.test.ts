import test from "node:test";
import assert from "node:assert/strict";
import {visibleTerrainDetail,featherTerrainDetail,detailPresentationIdentity,detailViewPlan,detailNumericalTiles} from "./terrain-detail-presentation";
import {TerrainDetailCache,numericalChecksum,type DetailPlan} from "./terrain-refinement-cache";
import type {RefinementMeta} from "./terrain-refinement";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import {TerrainDetailPainter} from "./terrain-detail-renderer";
import {CLASSIC_RELIEF} from "./terrain-relief";
import {scalarRasterBytes} from "./terrain-render-quality";

const world={width:64,height:64,tileSize:32,displayWidth:1000,displayHeight:1000,min:-12000,max:12000,wrap:false};
const meta=(id:string,level:number,frame={x:100,y:100,width:800,height:800}):RefinementMeta=>({id,worldId:"world",terrainId:"terrain",mapId:"map",parentId:level>1?"parent":null,parentRevision:2,name:id,level,revision:2,frame,gridWidth:64,gridHeight:64,overviewLevels:1,updatedAt:"fixed"});
const plan=(m:RefinementMeta):DetailPlan=>({meta:m,lod:0,keys:[0,1,2,3]});
const view={left:360,right:440,top:360,bottom:440,width:800,height:800,scale:10};
async function accepted(cache:TerrainDetailCache,p:DetailPlan,value=1000){
 const samples=Array(1024).fill(value),sha256=await numericalChecksum(samples);
 await cache.accept(p,{refinement:p.meta,headRevision:p.meta.revision,lod:p.lod,tiles:p.keys.map(key=>({x:key%2,y:Math.floor(key/2),samples,mask:"0".repeat(256),sha256})),source:{kind:"manual"},acceptedRequestId:"accepted",rootRevision:2,seaLevel:0,canEdit:true});
}
test("only complete pinned finer coverage removes hidden parent presentation work",async()=>{
 let requests=0;const cache=new TerrainDetailCache(async()=>{requests++;throw Error("Presentation never requests data");}),parent=plan(meta("parent",1)),child=plan(meta("child",2,{x:300,y:300,width:200,height:200})),scene={cache,tick:0,plans:[child,parent]};
 assert.equal(visibleTerrainDetail(scene,view,world).covering,undefined);await accepted(cache,child);
 const visible=visibleTerrainDetail(scene,view,world);assert.equal(visible.covering?.meta.id,"child");assert.deepEqual(visible.plans,[child]);assert.equal(requests,0);
 const next={...child,meta:{...child.meta,revision:3}};assert.equal(visibleTerrainDetail({...scene,plans:[next,parent]},view,world).covering,undefined,"Another accepted revision cannot reuse completeness");cache.dispose();
});
test("refinement collars, incomplete batches and polar edges keep their parent available",async()=>{
 const cache=new TerrainDetailCache(async()=>{throw Error("No network");}),child=plan(meta("child",2,{x:300,y:300,width:200,height:200}));await accepted(cache,{...child,keys:[0]});
 assert.equal(visibleTerrainDetail({cache,tick:0,plans:[child]},view,world).covering,undefined);
 await accepted(cache,child);assert.equal(visibleTerrainDetail({cache,tick:1,plans:[child]},{...view,left:301,right:360},world).covering,undefined);
 const pole=plan(meta("pole",2,{x:300,y:0,width:200,height:200}));await accepted(cache,pole);assert.equal(visibleTerrainDetail({cache,tick:2,plans:[pole]},{...view,top:0,bottom:80},world).covering,undefined);cache.dispose();
});
test("safe wrapped coverage prunes parents while higher partial refinements remain",async()=>{
 const cache=new TerrainDetailCache(async()=>{throw Error("No network");}),child=plan(meta("wrapped",2,{x:950,y:300,width:100,height:200})),parent=plan(meta("parent",1)),partial=plan(meta("partial",3,{x:980,y:380,width:20,height:30}));await accepted(cache,child);
 const result=visibleTerrainDetail({cache,tick:0,plans:[partial,child,parent]},{...view,left:-30,right:30},{...world,wrap:true});assert.equal(result.covering?.meta.id,"wrapped");assert.deepEqual(result.plans,[partial,child]);cache.dispose();
});
test("working and saved presentation identities never cross accepted revisions",()=>{
 const p=plan(meta("fine",2));assert.notEqual(detailPresentationIdentity(p,false),detailPresentationIdentity(p,true));assert.notEqual(detailPresentationIdentity(p,false),detailPresentationIdentity({...p,meta:{...p.meta,revision:3}},false));
});
test("read-only numerical indexes share only exact validated cache entries",async()=>{
 const cache=new TerrainDetailCache(async()=>{throw Error("No network");}),p=plan(meta("fine",2));await accepted(cache,p);const scene={cache,tick:0,plans:[p]},index=detailNumericalTiles(scene,p);assert.equal(index.size,4);assert.equal(index.get(0),cache.peek(p.meta.id,p.meta.revision,p.lod,0));assert.equal(detailNumericalTiles(scene,{...p,meta:{...p.meta,revision:3}}).size,0);assert.equal(detailNumericalTiles(scene,{...p,lod:1}).size,0);cache.dispose();
});
test("edge feathering changes only temporary alpha, with exact opaque interiors and wrapped seams",()=>{
 const make=()=>({data:Uint8ClampedArray.from({length:32*32*4},(_,i)=>i%4===3?255:100+i%3),width:32,height:32}) as ImageData;
 const image=make(),before=image.data.slice();assert.equal(featherTerrainDetail(image,world,0,0),true);assert(image.data[3]<255);assert.equal(image.data[(10*32+10)*4+3],255);for(let i=0;i<image.data.length;i++)if(i%4!==3)assert.equal(image.data[i],before[i]);
 const interior=make(),copy=interior.data.slice();assert.equal(featherTerrainDetail(interior,world,0,0,{x:10,y:10,width:1,height:1,pixelsX:32,pixelsY:32}),false);assert.deepEqual(interior.data,copy);
 const wrapped=make();featherTerrainDetail(wrapped,{...world,wrap:true},0,16);assert.equal(wrapped.data[(10*32)*4+3],255);
});
test("richer numerical LOD is opt-in, source frames stay exact and the native tile budget remains",()=>{
 const m={...meta("fine",1,{x:0,y:0,width:6400,height:6400}),gridWidth:1024,gridHeight:1024,overviewLevels:5},v={...view,left:1000,top:1000,right:2000,bottom:2000,scale:.09};
 const normal=detailViewPlan([m],v,world),same=detailViewPlan([m],v,world,new Map(),1024,1),rich=detailViewPlan([m],v,world,new Map(),1024,2);assert.deepEqual(same,normal);assert(rich[0].lod<normal[0].lod);assert.deepEqual(rich[0].meta,m);
 const crowded=detailViewPlan(Array.from({length:8},(_,i)=>({...m,id:"source"+i})),{...v,left:0,top:0,right:6400,bottom:6400},world,new Map(),1024,2);assert(crowded.reduce((n,p)=>n+p.keys.length,0)<=1024);
 assert.deepEqual(["fast","balanced","detailed","maximum"].map(q=>scalarRasterBytes(q as Parameters<typeof scalarRasterBytes>[0])),[8,8,16,24].map(n=>n*1048576));
});
test("nested scalar presentation spends its visible budget on the finest source and honors quality bounds",async()=>{
 const beforeDocument=globalThis.document,beforeImage=globalThis.ImageData;globalThis.ImageData=class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}} as unknown as typeof ImageData;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({putImageData:()=>{}})})} as unknown as Document;
 try{
  const cache=new TerrainDetailCache(async()=>{throw Error("No network");}),parent=plan(meta("parent",1)),child=plan(meta("child",2,{x:300,y:300,width:200,height:200}));await accepted(cache,parent);await accepted(cache,child);
  const scene:TerrainDetailScene={cache,tick:1,plans:[child,parent]},root=new Int16Array(4096),painter=new TerrainDetailPainter();painter.sync(scene,world,0,CLASSIC_RELIEF,view,root,2,"maximum");assert.equal(painter.metrics.occludedSources,1);assert.equal(painter.metrics.visualDpr,2);
  let batches=0;while(painter.pending){painter.paint(world,0,CLASSIC_RELIEF,4);assert(++batches<4000);}assert(painter.bytes<=24*1048576);painter.sync(scene,world,0,CLASSIC_RELIEF,view,root,1,"balanced");assert(painter.bytes<=8*1048576,"A quality downgrade trims cached payload immediately");painter.clear();cache.dispose();
 }finally{globalThis.document=beforeDocument;globalThis.ImageData=beforeImage;}
});
