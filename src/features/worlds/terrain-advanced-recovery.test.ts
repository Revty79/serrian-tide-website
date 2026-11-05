import assert from "node:assert/strict";
import test from "node:test";
import {parseAdvancedDraft,retireAdvancedDraft} from "./terrain-advanced-recovery";
import {terrainSourceSchema} from "./terrain-source";
import {advancedProvenanceSchema} from "./terrain-advanced-spec";
const mapId="92000000-0000-4000-8000-000000000001",frame={x:0,y:0,width:6400,height:6400};
const operation={kind:"erosion",selection:{frame},preserveManual:true,strength:50,model:"runoff",iterations:8,direction:90,directionInfluence:.5,deposition:true,maxDepthM:100,reposeDegrees:30,featherM:100};
const packet={version:1,mapId,sourceId:null,revision:3,operation,visualOnly:false},raw=JSON.stringify(packet);
test("old manual source serialization is exact; advanced metadata extends native provenance",()=>{
  assert.deepEqual(terrainSourceSchema.parse({kind:"manual"}),{kind:"manual"});
  const advanced={version:1,operation,contextPin:"a".repeat(64),effect:{changed:20,affected:{frame}}};
  assert.deepEqual(terrainSourceSchema.parse({kind:"manual",advanced}),{kind:"manual",advanced});
  assert.throws(()=>advancedProvenanceSchema.parse({...advanced,contextPin:"not-a-pin"}));
  assert.throws(()=>advancedProvenanceSchema.parse({...advanced,effect:{changed:0,affected:{frame}}}));
});
test("valid unfinished settings recover on the exact map and numerical source",()=>{
  assert.deepEqual(parseAdvancedDraft(raw,mapId,null),packet);
  assert.throws(()=>parseAdvancedDraft(raw,"92000000-0000-4000-8000-000000000002",null),/another terrain source/);
  assert.throws(()=>parseAdvancedDraft(raw,mapId,"92000000-0000-4000-8000-000000000003"),/another terrain source/);
});
test("unfinished numbers and freehand points recover for editing but cannot bypass numerical admission",()=>{
  const unfinished={...packet,operation:{...operation,strength:0,iterations:0},outline:[{x:10,y:20},{x:20,y:30}],areaMode:"freehand",drawing:true,simplificationM:2};
  const value=parseAdvancedDraft(JSON.stringify(unfinished),mapId,null);
  assert.deepEqual(value,unfinished);
  assert.throws(()=>advancedProvenanceSchema.parse({version:1,contextPin:"a".repeat(64),operation:value.operation,effect:{changed:2,affected:{frame}}}));
});
test("corrupt and over-budget recovery bytes are rejected without destructive storage actions",()=>{
  assert.throws(()=>parseAdvancedDraft("{unfinished",mapId,null));
  assert.throws(()=>parseAdvancedDraft(" ".repeat(250001),mapId,null),/budget/);
});
test("retiring an acknowledged packet preserves newer work from another tab",()=>{
  const values=new Map([["draft",raw]]),storage={getItem:(key:string)=>values.get(key)??null,removeItem:(key:string)=>{values.delete(key);}};
  retireAdvancedDraft(storage,"draft",raw+"changed");assert.equal(values.get("draft"),raw);
  values.set("draft",raw+"newer");retireAdvancedDraft(storage,"draft",raw);assert.equal(values.get("draft"),raw+"newer");
  values.set("draft",raw);retireAdvancedDraft(storage,"draft",raw);assert.equal(values.has("draft"),false);
});
