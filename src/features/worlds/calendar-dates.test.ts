import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { blankCalendarRules, annual } from "./calendar";
import { calendarEntryDraftSchema, elapsedDaySchema, convertDate, toElapsed, fromElapsed, validateCutover, sourceLabel, type CalendarSource } from "./calendar-dates";
import { reformSchema, calendarPeriodSchema } from "./calendar-evolution";
import { chronologicalEntries, entryDraftSchema, type EntryRecord } from "./history";
const oldRules=()=>({...blankCalendarRules(),months:Array.from({length:10},(_,i)=>({name:`Moon ${i+1}`,days:36})),weekdays:["A","B","C","D","E","F"]});
const newRules=()=>({...blankCalendarRules(),months:Array.from({length:12},(_,i)=>({name:`Month ${i+1}`,days:29}))});
const date={year:1,month:1,day:1};
test("anchored conversion handles different year lengths and reverses distant signed dates",()=>{
  const a={rules:oldRules(),anchor:{versionId:randomUUID(),date,elapsedDay:"0"}},b={rules:newRules(),anchor:{versionId:randomUUID(),date,elapsedDay:"0"}};
  assert.deepEqual(convertDate(a,b,{year:2,month:1,day:1}),{year:2,month:1,day:13});
  for(const year of [-1000000000,-10,0,1,500000000]){const source={year,month:5,day:20};assert.deepEqual(convertDate(b,a,convertDate(a,b,source)),source);}
  a.anchor.elapsedDay="9007199254740993";assert.equal(toElapsed(a.rules,a.anchor,{year:1,month:1,day:2}),"9007199254740994");assert.deepEqual(fromElapsed(a.rules,a.anchor,"9007199254740994"),{year:1,month:1,day:2});
});
test("skipped/repeated labels retain explicit version identity and consecutive cutovers",()=>{
  const a={rules:oldRules(),anchor:{versionId:randomUUID(),date,elapsedDay:"0"}},b={rules:newRules(),anchor:{versionId:randomUUID(),date,elapsedDay:"380"}};
  const before=toElapsed(a.rules,a.anchor,{year:2,month:1,day:20}),after=toElapsed(b.rules,b.anchor,date);validateCutover(before,after);
  assert.equal(toElapsed(a.rules,a.anchor,date),"0");assert.equal(toElapsed(b.rules,b.anchor,date),"380");assert.notEqual(a.anchor.versionId,b.anchor.versionId);
  assert.throws(()=>validateCutover(before,"381"),/immediately follow/);assert.throws(()=>calendarEntryDraftSchema.parse({kind:"known",start:{revision:1,date}}));
});
test("unsupported or missing anchors, absent leap dates and unsafe serialization fail explicitly",()=>{
  const rules=oldRules(),anchor={versionId:randomUUID(),date,elapsedDay:"0"};assert.throws(()=>toElapsed(rules,undefined,date),/no authored day anchor/);assert.throws(()=>convertDate({rules,anchor},{rules},date),/no authored day anchor/);
  for(const value of ["-0","01","1.5","1e3","100000000000000000000",9007199254740993])assert.equal(elapsedDaySchema.safeParse(value).success,false);
  const extraId=randomUUID();rules.intercalations.push({id:extraId,name:"Still",month:2,afterDay:0,inWeek:false,rule:{...annual(),every:4}});assert.throws(()=>toElapsed(rules,anchor,{year:3,month:2,day:0,intercalaryId:extraId}),/does not occur/);const leap={year:4,month:2,day:0,intercalaryId:extraId};assert.deepEqual(fromElapsed(rules,anchor,toElapsed(rules,anchor,leap)),leap);
});
test("canonical precision is separate from optional calendar precision; no chronological sort invents a day mapping",()=>{
  const start={versionId:randomUUID(),revision:1,date};
  for(const kind of ["known","approximate","window","duration"] as const){const source=calendarEntryDraftSchema.parse(kind==="known"||kind==="approximate"?{kind,start}:{kind,start,end:start});assert.equal(source.kind,kind);}
  assert.equal(calendarEntryDraftSchema.safeParse({kind:"undated",start}).success,false);
  assert.equal(calendarPeriodSchema.parse({time:{version:1,scale:"world-year",kind:"approximate",year:801},notes:""}).time.kind,"approximate");
  const draft=entryDraftSchema.parse({title:"A",account:"Account",time:{version:1,scale:"world-year",kind:"undated"},accuracy:"disputed",narrative:"planned",calendarDate:{kind:"known",start}});assert.equal(draft.time.kind,"undated");assert.equal(draft.narrative,"planned");
  const point={...start,calendarId:randomUUID(),calendarName:"Old",versionTitle:"Ancient",elapsedDay:"100",notation:"Moon 1 1, Year 1"};const source:CalendarSource={version:1,kind:"approximate",start:point};assert.match(sourceLabel(source),/^Around /);
  const entry={...draft,id:randomUUID(),worldId:randomUUID(),revision:1,archived:false,updatedAt:"",calendarSource:source} as EntryRecord;const other={...entry,id:randomUUID(),title:"Z",calendarSource:{...source,start:{...point,elapsedDay:"-100"}}};assert.deepEqual(chronologicalEntries([other,entry]).map(item=>item.title),["A","Z"]);
  assert.equal(reformSchema.safeParse({name:"Bad",predecessorId:start.versionId,successorId:start.versionId,time:draft.time,reason:"Reason",details:"",entryId:null,cutover:null}).success,false);
});
