import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {blankCalendarRules} from "../src/features/worlds/calendar";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
export async function validateNativeWorldContexts(f:RegionalFixture,timelineId:string){
  const {changeCalendar,getCalendars}=await import("../src/features/worlds/calendar-service"),{changeWorldLink}=await import("../src/features/worlds/linking-service"),{changeChronology}=await import("../src/features/worlds/world-service"),{worldCampaignAssociations,changeCampaignAssociation}=await import("../src/features/worlds/campaign-association-service"),{discoverWorldAtlas}=await import("../src/features/worlds/world-atlas-discovery-service"),{changeTimeline}=await import("../src/features/worlds/branching-history-service");
  const integration=JSON.parse(await readFile(path.join(f.out,"worlds-atlas-integration.json"),"utf8")).fixture as {records:Record<string,string>;target:{kind:"terrain";id:string};sources:Record<string,NativeHistoryScope>};
  const rulesId=await changeCalendar("world-god",f.world,{action:"create",draft:{name:"Harbor historical calendar",description:"Actual society tradition",context:"No geographic position",visibility:"ordinary"},title:"Original Harbor rules",rules:blankCalendarRules()});
  const calendar=(await getCalendars("world-god",f.world,false,false,timelineId)).versions.find(v=>v.id===rulesId)!.calendarId;
  const datingId=String(await changeChronology("world-god",f.world,{action:"save",draft:{name:"Harbor original reckoning",description:"",origin:"Recorded Harbor founding",epochYear:0,numbering:"year-zero",beforeLabel:"Before Harbor",afterLabel:"After Harbor",notes:""}}));
  const known=(year:number)=>({version:1 as const,scale:"world-year" as const,kind:"known" as const,year});
  for(const kind of ["calendar","chronology"]){await changeWorldLink("world-god",f.world,{action:"save",timelineId,id:randomUUID(),draft:{kind:"society-time",loreId:integration.records.culture,calendarId:kind==="calendar"?calendar:null,calendarVersionId:kind==="calendar"?rulesId:null,datingSystemId:kind==="chronology"?datingId:null,adoptionId:null,label:`Harbor original ${kind} relationship`,interpretation:"Explicit saved dated society relationship",perspective:"",visibility:"ordinary",beginning:known(100),ending:known(100)}});}
  const campaign=(await f.pool.query("insert into campaign(name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Atlas context campaign','Owned context fixture',100,100,10,10,10,100,'Credits','Assigned','world-god') returning id")).rows[0].id;
  const choices=await worldCampaignAssociations("world-god",f.world),choice=choices.choices.find(c=>c.id===campaign)!;assert.ok(choice);
  await changeCampaignAssociation("world-god",f.world,{action:"link",campaignId:campaign,campaignUpdatedAt:choice.updatedAt,timelineId,startingYear:0});
  const association=(await worldCampaignAssociations("world-god",f.world)).contexts.find(c=>c.campaignId===campaign)!;
  await f.pool.query("insert into campaign_player(campaign_id,user_id) values($1,'other-god'),($1,'world-player')",[campaign]);
  const find=(subject:unknown,year=100,timeline=timelineId)=>discoverWorldAtlas("world-god",f.world,{timelineId:timeline,year,subject});
  const map100=await find({kind:"map",target:integration.target,scope:{...integration.sources["terrain:100"],edit:false}});
  assert.ok(map100.records.some(r=>r.kind==="calendar"&&r.id===calendar&&r.associationVersionId&&new URL(r.href,"https://owned.invalid").searchParams.get("calendarVersion")===rulesId));assert.ok(map100.records.some(r=>r.kind==="chronology"&&r.id===datingId));
  assert.ok(map100.records.some(r=>r.kind==="campaign"&&r.id===association.id&&r.coverage==="current-reference"));
  for(const [kind,id]of [["calendar",calendar],["chronology",datingId]] as const){const result=await find({kind,id});assert.equal(result.maps.length,0);assert.ok(result.records.some(r=>r.id===integration.records.culture&&r.associationVersionId));assert.equal((await find({kind,id},500)).records.filter(r=>r.coverage!=="outside").length,0);}
  const campaignContext=await find({kind:"campaign",id:association.id},0);assert.equal(campaignContext.sourceName,"Atlas context campaign");assert.equal(campaignContext.maps.length,0);
  await assert.rejects(find({kind:"campaign",id:randomUUID()}),/unavailable/);
  for(const user of ["other-god","world-player"])await assert.rejects(discoverWorldAtlas(user,f.world,{timelineId,year:100,subject:{kind:"map",target:integration.target}}),/unavailable|access is required/);
  const revision=(await f.pool.query("select revision from world_timeline where id=$1",[timelineId])).rows[0].revision,branch=await changeTimeline("world-god",f.world,{action:"create",parentRevision:revision,draft:{name:"Unadopted integration account",description:"",explanation:"No society or map is adopted automatically",parentId:timelineId,divergenceYear:0}});
  const branchCalendar=await find({kind:"calendar",id:calendar},100,branch);assert.equal(branchCalendar.maps.length,0);assert.equal(branchCalendar.records.length,0);
  await writeFile(path.join(f.out,"native-world-contexts.json"),JSON.stringify({passed:true,actualSocietyCalendarAndChronologySourcePins:true,noArtificialTimekeepingPositions:true,relatedMapTimekeepingThroughActualMappedSociety:true,campaignContextHasNoGeographicPositionOrDateClaim:true,campaignPlayerCannotBypassWorldAccess:true,yearZeroPreserved:true,unadoptedBranchDoesNotBorrowAssociations:true,sharedDatabaseAccess:false,fixture:{calendar,rulesId,datingId,campaign,contextId:association.id,branch,records:integration.records,target:integration.target,timelineId}},null,2));
}
