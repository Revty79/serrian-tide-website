import assert from "node:assert/strict";
import test from "node:test";
import {createSelectedDryJoinReview,sharedReliefJoinReviewDataSchema,type SelectedDryJoinOptions} from "./terrain-shared-relief-join-review";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import type {SharedReliefSnapshot} from "./terrain-shared-relief-spec";

const source:SharedReliefSnapshot={id:"00000000-0000-4000-8000-000000000002",revision:2,parentId:null,parentRevision:1,level:1,frame:{x:1000,y:1000,width:1000,height:1000},columns:32,rows:32,contentHash:"a".repeat(64)},
 point={x:2000,y:1500},support={edge:"east" as const,index:16,before:200,after:300,outsideWorkArea:true};
function options():SelectedDryJoinOptions{return {context:{world:{width:10000,height:10000,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]},selection:{frame:{x:0,y:0,width:10000,height:10000}},workArea:{x:1400,y:1400,width:200,height:200},preserveManual:false,nativeCells:1024,workingBytes:1048576,work:()=>{}};}
const sample=(_:{x:number;y:number},next:boolean):number=>next?300:200;
const add=(review:ReturnType<typeof createSelectedDryJoinReview>,read=sample)=>review.add(source,point,support,1,5,read);

test("protected water context construction charges geometry and observes cancellation before reading rings",()=>{
 const ring=[{x:100,y:100},{x:200,y:100},{x:200,y:200},{x:100,y:200}];
 for(const wrap of [false,true]){const o=options();o.context.world.wrap=wrap;o.context.water.features=[{kind:"wetland",rings:[ring]} as NonNullable<typeof o.context.water.features>[number]];let work=0;o.work=n=>{work+=n;};const before=structuredClone(o.context);createSelectedDryJoinReview(o);assert.equal(work,15);assert.deepEqual(o.context,before);}
 const canceled=options(),unread={kind:"wetland",rings:[ring]} as NonNullable<typeof canceled.context.water.features>[number];Object.defineProperty(unread,"rings",{get(){assert.fail("Canceled context must not read or flatten shoreline geometry");}});canceled.context.water.features=[unread];canceled.work=()=>{throw Error("Canceled water context");};assert.throws(()=>createSelectedDryJoinReview(canceled),/Canceled water context/);
});

test("selected dry review retains every changed support and leaves native inputs untouched",async()=>{
 const o=options(),before=structuredClone(o.context),s=structuredClone(source);let steps=0;o.work=n=>{steps+=n;};const review=createSelectedDryJoinReview(o);await add(review);
 const result=review.review()!;assert.equal(result.scope,"selected-dry");assert.deepEqual(result.sources[0].supports,[support]);assert.equal(result.sources[0].oldParentRevision,1);assert.equal(result.sources[0].newParentRevision,5);assert.equal(review.samples(),1);assert.equal(review.workingBytes(),512);assert(steps>=19);assert.deepEqual(o.context,before);assert.deepEqual(source,s);
});

test("selection and a concave original polygon remain hard geographic boundaries",async()=>{
 const o=options();o.selection={frame:{x:0,y:0,width:1900,height:10000}};await assert.rejects(add(createSelectedDryJoinReview(o)),/original selected outline/);
 const p=options();p.selection={frame:{x:0,y:0,width:10000,height:10000},footprint:{version:1,kind:"polygon",parts:[[{x:0,y:0},{x:10000,y:0},{x:10000,y:10000},{x:2100,y:10000},{x:2100,y:1400},{x:1900,y:1400},{x:1900,y:10000},{x:0,y:10000}]]}};
 await assert.rejects(add(createSelectedDryJoinReview(p)),/original selected outline/);
});

test("saved sea and eight-neighbour shores refuse even when the support itself stays dry",async()=>{
 await assert.rejects(add(createSelectedDryJoinReview(options()),(p,next)=>p.x>2000?0:sample(p,next)),/sea or shoreline/);
 const o=options();o.context.seaLevel=100;await assert.rejects(add(createSelectedDryJoinReview(o),(p,next)=>p.y>1500?100:sample(p,next)),/sea or shoreline/);
 const review=createSelectedDryJoinReview(options());await assert.rejects(review.add(source,point,{...support,before:0},1,5,sample),/retained sea/);
});

test("standing lakes and wetlands protect ground independently of construction height or water level",async()=>{
 const ring=[{x:1980,y:1480},{x:2020,y:1480},{x:2020,y:1520},{x:1980,y:1520}],o=options();
 o.context.water.lakes=[{id:"lake",name:"Saved high lake",rings:[ring],levelM:3810,seed:{x:2000,y:1500},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
 await assert.rejects(add(createSelectedDryJoinReview(o)),/lake or wetland/);
 const wet=options();wet.context.water.features=[{kind:"wetland",rings:[ring]} as NonNullable<typeof wet.context.water.features>[number]];await assert.rejects(add(createSelectedDryJoinReview(wet)),/lake or wetland/);
});

test("settlement support collars and explicit manual protection remain authoritative",async()=>{
 const o=options();o.context.sites=[{id:"site",x:1995,y:1500}];await assert.rejects(add(createSelectedDryJoinReview(o)),/settlement support/);
 assert.throws(()=>createSelectedDryJoinReview({...options(),preserveManual:true}),/manual heights protected/);
});

test("combined cells, review memory and counted work refuse before retaining a support",async()=>{
 const cells=createSelectedDryJoinReview({...options(),nativeCells:ADVANCED_TERRAIN_LIMITS.cells});await assert.rejects(add(cells),/262,144/);assert.equal(cells.samples(),0);
 const memory=createSelectedDryJoinReview({...options(),workingBytes:ADVANCED_TERRAIN_LIMITS.workingBytes});await assert.rejects(add(memory),/32 MiB/);assert.equal(memory.samples(),0);
 const o=options();let work=0;o.work=n=>{work+=n;if(work>8)throw Error("Canceled bounded work");};const canceled=createSelectedDryJoinReview(o);await assert.rejects(add(canceled),/Canceled bounded work/);assert.equal(canceled.samples(),0);
});

test("review schema refuses duplicate, stale scope, wet or omitted outside-context evidence",async()=>{
 const review=createSelectedDryJoinReview(options());await add(review);const value=review.review()!;
 for(const invalid of [
  {...value,sources:[...value.sources,...value.sources]},
  {...value,sources:[{...value.sources[0],supports:[support,support]}]},
  {...value,sources:[{...value.sources[0],supports:[{...support,before:0}]}]},
  {...value,sources:[{...value.sources[0],supports:[{...support,outsideWorkArea:false}]}]},
  {...value,sources:[{...value.sources[0],supports:[{...support,index:33}]}]},
 ])assert.throws(()=>sharedReliefJoinReviewDataSchema.parse(invalid));
});

test("wrapped joins retain their canonical native position without a seam substitute",async()=>{
 const o=options();o.context.world.wrap=true;const s={...source,frame:{...source.frame,x:9500}},review=createSelectedDryJoinReview(o);await review.add(s,{x:500,y:1500},support,1,5,sample);
 assert.equal(review.review()!.sources[0].frame.x,9500);assert.deepEqual(review.review()!.sources[0].supports,[support]);
});
