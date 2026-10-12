/** Additional retained-source and limit/privacy cases in this pass's own cluster. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import type { LinkingFixtures } from "./worlds-linking-checks";
import { emptyLore } from "../src/features/worlds/peoples";
import { blankCalendarRules } from "../src/features/worlds/calendar";
async function main(){
  const e=JSON.parse(await readFile("artifacts/guidance/linking-retained-environment.json","utf8")),f=e.fixtures as LinkingFixtures;
  assert.equal(path.dirname(path.resolve(e.temporaryRoot)),path.resolve(tmpdir()));assert.ok(path.basename(e.temporaryRoot).startsWith("serrian-worlds-linking-"));assert.equal(e.databaseUrl,`postgresql://postgres@127.0.0.1:${e.dbPort}/serrian_worlds_test`);
  process.env.DATABASE_URL=e.databaseUrl;
  const pool=new pg.Pool({connectionString:e.databaseUrl}),application=await import("../src/db"),links=await import("../src/features/worlds/linking-service"),people=await import("../src/features/worlds/peoples-service"),calendars=await import("../src/features/worlds/calendar-service"),worlds=await import("../src/features/worlds/world-service");
  const receipts:string[]=[];
  try{
    let secret=await people.getPeople("world-god",f.worldId,f.primary,f.secretRealm);
    await people.changePeople("world-god",f.worldId,{action:"save",timelineId:f.primary,id:secret.id,revision:secret.revision,draft:{...secret.draft,name:"Released public Realm",visibility:"ordinary"}});
    assert.ok(!(await links.getWorldLinks("world-god",f.worldId,f.primary,false,true)).links.some(l=>l.draft.label==="SECRET_REALM_LINK"));
    secret=await people.getPeople("world-god",f.worldId,f.primary,f.secretRealm);await people.changePeople("world-god",f.worldId,{action:"save",timelineId:f.primary,id:secret.id,revision:secret.revision,draft:{...secret.draft,name:"SECRET_REALM",visibility:"protected"}});receipts.push("An originally protected retained pin stays hidden after its effective source becomes public");
    const realm=await people.changePeople("world-god",f.worldId,{action:"create",timelineId:f.primary,requestId:randomUUID(),draft:{...emptyLore("realm"),name:"Gateway profile",geographies:[{id:randomUUID(),geographyId:f.secretPlace,destinationId:null,relationshipType:"Private portal",account:"",time:{version:1,scale:"world-year",kind:"undated"},protected:true}]}});
    const privateLink=randomUUID();await links.changeWorldLink("world-god",f.worldId,{action:"save",timelineId:f.primary,id:privateLink,draft:{kind:"realm-map",loreId:realm,mapId:f.maps[0],label:"SECRET_GEOGRAPHY_ACCOUNT"}});
    let gateway=await people.getPeople("world-god",f.worldId,f.primary,realm);await people.changePeople("world-god",f.worldId,{action:"save",timelineId:f.primary,id:realm,revision:gateway.revision,draft:{...gateway.draft,geographies:[]}});assert.ok(!(await links.getWorldLinks("world-god",f.worldId,f.primary,false,true)).links.some(l=>l.id===privateLink));
    const publicLink=randomUUID();await links.changeWorldLink("world-god",f.worldId,{action:"save",timelineId:f.primary,id:publicLink,draft:{kind:"realm-map",loreId:realm,mapId:f.maps[0],label:"SECRET_CURRENT_GEOGRAPHY_ACCOUNT"}});
    gateway=await people.getPeople("world-god",f.worldId,f.primary,realm);await people.changePeople("world-god",f.worldId,{action:"save",timelineId:f.primary,id:realm,revision:gateway.revision,draft:{...gateway.draft,geographies:[{id:randomUUID(),geographyId:f.secretPlace,destinationId:null,relationshipType:"Private portal",account:"",time:{version:1,scale:"world-year",kind:"undated"},protected:true}]}});assert.ok(!(await links.getWorldLinks("world-god",f.worldId,f.primary,false,true)).links.some(l=>l.id===publicLink));receipts.push("Retained and effective confidential geographic associations independently withhold an entire connection");
    const c=(await calendars.getCalendars("world-god",f.worldId)).calendars.find(c=>c.id===f.calendarId)!;
    await calendars.changeCalendar("world-god",f.worldId,{action:"identity",id:c.id,revision:c.revision,draft:{name:c.name,description:c.description,context:c.context,visibility:"protected"}});
    const ordinary=await links.getWorldLinks("world-god",f.worldId,f.primary,false,true);assert.ok(!JSON.stringify(ordinary).includes(f.calendarId));assert.ok(!JSON.stringify(ordinary).includes(f.rulesId));await calendars.changeCalendar("world-god",f.worldId,{action:"identity",id:c.id,revision:c.revision+1,draft:{name:c.name,description:c.description,context:c.context,visibility:"ordinary"}});receipts.push("Current calendar protection removes its identities, rules, adoption choices, links and inverse labels");
    const large=await worlds.createWorld("world-god",{name:"Disposable private archive limit fixture"}),timeline=(await worlds.getWorld("world-god",large)).selectedTimeline.id;
    const society=await people.changePeople("world-god",large,{action:"create",timelineId:timeline,requestId:randomUUID(),draft:{...emptyLore("people"),name:"Public limit fixture"}});
    const rules=await calendars.changeCalendar("world-god",large,{action:"create",draft:{name:"SECRET_LARGE_CALENDAR",description:"",context:"",visibility:"protected"},title:"SECRET_RULES",rules:blankCalendarRules()});
    const cv=(await calendars.getCalendars("world-god",large)).versions.find(v=>v.id===rules)!;
    await pool.query("insert into world_calendar_version(id,world_id,calendar_id,title,rules) select gen_random_uuid()::text,$1,$2,'SECRET_RULES_'||s, rules from world_calendar_version cross join generate_series(1,2001) s where id=$3",[large,cv.calendarId,rules]);
    const sample=randomUUID();await links.changeWorldLink("world-god",large,{action:"save",timelineId:timeline,id:sample,draft:{kind:"society-time",loreId:society,calendarId:cv.calendarId,calendarVersionId:null,datingSystemId:null,label:"SECRET_LIMIT_ACCOUNT"}}).catch(async failure=>{
      // Author selectors correctly report the now-large archive. Seed the exact
      // same validated shape through SQL to exercise the ordinary limit guard.
      assert.match(String(failure),/Too many/);
      const lore=(await people.getPeople("world-god",large,timeline,society));
      const draft={kind:"society-time",loreId:society,calendarId:cv.calendarId,calendarVersionId:null,datingSystemId:null,adoptionId:null,label:"SECRET_LIMIT_ACCOUNT",interpretation:"",perspective:"",visibility:"ordinary",beginning:null,ending:null};
      const source={lore:{id:society,versionId:lore.versionId,revision:lore.revision,name:lore.draft.name,family:lore.family},target:{id:cv.calendarId,name:"SECRET_LARGE_CALENDAR",revision:1,visibility:"protected"}};
      await pool.query("insert into world_link_identity(id,world_id,kind,origin_timeline_id,creator_id) values($1,$2,'society-time',$3,'world-god')",[sample,large,timeline]);
      const versionId=randomUUID();await pool.query("insert into world_link_version(id,world_id,link_id,timeline_id,author_id,lore_id,lore_version_id,calendar_id,draft,source) values($1,$2,$3,$4,'world-god',$5,$6,$7,$8,$9)",[versionId,large,sample,timeline,society,lore.versionId,cv.calendarId,draft,source]);await pool.query("insert into world_link_head(world_id,timeline_id,link_id,version_id,revision,mode) values($1,$2,$3,$4,1,'authored')",[large,timeline,sample,versionId]);
    });
    const identities=(await pool.query("insert into world_link_identity(id,world_id,kind,origin_timeline_id,creator_id) select gen_random_uuid()::text,$1,'society-time',$2,'world-god' from generate_series(1,2001) returning id",[large,timeline])).rows.map(r=>r.id);
    for(const id of identities){const v=randomUUID();await pool.query("insert into world_link_version(id,world_id,link_id,timeline_id,author_id,lore_id,lore_version_id,calendar_id,draft,source) select $1,world_id,$2,timeline_id,author_id,lore_id,lore_version_id,calendar_id,draft,source from world_link_version where link_id=$3",[v,id,sample]);await pool.query("insert into world_link_head(world_id,timeline_id,link_id,version_id,revision,mode) values($1,$2,$3,$4,1,'authored')",[large,timeline,id,v]);}
    const largeOrdinary=await links.getWorldLinks("world-god",large,timeline,false,true);assert.equal(largeOrdinary.links.length,0);assert.equal(largeOrdinary.choices.calendars.length,0);assert.equal(largeOrdinary.choices.versions.length,0);assert.ok(!JSON.stringify(largeOrdinary).includes("SECRET_"));receipts.push("More than 2000 protected rules and connections are filtered before ordinary bounds and counts");
    await writeFile("artifacts/guidance/worlds-linking-acceptance/privacy-results.json",JSON.stringify({total:receipts.length,receipts},null,2)+"\n");console.log(`PASS ${receipts.length} additional retained-source and limit/privacy groups.`);
  }finally{await pool.end();await application.pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
