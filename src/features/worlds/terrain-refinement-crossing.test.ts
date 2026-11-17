import assert from "node:assert/strict";
import test from "node:test";
import {terrainGeometry,terrainSettingsSchema} from "./terrain";
import {initializeRefinement,refinementCreateSchema,rootFrame,terrainEditMask,type RefinementMeta} from "./terrain-refinement";
import {crossingRefinementLevel,isCrossingRefinement,refinementOccluders} from "./terrain-refinement-crossing";

const world=terrainGeometry(terrainSettingsSchema.parse({widthKm:3200,heightKm:1600,gridWidth:640,gridHeight:384,wrap:true}));
const original:RefinementMeta={id:"old",worldId:"world",terrainId:"root",mapId:"map",name:"Original area",parentId:null,parentRevision:1,level:1,revision:2,frame:{x:500000,y:400000,width:128000,height:64000},gridWidth:128,gridHeight:64,overviewLevels:1,updatedAt:""};
const frame={x:470000,y:420000,width:64000,height:32000};
test("explicit crossing precedence spans a boundary without changing numerical parentage",()=>{
 assert.equal(crossingRefinementLevel(frame,128,64,world,[original]),2);
 const crossing={...original,id:"crossing",parentId:null,level:2,frame,gridWidth:128,gridHeight:64};
 assert(isCrossingRefinement(crossing));assert(!isCrossingRefinement(original));
 assert.equal(crossing.parentId,null);assert.equal(crossing.parentRevision,1);
});
test("crossing requires genuine overlap, finer samples on both axes and the existing depth bound",()=>{
 assert.throws(()=>crossingRefinementLevel({...frame,x:800000},128,64,world,[original]),/ordinary/);
 assert.throws(()=>crossingRefinementLevel(frame,32,64,world,[original]),/twice/);
 assert.throws(()=>crossingRefinementLevel(frame,128,32,world,[original]),/twice/);
 assert.throws(()=>crossingRefinementLevel(frame,128,64,world,[{...original,level:8}]),/eight/);
 assert.throws(()=>crossingRefinementLevel({...frame,y:1590000},128,64,world,[original]),/edges/);
});
test("crossing detects seam overlap using the established World wrap convention",()=>{
 const edge={...original,frame:{x:3170000,y:400000,width:64000,height:64000},gridWidth:64};
 assert.equal(crossingRefinementLevel({...frame,x:3190000,width:64000},128,64,world,[edge]),2);
});
test("overlapping parent terrain is protected even when the finer area has another numerical parent",()=>{
 const crossing={...original,id:"crossing",level:2,frame,gridWidth:128,gridHeight:64};
 assert.deepEqual(refinementOccluders([original,crossing],original.id),[crossing]);
 const shape={...world,width:128,height:64,displayWidth:original.frame.width,displayHeight:original.frame.height,wrap:false};
 const mask=terrainEditMask(shape,original.frame,refinementOccluders([original,crossing],original.id),world,true);
 assert.equal(mask[30*128+10],1);assert.equal(mask[30*128+100],0);
 assert.deepEqual(refinementOccluders([original,crossing],crossing.id),[]);
 assert.deepEqual(refinementOccluders([],crossing.id),[]);
});
test("crossing preview inherits the explicit pinned World base, including coarse land",()=>{
 const base=new Int16Array(world.width*world.height).fill(-500);base[105*world.width+100]=200;
 const saved=base.slice(),actual=initializeRefinement(base,world,rootFrame(world),frame,128,64,world);
 assert(actual.some(v=>v!==-500));assert.deepEqual(base,saved);
});
test("crossing extension retains priority and refuses new same or finer overlap",()=>{
 const crossing={...original,id:"crossing",level:2,frame,gridWidth:128,gridHeight:64};
 const grown={...frame,width:128000};
 assert.equal(crossingRefinementLevel(grown,256,64,world,[original,crossing],crossing),2);
 assert.throws(()=>crossingRefinementLevel(grown,256,64,world,[original,crossing,{...original,id:"other",level:2}],crossing),/same or a finer/);
});

const command={action:"create",requestId:"43000000-0000-4000-8000-000000000011",mapId:"43000000-0000-4000-8000-000000000012",parentId:null,parentRevision:1,name:"Synthetic crossing",acrossExisting:true,frame,gridWidth:128,gridHeight:64,previewHash:"0".repeat(64)};
test("original crossing acceptance retains the real bounded native revision vector",()=>{
 const sourceState="1;43000000-0000-4000-8000-000000000013:2";
 assert.equal(refinementCreateSchema.parse({...command,sourceState}).sourceState,sourceState);
 assert.throws(()=>refinementCreateSchema.parse(command),/accepted source state/);
 assert.throws(()=>refinementCreateSchema.parse({...command,sourceState:"x".repeat(8193)}));
});
test("ordinary creation remains compatible without a crossing revision vector",()=>{
 const {acrossExisting,...ordinary}=command;assert(acrossExisting);
 assert.equal(refinementCreateSchema.parse(ordinary).sourceState,undefined);
 assert.throws(()=>refinementCreateSchema.parse({...command,sourceState:"1",parentId:"43000000-0000-4000-8000-000000000013"}),/Whole World/);
});
