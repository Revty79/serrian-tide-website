import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { emptyLore, loreDraftSchema, loreWorkspaceTab } from "./peoples";
import { storyFields } from "./stories";
import { pilotFieldSection, pilotIssueSection } from "./pilot-composition";
import { PilotProfile } from "./pilot-profile";

test("a name alone saves a story; original classifications never establish accuracy",()=>{
  const story=loreDraftSchema.parse({...emptyLore("story"),name:"The unseen tide",fields:{classification:"Impossible memory"}});
  assert.equal(story.accuracy,"unverified");assert.equal(story.time.kind,"undated");assert.equal(story.storyContext?.time.kind,"undated");assert.equal(loreWorkspaceTab(story.family),"stories");
});
test("telling, alleged dates and independent period endpoints retain separate meanings",()=>{
  const draft=loreDraftSchema.parse({...emptyLore("story"),name:"Contradiction",time:{version:1,scale:"world-year",kind:"known",year:120},storyContext:{time:{version:1,scale:"world-year",kind:"approximate",year:-300},protected:false},periods:[{id:randomUUID(),label:"Oral account",status:"disputed",account:"The tide never rose",perspective:"Old narrator",beginning:null,ending:null,protected:false}]});
  assert.equal("year" in draft.time&&draft.time.year,120);assert.equal(draft.storyContext?.time.kind,"approximate");assert.equal(draft.periods?.[0].ending,null);
  const html=renderToStaticMarkup(createElement(PilotProfile,{draft}));assert.match(html,/Story told or recorded/);assert.match(html,/Alleged events/);assert.match(html,/unknown endings do not establish continued transmission/);
});
test("all narrative fields reach their visible workshop sections and validation reaches both date controls",()=>{
  for(const key of Object.keys(storyFields))assert.notEqual(pilotFieldSection("story",key),"custom");
  assert.equal(pilotFieldSection("story","story"),"story");assert.equal(pilotFieldSection("story","sourceContext"),"sources");
  assert.equal(pilotIssueSection("story",["storyContext","time","year"]),"context");assert.equal(pilotIssueSection("story",["storySources",0,"relationshipType"]),"sources");
});
test("retained account identities must be distinct and story fields cannot be smuggled into another family",()=>{
  const link={id:randomUUID(),entityId:randomUUID(),versionId:randomUUID(),revision:1,relationshipType:"contradicts",account:"Neither wins",protected:false};
  assert.equal(loreDraftSchema.safeParse({...emptyLore("story"),name:"Dispute",storySources:[link,link]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("species"),name:"Species",storySources:[link]}).success,false);
  assert.equal(loreDraftSchema.safeParse({...emptyLore("story"),name:"Dispute",storySources:[{...link,relationshipType:""}]}).success,false);
});
