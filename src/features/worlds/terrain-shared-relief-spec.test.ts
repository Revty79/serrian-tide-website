import assert from "node:assert/strict";
import test from "node:test";
import {terrainSourceSchema} from "./terrain-source";
import {terrainCommandSchema} from "./terrain";
import {terrainTransferHeaderSchema} from "./terrain-transfer";
import {sharedReliefCommandSchema,sharedReliefReceiptSchema} from "./terrain-shared-relief-spec";
const mapId="10000000-0000-4000-8000-000000000001",requestId="10000000-0000-4000-8000-000000000002",groupId="10000000-0000-4000-8000-000000000003";
test("native shared receipts preserve old manual parsing and cannot enter ordinary saves or chunked transfers",()=>{
 assert.deepEqual(terrainSourceSchema.parse({kind:"manual"}),{kind:"manual"});
 const receipt={version:1 as const,groupId,changed:0},source={kind:"manual" as const,sharedRelief:receipt};assert.deepEqual(terrainSourceSchema.parse(source),source);
 const header={action:"save" as const,mapId,requestId,revision:1,seaLevel:0,source};
 assert.throws(()=>terrainCommandSchema.parse({...header,tiles:[]}),/checked atomic/);assert.throws(()=>terrainTransferHeaderSchema.parse(header),/checked atomic/);
 assert.throws(()=>sharedReliefReceiptSchema.parse({...receipt,changed:262145}));assert.throws(()=>sharedReliefReceiptSchema.parse({...receipt,extra:true}));
 assert.throws(()=>terrainSourceSchema.parse({...source,inheritance:{version:1}}));
});
test("shared commands accept native intent and context hashes rather than caller-authored terrain tiles or source vectors",()=>{
 const operation={kind:"landform-profile",mode:"shape",selection:{frame:{x:0,y:0,width:10000,height:10000}},points:[{x:1000,y:1000,elevationM:2000,widthM:4000},{x:9000,y:9000,elevationM:3000,widthM:4000}],preserveManual:false,strength:100,hardness:0,endBlendM:0,featherM:1000},workArea={x:1000,y:1000,width:1000,height:1000},preview={action:"preview",mapId,operation,workArea};
 assert.deepEqual(sharedReliefCommandSchema.parse(preview),preview);
 const accept={...preview,action:"accept",requestId,contextPin:"a".repeat(64),previewHash:"b".repeat(64)};assert.deepEqual(sharedReliefCommandSchema.parse(accept),accept);
 for(const extra of [{tiles:[]},{sourceState:[]},{parentRevision:99},{skipBoundaryChecks:true}])assert.throws(()=>sharedReliefCommandSchema.parse({...accept,...extra}));
 for(const action of ["undo","redo"]){const value={action,mapId,requestId,groupId};assert.deepEqual(sharedReliefCommandSchema.parse(value),value);assert.throws(()=>sharedReliefCommandSchema.parse({...value,tiles:[]}));}
});
