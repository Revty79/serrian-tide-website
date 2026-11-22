import assert from "node:assert/strict";
import test from "node:test";
import {findAdvancedDraft,listAdvancedDrafts,readUnchangedAdvancedDraft,parseAdvancedDraft,retireAdvancedDraft} from "./terrain-advanced-recovery";
import {terrainSourceSchema} from "./terrain-source";
import {advancedOperationSchema,advancedProvenanceSchema} from "./terrain-advanced-spec";
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

test("recovery prefers the requested tool among retained drafts without changing any original bytes",()=>{
  const profile=JSON.stringify({...packet,operation:{kind:"landform-profile",selection:{frame},points:[],preserveManual:true,strength:100,mode:"shape",hardness:0,endBlendM:0,featherM:0}});
  for(const entries of [[["draft:erosion",raw],["draft:profile",profile]],[["draft:profile",profile],["draft:erosion",raw]]] as [string,string][][]){
    const values=new Map(entries),storage={get length(){return values.size;},key:(n:number)=>[...values.keys()][n]??null,getItem:(key:string)=>values.get(key)??null},before=[...values];
    assert.deepEqual(findAdvancedDraft(storage,"draft:","draft:new",mapId,null,"landform-profile"),{key:"draft:profile",raw:profile});
    assert.deepEqual(findAdvancedDraft(storage,"draft:","draft:new",mapId,null,"erosion"),{key:"draft:erosion",raw});
    assert.deepEqual([...values],before);
  }
  const values=new Map([["draft:broken","{unfinished"],["draft:foreign",JSON.stringify({...packet,mapId:"92000000-0000-4000-8000-000000000002"})],["draft:erosion",raw]]),storage={get length(){return values.size;},key:(n:number)=>[...values.keys()][n]??null,getItem:(key:string)=>values.get(key)??null};
  assert.equal(findAdvancedDraft(storage,"draft:","draft:new",mapId,null,"erosion")?.key,"draft:erosion");
  assert.equal(findAdvancedDraft(storage,"draft:","draft:new",mapId,null,"landform-profile")?.raw,"{unfinished");
  assert.equal(findAdvancedDraft(storage,"other:","draft:new",mapId,null,"erosion"),undefined);assert.equal(values.size,3);
});

test("all same-source native drafts can be identified without replacing the legacy default or their bytes",()=>{
  const profile=(points:number,revision:number)=>JSON.stringify({...packet,revision,operation:{kind:"landform-profile",selection:{frame},points:Array.from({length:points},(_,n)=>({x:100+n*200,y:300+n*100,elevationM:1800+n*100,widthM:900})),preserveManual:false,strength:100,mode:"minimum",hardness:0,endBlendM:120,featherM:100},outline:[{x:0,y:0},{x:6000,y:0},{x:6000,y:6000}],areaMode:"points",drawing:false,simplificationM:1});
  const older=profile(12,288),wanted=profile(7,493),values=new Map([["scope:older",older],["scope:wanted",wanted],["scope:current",raw],["other:draft",raw]]),before=[...values],storage={get length(){return values.size;},key:(n:number)=>[...values.keys()][n]??null,getItem:(key:string)=>values.get(key)??null};
  const choices=listAdvancedDrafts(storage,"scope:","scope:current",mapId,null);
  assert.deepEqual(choices.map(v=>v.info),[{kind:"landform-profile",revision:288,points:12},{kind:"landform-profile",revision:493,points:7}]);assert.equal(choices[1].raw,wanted);
  assert.deepEqual(findAdvancedDraft(storage,"scope:","scope:current",mapId,null,"landform-profile"),{key:"scope:older",raw:older});
  assert.equal(parseAdvancedDraft(readUnchangedAdvancedDraft(storage,choices[1]).raw,mapId,null).operation.kind,"landform-profile");assert.deepEqual([...values],before);
});

test("unreadable and foreign-source originals remain exportable but cannot gain readable recovery metadata",()=>{
  const values=new Map([["scope:broken","{unfinished"],["scope:large"," ".repeat(250001)],["scope:foreign-map",JSON.stringify({...packet,mapId:"92000000-0000-4000-8000-000000000002"})],["scope:foreign-source",JSON.stringify({...packet,sourceId:"92000000-0000-4000-8000-000000000003"})],["scope:valid",raw]]),before=[...values],storage={get length(){return values.size;},key:(n:number)=>[...values.keys()][n]??null,getItem:(key:string)=>values.get(key)??null};
  const choices=listAdvancedDrafts(storage,"scope:","scope:new",mapId,null);assert.equal(choices.length,5);assert(choices.slice(0,4).every(v=>v.info===undefined));assert.deepEqual(choices.map(v=>[v.key,v.raw]),before);assert.equal(choices[4].info?.kind,"erosion");assert.deepEqual([...values],before);
});

test("a changed or removed retained choice refuses recovery while preserving the selected original and newer tab bytes",()=>{
  const choice={key:"scope:draft",raw},values=new Map([[choice.key,raw]]),storage={getItem:(key:string)=>values.get(key)??null};assert.equal(readUnchangedAdvancedDraft(storage,choice),choice);
  const newer=JSON.stringify({...packet,revision:4});values.set(choice.key,newer);assert.throws(()=>readUnchangedAdvancedDraft(storage,choice),/changed in another tab/);assert.equal(values.get(choice.key),newer);assert.equal(choice.raw,raw);
  values.delete(choice.key);assert.throws(()=>readUnchangedAdvancedDraft(storage,choice),/changed in another tab/);assert.equal(choice.raw,raw);assert.equal(values.size,0);
  assert.throws(()=>readUnchangedAdvancedDraft({getItem:()=>{throw Error("Storage unavailable");}},choice),/Storage unavailable/);
});

test("choosing an unfinished native draft does not authorize its numerical operation",()=>{
  const unfinished=JSON.stringify({...packet,operation:{kind:"landform-profile",selection:{frame},points:[],preserveManual:true,strength:0,mode:"shape",hardness:0,endBlendM:0,featherM:0}}),storage={length:1,key:()=>"scope:unfinished",getItem:()=>unfinished},[choice]=listAdvancedDrafts(storage,"scope:","scope:new",mapId,null);assert.equal(choice.info?.points,0);
  const restored=parseAdvancedDraft(readUnchangedAdvancedDraft(storage,choice).raw,mapId,null);assert.throws(()=>advancedOperationSchema.parse(restored.operation));assert.equal(choice.raw,unfinished);
});
