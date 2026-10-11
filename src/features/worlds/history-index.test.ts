import assert from "node:assert/strict";
import { test } from "node:test";
import { entryDraftSchema, type HistoricalTime } from "./history";
import { historyFilterSchema, overlapsPeriod } from "./history-index";
const time=(kind:"known"|"approximate",year:number):HistoricalTime=>({version:1,scale:"world-year",kind,year});
test("History ranges preserve year zero, negative years and inclusive overlap without inventing approximate tolerance",()=>{
  assert.equal(overlapsPeriod(time("known",0),0,0),true);
  assert.equal(overlapsPeriod(time("known",-405),-500,-400),true);
  assert.equal(overlapsPeriod(time("approximate",405),406,420),false);
  assert.equal(overlapsPeriod(time("approximate",405),400,410),true);
  for(const kind of ["window","duration"] as const){assert.equal(overlapsPeriod({version:1,scale:"world-year",kind,startYear:400,endYear:500},450,600),true);assert.equal(overlapsPeriod({version:1,scale:"world-year",kind,startYear:400,endYear:500},501,600),false);}
  assert.equal(overlapsPeriod({version:1,scale:"world-year",kind:"undated"},0,1),false);
  assert.equal(overlapsPeriod({version:1,scale:"world-year",kind:"undated"}),true);
  assert.equal(historyFilterSchema.safeParse({from:1,to:-1}).success,false);
});
test("Prominence and manual custom event types are optional compatible presentation, separate from knowledge and accuracy",()=>{
  const old={title:"Disputed founding",account:"One interpretation.",time:time("known",0),accuracy:"disputed",narrative:"recorded"};
  const parsed=entryDraftSchema.parse(old);assert.equal("prominence"in parsed,false);assert.equal("eventType"in parsed,false);
  const next=entryDraftSchema.parse({...old,prominence:"index-only",eventType:"First light festival",visibility:"protected"});assert.equal(next.accuracy,"disputed");assert.equal(next.visibility,"protected");assert.equal(next.eventType,"First light festival");
  assert.equal(entryDraftSchema.safeParse({...old,prominence:"public"}).success,false);
});
