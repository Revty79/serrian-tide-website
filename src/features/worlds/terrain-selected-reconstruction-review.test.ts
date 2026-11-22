import assert from "node:assert/strict";
import test from "node:test";
import {createSelectedDryJoinReview,sharedReliefJoinReviewDataSchema,type SelectedDryJoinOptions,type SelectedReconstructionReview} from "./terrain-shared-relief-join-review";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {ADVANCED_TERRAIN_LIMITS,landformProfileSchema} from "./terrain-advanced-spec";
import {planSharedRelief,type SharedProfile} from "./terrain-shared-relief";
import {SELECTED_RECONSTRUCTION_TRACE_BYTES} from "./terrain-selected-reconstruction";

const rootId="40000000-0000-4000-8000-000000000001",fineId="40000000-0000-4000-8000-000000000002",frame={x:975,y:1000,width:1000,height:1000},
 source={id:fineId,revision:2,parentId:null,parentRevision:1,level:1,frame,columns:32,rows:32,contentHash:"a".repeat(64)},point={x:1975,y:1500},
 support={edge:"east" as const,index:16,before:200,after:225,outsideWorkArea:true},node={sourceId:rootId,beforeRevision:1,afterRevision:5,x:1900,y:1500,weight:.25,before:200,after:300};
function options():SelectedDryJoinOptions{return {allowReconstruction:true,context:{world:{width:3200,height:3200,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]},selection:{frame:{x:0,y:0,width:1950,height:3200}},workArea:{x:1800,y:1400,width:300,height:200},preserveManual:false,nativeCells:1024,workingBytes:1048576,work:()=>{}};}
const dry=(_p:{x:number;y:number},next:boolean):number=>next?225:200;
function evidence(sample=dry):SelectedReconstructionReview{return {supports:[{...node}],read:async()=>({frame:{x:0,y:0,width:3200,height:3200},columns:32,rows:32,sample})};}
async function add(o=options(),basis=evidence()){const review=createSelectedDryJoinReview(o);await review.add(source,point,support,1,5,dry,basis);return review;}

test("explicit reconstruction review retains the exact selected basis and charges cells and memory",async()=>{
 const review=await add(),result=review.review()!;assert.equal(result.reconstructionSupports,true);assert.deepEqual(result.sources[0].supports[0].reconstruction,[node]);assert.equal(review.samples(),2);assert.equal(review.workingBytes(),768);
 await assert.rejects(add({...options(),allowReconstruction:undefined}),/original selected outline/);assert.throws(()=>createSelectedDryJoinReview({...options(),preserveManual:true}),/manual heights protected/);
});
test("reconstruction evidence cannot move the selection, invent weights, repeat samples or reuse a revision",async()=>{
 const value=(await add()).review()!,edit=(change:(v:typeof value)=>void)=>{const v=structuredClone(value);change(v);assert.throws(()=>sharedReliefJoinReviewDataSchema.parse(v));};
 edit(v=>{delete v.reconstructionSupports;});edit(v=>{v.sources[0].supports[0].reconstruction![0].x=1960;});edit(v=>{v.sources[0].supports[0].reconstruction![0].weight=.5;});edit(v=>{v.sources[0].supports[0].reconstruction!.push({...node});});edit(v=>{v.sources[0].supports[0].reconstruction![0].beforeRevision=5;});edit(v=>{v.sources[0].supports[0].outsideWorkArea=false;});
});
test("contributing native sea neighbours remain protected even when the fine join is dry",async()=>{
 await assert.rejects(add(options(),evidence((p,next)=>p.x===1800?-500:dry(p,next))),/sea or shoreline/);
 const o=options();o.context.seaLevel=100;await assert.rejects(add(o,evidence((p,next)=>p.x===1800?100:dry(p,next))),/sea or shoreline/);
});
test("contributing native lake, wetland and settlement supports remain protected independently of the fine join",async()=>{
 const ring=[{x:1880,y:1480},{x:1920,y:1480},{x:1920,y:1520},{x:1880,y:1520}];
 const lake=options();lake.context.water.lakes=[{id:"retained",name:"Saved high lake",rings:[ring],levelM:3810,seed:{x:1900,y:1500},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];await assert.rejects(add(lake),/lake or wetland/);
 const wet=options();wet.context.water.features=[{kind:"wetland",rings:[ring]} as NonNullable<typeof wet.context.water.features>[number]];await assert.rejects(add(wet),/lake or wetland/);
 const site=options();site.context.sites=[{id:"saved",x:1900,y:1500}];await assert.rejects(add(site),/settlement support/);
});
test("new evidence counts toward unchanged native cell, memory and cooperative work limits",async()=>{
 await assert.rejects(add({...options(),nativeCells:ADVANCED_TERRAIN_LIMITS.cells-1}),/262,144/);
 await assert.rejects(add({...options(),workingBytes:ADVANCED_TERRAIN_LIMITS.workingBytes-767}),/32 MiB/);
 const o=options();let steps=0;o.work=n=>{steps+=n;if(steps>30)throw Error("Canceled reconstruction guards");};await assert.rejects(add(o),/Canceled reconstruction guards/);
});
test("optional support review reserves its trace workspace without changing legacy plans or numeric intent",()=>{
 const world={width:32,height:32,tileSize:32,displayWidth:3200,displayHeight:3200,min:-12000,max:12000,wrap:false},o=options(),operation:SharedProfile={kind:"landform-profile",selection:o.selection,points:[{x:1600,y:1400,elevationM:500,widthM:1000},{x:1900,y:1600,elevationM:500,widthM:1000}],mode:"minimum",preserveManual:false,strength:100,hardness:0,endBlendM:0,featherM:0},sources=[{id:null,revision:1,shape:world,frame:{x:0,y:0,width:3200,height:3200}}],context=o.context,
  legacy=planSharedRelief(sources,operation,o.workArea,context),absent=planSharedRelief(sources,{...operation,reviewDryReconstructionSupports:false},o.workArea,context),enabled=planSharedRelief(sources,{...operation,reviewDryBorderJoins:true,reviewDryReconstructionSupports:true},o.workArea,context);
 assert.deepEqual(legacy,absent);assert.equal(enabled.workingBytes-legacy.workingBytes,SELECTED_RECONSTRUCTION_TRACE_BYTES);assert.equal(enabled.cells,legacy.cells);assert.equal(enabled.sampleSteps,legacy.sampleSteps);assert.deepEqual(enabled.plans,legacy.plans);
 assert.throws(()=>landformProfileSchema.parse({...operation,reviewDryReconstructionSupports:true}),/complete dry border review/);
});
