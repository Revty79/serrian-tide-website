import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { emptyLore, loreDraftSchema, loreInheritance, loreCommandSchema } from "./peoples";

test("simple species and peoples require no invented biology, origin or date",()=>{
  for(const family of ["species","people"] as const){const d=loreDraftSchema.parse({...emptyLore(family),name:"Original identity"});assert.equal(d.time.kind,"undated");assert.deepEqual(d.fields,{});assert.deepEqual(d.milestones,[]);assert.equal(d.accuracy,"unverified");}
  assert.equal(loreDraftSchema.safeParse({...emptyLore("species"),name:"Spirit",fields:{politicalRule:"invented"}}).success,false);
});
test("contradictory origins and multiple original progenitors require an authored subject and account",()=>{
  const subject={targetId:randomUUID(),authoredReference:"",role:"subject",account:""};
  const unresolved={targetId:null,authoredReference:"The unmade god",role:"claimed creator",account:"Disputed attribution"};
  const d={...emptyLore("origin"),name:"The three creators",description:"Three divine sources claim incompatible beginnings.",participants:[subject,unresolved,{...unresolved,authoredReference:"A machine beyond time"}]};
  assert.equal(loreDraftSchema.parse(d).participants.length,3);
  assert.equal(loreDraftSchema.safeParse({...d,description:""}).success,false);
  assert.equal(loreDraftSchema.safeParse({...d,participants:[unresolved]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...d,participants:[{...subject,authoredReference:"Another target"}]}).success,false);
  assert.equal(loreDraftSchema.parse({...emptyLore("relationship"),name:"Paradox",fields:{relationshipType:"Ancestor of own progenitor"},participants:[subject,subject]}).fields.relationshipType,"Ancestor of own progenitor");
});
test("milestones preserve optional precision, custom types and revision identity",()=>{
  const entryId=randomUUID(),event={title:"Appearance",account:"An uncertain account",notes:"",accuracy:"disputed",narrative:"planned",eraIds:[],time:{version:1,scale:"world-year",kind:"approximate",year:0}};
  const d={...emptyLore("species"),name:"Ashborne",milestones:[{entryId,revision:2,eventType:"Dream crystallization",draft:event}]};
  assert.equal(loreDraftSchema.safeParse(d).success,true);
  assert.equal(loreDraftSchema.safeParse({...d,milestones:[...d.milestones,...d.milestones]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...d,milestones:[{...d.milestones[0],revision:undefined}]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...d,milestones:[{...d.milestones[0],draft:{...event,time:{version:1,scale:"world-year",kind:"known",year:.5}}}]}).success,false);
});
test("branch inference accepts only bounded recorded accounts before divergence",()=>{
  const t={version:1 as const,scale:"world-year" as const,kind:"known" as const,year:299};
  assert.equal(loreInheritance(t,false,"recorded",300),"inherited");
  assert.equal(loreInheritance({...t,year:300},false,"recorded",300),"excluded");
  assert.equal(loreInheritance({...t,kind:"approximate"},false,"recorded",300),"pending");
  assert.equal(loreInheritance({version:1,scale:"world-year",kind:"duration",startYear:10,endYear:350},false,"recorded",300),"pending");
  assert.equal(loreInheritance(t,false,"planned",300),"pending");
  assert.equal(loreInheritance(t,true,"recorded",300),"excluded");
});
test("every save and source reconciliation carries explicit conflict context",()=>{
  const id=randomUUID(),timelineId=randomUUID();assert.equal(loreCommandSchema.safeParse({action:"save",id,timelineId,draft:{...emptyLore("people"),name:"Coast folk"}}).success,false);
  assert.equal(loreCommandSchema.safeParse({action:"adopt-source",id,timelineId,revision:0,parentVersionId:randomUUID(),parentRevision:1}).success,true);
});
