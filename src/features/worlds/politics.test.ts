import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { emptyLore, loreDraftSchema, loreWorkspaceTab } from "./peoples";
import { politicalFamilies } from "./politics";

test("all political identities begin with a name, without an invented officeholder or territory",()=>{
  for(const family of Object.keys(politicalFamilies) as (keyof typeof politicalFamilies)[]){const draft=loreDraftSchema.parse({...emptyLore(family),name:"An original political identity"});assert.equal(draft.time.kind,"undated");assert.deepEqual(draft.participants,[]);assert.deepEqual(draft.milestones,[]);assert.equal(loreWorkspaceTab(family),"politics");}
});
test("joint appointments retain original statuses and independently unknown endpoints",()=>{
  const id=randomUUID(),holder=randomUUID(),draft={...emptyLore("appointment"),name:"The shared seat",participants:[{targetId:holder,authoredReference:"",role:"joint claimant",account:""},{targetId:holder,authoredReference:"",role:"acting representative",account:""}],periods:[{id,label:"Disputed shared authority",status:"collective dream office",beginning:null,ending:{version:1,scale:"world-year",kind:"approximate",year:-3}}]};
  const parsed=loreDraftSchema.parse(draft);assert.equal(parsed.periods?.[0].beginning,null);assert.equal(parsed.periods?.[0].status,"collective dream office");assert.equal(loreDraftSchema.safeParse({...draft,periods:[...draft.periods,...draft.periods]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...draft,participants:[{targetId:null,authoredReference:"Retyped holder",role:"holder",account:""}]}).success,false);
});
test("political field protection follows the chosen typed family",()=>{
  assert.equal(loreDraftSchema.safeParse({...emptyLore("agreement"),name:"Treaty",fields:{terms:"Secret terms"},protectedFields:["terms"]}).success,true);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("government"),name:"Council",protectedFields:["terms"]}).success,false);
});
test("one canonical milestone carries several distinct saved identity links",()=>{
  const id=randomUUID(),event={eventType:"Joint succession",targets:[{id,kind:"lore"}],draft:{title:"The shared accession",account:"An explicitly authored joint accession",notes:"",time:{version:1,scale:"world-year",kind:"known",year:0},accuracy:"disputed",narrative:"recorded",eraIds:[]}};
  const draft={...emptyLore("appointment"),name:"Joint accession",milestones:[event]};assert.equal(loreDraftSchema.safeParse(draft).success,true);assert.equal(loreDraftSchema.safeParse({...draft,milestones:[{...event,targets:[...event.targets,...event.targets]}]}).success,false);
});
