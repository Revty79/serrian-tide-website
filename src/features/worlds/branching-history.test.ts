import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { branchDraftSchema, inheritanceMode, inheritedProjection, type HistoryContext } from "./branching-history";
import type { EntryRecord, EraRecord, HistoricalTime } from "./history";
import { fitHistory } from "./timeline";
const entry=(time:HistoricalTime):EntryRecord=>({id:randomUUID(),worldId:randomUUID(),title:"Source",account:"An account",notes:"",eraIds:[],accuracy:"disputed",narrative:"recorded",time,revision:1,archived:false,updatedAt:"2026-10-10T00:00:00.000Z"});
const dated=(year:number)=>entry({version:1,scale:"world-year",kind:"known",year});
test("start-of-year divergence excludes both the boundary and parent future",()=>{
  assert.equal(inheritanceMode("entry",dated(300),650),"inherited");assert.equal(inheritanceMode("entry",dated(650),650),"excluded");assert.equal(inheritanceMode("entry",dated(800),650),"excluded");
});
test("negative, zero and signed chronology limits retain the same boundary",()=>{
  assert.equal(inheritanceMode("entry",dated(-1e12),-1e12),"excluded");assert.equal(inheritanceMode("entry",dated(-1e12),-1e12+1),"inherited");assert.equal(inheritanceMode("entry",dated(-1),0),"inherited");assert.equal(inheritanceMode("entry",dated(0),0),"excluded");assert.equal(inheritanceMode("entry",dated(1e12),1e12),"excluded");
});
test("crossing windows and durations remain unresolved without changing their dates",()=>{
  for(const kind of ["window","duration"] as const){const record=entry({version:1,scale:"world-year",kind,startYear:600,endYear:700});const before=structuredClone(record);assert.equal(inheritanceMode("entry",record,650),"pending");assert.deepEqual(record,before);assert.equal(inheritanceMode("entry",record,701),"inherited");}
});
test("an approximate center has no invented uncertainty tolerance",()=>{assert.equal(inheritanceMode("entry",entry({version:1,scale:"world-year",kind:"approximate",year:300}),650),"pending");});
test("undated and predecessor plans are not established inherited events",()=>{
  assert.equal(inheritanceMode("entry",entry({version:1,scale:"world-year",kind:"undated"}),650),"pending");assert.equal(inheritanceMode("entry",{...dated(300),narrative:"planned"},650),"pending");
});
test("eras retain pre-boundary existence without assuming an ending",()=>{
  const era:EraRecord={id:randomUUID(),worldId:randomUUID(),name:"Empire",description:"Original ending",tone:"primary",startYear:300,endYear:800,archived:false,revision:1};
  assert.equal(inheritanceMode("era",era,650),"partial");assert.equal(inheritanceMode("era",{...era,endYear:null},650),"partial");assert.equal(inheritanceMode("era",{...era,startYear:null},650),"pending");
  const context:HistoryContext={mode:"partial",timelineId:randomUUID(),versionId:randomUUID(),sourceTimelineId:randomUUID(),sourceVersionId:randomUUID(),sourceRevision:1,newerParent:false,parentRevision:1,parentVersionId:null,coveredUntil:649};
  const projected=inheritedProjection(era,context) as EraRecord;assert.equal(projected.endYear,null);assert.equal(era.endYear,800);assert.equal(projected.historyContext?.coveredUntil,649);
  const view=fitHistory([projected],[]);assert.ok(view.start<=300&&view.end>=649&&view.end<800,"Fit includes only the known predecessor extent, not the source's future ending");
});
test("archived sources remain retained without automatic adoption",()=>{assert.equal(inheritanceMode("entry",{...dated(300),archived:true},650),"excluded");});
test("branch input rejects fractions, out-of-range years and forged fields",()=>{
  const draft={name:"Alternative",parentId:randomUUID(),divergenceYear:0};assert.ok(branchDraftSchema.safeParse(draft).success);
  for(const invalid of [{...draft,divergenceYear:.5},{...draft,divergenceYear:1e12+1},{...draft,worldId:randomUUID()}])assert.equal(branchDraftSchema.safeParse(invalid).success,false);
});
