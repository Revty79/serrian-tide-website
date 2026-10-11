import assert from "node:assert/strict";
import {test} from "node:test";
import {randomUUID} from "node:crypto";
import {emptyLore,loreDraftSchema,geographyAssociationSchema} from "./peoples";

test("societies begin with a name without mandatory government, biology, religion, grammar or population counts",()=>{
  for(const family of ["culture","civilization","language","population","belief","tradition"] as const){
    const draft=loreDraftSchema.parse({...emptyLore(family),name:"An original identity"});
    assert.deepEqual(draft.fields,{});assert.deepEqual(draft.geographies,[]);assert.equal(draft.time.kind,"undated");assert.deepEqual(draft.milestones,[]);
  }
  assert.equal(loreDraftSchema.safeParse({...emptyLore("language"),name:"Light speech",fields:{method:"Memories exchanged through colored light",dialects:"Several simultaneous interpretations"}}).success,true);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("culture"),name:"A culture",fields:{grammar:"A language-only concept"}}).success,false);
});
test("place relationships retain distinct identities, overlapping presence and honest unknown periods",()=>{
  const place=randomUUID(),destination=randomUUID();
  const g=geographyAssociationSchema.parse({id:randomUUID(),geographyId:place,relationshipType:"shared habitat"});
  assert.equal(g.time.kind,"undated");assert.equal(g.destinationId,null);
  const migration={...g,id:randomUUID(),destinationId:destination,relationshipType:"migration",time:{version:1,scale:"world-year",kind:"duration",startYear:800,endYear:850}};
  const draft={...emptyLore("population"),name:"Wandering community",geographies:[g,migration]};
  assert.equal(loreDraftSchema.parse(draft).geographies.length,2);
  assert.equal(loreDraftSchema.safeParse({...draft,geographies:[g,g]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...draft,geographies:[{...g,geographyId:"a mutable map label"}]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...draft,geographies:[{...migration,time:{...migration.time,startYear:851}}]}).success,false);
});
test("account context is independent of an explicitly authored founding milestone",()=>{
  const draft=loreDraftSchema.parse({...emptyLore("civilization"),name:"The shared hearth",time:{version:1,scale:"world-year",kind:"known",year:600}});
  assert.deepEqual(draft.milestones,[]);
  const authored=loreDraftSchema.parse({...draft,milestones:[{eventType:"founding",draft:{title:"Founding of the shared hearth",account:"One of several foundation claims",time:draft.time,accuracy:"disputed",narrative:"recorded",eraIds:[]}}]});
  assert.equal(authored.milestones[0].eventType,"founding");assert.equal(authored.milestones[0].draft.accuracy,"disputed");
});
