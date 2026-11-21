import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {encodeSharedReliefPreview,decodeSharedReliefPreview,type SharedReliefPreview} from "./terrain-shared-relief-packet";
import {sharedReliefPreviewPlans} from "./terrain-shared-relief-preview-geometry";
import {parseSharedReliefDraft} from "./terrain-shared-relief-recovery";
import type {RefinementMeta} from "./terrain-refinement";
import {sharedReliefJoinReviewDataSchema} from "./terrain-shared-relief-join-review";
const id="10000000-0000-4000-8000-000000000001",mapId="10000000-0000-4000-8000-000000000002",worldId="10000000-0000-4000-8000-000000000003",frame={x:0,y:0,width:64000,height:38400};
const digest=(a:Int16Array)=>createHash("sha256").update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest("hex");
function preview():SharedReliefPreview{const before=new Int16Array(32*32).fill(500),after=before.slice();after[500]=3000;return {header:{version:1,worldId,mapId,terrainId:id,rootRevision:4,contextPin:"a".repeat(64),previewHash:"b".repeat(64),refinements:[],windows:[{id,sourceId:null,name:"Native World",level:0,revision:4,frame,sourceWidth:640,sourceHeight:384,x:32,y:32,width:32,height:32,beforeHash:digest(before),afterHash:digest(after),changed:1,maxLoweringM:0,maxRaisingM:2500}],effects:[{id,name:"Native World",revision:5,parentRevision:null,changed:1}],cells:1,sampleSteps:1,workingBytes:3000000,contextChanges:0,maxContextChangeM:0,elapsedMs:100,protected:0,waterProtected:0,siteProtected:0},windows:[{before,after}]};}
test("bounded native binary preview verifies all heights and refuses corruption, truncation and impossible windows",async()=>{
 const p=preview(),packet=encodeSharedReliefPreview(p),actual=await decodeSharedReliefPreview(packet.buffer as ArrayBuffer);assert.deepEqual(actual,p);
 const bad=packet.slice();bad[bad.length-20]^=1;await assert.rejects(decodeSharedReliefPreview(bad.buffer as ArrayBuffer),/checksum/);await assert.rejects(decodeSharedReliefPreview(packet.slice(0,-1).buffer as ArrayBuffer),/incomplete/);
 const outside=preview();outside.header.windows[0].x=640;assert.throws(()=>encodeSharedReliefPreview(outside),/outside/);
 const extra=new Uint8Array(packet.length+2);extra.set(packet);await assert.rejects(decodeSharedReliefPreview(extra.buffer),/incomplete/);
});
test("legacy 640 by 384 native preview plans contain only complete integer LOD tiles at every zoom",()=>{
 const world={width:640,height:384,tileSize:32,displayWidth:64000,displayHeight:38400,min:-30000,max:30000,wrap:true},meta:RefinementMeta={id,worldId,mapId,terrainId:id,name:"Original native World window",parentId:id,parentRevision:1,level:.5,revision:1,frame,gridWidth:640,gridHeight:384,overviewLevels:2,updatedAt:""};
 for(const scale of [.00001,.001,.01,.1,1,10]){const plans=sharedReliefPreviewPlans([meta],{left:0,top:0,right:64000,bottom:38400,scale,width:1000,height:600},world);for(const p of plans){assert(Number.isInteger(p.lod));assert(p.lod<=2);const cols=640/32/2**p.lod,rows=384/32/2**p.lod;assert(Number.isInteger(cols));assert(Number.isInteger(rows));assert(p.keys.every(k=>Number.isInteger(k)&&k>=0&&k<cols*rows));assert.equal(new Set(p.keys).size,p.keys.length);}}
});
test("native shared recovery binds an exact original request to its World and map",()=>{
 const operation={kind:"landform-profile",mode:"shape",selection:{frame},points:[{x:1000,y:1000,elevationM:1000,widthM:10000},{x:50000,y:30000,elevationM:2000,widthM:10000}],preserveManual:false,strength:100,hardness:0,endBlendM:0,featherM:0},pending={action:"accept",mapId,requestId:id,operation,workArea:frame,contextPin:"a".repeat(64),previewHash:"b".repeat(64)},value={version:1,worldId,mapId,operation,workArea:frame,pending},raw=JSON.stringify(value);
 assert.deepEqual(parseSharedReliefDraft(raw,worldId,mapId),value);assert.throws(()=>parseSharedReliefDraft(raw,mapId,mapId),/another World/);assert.throws(()=>parseSharedReliefDraft(raw,worldId,id),/another World/);
 assert.throws(()=>parseSharedReliefDraft(JSON.stringify({...value,pending:{...pending,mapId:id}}),worldId,mapId),/same native map/);
});

test("complete border metadata roundtrips and refuses changed evidence or mismatched source pins",async()=>{
 const p=preview(),fineId="10000000-0000-4000-8000-000000000004",fineFrame={x:1000,y:1000,width:1000,height:1000},
  data=sharedReliefJoinReviewDataSchema.parse({scope:"selected-dry",world:{width:64000,height:38400,wrap:false},selection:{frame},workArea:{x:3200,y:3200,width:3200,height:3200},seaLevel:0,sources:[{sourceId:fineId,frame:fineFrame,columns:32,rows:32,oldParentRevision:2,newParentRevision:5,supports:[{edge:"east",index:16,before:200,after:300,outsideWorkArea:true}]}]});
 p.header.refinements.push({id:fineId,worldId,mapId,terrainId:id,name:"Retained native border",parentId:null,parentRevision:2,level:1,revision:2,frame:fineFrame,gridWidth:32,gridHeight:32,overviewLevels:0,updatedAt:""});
 p.header.effects.push({id:fineId,name:"Retained native border",revision:3,parentRevision:5,changed:0});p.header.cells=2;p.header.contextChanges=1;p.header.maxContextChangeM=100;
 p.header.joinReview={...data,reviewHash:createHash("sha256").update(JSON.stringify(data)).digest("hex")};
 const packet=encodeSharedReliefPreview(p);assert.deepEqual(await decodeSharedReliefPreview(packet.buffer as ArrayBuffer),p);
 const changed=structuredClone(p);changed.header.joinReview!.sources[0].supports[0].after=301;await assert.rejects(decodeSharedReliefPreview(encodeSharedReliefPreview(changed).buffer as ArrayBuffer),/border review failed its checksum/);
 const wrongPin=structuredClone(p);wrongPin.header.refinements[0].parentRevision=3;await assert.rejects(decodeSharedReliefPreview(encodeSharedReliefPreview(wrongPin).buffer as ArrayBuffer),/does not match/);
 const tooLarge=structuredClone(p);tooLarge.header.cells=0;assert.throws(()=>encodeSharedReliefPreview(tooLarge),/existing numerical memory bound/);
});

test("explicit border-review intent stays bound to the exact native recovery and retry request",()=>{
 const operation={kind:"landform-profile",mode:"minimum",selection:{frame},points:[{x:1000,y:1000,elevationM:1000,widthM:10000},{x:50000,y:30000,elevationM:2000,widthM:10000}],preserveManual:false,strength:100,hardness:0,endBlendM:0,featherM:0,reviewDryBorderJoins:true},pending={action:"accept",mapId,requestId:id,operation,workArea:frame,contextPin:"a".repeat(64),previewHash:"b".repeat(64)},value={version:1,worldId,mapId,operation,workArea:frame,pending};
 assert.deepEqual(parseSharedReliefDraft(JSON.stringify(value),worldId,mapId),value);assert.equal(parseSharedReliefDraft(JSON.stringify(value),worldId,mapId).pending?.action,"accept");
});

test("protected-bank review counters roundtrip and refuse altered or out-of-bound evidence",async()=>{
 const p=preview(),data={conflictingSupports:113,maximumStepM:183};p.header.bankReinforcement={...data,reviewHash:createHash("sha256").update(JSON.stringify(data)).digest("hex")};assert.deepEqual(await decodeSharedReliefPreview(encodeSharedReliefPreview(p).buffer as ArrayBuffer),p);
 const changed=structuredClone(p);changed.header.bankReinforcement!.conflictingSupports++;await assert.rejects(decodeSharedReliefPreview(encodeSharedReliefPreview(changed).buffer as ArrayBuffer),/protected-bank review failed its checksum/);
 for(const change of [{conflictingSupports:8388609},{maximumStepM:60001},{maximumStepM:NaN}]){const invalid=structuredClone(p);Object.assign(invalid.header.bankReinforcement!,change);assert.throws(()=>encodeSharedReliefPreview(invalid));}
});
test("explicit reinforced erosion and its fill limit survive exact shared recovery and retry",()=>{
 const operation={kind:"erosion",selection:{frame},preserveManual:false,strength:100,model:"thermal",iterations:40,direction:90,directionInfluence:.6,deposition:false,maxDepthM:2000,reposeDegrees:30,featherM:2000,preserveShoreline:true,outflowRate:4,bankReinforcementM:200},pending={action:"accept",mapId,requestId:id,operation,workArea:frame,contextPin:"a".repeat(64),previewHash:"b".repeat(64)},value={version:1,worldId,mapId,operation,workArea:frame,pending};assert.deepEqual(parseSharedReliefDraft(JSON.stringify(value),worldId,mapId,"erosion"),value);
 const changedDraft=JSON.parse(JSON.stringify(value)) as typeof value;changedDraft.operation.bankReinforcementM=201;const recovered=parseSharedReliefDraft(JSON.stringify(changedDraft),worldId,mapId,"erosion");assert.deepEqual(recovered.pending,value.pending);assert.deepEqual(recovered.operation,changedDraft.operation);
});
