import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { emptyLore, loreDraftSchema, loreWorkspaceTab } from "./peoples";
import { cosmologyFamilies, cosmicKinds } from "./cosmology";

test("every cosmic family can begin with a name without physics or hierarchy",()=>{
  for(const family of Object.keys(cosmologyFamilies) as (keyof typeof cosmologyFamilies)[]) {
    const draft=loreDraftSchema.parse({...emptyLore(family),name:"An original reality"});
    assert.equal(draft.time.kind,"undated");assert.deepEqual(draft.participants,[]);assert.deepEqual(draft.milestones,[]);
    assert.equal(loreWorkspaceTab(family),"cosmology");
  }
});
test("kinds are persistent original classifications and impossible celestial properties are allowed",()=>{
  assert.ok(cosmicKinds.celestial.includes("moon"));
  const draft=loreDraftSchema.parse({...emptyLore("celestial"),name:"Root-supported world",fields:{classification:"living hollow nonplanet",mass:"negative memories",gravity:"upward only when asleep",orbit:"none",scale:"unmeasurable"}});
  assert.equal(draft.fields.classification,"living hollow nonplanet");assert.equal(draft.fields.orbit,"none");
  assert.equal(loreDraftSchema.safeParse({...draft,fields:{unrecognizedMechanicalDefault:"1"}}).success,false);
});
test("law scopes and cosmic connections use saved references with multiple original roles",()=>{
  const target=randomUUID();
  for(const family of ["cosmicPrinciple","cosmicConnection"] as const) {
    const draft={...emptyLore(family),name:"Overlapping claim",participants:[{targetId:target,authoredReference:"",role:"origin",account:""},{targetId:target,authoredReference:"",role:"reflection and destination",account:""}]};
    assert.equal(loreDraftSchema.parse(draft).participants.length,2);
    assert.equal(loreDraftSchema.safeParse({...draft,participants:[{targetId:null,authoredReference:"Retyped realm",role:"scope",account:""}]}).success,false);
  }
});
test("contradictory cosmic accounts and uncertain law periods remain independent authored claims",()=>{
  const target=randomUUID(),base={...emptyLore("cosmicConnection"),name:"Origin account",accuracy:"disputed",participants:[{targetId:target,authoredReference:"",role:"subject",account:""}],periods:[{id:randomUUID(),label:"Timeless scope",status:"alleged",beginning:null,ending:{version:1,scale:"world-year",kind:"approximate",year:-200}}]};
  assert.equal(loreDraftSchema.parse({...base,fields:{relationshipType:"divine creation"}}).accuracy,"disputed");
  assert.equal(loreDraftSchema.parse({...base,fields:{relationshipType:"eternal existence"}}).time.kind,"undated");
});
test("confidential cosmic access starts protected and wrong-family or duplicate field keys fail",()=>{
  assert.deepEqual(emptyLore("realm").protectedFields,["hiddenAccess"]);
  assert.deepEqual(emptyLore("cosmicConnection").protectedFields,["conditions"]);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("realm"),name:"Realm",protectedFields:["mass"]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("celestial"),name:"Moon",protectedFields:["description","description"]}).success,false);
});
