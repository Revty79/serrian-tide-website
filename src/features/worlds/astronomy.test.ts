import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { exact, exactLabel, add, floor, blankCycle, cycleSchema, projectCycle, projectionPosition, compare, astronomyFamilies } from "./astronomy";
import { emptyLore, loreDraftSchema, loreWorkspaceTab } from "./peoples";
import { blankCalendarRules, annual } from "./calendar";
import { convertDate, toElapsed } from "./calendar-dates";

test("all astronomical identities begin with a name and remain in Cosmology",()=>{
  for(const family of Object.keys(astronomyFamilies) as (keyof typeof astronomyFamilies)[]){assert.ok(loreDraftSchema.safeParse({...emptyLore(family),name:"Original sky"}).success);assert.equal(loreWorkspaceTab(family),"cosmology");}
});
test("far shared days retain fractional ordering beyond authored numerator precision",()=>{
  const cycle={...blankCycle(),period:"0.000000000001",anchor:"0"};
  const result=projectCycle(cycle,"0","99999999999999999998","99999999999999999999");
  assert.equal(result.occurrences.length,200);assert.equal(result.truncated,true);
  assert.equal(compare(projectionPosition(result.occurrences[0].position),projectionPosition(result.occurrences[1].position)),-1);
  assert.throws(()=>exact(result.occurrences[1].position));
  const extreme={...cycle,unit:"minute" as const,period:"1/999999999989",offset:"1/999999999967"};
  const other=projectCycle(extreme,"0","99999999999999999998","99999999999999999999",{n:BigInt("1"),d:BigInt("1000000")});
  assert.equal(compare(projectionPosition(other.occurrences[0].position),projectionPosition(other.occurrences[1].position)),-1);
});
test("exact decimals, fractions and negative floor never pass through floating point",()=>{
  assert.equal(exactLabel(add(exact("0.1"),exact("0.2"))),"3/10");assert.equal(exactLabel(exact("-0.125")),"-1/8");assert.equal(floor(exact("-7/3")),BigInt("-3"));assert.throws(()=>exact("1/0"));assert.throws(()=>exact("1e5"));assert.throws(()=>exact("0.1234567890123"));
});
const moon=()=>({...blankCycle(),period:"35",anchor:"0",phases:["Sleeping Ember","First Whisper","Silver Awakening","Crown of Glass","Returning Silence"].map(name=>({id:randomUUID(),name,duration:"7",description:""}))});
test("original moon phases repeat across boundaries, Year 0 and negative positions",()=>{
  const c=moon();assert.equal(projectCycle(c,"0","0","0").phase,"Sleeping Ember");assert.equal(projectCycle(c,"0","7","7").phase,"First Whisper");assert.equal(projectCycle(c,"0","-1","-1").phase,"Returning Silence");assert.equal(projectCycle(c,"0","35","35").phase,"Sleeping Ember");assert.deepEqual(projectCycle(c,"0","-70","70").occurrences.map(o=>o.position),["-70","-35","0","35","70"]);
});
test("unequal rational phases retain exact boundaries and far future repeatability",()=>{
  const c={...moon(),period:"7/3",phases:[{id:randomUUID(),name:"Short",duration:"1/3",description:""},{id:randomUUID(),name:"Long",duration:"2",description:""}]};assert.ok(cycleSchema.safeParse(c).success);assert.equal(projectCycle(c,"0","1/3","1/3").phase,"Long");assert.equal(projectCycle(c,"0","700000000000","700000000000").phase,"Short");assert.equal(projectCycle(c,"0","-700000000000","-700000000000").phase,"Short");
});
test("invalid phase sums, duplicate states, scales and bounds fail visibly",()=>{
  const c=moon();assert.equal(cycleSchema.safeParse({...c,period:"36"}).success,false);assert.equal(cycleSchema.safeParse({...c,phases:[c.phases[0],c.phases[0]]}).success,false);assert.equal(cycleSchema.safeParse({...c,unit:"year"}).success,false);assert.equal(cycleSchema.safeParse({...c,beginning:"2",ending:"1"}).success,false);assert.equal(cycleSchema.safeParse({...c,window:"36"}).success,false);
});
test("unknown anchors, qualitative phases and irregular prose fabricate no dates",()=>{
  assert.equal(projectCycle({...moon(),period:null},"0","0","35").occurrences.length,0);assert.equal(projectCycle(moon(),null,"0","35").occurrences.length,0);assert.equal(projectCycle({...moon(),phases:moon().phases.map(p=>({...p,duration:null}))},"0","1","1").phase,null);assert.ok(loreDraftSchema.safeParse({...emptyLore("skyCycle"),name:"A comet when rulers die",description:"Its exceptional law is an authored claim"}).success);
});
test("offsets, recurring windows and model termination are explicit",()=>{
  const c={...moon(),offset:"2",window:"4",beginning:"0",ending:"40",approximate:true};const result=projectCycle(c,"0","3","41");assert.deepEqual(result.occurrences.map(o=>[o.position,o.end]),[["2","6"],["37","40"]]);assert.ok(result.occurrences.every(o=>o.approximate));assert.equal(projectCycle(c,"0","41","100").occurrences.length,0);assert.ok(projectCycle(c,"0","41","41").reason);
});
test("hard horizons and occurrence caps bound very short periods",()=>{
  assert.throws(()=>projectCycle(moon(),"0","0","1000001"),/bounded/);const result=projectCycle({...moon(),period:"0.000000000001",phases:[]},"0","0","100");assert.equal(result.occurrences.length,200);assert.equal(result.truncated,true);
});
test("canonical year recurrence does not derive a calendar day or geometric eclipse",()=>{
  const c={...blankCycle(),scale:"world-year" as const,unit:"year" as const,period:"144",anchor:"0"};assert.ok(cycleSchema.safeParse(c).success);assert.deepEqual(projectCycle(c,"0","-288","288").occurrences.map(o=>o.position),["-288","-144","0","144","288"]);assert.equal(cycleSchema.safeParse({...c,anchorCalendar:{versionId:randomUUID(),revision:1,date:{year:0,month:1,day:1}}}).success,false);
});
test("existing unequal months and leap days preserve the shared-day correspondence",()=>{
  const rules={...blankCalendarRules(),months:[{name:"Ash",days:31},{name:"Whisper",days:4}],intercalations:[{id:randomUUID(),name:"The extra silence",month:2,afterDay:4,inWeek:false,rule:{...annual(),every:4}}]};
  const anchor={versionId:randomUUID(),elapsedDay:"0",date:{year:0,month:1,day:1}};assert.equal(toElapsed(rules,anchor,{year:0,month:2,day:4}),"34");assert.equal(toElapsed(rules,anchor,{year:0,month:2,day:4,intercalaryId:rules.intercalations[0].id}),"35");assert.equal(projectCycle(moon(),"0","35","35").phase,"Sleeping Ember");assert.throws(()=>convertDate({rules},{rules,anchor},{year:0,month:1,day:1}),/anchor/);
});
