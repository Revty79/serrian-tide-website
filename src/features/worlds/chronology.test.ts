import assert from "node:assert/strict";
import test from "node:test";
import { datingDraftOf, datingDraftSchema, formatEra, formatTime, formatYear, fromReckoning, toReckoning, type DatingDraft } from "./chronology";
import { historicalTimeSchema, YEAR_LIMIT, type HistoricalTime } from "./history";
const founding:DatingDraft={...datingDraftOf(),name:"Founding Reckoning",origin:"The first city",epochYear:0,beforeLabel:"Before Founding",afterLabel:"After Founding"};
test("no-zero reckoning reversibly skips zero at its explicit epoch",()=>{
  assert.deepEqual([-2,-1,0,1,2].map((year)=>toReckoning(year,founding)),[-2,-1,1,2,3]);
  assert.equal(formatYear(-1,founding),"Year 1 Before Founding");assert.equal(formatYear(0,founding),"Year 1 After Founding");
  assert.throws(()=>fromReckoning(0,founding),/no Year 0/);
});
test("year-zero convention has its own origin and preserves zero",()=>{
  const system={...founding,numbering:"year-zero" as const,epochYear:500};
  assert.deepEqual([499,500,501].map((year)=>toReckoning(year,system)),[-1,0,1]);assert.equal(fromReckoning(0,system),500);
});
test("round trips cover both conventions, distant epochs and extreme canonical years",()=>{
  for(const epochYear of [-YEAR_LIMIT,-1000,0,750,YEAR_LIMIT])for(const numbering of ["year-zero","no-year-zero"] as const){
    const system={...founding,epochYear,numbering};
    for(const canonical of [-YEAR_LIMIT,-1000000,-1,0,1,1000000,YEAR_LIMIT])assert.equal(fromReckoning(toReckoning(canonical,system),system),canonical);
  }
  assert.equal(toReckoning(YEAR_LIMIT,{...founding,epochYear:-YEAR_LIMIT}),2*YEAR_LIMIT+1);
});
test("conversions reject non-integers, invalid epochs, unsupported rules and out-of-range inverses",()=>{
  for(const value of [NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>fromReckoning(value,founding));
  assert.throws(()=>fromReckoning(2,{...founding,epochYear:YEAR_LIMIT}),/canonical range/);
  assert.throws(()=>toReckoning(0,{...founding,epochYear:0.5}));assert.throws(()=>toReckoning(0,{...founding,numbering:"calendar" as never}));
  assert.throws(()=>fromReckoning(0.5));assert.throws(()=>toReckoning(YEAR_LIMIT+1));
});
test("year windows, durations, approximate dates and open eras keep their original precision",()=>{
  const inputs:HistoricalTime[]=[{version:1,scale:"world-year",kind:"known",year:0},{version:1,scale:"world-year",kind:"approximate",year:-1},{version:1,scale:"world-year",kind:"window",startYear:-1,endYear:1},{version:1,scale:"world-year",kind:"duration",startYear:-1,endYear:1},{version:1,scale:"world-year",kind:"undated"}];
  const before=structuredClone(inputs);for(const time of inputs){formatTime(time,founding);assert.deepEqual(historicalTimeSchema.parse(time),time);}assert.deepEqual(inputs,before);
  assert.match(formatTime(inputs[2],founding),/^Sometime between/);assert.doesNotMatch(formatTime(inputs[3],founding),/Sometime/);assert.equal(formatTime(inputs[4],founding),"Date unknown");
  assert.equal(formatEra({startYear:null,endYear:0},founding),"Unknown beginning → Year 1 After Founding");
});
test("canonical fallback and separate reckonings never assume calendar year lengths or days",()=>{
  assert.equal(fromReckoning(0),0);assert.equal(toReckoning(-YEAR_LIMIT),-YEAR_LIMIT);
  assert.equal(formatTime({version:1,scale:"world-year",kind:"known",year:0}),"Year 0");
  const other={...founding,epochYear:100,numbering:"year-zero" as const};assert.equal(fromReckoning(toReckoning(750,founding),founding),fromReckoning(toReckoning(750,other),other));
  for(const extra of [{months:[]},{yearLength:360},{calendarVersionId:"invented"},{day:1},{elapsedDays:0}])assert.equal(datingDraftSchema.safeParse({...founding,...extra}).success,false);
  assert.equal(historicalTimeSchema.safeParse({version:1,scale:"world-year",kind:"known",year:0,month:1,day:1}).success,false);
});
