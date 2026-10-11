import assert from "node:assert/strict";
import test from "node:test";
import {fieldLabels,emptyLore,loreDraftSchema} from "./peoples";
import {individualSections,principleSections,pilotFieldSection,pilotIssueSection,pilotIssueLabel,principleCopy,patchPilotField} from "./pilot-composition";

test("every retained pilot field has one reachable section and cosmic field guidance",()=>{
  for(const family of ["individual","cosmicPrinciple"] as const){const sections=family==="individual"?individualSections:principleSections;for(const key of Object.keys(fieldLabels[family])){assert.ok(sections.some(s=>s.id===pilotFieldSection(family,key)),key);if(family==="cosmicPrinciple")assert.ok(principleCopy[key as keyof typeof principleCopy]);}}
});
test("cross-section invalid fields route to their section and accessible control",()=>{
  assert.equal(pilotIssueSection("individual",["sections",0,"title"]),"custom");assert.equal(pilotIssueLabel("individual",["sections",0,"title"]),"Custom section 1 title");
  assert.equal(pilotIssueSection("cosmicPrinciple",["fields","scope"]),"scope");
  assert.equal(pilotIssueSection("cosmicPrinciple",["periods",0,"beginning","year"]),"when");
  assert.equal(pilotIssueLabel("cosmicPrinciple",["milestones",2,"draft","time","year"]),"Milestone 3 year");
  assert.equal(pilotIssueLabel("individual",["participants",0,"role"]),"Connection 1 meaning");
});
test("editing one field preserves advanced, protected and immutable-reference draft information",()=>{
  const draft=emptyLore("individual");draft.name="Original being";draft.fields={existence:"Remembered light",accounts:"Disputed"};draft.privateNotes="Private";draft.nameAccounts=[{id:"00000000-0000-4000-8000-000000000001",name:"Earlier name",kind:"attribution",meaning:"",perspective:"An account",time:{version:1,scale:"world-year",kind:"undated"},protected:true}];
  const edited={...draft,...patchPilotField(draft,"existence","Sentient light")};assert.equal(edited.fields.accounts,"Disputed");assert.deepEqual(edited.nameAccounts,draft.nameAccounts);assert.equal(edited.privateNotes,draft.privateNotes);assert.deepEqual(edited.protectedFields,draft.protectedFields);assert.equal(loreDraftSchema.safeParse(edited).success,true);
});
test("minimal pilots do not invent examples, ancestry, scope or events",()=>{
  for(const family of ["individual","cosmicPrinciple"] as const){const draft=emptyLore(family);draft.name="A provisional name";assert.equal(loreDraftSchema.safeParse(draft).success,true);assert.deepEqual(draft.fields,{});assert.deepEqual(draft.participants,[]);assert.deepEqual(draft.milestones,[]);}
});
