import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { emptyLore, loreDraftSchema } from "./peoples";
import { individualFields, nameAccountSchema, relationshipPeriodSchema } from "./individuals";
const undated={version:1 as const,scale:"world-year" as const,kind:"undated" as const};
test("an individual needs only a name and permits original nonbiological existence",()=>{
  const minimal=loreDraftSchema.parse({family:"individual",name:"Unnamed traveler"});assert.equal(minimal.time.kind,"undated");assert.deepEqual(minimal.milestones,[]);assert.deepEqual(minimal.fields,{});
  for(const existence of ["Collective consciousness","Artificial intelligence","A repeatedly returning spirit","An immortal concept"]){const draft=loreDraftSchema.parse({...emptyLore("individual"),name:existence,fields:{existence,aging:"Inapplicable"}});assert.equal(draft.fields.existence,existence);}
});
test("all individual field groups are saved narrative categories with optional protection",()=>{
  const fields=Object.fromEntries(Object.keys(individualFields).map(key=>[key,`Authored ${key}`]));
  const rich=loreDraftSchema.parse({...emptyLore("individual"),name:"Aralyn",fields,protectedFields:["beliefs","origins","description"]});assert.deepEqual(rich.fields,fields);
  assert.equal(loreDraftSchema.safeParse({...rich,fields:{...fields,combatLevel:"20"}}).success,false);
  assert.equal(loreDraftSchema.safeParse({...rich,protectedFields:["inventedField"]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...rich,protectedFields:["beliefs","beliefs"]}).success,false);
});
test("historical names preserve dates and perspectives without changing the individual identity",()=>{
  const n=nameAccountSchema.parse({id:randomUUID(),name:"Aralyn of the Reed",kind:"cultural name",meaning:"A title used by the second culture",perspective:"A disputed inscription",time:undated,protected:true});
  assert.equal(loreDraftSchema.parse({...emptyLore("individual"),name:"Aralyn",nameAccounts:[n]}).nameAccounts?.[0].id,n.id);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("individual"),name:"Aralyn",nameAccounts:[n,n]}).success,false);
});
test("relationship periods retain unknown ends and independent conflicting accounts",()=>{
  const p=relationshipPeriodSchema.parse({id:randomUUID(),label:"Allies",status:"disputed",account:"One account",perspective:"A witness",beginning:{...undated,kind:"known",year:310},ending:null,protected:false});
  const participants=[1,2,3].map(()=>({targetId:randomUUID(),role:"original creator",authoredReference:"",account:"Authored account",protected:true}));
  const draft=loreDraftSchema.parse({...emptyLore("relationship"),name:"Three creators",fields:{relationshipType:"Shared creation"},participants,relationshipPeriods:[p,{...p,id:randomUUID(),label:"Rivals",status:"ended"}]});
  assert.equal(draft.participants.length,3);assert.equal(draft.relationshipPeriods?.[0].ending,null);
  assert.equal(loreDraftSchema.safeParse({...draft,relationshipPeriods:[p,p]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("individual"),name:"Not a relationship",relationshipPeriods:[p]}).success,false);
});
