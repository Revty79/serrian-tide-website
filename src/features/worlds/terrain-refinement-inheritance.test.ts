import assert from "node:assert/strict";
import test from "node:test";
import {terrainCommandSchema,terrainGeometry,terrainSettingsSchema} from "./terrain";
import {refinementCreateSchema,type RefinementMeta} from "./terrain-refinement";
import {acceptedRefinementSources,initializeAcceptedRefinement,refinementInheritance} from "./terrain-refinement-inheritance";
import {refinementInheritanceSchema} from "./terrain-refinement-inheritance-spec";
import {terrainSourceSchema} from "./terrain-source";
import {canonGeographyRow} from "./world-canon-geography";

const world=terrainGeometry(terrainSettingsSchema.parse({widthKm:3200,heightKm:1600,wrap:true})),frame={x:470000,y:420000,width:64000,height:32000};
const west:RefinementMeta={id:"43000000-0000-4000-8000-000000000001",worldId:"world",terrainId:"root",mapId:"map",name:"West",parentId:null,parentRevision:1,revision:2,level:1,frame:{x:372000,y:400000,width:128000,height:64000},gridWidth:128,gridHeight:64,overviewLevels:1,updatedAt:""};
const east:RefinementMeta={...west,id:"43000000-0000-4000-8000-000000000002",name:"East",frame:{...west.frame,x:500000}};
const base=()=>new Int16Array(world.width*world.height).fill(-500);
const constant=(meta:RefinementMeta)=>new Int16Array(meta.gridWidth*meta.gridHeight).fill(meta.id===west.id?200:600);

test("accepted crossing retains both native surfaces across their shared boundary",async()=>{
 const root=base(),saved=root.slice(),grid=await initializeAcceptedRefinement(root,world,frame,128,64,[east,west],async meta=>constant(meta));
 for(let y=0;y<64;y++)for(let x=0;x<128;x++)assert.equal(grid[y*128+x],frame.x+x/128*frame.width<500000?200:600);
 assert.deepEqual(root,saved);
});
test("crossing gaps retain the pinned World base without inventing fine geography",async()=>{
 const gap={...east,frame:{...east.frame,x:510000}},grid=await initializeAcceptedRefinement(base(),world,frame,128,64,[west,gap],async meta=>constant(meta));
 assert.equal(grid[32*128+40],200);assert.equal(grid[32*128+70],-500);assert.equal(grid[32*128+100],600);
});
test("higher accepted detail wins independently of source index ordering",async()=>{
 const child={...east,id:"43000000-0000-4000-8000-000000000003",parentId:east.id,parentRevision:2,level:2,frame:{x:510000,y:424000,width:16000,height:8000},gridWidth:64,gridHeight:32};
 const load=async(meta:RefinementMeta)=>new Int16Array(meta.gridWidth*meta.gridHeight).fill(meta.id===child.id?950:meta.id===west.id?200:600);
 const a=await initializeAcceptedRefinement(base(),world,frame,512,256,[child,east,west],load),b=await initializeAcceptedRefinement(base(),world,frame,512,256,[west,child,east],load);assert.deepEqual(a,b);assert.equal(a[64*512+384],950);assert.equal(a[180*512+384],600);
});
test("accepted inheritance follows the established wrapped coordinate convention",async()=>{
 const source={...west,frame:{x:3190000,y:400000,width:64000,height:64000},gridWidth:64};
 const grid=await initializeAcceptedRefinement(base(),world,{...frame,x:3180000},128,64,[source],async meta=>constant(meta));assert.equal(grid[10],-500);assert.equal(grid[40],200);assert.equal(grid[127],200);
 const split={...source,frame:{...source.frame,x:3000000,width:1000000}},reports:number[]=[];
 const wrapped=await initializeAcceptedRefinement(base(),world,{...frame,x:500000,width:3000000},2048,64,[split],async meta=>constant(meta),value=>reports.push(value));
 assert.equal(wrapped[10],200);assert.equal(wrapped[600],-500);assert.equal(wrapped[2000],200);assert(reports.every((value,index)=>!index||value>=reports[index-1]));assert.equal(reports.at(-1),1);
});
test("cancelled or incomplete accepted loads cannot yield an accepted surface",async()=>{
 const root=base(),before=root.slice(),controller=new AbortController();await assert.rejects(initializeAcceptedRefinement(root,world,frame,128,64,[west],async meta=>{controller.abort();return constant(meta);},undefined,controller.signal),/canceled/);assert.deepEqual(root,before);
 await assert.rejects(initializeAcceptedRefinement(root,world,frame,128,64,[west],async()=>new Int16Array(1)),/incomplete/);
});
test("existing index, numerical resolution and overlap bounds remain enforced",async()=>{
 assert.throws(()=>acceptedRefinementSources(frame,[west,west],world),/index/);
 await assert.rejects(initializeAcceptedRefinement(base(),world,frame,32,64,[west],async meta=>constant(meta)),/twice/);
 await assert.rejects(initializeAcceptedRefinement(base(),world,{...frame,x:2000000},128,64,[west],async meta=>constant(meta)),/ordinary/);
});
const command={action:"create",requestId:"43000000-0000-4000-8000-000000000011",mapId:"43000000-0000-4000-8000-000000000012",parentId:null,parentRevision:1,name:"Retained crossing",acrossExisting:true,inheritExisting:true,sourceState:"1;"+west.id+":2",frame,gridWidth:128,gridHeight:64,previewHash:"0".repeat(64)};
test("keeping existing terrain is explicit and survives original-request parsing",()=>{
 assert.equal(refinementCreateSchema.parse(command).inheritExisting,true);const {acrossExisting,...ordinary}=command;assert(acrossExisting);assert.throws(()=>refinementCreateSchema.parse(ordinary),/explicit crossing/);assert.equal(refinementCreateSchema.parse({...ordinary,inheritExisting:undefined}).inheritExisting,undefined);
});
test("native inheritance provenance is immutable evidence and cannot be forged by a save or leaked by ordinary copy",()=>{
 const sources=structuredClone([west,east]),inheritance=refinementInheritance(1,command.sourceState,sources);sources[0].frame.x++;assert.equal(inheritance.sources[0].frame.x,west.frame.x);assert.deepEqual(refinementInheritanceSchema.parse(inheritance),inheritance);const source={kind:"manual",inheritance};assert.deepEqual(terrainSourceSchema.parse(source),source);
 assert.throws(()=>terrainCommandSchema.parse({action:"save",requestId:command.requestId,mapId:command.mapId,revision:2,seaLevel:0,source,tiles:[]}),/checked native/);
 assert.deepEqual(canonGeographyRow("world_terrain_refinement_version",{source},"player").source,{kind:"manual"});
});
