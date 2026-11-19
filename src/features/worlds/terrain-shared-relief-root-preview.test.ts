import test from "node:test";
import assert from "node:assert/strict";
import {sharedReliefRootPreview} from "./terrain-shared-relief-root-preview";
import {sampleTerrainGrid} from "./terrain-refinement";
import {planSharedRelief,type SharedProfile} from "./terrain-shared-relief";
import type {SharedReliefPreview} from "./terrain-shared-relief-packet";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
test("a cropped Root proposal keeps native wrapped seam sampling and preserves every outside height",()=>{
 const shape={width:128,height:128,tileSize:32,displayWidth:12800,displayHeight:12800,min:-30000,max:30000,wrap:true},base=new Int16Array(128*128).fill(500),after=new Int16Array(128*32).fill(500);after[16*128]=3000;
 const proposal={header:{windows:[{sourceId:null,sourceWidth:128,sourceHeight:128,x:0,y:32,width:128,height:32}]},windows:[{before:new Int16Array(128*32).fill(500),after}]} as SharedReliefPreview,
  displayed=sharedReliefRootPreview(base,shape,proposal,false);
 assert.equal(sampleTerrainGrid(displayed,shape,12799,4800),2974.9999999999873);assert.equal(sampleTerrainGrid(after,{...shape,height:32,displayHeight:3200,wrap:false},12799,1600),500);
 for(let i=0;i<displayed.length;i++)assert.equal(displayed[i],i===48*128?3000:500);assert(base.every(n=>n===500));assert.equal(sharedReliefRootPreview(base,shape,proposal,true),base);
 const whole={header:{windows:[{sourceId:null,sourceWidth:128,sourceHeight:128,x:0,y:0,width:128,height:128}]},windows:[{before:base,after:displayed}]} as SharedReliefPreview;assert.equal(sharedReliefRootPreview(base,shape,whole,false),displayed);
});
test("shared admission reserves the optional original-resolution Root preview copy within 32 MiB",()=>{
 const shape={width:512,height:512,tileSize:32,displayWidth:12800,displayHeight:12800,min:-30000,max:30000,wrap:true},operation:SharedProfile={kind:"landform-profile",mode:"shape",selection:{frame:{x:0,y:5000,width:1000,height:1000}},points:[{x:100,y:5100,elevationM:3000,widthM:1000},{x:900,y:5900,elevationM:3000,widthM:1000}],preserveManual:false,strength:100,hardness:0,endBlendM:0,featherM:0},
  budget=planSharedRelief([{id:null,revision:1,shape,frame:{x:0,y:0,width:12800,height:12800}}],operation,operation.selection.frame,{world:{width:12800,height:12800,wrap:true},seaLevel:0,water:EMPTY_HYDROLOGY,sites:[],volcanoes:[]});
 assert.equal(budget.rootPreviewBytes,512*512*2);assert(budget.workingBytes<32*1048576);assert(budget.workingBytes>=budget.rootPreviewBytes+budget.binaryBytes);
});
