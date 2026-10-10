import { z } from "zod";
import { YEAR_LIMIT, yearSchema } from "./history";

const name = z.string().trim().min(1,"Enter a name.").max(120);
const integer = z.number().int();
export const periodicSchema = z.object({
  every:integer.min(1).max(1000000), offset:yearSchema,
  exceptEvery:integer.min(1).max(1000000).nullable(), restoreEvery:integer.min(1).max(1000000).nullable(),
  includeYears:z.array(yearSchema).max(100), excludeYears:z.array(yearSchema).max(100),
}).strict().superRefine((rule,ctx)=>{
  if(rule.exceptEvery && rule.exceptEvery % rule.every)ctx.addIssue({code:"custom",message:"Exception period must be a multiple of the base period."});
  if(rule.restoreEvery && (!rule.exceptEvery || rule.restoreEvery % rule.exceptEvery))ctx.addIssue({code:"custom",message:"Restoring period must be a multiple of the exception period."});
  if(rule.includeYears.some((year)=>rule.excludeYears.includes(year)))ctx.addIssue({code:"custom",message:"A year cannot be both included and excluded."});
});
const boundary = z.object({month:integer.min(1).max(40),day:integer.min(1).max(400)}).strict();
export const calendarRulesSchema = z.object({
  version:z.literal(1), numbering:z.enum(["year-zero","no-year-zero"]),
  months:z.array(z.object({name,days:integer.min(1).max(400)}).strict()).min(1).max(40),
  weekdays:z.array(name).min(1).max(20), progression:z.enum(["continuous","reset-year","reset-month"]), firstWeekday:integer.min(0).max(19),
  timeUnits:z.object({hoursPerDay:integer.min(1).max(1000),minutesPerHour:integer.min(1).max(1000)}).strict().nullable(),
  intercalations:z.array(z.object({id:z.string().uuid(),name,month:integer.min(1).max(40),afterDay:integer.min(0).max(400),inWeek:z.boolean(),rule:periodicSchema}).strict()).max(20),
  seasons:z.array(z.object({name,description:z.string().max(1000),start:boundary,end:boundary}).strict()).max(20),
  observances:z.array(z.object({name,description:z.string().max(1000),kind:z.enum(["holiday","festival","recurring"]),
    date:z.discriminatedUnion("kind",[z.object({kind:z.literal("month-day"),...boundary.shape}).strict(),z.object({kind:z.literal("ordinal"),day:integer.min(1).max(20000)}).strict(),z.object({kind:z.literal("intercalary"),id:z.string().uuid()}).strict()]),rule:periodicSchema}).strict()).max(100),
}).strict().superRefine((rules,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:"custom",message});
  if(rules.firstWeekday>=rules.weekdays.length)fail("The first weekday must exist in this week.");
  const valid=(date:{month:number;day:number})=>!!rules.months[date.month-1] && date.day<=rules.months[date.month-1].days;
  for(const day of rules.intercalations)if(!rules.months[day.month-1] || day.afterDay>rules.months[day.month-1].days)fail("An intercalary insertion must follow a day in an existing month (or day 0). ");
  if(new Set(rules.intercalations.map(({id})=>id)).size!==rules.intercalations.length)fail("Intercalary day identities must be unique.");
  for(const season of rules.seasons)if(!valid(season.start)||!valid(season.end))fail("Season boundaries must be ordinary dates in this calendar.");
  for(const item of rules.observances){if(item.date.kind==="month-day" && !valid(item.date))fail("An observance must use an existing ordinary date.");if(item.date.kind==="intercalary" && !rules.intercalations.some(({id})=>id===(item.date as {id:string}).id))fail("The observed intercalary day must exist.");}
});
export type CalendarRules=z.infer<typeof calendarRulesSchema>;
export type PeriodicRule=z.infer<typeof periodicSchema>;
export type CalendarDate={year:number;month:number;day:number;intercalaryId?:string};
export type CalendarDay=CalendarDate & {ordinal:number;weekday:number|null;name:string;seasons:string[];observances:{name:string;kind:string;description:string}[]};
export const annual=():PeriodicRule=>({every:1,offset:0,exceptEvery:null,restoreEvery:null,includeYears:[],excludeYears:[]});
export function blankCalendarRules():CalendarRules{return {version:1,numbering:"year-zero",months:[{name:"First month",days:30}],weekdays:["First day"],progression:"continuous",firstWeekday:0,timeUnits:null,intercalations:[],seasons:[],observances:[]};}
export const calendarIdentitySchema=z.object({name:z.string().trim().min(1).max(160),description:z.string().max(4000),context:z.string().max(10000)}).strict();
export type CalendarIdentity=z.infer<typeof calendarIdentitySchema> & {id:string;worldId:string;revision:number;archived:boolean};
export type CalendarVersion={id:string;worldId:string;calendarId:string;title:string;rules:CalendarRules;revision:number;archived:boolean};
export type CalendarBundle={calendars:CalendarIdentity[];versions:CalendarVersion[];defaultVersionId:string|null;worldRevision:number;canEdit:boolean};

function floor(a:bigint,b:bigint){const q=a/b;return a<BigInt("0") && a%b!==BigInt("0") ? q-BigInt("1") : q;}
function mod(a:bigint,b:bigint){return ((a%b)+b)%b;}
function ordinaryMatch(year:number,rule:PeriodicRule){const delta=BigInt(year)-BigInt(rule.offset);return mod(delta,BigInt(rule.every))===BigInt("0") && (!rule.exceptEvery || mod(delta,BigInt(rule.exceptEvery))!==BigInt("0") || !!rule.restoreEvery && mod(delta,BigInt(rule.restoreEvery))===BigInt("0"));}
export function matchesYear(year:number,rule:PeriodicRule){return rule.includeYears.includes(year) || !rule.excludeYears.includes(year) && ordinaryMatch(year,rule);}
function countRule(start:number,end:number,rule:PeriodicRule,zero:boolean):bigint {
  const count=(period:number)=>floor(BigInt(end)-BigInt("1")-BigInt(rule.offset),BigInt(period))-floor(BigInt(start)-BigInt("1")-BigInt(rule.offset),BigInt(period));
  let total=count(rule.every)-(rule.exceptEvery ? count(rule.exceptEvery) : BigInt("0"))+(rule.restoreEvery ? count(rule.restoreEvery) : BigInt("0"));
  for(const year of new Set(rule.includeYears))if(year>=start && year<end && !ordinaryMatch(year,rule))total++;
  for(const year of new Set(rule.excludeYears))if(year>=start && year<end && ordinaryMatch(year,rule))total--;
  if(!zero && start<=0 && end>0 && matchesYear(0,rule))total--;
  return total;
}
function checkedYear(rules:CalendarRules,year:number){yearSchema.parse(year);if(!year && rules.numbering==="no-year-zero")throw new Error("This calendar has no Year 0.");}
export function yearPrefix(rules:CalendarRules,year:number,weekdayOnly=false):bigint {
  checkedYear(rules,year);const epoch=rules.numbering==="year-zero" ? 0 : 1;
  const start=Math.min(epoch,year),end=Math.max(epoch,year),zero=rules.numbering==="year-zero";
  const years=BigInt(end-start-(!zero && start<=0 && end>0 ? 1 : 0));
  let total=years*BigInt(rules.months.reduce((sum,month)=>sum+month.days,0));
  for(const extra of rules.intercalations)if(!weekdayOnly || extra.inWeek)total+=countRule(start,end,extra.rule,zero);
  return year<epoch ? -total : total;
}
export function yearDays(rules:CalendarRules,year:number):CalendarDay[] {
  checkedYear(rules,year);
  const result:CalendarDay[]=[];let consumed=rules.progression==="continuous" ? yearPrefix(rules,year,true) : BigInt("0");
  const seasonAt=(month:number,day:number)=>{const key=month*1000+Math.max(day,1);return rules.seasons.filter(({start,end})=>{const a=start.month*1000+start.day,b=end.month*1000+end.day;return a<=b ? key>=a&&key<=b : key>=a||key<=b;}).map(({name})=>name);};
  function append(month:number,day:number,extra?:CalendarRules["intercalations"][number]){
    const inWeek=!extra || extra.inWeek;
    const date:CalendarDay={year,month,day,...(extra ? {intercalaryId:extra.id} : {}),ordinal:result.length+1,weekday:inWeek ? Number(mod(BigInt(rules.firstWeekday)+consumed,BigInt(rules.weekdays.length))) : null,name:extra?.name ?? String(day),seasons:seasonAt(month,day),observances:[]};
    date.observances=rules.observances.filter((item)=>matchesYear(year,item.rule) && (item.date.kind==="ordinal" ? item.date.day===date.ordinal : item.date.kind==="intercalary" ? item.date.id===extra?.id : !extra && item.date.month===month && item.date.day===day)).map(({name,kind,description})=>({name,kind,description}));
    result.push(date);if(inWeek)consumed++;
  }
  rules.months.forEach((month,index)=>{
    if(rules.progression==="reset-month")consumed=BigInt("0");
    for(let day=0;day<=month.days;day++){if(day)append(index+1,day);for(const extra of rules.intercalations)if(extra.month===index+1 && extra.afterDay===day && matchesYear(year,extra.rule))append(index+1,day,extra);}
  });return result;
}
export function dayIndex(rules:CalendarRules,date:CalendarDate):bigint {
  const found=yearDays(rules,date.year).find((item)=>item.month===date.month && item.day===date.day && item.intercalaryId===date.intercalaryId);
  if(!found)throw new Error("This date does not occur in that calendar year.");
  return yearPrefix(rules,date.year)+BigInt(found.ordinal-1);
}
export function dateAtIndex(rules:CalendarRules,index:bigint):CalendarDate {
  const printed=(n:number)=>rules.numbering==="no-year-zero" && n>=0 ? n+1 : n;
  let low=-YEAR_LIMIT,high=rules.numbering==="no-year-zero" ? YEAR_LIMIT-1 : YEAR_LIMIT;
  if(index<yearPrefix(rules,printed(low)) || index>=yearPrefix(rules,printed(high))+BigInt(yearDays(rules,printed(high)).length))throw new Error("The elapsed position is outside this calendar's supported range.");
  while(low<high){const mid=low+Math.ceil((high-low)/2);if(yearPrefix(rules,printed(mid))<=index)low=mid;else high=mid-1;}
  const year=printed(low),day=yearDays(rules,year)[Number(index-yearPrefix(rules,year))];
  return {year,month:day.month,day:day.day,...(day.intercalaryId ? {intercalaryId:day.intercalaryId} : {})};
}
export function nextYear(rules:CalendarRules,year:number,delta:number){const index=rules.numbering==="no-year-zero" && year>0 ? year-1 : year;const moved=index+delta;const value=rules.numbering==="no-year-zero" && moved>=0 ? moved+1 : moved;checkedYear(rules,value);return value;}
export function dateLabel(rules:CalendarRules,date:CalendarDate){return `${date.intercalaryId ? rules.intercalations.find(({id})=>id===date.intercalaryId)?.name ?? "Intercalary day" : `${rules.months[date.month-1]?.name ?? "Unknown month"} ${date.day}`}, Year ${date.year.toLocaleString("en-US")}`;}
