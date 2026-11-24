import test from "node:test";
import assert from "node:assert/strict";
import {ASSOCIATION_RECOVERY_CHARACTERS,associationRecoveryKey,associationCommand,parseAssociationDraft,encodeAssociationDraft,readAssociationDraft,writeAssociationDraft,clearAssociationDraft,type AssociationDraft,type AssociationStore} from "./native-coordinate-association-recovery";
const id=(n:number)=>`51000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const context={actorId:"fixture-owner",worldId:id(1),timelineId:id(2)},key=associationRecoveryKey(context);
const draft=(extra:Partial<AssociationDraft>={}):AssociationDraft=>({format:"serrian-native-coordinate-association",version:1,...context,requestId:id(5),mapId:id(3),surfaceId:id(4),attempted:false,...extra});
function memory(){const values=new Map<string,string>();const store:AssociationStore={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};return {values,store};}

test("retained attempted association preserves the exact original wire request without account metadata",()=>{
  const value=draft({attempted:true}),raw=encodeAssociationDraft(value,context),restored=parseAssociationDraft(raw,context);
  assert.deepEqual(restored,value);assert.deepEqual(associationCommand(restored),{action:"attach",mapId:id(3),timelineId:id(2),requestId:id(5),surfaceId:id(4)});
});
test("foreign account, World and timeline packets stay exportable but are never admitted",()=>{
  const {store,values}=memory(),raw=encodeAssociationDraft(draft(),context);values.set(key,raw);
  for(const other of[{...context,actorId:"other-owner"},{...context,worldId:id(6)},{...context,timelineId:id(6)}]){const result=readAssociationDraft(store,key,other);assert.equal(result?.raw,raw);assert.equal(result?.value,undefined);assert.match(result?.error??"",/another account/);assert.equal(values.get(key),raw);}
});
test("incomplete unattempted choices can recover, while incomplete attempted or submitted choices refuse",()=>{
  const partial=draft({mapId:"",surfaceId:""});assert.deepEqual(parseAssociationDraft(encodeAssociationDraft(partial,context),context),partial);
  assert.throws(()=>associationCommand(partial));assert.throws(()=>encodeAssociationDraft({...partial,attempted:true},context));
});
test("unreadable and oversized original bytes are retained without numerical or source admission",()=>{
  const {store,values}=memory();for(const raw of['{"broken":',"x".repeat(ASSOCIATION_RECOVERY_CHARACTERS+1)]){values.set(key,raw);const result=readAssociationDraft(store,key,context);assert.equal(result?.raw,raw);assert.equal(result?.value,undefined);assert(result?.error);assert.equal(values.get(key),raw);}
});
test("extra action, source and geometry fields cannot enter an association packet",()=>{
  for(const extra of[{action:"import"},{source:{records:[]}},{geometry:{type:"Point",coordinates:[0,0]}}])assert.throws(()=>parseAssociationDraft(JSON.stringify({...draft(),...extra}),context));
});
test("a changed packet in another tab prevents overwriting the newer choice",()=>{
  const {store,values}=memory(),raw=writeAssociationDraft(store,key,null,draft(),context),newer=encodeAssociationDraft(draft({requestId:id(6)}),context);values.set(key,newer);
  assert.throws(()=>writeAssociationDraft(store,key,raw,draft({surfaceId:id(7)}),context),/Another tab/);assert.equal(values.get(key),newer);
});
test("an existing unreadable packet cannot be silently replaced as a new start",()=>{
  const {store,values}=memory();values.set(key,"unreadable-original");assert.throws(()=>writeAssociationDraft(store,key,null,draft(),context),/Another tab/);assert.equal(values.get(key),"unreadable-original");
});
test("clearing recovery requires the same reviewed original bytes",()=>{
  const {store,values}=memory(),raw=writeAssociationDraft(store,key,null,draft(),context);values.set(key,raw+" ");assert.throws(()=>clearAssociationDraft(store,key,raw),/Another tab/);assert.equal(values.get(key),raw+" ");clearAssociationDraft(store,key,raw+" ");assert.equal(values.has(key),false);
});
test("storage refusal surfaces without losing the preceding original packet",()=>{
  const {store,values}=memory(),raw=writeAssociationDraft(store,key,null,draft(),context),refusing={...store,setItem:()=>{throw Error("quota refused");}};
  assert.throws(()=>writeAssociationDraft(refusing,key,raw,draft({requestId:id(6)}),context),/quota refused/);assert.equal(values.get(key),raw);
});
test("an attempted selection cannot change its request or destination and exact retry retains original bytes",()=>{
  const {store,values}=memory(),value=draft({attempted:true}),original="  "+encodeAssociationDraft(value,context)+"\n";values.set(key,original);
  for(const changed of[{requestId:id(8)},{mapId:id(8)},{surfaceId:id(8)},{attempted:false}]){assert.throws(()=>writeAssociationDraft(store,key,original,{...value,...changed},context),/exact attempted/);assert.equal(values.get(key),original);}
  assert.equal(writeAssociationDraft({...store,setItem:()=>{throw Error("retry must retain original bytes");}},key,original,value,context),original);assert.equal(values.get(key),original);
});
test("even an observed unreadable packet requires an explicit clear before replacement",()=>{
  const {store,values}=memory(),raw='{"broken":';values.set(key,raw);assert.throws(()=>writeAssociationDraft(store,key,raw,draft(),context));assert.equal(values.get(key),raw);
});
