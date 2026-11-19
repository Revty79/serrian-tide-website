import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {encodeSharedReliefPreview,decodeSharedReliefPreview,type SharedReliefPreview} from "./terrain-shared-relief-packet";
import {sharedReliefPreviewPlans} from "./terrain-shared-relief-preview-geometry";
import {parseSharedReliefDraft} from "./terrain-shared-relief-recovery";
import type {RefinementMeta} from "./terrain-refinement";
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
