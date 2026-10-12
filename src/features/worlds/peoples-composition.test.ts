import assert from "node:assert/strict";
import {test} from "node:test";
import {randomUUID} from "node:crypto";
import {emptyLore,fieldLabels,loreDraftSchema} from "./peoples";
import {repairBFamilies,peoplesComposition,repairBIssueSection} from "./peoples-composition";

test("Repair B inventories every existing typed field with a distinct reachable question",()=>{
  for(const family of repairBFamilies){const composition=peoplesComposition[family];assert.deepEqual(Object.keys(composition.fields).sort(),Object.keys(fieldLabels[family]).sort(),family);assert.equal(new Set(composition.sections.map(s=>s.id)).size,composition.sections.length);for(const question of Object.values(composition.fields)){assert.ok(composition.sections.some(s=>s.id===question.section));assert.ok(question.help.length>60);}}
});
test("required origin subjects remain saved identities while multiple attributed progenitors can remain uncertain",()=>{
  const draft={...emptyLore("origin"),name:"Origins of light",description:"Two competing accounts.",participants:[{targetId:randomUUID(),role:"subject",authoredReference:"",account:""},{targetId:null,role:"claimed creator",authoredReference:"Perhaps the forgotten moon",account:"An attributed claim"}]};
  assert.equal(loreDraftSchema.safeParse(draft).success,true);
  const incomplete=loreDraftSchema.safeParse({...draft,description:"",participants:[]});assert.equal(incomplete.success,false);if(!incomplete.success){assert.ok(incomplete.error.issues.some(i=>i.path.join(".")==="description"));assert.ok(incomplete.error.issues.some(i=>i.path.join(".")==="participants"));}
  assert.equal(loreDraftSchema.safeParse({...draft,participants:draft.participants.slice(1)}).success,false);
});
test("relationship meaning, participant requirements and independently unknown periods stay intact",()=>{
  const draft={...emptyLore("relationship"),name:"The disputed pact",fields:{relationshipType:"Possible kinship"},participants:[{targetId:null,role:"ancestor",authoredReference:"A remembered light",account:""},{targetId:randomUUID(),role:"descendant",authoredReference:"",account:""}],relationshipPeriods:[{id:randomUUID(),label:"Before the Oath",status:"disputed",account:"A claimed friendship",perspective:"A later storyteller",beginning:null,ending:null,protected:true}]};
  assert.equal(loreDraftSchema.safeParse(draft).success,true);const original=structuredClone(draft);
  const result=loreDraftSchema.safeParse({...draft,fields:{},participants:[]});assert.equal(result.success,false);if(!result.success){assert.ok(result.error.issues.some(i=>i.path.join(".")==="fields.relationshipType"));assert.ok(result.error.issues.some(i=>i.path.join(".")==="participants"));}
  assert.deepEqual(draft,original);
  assert.equal(repairBIssueSection("relationship",["relationshipPeriods",0,"beginning","endYear"]),"periods");
});
test("eight name-only creators do not save examples or assign culture, languages, beliefs, biology or events",()=>{
  for(const family of repairBFamilies.filter(f=>f!=="origin"&&f!=="relationship")){const draft=loreDraftSchema.parse({...emptyLore(family),name:"Undecided"});assert.deepEqual(draft.fields,{});assert.deepEqual(draft.participants,[]);assert.deepEqual(draft.milestones,[]);assert.equal(draft.time.kind,"undated");}
});
test("nested supporting validation routes separately to places, History, periods and private notes",()=>{
  assert.equal(repairBIssueSection("origin",["participants",1,"role"]),"connections");assert.equal(repairBIssueSection("population",["geographies",0,"time","endYear"]),"places");assert.equal(repairBIssueSection("language",["milestones",0,"draft","calendarDate","start","date","day"]),"history");assert.equal(repairBIssueSection("culture",["privateNotes"]),"private");assert.equal(repairBIssueSection("civilization",["sections",0,"title"]),"custom");
});
