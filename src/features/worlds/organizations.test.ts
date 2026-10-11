import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { emptyLore, loreDraftSchema, loreWorkspaceTab } from "./peoples";
import { organizationFamilies } from "./organizations";
test("organizations and their roles/accounts require only a name without invented hierarchy",()=>{
  for(const family of Object.keys(organizationFamilies) as (keyof typeof organizationFamilies)[]){const draft=loreDraftSchema.parse({...emptyLore(family),name:"Original decentralized entity"});assert.equal(draft.time.kind,"undated");assert.deepEqual(draft.participants,[]);assert.deepEqual(draft.milestones,[]);assert.equal(loreWorkspaceTab(family),"organizations");}
});
test("confidential goals and operations start protected while ordinary fields stay authorable",()=>{
  const draft=loreDraftSchema.parse({...emptyLore("organization"),name:"Public guild",fields:{purpose:"Public research",confidentialGoals:"Secret patronage"}});assert.deepEqual(draft.protectedFields,["confidentialGoals","secretOperations"]);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("membership"),name:"Membership",protectedFields:["confidentialGoals"]}).success,false);
});
test("shared memberships reference one individual identity with original dated statuses",()=>{
  const individual=randomUUID(),organization=randomUUID(),draft={...emptyLore("membership"),name:"Conditional honorary membership",participants:[{targetId:organization,authoredReference:"",role:"organization",account:""},{targetId:individual,authoredReference:"",role:"honorary member",account:""}],periods:[{id:randomUUID(),label:"Uncertain period",status:"conditional and temporarily suspended",beginning:null,ending:null}]};
  assert.equal(loreDraftSchema.parse(draft).participants[1].targetId,individual);assert.equal(loreDraftSchema.parse({...draft,participants:[{...draft.participants[0],targetId:randomUUID()},draft.participants[1]]}).participants[1].targetId,individual);
  assert.equal(loreDraftSchema.safeParse({...draft,participants:[{targetId:null,authoredReference:"Retyped member",role:"member",account:""}]}).success,false);
});
test("networks accept overlapping and cyclic saved references without one-tree rules",()=>{
  const id=randomUUID(),draft={...emptyLore("network"),name:"Overlapping network",fields:{relationshipType:"Original cross-cutting network"},participants:[{targetId:id,authoredReference:"",role:"partner",account:""},{targetId:id,authoredReference:"",role:"independent chapter",account:""}]};assert.equal(loreDraftSchema.safeParse(draft).success,true);
});
