import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { annual, blankCalendarRules, calendarRulesSchema, dateAtIndex, dayIndex, matchesYear, nextYear, yearDays, yearPrefix } from "./calendar";
const unusual=()=>({...blankCalendarRules(),months:Array.from({length:10},(_,i)=>({name:`Moon ${i+1}`,days:36})),weekdays:["Ash","Birch","Cedar","Dawn","Ember","Frost"]});
test("ten 36-day months and six weekdays produce real ordinary dates",()=>{const rules=unusual();const days=yearDays(rules,1);assert.equal(days.length,360);assert.equal(days[35].day,36);assert.equal(days[36].month,2);assert.equal(days[359].weekday,5);assert.equal(yearPrefix(rules,1000000000000),BigInt("360000000000000"));});
test("insertions, exception cycles and out-of-week festivals keep ordinary notation",()=>{
  const rules=unusual();const id=randomUUID();rules.intercalations.push({id,name:"Still day",month:2,afterDay:20,inWeek:false,rule:{...annual(),every:4,exceptEvery:100,restoreEvery:400}});
  rules.observances.push({name:"Still celebration",kind:"festival",description:"",date:{kind:"intercalary",id},rule:annual()});
  assert.equal(yearDays(rules,4).length,361);assert.equal(yearDays(rules,100).length,360);assert.equal(yearDays(rules,400).length,361);
  const extra=yearDays(rules,4).find((date)=>date.intercalaryId===id)!;assert.equal(extra.weekday,null);assert.equal(extra.observances[0].name,"Still celebration");assert.equal(yearDays(rules,4)[extra.ordinal].day,21);assert.equal(dayIndex(rules,{year:4,month:2,day:20,intercalaryId:id}),yearPrefix(rules,4)+BigInt("56"));
  assert.throws(()=>dayIndex(rules,{year:3,month:2,day:20,intercalaryId:id}),/does not occur/);
});
test("signed prefixes equal an independent per-year oracle with explicit exceptions",()=>{
  const rules=unusual();rules.intercalations=[{id:randomUUID(),name:"Leap",month:10,afterDay:36,inWeek:true,rule:{every:4,offset:-2,exceptEvery:12,restoreEvery:24,includeYears:[-5,7],excludeYears:[2]}}];
  for(const numbering of ["year-zero","no-year-zero"] as const){rules.numbering=numbering;const epoch=numbering==="year-zero"?0:1;for(let y=-90;y<=90;y++){if(y===0&&numbering==="no-year-zero")continue;let expected=0;for(let k=Math.min(y,epoch);k<Math.max(y,epoch);k++){if(k===0&&numbering==="no-year-zero")continue;expected+=360+(matchesYear(k,rules.intercalations[0].rule)?1:0);}assert.equal(yearPrefix(rules,y),BigInt(y<epoch?-expected:expected));}}
});
test("date inverse round trips negative, zero and extreme supported years without elapsed-year iteration",()=>{
  const rules=unusual();rules.intercalations=[{id:randomUUID(),name:"Leap",month:1,afterDay:0,inWeek:true,rule:{...annual(),every:7}}];
  const began=performance.now();for(const year of [-1e12,-17,-1,0,1,17,1e12])for(const day of [yearDays(rules,year)[0],yearDays(rules,year).at(-1)!]){const date={year,month:day.month,day:day.day,...(day.intercalaryId?{intercalaryId:day.intercalaryId}:{})};assert.deepEqual(dateAtIndex(rules,dayIndex(rules,date)),date);}assert.ok(performance.now()-began<5000);
  rules.numbering="no-year-zero";assert.equal(nextYear(rules,-1,1),1);assert.equal(nextYear(rules,1,-1),-1);assert.throws(()=>yearDays(rules,0),/no Year 0/);assert.throws(()=>dateAtIndex(rules,yearPrefix(rules,-1e12)-BigInt("1")),/supported range/);
});
test("weekday reset choices, authored units, seasons and ordinal recurrences",()=>{
  const rules=unusual();rules.months[0].days=35;rules.firstWeekday=2;rules.timeUnits={hoursPerDay:10,minutesPerHour:100};rules.seasons=[{name:"Long night",description:"",start:{month:10,day:30},end:{month:1,day:3}}];rules.observances=[{name:"New dawn",kind:"holiday",description:"",date:{kind:"ordinal",day:1},rule:annual()}];
  assert.equal(yearDays(rules,1)[0].observances[0].name,"New dawn");assert.equal(yearDays(rules,1)[0].seasons[0],"Long night");assert.deepEqual(calendarRulesSchema.parse(rules).timeUnits,{hoursPerDay:10,minutesPerHour:100});rules.progression="reset-year";assert.equal(yearDays(rules,500)[0].weekday,2);rules.progression="reset-month";assert.equal(yearDays(rules,500)[35].weekday,2);
});
test("unsupported grammar, invalid insertion and inconsistent boundaries fail closed",()=>{
  const rules=unusual();assert.equal(calendarRulesSchema.safeParse({...rules,script:"eval()"}).success,false);assert.equal(calendarRulesSchema.safeParse({...rules,firstWeekday:7}).success,false);
  assert.equal(calendarRulesSchema.safeParse({...rules,intercalations:[{id:randomUUID(),name:"Bad",month:20,afterDay:0,inWeek:true,rule:{...annual(),every:4,exceptEvery:7}}]}).success,false);assert.equal(calendarRulesSchema.safeParse({...rules,seasons:[{name:"Bad",description:"",start:{month:1,day:37},end:{month:1,day:1}}]}).success,false);
  assert.throws(()=>dayIndex(rules,{year:1,month:1,day:37}),/does not occur/);assert.throws(()=>yearDays(rules,0.5));
});
