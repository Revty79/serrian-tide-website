import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {terrainCommandSchema} from "./terrain";
import {terrainSourceState,advanceTerrainSourceState,regionCreateSchema} from "./terrain-regions";
import {parseTerrainRecovery} from "./terrain-recovery";
import {terrainTransferHeaderSchema} from "./terrain-transfer";
import {refinementCreateSchema,type RefinementMeta} from "./terrain-refinement";
import {refinementExpansionSchema} from "./terrain-refinement-expansion";
import {regionalAuthoringSchema} from "./terrain-regional-scope";
import {refinementInheritanceSchema} from "./terrain-refinement-inheritance-spec";
import {environmentLayerSchema,EMPTY_ENVIRONMENT,encodeEnvironment} from "./terrain-environment";
import {savedElevationListSchema} from "./terrain-saved-elevations";
import {hydroAnalysisSchema,hydroLakeSchema} from "./terrain-hydrology";
import {waterFeatureSchema} from "./terrain-water-feature-schema";
import {encodeSharedReliefPreview,decodeSharedReliefPreview,type SharedReliefPreview} from "./terrain-shared-relief-packet";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import {LEGACY_TERRAIN_REFINEMENT_LIMIT,TERRAIN_REFINEMENT_LIMIT,TERRAIN_SOURCE_LIMIT,TERRAIN_SOURCE_STATE_CHARACTERS} from "./terrain-source-limits";
const id=(n:number)=>"10000000-0000-4000-8000-"+n.toString(16).padStart(12,"0"),worldId=id(1000),mapId=id(1001),terrainId=id(1002),frame={x:0,y:0,width:64000,height:38400};
const refs=Array.from({length:256},(_,i)=>({id:id(i+1),revision:Number.MAX_SAFE_INTEGER}));
const state=terrainSourceState(Number.MAX_SAFE_INTEGER,refs);
test("complete256-source revision vectors survive save, transfer, native recovery, region creation and saved-elevation reads",()=>{
 assert.equal(LEGACY_TERRAIN_REFINEMENT_LIMIT,128);assert.equal(TERRAIN_REFINEMENT_LIMIT,256);assert.equal(TERRAIN_SOURCE_LIMIT,257);
 assert(state.length>8192&&state.length<TERRAIN_SOURCE_STATE_CHARACTERS);
 assert.equal(state,terrainSourceState(Number.MAX_SAFE_INTEGER,[...refs].reverse()));
 const save={action:"save",requestId:id(999),mapId,revision:1,seaLevel:0,sourceState:state};
 const region={action:"create-region",requestId:id(998),parentMapId:mapId,terrainId,parentRevision:1,sourceRevision:1,sourceState:state,name:"U.S. regional test",frame};
 const recovery={key:"owned-test",sourceState:state,revision:1,seaLevel:0,tiles:[],savedAt:new Date(0).toISOString(),pending:{requestId:id(999),revision:1,seaLevel:0,sourceState:state,tiles:[]}};
 const create={action:"create",requestId:id(997),mapId,parentId:null,parentRevision:1,name:"New U.S. detail",acrossExisting:true,sourceState:state,frame,gridWidth:32,gridHeight:32,previewHash:"a".repeat(64)};
 const elevations={worldId,mapId,terrainId,headRevision:1,sourceState:state,waterRevision:0,width:640,height:384,versions:[]};
 for(const parse of [
  (v:string)=>{const value=terrainCommandSchema.parse({...save,sourceState:v,tiles:[]});assert(value.action==="save");return value.sourceState;},
  (v:string)=>{const value=terrainTransferHeaderSchema.parse({...save,sourceState:v});assert(value.action==="save");return value.sourceState;},
  (v:string)=>regionCreateSchema.parse({...region,sourceState:v}).sourceState,
  (v:string)=>parseTerrainRecovery({...recovery,sourceState:v,pending:{...recovery.pending,sourceState:v}},"owned-test").pending!.sourceState,
  (v:string)=>refinementCreateSchema.parse({...create,sourceState:v}).sourceState,
  (v:string)=>refinementExpansionSchema.parse({action:"expand",requestId:id(996),mapId,refinementId:id(1),revision:1,parentRevision:1,sourceState:v,gridWidth:64,gridHeight:32,columnsToWest:32,rowsToNorth:0,previewHash:"a".repeat(64)}).sourceState,
  (v:string)=>regionalAuthoringSchema.parse({version:1,regionMapId:id(995),parentMapId:mapId,terrainId,regionRevision:1,sourceState:v}).sourceState,
  (v:string)=>refinementInheritanceSchema.parse({version:1,rootRevision:Number.MAX_SAFE_INTEGER,sourceState:v,sources:preview().header.refinements.map(({id,revision,parentId,parentRevision,level,frame,gridWidth,gridHeight})=>({id,revision,parentId,parentRevision,level,frame,gridWidth,gridHeight}))}).sourceState,
  (v:string)=>savedElevationListSchema.parse({...elevations,sourceState:v}).sourceState,
 ]){assert.equal(parse(state),state);assert.throws(()=>parse("x".repeat(TERRAIN_SOURCE_STATE_CHARACTERS+1)));}
 const advanced=advanceTerrainSourceState(state,id(128),7)!;
 assert.equal(advanced.split(";").length,257);assert.equal(advanced.split(";").filter(v=>v===id(128)+":7").length,1);
 for(const ref of refs.filter(v=>v.id!==id(128)))assert(advanced.includes(ref.id+":"+ref.revision));
});
test("water analyses, climate fields and authored features retain every257 native pin and refuse258",()=>{
 const pins=Array.from({length:257},(_,i)=>({id:id(i),revision:1,lod:0,contentHash:"a".repeat(64),spacingX:1,spacingY:1}));
 const analysis={id:"owned-drainage",method:"terrain-drainage-v1",fingerprint:"b".repeat(64),rootRevision:1,runoff:"uniform-contributing-land-area",minimumAreaM2:100,focus:frame,pins};
 assert.deepEqual(hydroAnalysisSchema.parse(analysis).pins,pins);
 assert.throws(()=>hydroAnalysisSchema.parse({...analysis,pins:[...pins,pins[0]]}));
 const common={id:"owned-water",name:"Owned spring",description:"",flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:pins.map(v=>v.id),authoredPins:pins,review:false};
 const spring={...common,kind:"spring",point:{x:1,y:1},riverId:null};
 assert.deepEqual(waterFeatureSchema.parse(spring).authoredPins,pins);
 assert.throws(()=>waterFeatureSchema.parse({...spring,sourceIds:[...common.sourceIds,id(999)]}));
 const lake={...common,rings:[[{x:1,y:1},{x:2,y:1},{x:2,y:2}]],levelM:10,seed:{x:1.5,y:1.5},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null};
 const {description,...lakeInput}=lake;void description;
 assert.deepEqual(hydroLakeSchema.parse(lakeInput).authoredPins,pins);
 assert.throws(()=>hydroLakeSchema.parse({...lakeInput,authoredPins:[...pins,pins[0]]}));
 const field={id:id(500),contextId:null,frame,width:16,height:16,fingerprint:"a".repeat(64),rootRevision:1,seaLevel:0,waterRevision:0,pins,settings:EMPTY_ENVIRONMENT.settings,data:encodeEnvironment(new Uint8Array(16*16*7))};
 assert.deepEqual(environmentLayerSchema.parse({...EMPTY_ENVIRONMENT,fields:[field]}).fields[0].pins,pins);
 assert.throws(()=>environmentLayerSchema.parse({...EMPTY_ENVIRONMENT,fields:[{...field,pins:[...pins,pins[0]]}]}));
});
function preview():SharedReliefPreview{
 const before=new Int16Array(1024).fill(500),after=before.slice();after[500]=501;
 const digest=(g:Int16Array)=>createHash("sha256").update(new Uint8Array(g.buffer)).digest("hex");
 const refinements:RefinementMeta[]=refs.map((v,i)=>({...v,worldId,mapId,terrainId,name:"U.S. native area "+i,parentId:null,parentRevision:1,level:1,frame:{x:i*100,y:0,width:100,height:100},gridWidth:32,gridHeight:32,overviewLevels:0,updatedAt:""}));
 return {header:{version:1,worldId,mapId,terrainId,rootRevision:1,contextPin:"a".repeat(64),previewHash:"b".repeat(64),refinements,windows:[{id:terrainId,sourceId:null,name:"Native World",level:0,revision:1,frame,sourceWidth:640,sourceHeight:384,x:0,y:0,width:32,height:32,beforeHash:digest(before),afterHash:digest(after),changed:1,maxLoweringM:0,maxRaisingM:1}],effects:[{id:terrainId,name:"Native World",revision:2,parentRevision:null,changed:1}],cells:1,sampleSteps:1,workingBytes:32768,contextChanges:0,maxContextChangeM:0,elapsedMs:0,protected:0,waterProtected:0,siteProtected:0},windows:[{before,after}]};
}
test("native preview transports a complete256-source index without enlarging its250k metadata or numerical limits",async()=>{
 const p=preview(),encoded=encodeSharedReliefPreview(p);
 assert.deepEqual(await decodeSharedReliefPreview(encoded.buffer as ArrayBuffer),p);
 assert.equal(ADVANCED_TERRAIN_LIMITS.packetCharacters,250000);
 assert.equal(ADVANCED_TERRAIN_LIMITS.cells,262144);assert.equal(ADVANCED_TERRAIN_LIMITS.workingBytes,33554432);
 assert.equal(ADVANCED_TERRAIN_LIMITS.work,8388608);assert.equal(ADVANCED_TERRAIN_LIMITS.workerMs,30000);
 const tooMany=structuredClone(p);tooMany.header.refinements.push({...p.header.refinements[0],id:id(999)});
 assert.throws(()=>encodeSharedReliefPreview(tooMany));
 const tooLong=structuredClone(p);for(const meta of tooLong.header.refinements)meta.name="\u0001".repeat(160);
 assert.throws(()=>encodeSharedReliefPreview(tooLong),/metadata/);
});
