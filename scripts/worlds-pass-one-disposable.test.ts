import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";
import { entryDraftOf, worldDraftOf } from "../src/features/worlds/client-api";
import type { EntryDraft, HistoricalTime } from "../src/features/worlds/history";
import { calendarServiceChecks, calendarBrowserChecks } from "./worlds-calendar-checks";
import { evolutionServiceChecks, evolutionBrowserChecks } from "./worlds-calendar-evolution-checks";
import { cartographyServiceChecks, cartographyBrowserChecks } from "./worlds-cartography-checks";
import { atlasServiceChecks, atlasBrowserChecks } from "./worlds-atlas-checks";
import { blankCalendarRules } from "../src/features/worlds/calendar";
import { chronologyServiceChecks, chronologyBrowserChecks } from "./worlds-chronology-checks";

const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const executable = (name:string) => path.join(postgresBin,process.platform === "win32" ? `${name}.exe` : name);
async function freePort() { const listener=createServer();await new Promise<void>((resolve,reject)=>{listener.once("error",reject);listener.listen(0,"127.0.0.1",resolve);});const address=listener.address();assert.ok(address&&typeof address==="object");await new Promise<void>((resolve,reject)=>listener.close((error)=>error?reject(error):resolve()));return address.port; }
async function signIn(context:BrowserContext,url:string,id:string) {const response=await context.request.post(`${url}/api/auth/sign-in/email`,{headers:{Origin:url},data:{email:`${id}@example.invalid`,password:"Worlds-Test-Only-Password!"}});assert.equal(response.status(),200,await response.text());}
async function hydrated(page:Page) {await page.waitForFunction(()=>[...document.querySelectorAll("button")].some((button)=>Object.keys(button).some((key)=>key.startsWith("__reactProps$"))));}
async function assertNoOverflow(page:Page) {assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),"The page must fit its phone viewport.");}
async function closeEditor(page:Page) {await page.getByRole("button",{name:"Close editor",exact:true}).click();const discard=page.getByRole("button",{name:"Discard draft",exact:true});if(await discard.isVisible())await discard.click();}
async function seedClassificationFixtures(pool: pg.Pool) {
  const fixtures: { name: string; group: string; owner?: string | null; canon?: boolean; archived?: boolean }[] = [
    {name:"High Fantasy",group:"Genre",owner:"world-admin",canon:true},
    {name:"Ancient",group:"Era",owner:"world-admin",canon:true},
    {name:"Mechanical",group:"Equipment",owner:"world-admin",canon:true},
    {name:"God A Era",group:"Era",owner:"world-god"},
    {name:"God A Genre",group:"Genre",owner:"world-god"},
    {name:"God B Era",group:"Era",owner:"other-god"},
    {name:"God B Genre",group:"Genre",owner:"other-god"},
    {name:"Admin Era",group:"Era",owner:"world-admin"},
    {name:"Admin Genre",group:"Genre",owner:"world-admin"},
    {name:"Unattributed Era",group:"Era",owner:null},
    {name:"Unlinked Genre",group:"Genre"},
    {name:"Archived Era",group:"Era",owner:"world-god",archived:true},
    {name:"Retained Lost Genre",group:"Genre",owner:"world-god",archived:true},
    {name:"Other Retained Genre",group:"Genre",owner:"other-god",archived:true},
  ];
  const ids = new Map<string, number>();
  for (const [index, fixture] of fixtures.entries()) {
    const tag = (await pool.query("insert into item_tags_catalog (canonical_id,name,tag_group,description) values ($1,$2,$3,$4) returning id",
      [`TAG-WORLD-${index}`,fixture.name,fixture.group,`Description for ${fixture.name}`])).rows[0];
    ids.set(fixture.name,tag.id);
    if (fixture.owner === undefined) continue;
    const scope = fixture.group === "Era" ? "equipment" : "inventory";
    const item = (await pool.query(`insert into items (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,is_system_canon,canon_marked_by_user_id,canon_marked_at,archived_at)
      values ($1,$2,$3,$4,'Item','World fixture','World fixture','Each',$5,$6,case when $6 then 'world-admin' else null end,case when $6 then now() else null end,case when $7 then now() else null end) returning id`,
      [`ITEM-WORLD-${index}`,`Catalog fixture ${fixture.name}`,scope,scope === "equipment" ? "general" : null,fixture.owner,!!fixture.canon,!!fixture.archived])).rows[0];
    await pool.query("insert into item_tag_links (item_id,tag_id) values ($1,$2)",[item.id,tag.id]);
  }
  return ids;
}
async function assertEraLabels(timeline: Locator) {
  const boxes = await timeline.locator("button[data-open]").evaluateAll(async (bands) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return bands.map((band) => {
      const label = band.querySelector("span")!;
      const b = band.getBoundingClientRect(), l = label.getBoundingClientRect();
      return {name:label.textContent,anchored:label.offsetParent === band,band:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width},label:{left:l.left,right:l.right,top:l.top,bottom:l.bottom,width:l.width}};
    });
  });
  assert.ok(boxes.length >= 3,"The fixture must exercise multiple overlapping and open-ended bands.");
  for (const {name,anchored,band,label} of boxes) {
    assert.equal(anchored,true,`${name}: its band must be the label's positioning ancestor.`);
    assert.ok(label.width > 0 && label.left >= band.left && label.right <= band.right + 1,`${name}: the label's horizontal bounds must stay within its band.`);
    assert.ok(label.top >= band.top && label.bottom <= band.bottom + 1,`${name}: the label's vertical bounds must stay within its band.`);
    assert.ok(label.left - band.left >= 1 && label.left - band.left <= 20,`${name}: the label must stay near the band's visible start.`);
  }
  return boxes;
}
async function checkEraLabelNavigation(page: Page, baseUrl: string, worldId: string, artifactRoot: string) {
  await page.goto(`${baseUrl}/worlds/${worldId}`);await hydrated(page);
  await page.getByRole("button",{name:/^History \d/}).click();
  const timeline = page.getByRole("region",{name:/Timeline canvas/});
  for (const [size,width,height] of [["desktop",1440,900],["mobile",390,844]] as const) {
    await page.setViewportSize({width,height});
    await page.getByRole("button",{name:"Fit history",exact:true}).click();
    const fitted = await assertEraLabels(timeline);
    assert.equal(fitted.length,6);assert.ok(new Set(fitted.map(({band})=>Math.round(band.left))).size >= 4,"Different era starts must produce distinct band positions.");
    assert.ok(fitted.some(({name,band})=>name==="One year" && band.width <= 45),"A very short era must exercise the minimum-width band.");
    await timeline.scrollIntoViewIfNeeded();await assertNoOverflow(page);
    await page.screenshot({path:path.join(artifactRoot,`worlds-era-labels-${size}.png`),fullPage:false});
    await page.getByRole("button",{name:"Zoom in",exact:true}).click();await assertEraLabels(timeline);
    await page.getByRole("button",{name:"Later years",exact:true}).click();await assertEraLabels(timeline);
    await timeline.focus();await timeline.press("ArrowLeft");await assertEraLabels(timeline);
    await timeline.press("-");await assertEraLabels(timeline);
    await timeline.press("Home");await assertEraLabels(timeline);
    await timeline.scrollIntoViewIfNeeded();const canvas = await timeline.boundingBox();assert.ok(canvas);
    await page.mouse.move(canvas.x + canvas.width / 2,canvas.y + 20);await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 + 24,canvas.y + 20,{steps:4});await page.mouse.up();await assertEraLabels(timeline);
  }
  await page.setViewportSize({width:1440,height:900});
  console.log("PASS: measured label/band bounds and positioning ancestors across overlapping, offset, open-ended and very short eras, zoom/pan/keyboard navigation, desktop and phone.");
}
async function main() {
  const temporaryParent=path.resolve(tmpdir());
  const temporaryRoot=path.resolve(await mkdtemp(path.join(temporaryParent,"serrian-worlds-pass-one-")));
  const data=path.join(temporaryRoot,"data"),dbPort=await freePort(),appPort=await freePort();
  const databaseUrl=`postgresql://postgres@127.0.0.1:${dbPort}/serrian_worlds_test`,baseUrl=`http://127.0.0.1:${appPort}`;
  const artifactRoot=path.resolve("artifacts/guidance"),distName=`artifacts/guidance/worlds-next-${appPort}`,distPath=path.resolve(distName);
  const originalConfig=await readFile("tsconfig.json","utf8"),originalNextEnv=await readFile("next-env.d.ts","utf8");
  await mkdir(artifactRoot,{recursive:true});const log=createWriteStream(path.join(artifactRoot,"worlds-pass-one-next.log"));
  let started=false,pool:pg.Pool|undefined,applicationPool:pg.Pool|undefined,server:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  const errors:string[]=[];
  let activePage: Page | undefined;
  try {
    execFileSync(executable("initdb"),["--auth=trust","--encoding=UTF8","--no-locale","--username=postgres","-D",data],{stdio:"pipe",windowsHide:true});
    execFileSync(executable("pg_ctl"),["-D",data,"-l",path.join(temporaryRoot,"postgres.log"),"-o",`-p ${dbPort} -h 127.0.0.1`,"-w","start"],{stdio:"ignore",windowsHide:true});started=true;
    pool=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${dbPort}/postgres`});await pool.query("create database serrian_worlds_test");await pool.end();pool=new pg.Pool({connectionString:databaseUrl});
    // Rehearse an upgrade with pre-existing users, tags and Campaign/runtime data.
    const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")) as {entries:{tag:string;idx:number}[]};
    assert.equal(journal.entries.at(-1)?.tag,"0105_worlds_atlas_drawing_order");
    const baseline=path.join(temporaryRoot,"baseline");await mkdir(path.join(baseline,"meta"),{recursive:true});
    for(const entry of journal.entries.filter(e=>e.idx<102))await copyFile(path.resolve(`drizzle/${entry.tag}.sql`),path.join(baseline,`${entry.tag}.sql`));
    await writeFile(path.join(baseline,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.filter(e=>e.idx<102)}));
    await migrate(drizzle(pool),{migrationsFolder:baseline});
    const password=await hashPassword("Worlds-Test-Only-Password!");
    for(const [id,role] of [["world-god","god"],["other-god","god"],["world-admin","admin"],["world-player","player"]]) {
      await pool.query('insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$1,$2,true,$1,$1)',[id,`${id}@example.invalid`]);
      await pool.query("insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())",[`${id}-credential`,id,password]);await pool.query("insert into user_role (user_id,role) values ($1,$2)",[id,role]);
    }
    const classificationIds = await seedClassificationFixtures(pool);
    const ownerColumn=(await pool.query("select column_name from information_schema.columns where table_name='campaign' and column_name='owner_user_id'")).rowCount ? ",owner_user_id" : "";
    const campaign=(await pool.query(`insert into campaign (name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id${ownerColumn}) values ('Untouched Campaign','Clock safety fixture',100,100,10,10,10,100,'Credits','Assigned','world-god'${ownerColumn ? ",'world-god'" : ""}) returning id`)).rows[0];
    const session=(await pool.query("insert into campaign_session (campaign_id,title,sequence_number,status,started_at) values ($1,'Untouched active session',1,'active',now()) returning id",[campaign.id])).rows[0];
    await pool.query("insert into campaign_session_scene (campaign_id,session_id,sequence_number,title,status,started_at) values ($1,$2,1,'Untouched scene','active',now())",[campaign.id,session.id]);
    async function runtimeSnapshot() {
      const tables=(await pool!.query("select tablename from pg_tables where schemaname='public' and (tablename like 'campaign%' or tablename like 'form_%' or tablename in ('race_evolution_events','creature_evolution_events','owned_creature_disposition','item_inventory_operation','races','creatures','skill','derived_ability','items','item_tags_catalog','item_tag_links','user_role','user_catalog_preferences','catalog_visibility_scope_activation')) order by tablename")).rows;
      const snapshot:Record<string,unknown>={};
      for(const {tablename} of tables){assert.match(tablename,/^[a-z_]+$/);snapshot[tablename]=(await pool!.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as rows from "${tablename}" t`)).rows[0].rows;}
      return snapshot;
    }
    const legacyWorld=randomUUID(),legacyEra=randomUUID();
    await pool.query("insert into world(id,owner_id,name,introduction,historical_overview) values($1,'other-god','Legacy history','Existing introduction','Existing overview')",[legacyWorld]);
    await pool.query("insert into world_historical_era(id,world_id,name,start_year,end_year) values($1,$2,'An open legacy era',null,0)",[legacyEra,legacyWorld]);
    const legacySystem=randomUUID();await pool.query("insert into world_dating_system(id,world_id,name,origin,epoch_year,numbering,before_label,after_label,referenced_at) values($1,$2,'Legacy Reckoning','A remembered origin',0,'year-zero','Before','After',now())",[legacySystem,legacyWorld]);await pool.query("insert into world_chronology_preference(world_id,default_dating_system_id) values($1,$2)",[legacyWorld,legacySystem]);
    const legacyTimes:HistoricalTime[]=[{version:1,scale:"world-year",kind:"known",year:0},{version:1,scale:"world-year",kind:"approximate",year:-1e12},{version:1,scale:"world-year",kind:"window",startYear:-1,endYear:1},{version:1,scale:"world-year",kind:"duration",startYear:0,endYear:1e12},{version:1,scale:"world-year",kind:"undated"}];
    for(const [index,time] of legacyTimes.entries()){
      const id=randomUUID();await pool.query("insert into world_historical_entry(id,world_id,title,account,historical_time,accuracy,narrative) values($1,$2,$3,'Existing account',$4,'disputed','planned')",[id,legacyWorld,`Legacy ${index}`,time]);
      if(index===0)await pool.query("update world_historical_entry set dating_system_id=$1,source_dating=$2 where id=$3",[legacySystem,{version:1,kind:"year-reckoning",systemId:legacySystem,revision:1,name:"Legacy Reckoning",origin:"A remembered origin",epochYear:0,numbering:"year-zero",beforeLabel:"Before",afterLabel:"After",years:[0]},id]);
      await pool.query("insert into world_entry_era(world_id,entry_id,era_id) values($1,$2,$3)",[legacyWorld,id,legacyEra]);
    }
    await pool.query("insert into world_classification_tag(world_id,tag_id) values($1,$2)",[legacyWorld,classificationIds.get("Ancient")]);
    const legacyCalendar=randomUUID(),legacyVersion=randomUUID();await pool.query("insert into world_calendar(id,world_id,name) values($1,$2,'Legacy Calendar')",[legacyCalendar,legacyWorld]);await pool.query("insert into world_calendar_version(id,world_id,calendar_id,title,rules) values($1,$2,$3,'Original rules',$4)",[legacyVersion,legacyWorld,legacyCalendar,blankCalendarRules()]);await pool.query("insert into world_calendar_preference(world_id,default_version_id) values($1,$2)",[legacyWorld,legacyVersion]);
    const legacyPeriod={time:{version:1,scale:"world-year",kind:"known",year:1},notes:"Legacy active calendar",continues:true};
    await pool.query("insert into world_day_reference(world_id,label,description) values($1,'Existing origin','Existing day-zero description')",[legacyWorld]);
    await pool.query("insert into world_calendar_anchor(version_id,world_id,calendar_date,elapsed_day) values($1,$2,$3,'9007199254740993')",[legacyVersion,legacyWorld,{year:1,month:1,day:1}]);
    await pool.query("insert into world_calendar_history(version_id,world_id,period) values($1,$2,$3)",[legacyVersion,legacyWorld,legacyPeriod]);
    await pool.query("insert into world_calendar_adoption(id,world_id,version_id,label,period) values($1,$2,$3,'Existing people',$4)",[randomUUID(),legacyWorld,legacyVersion,legacyPeriod]);
    const legacySuccessor=randomUUID();await pool.query("insert into world_calendar_version(id,world_id,calendar_id,title,rules) values($1,$2,$3,'Existing successor',$4)",[legacySuccessor,legacyWorld,legacyCalendar,blankCalendarRules()]);
    const legacyEntry=(await pool.query("select id from world_historical_entry where world_id=$1 order by title limit 1",[legacyWorld])).rows[0].id;
    await pool.query("insert into world_calendar_reform(id,world_id,name,predecessor_id,successor_id,effective_time,reason,details,entry_id) values($1,$2,'Existing reform',$3,$4,$5,'Existing reason','Existing transition',$6)",[randomUUID(),legacyWorld,legacyVersion,legacySuccessor,legacyPeriod.time,legacyEntry]);
    await pool.query("insert into world_calendar_entry_date(entry_id,world_id,start_version_id,source) values($1,$2,$3,$4)",[legacyEntry,legacyWorld,legacyVersion,{version:1,kind:"known",start:{versionId:legacyVersion,calendarId:legacyCalendar,revision:1,calendarName:"Legacy Calendar",versionTitle:"Original rules",date:{year:1,month:1,day:1},elapsedDay:"9007199254740993",notation:"Original source notation"}}]);
    const legacyTables=["world_day_reference","world_calendar_anchor","world_calendar_history","world_calendar_adoption","world_calendar_reform","world_calendar_entry_date","world_calendar","world_calendar_version","world_calendar_preference","world","world_historical_era","world_historical_entry","world_entry_era","world_classification_tag","world_dating_system","world_chronology_preference"];
    async function legacySnapshot(){const snapshot:Record<string,unknown>={};for(const table of legacyTables){const expression="to_jsonb(t)";snapshot[table]=(await pool!.query(`select coalesce(jsonb_agg(${expression} order by to_jsonb(t)::text),'[]'::jsonb) as rows from ${table} t`)).rows[0].rows;}return snapshot;}
    const legacyBefore=await legacySnapshot(),before=await runtimeSnapshot();
    const foundation=path.join(temporaryRoot,"foundation");await mkdir(path.join(foundation,"meta"),{recursive:true});
    for(const entry of journal.entries.filter(e=>e.idx<=102))await copyFile(path.resolve(`drizzle/${entry.tag}.sql`),path.join(foundation,`${entry.tag}.sql`));
    await writeFile(path.join(foundation,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.filter(e=>e.idx<=102)}));
    await migrate(drizzle(pool),{migrationsFolder:foundation});assert.deepEqual(await legacySnapshot(),legacyBefore);assert.deepEqual(await runtimeSnapshot(),before);
    const oldMap=randomUUID(),oldGeography=randomUUID(),oldFeature=randomUUID();await pool.query("insert into world_atlas_map(id,world_id,name) values($1,$2,'The Valdorian Atlas')",[oldMap,legacyWorld]);await pool.query("insert into world_geography(id,world_id,name,kind) values($1,$2,'Valdoria (3A)','continent')",[oldGeography,legacyWorld]);await pool.query("insert into world_atlas_feature(id,world_id,map_id,geography_id,geometry) values($1,$2,$3,$4,$5)",[oldFeature,legacyWorld,oldMap,oldGeography,{version:1,type:"polygon",points:[[200,200],[1100,120],[1600,300],[1500,850],[900,1050],[300,950]].map(([x,y])=>({id:randomUUID(),x,y}))}]);
    const atlasUpgradeBefore=(await pool.query("select to_jsonb(f) as row from world_atlas_feature f where id=$1",[oldFeature])).rows;
const integrity=path.join(temporaryRoot,"integrity");await mkdir(path.join(integrity,"meta"),{recursive:true});for(const entry of journal.entries.filter(e=>e.idx<=103))await copyFile(path.resolve(`drizzle/${entry.tag}.sql`),path.join(integrity,`${entry.tag}.sql`));await writeFile(path.join(integrity,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.filter(e=>e.idx<=103)}));await migrate(drizzle(pool),{migrationsFolder:integrity});
    const oldMapBefore=(await pool.query("select to_jsonb(m) as row from world_atlas_map m where id=$1",[oldMap])).rows;
    const cartography=path.join(temporaryRoot,"cartography");await mkdir(path.join(cartography,"meta"),{recursive:true});for(const entry of journal.entries.filter(e=>e.idx<=104))await copyFile(path.resolve(`drizzle/${entry.tag}.sql`),path.join(cartography,`${entry.tag}.sql`));await writeFile(path.join(cartography,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.filter(e=>e.idx<=104)}));await migrate(drizzle(pool),{migrationsFolder:cartography});
    const paintedMap=randomUUID();await pool.query("insert into world_atlas_map(id,world_id,name) values($1,$2,'Existing painted chart')",[paintedMap,legacyWorld]);for(let i=0;i<2;i++){const id=randomUUID();await pool.query("insert into world_atlas_drawing(id,world_id,map_id,content) values($1,$2,$3,$4)",[id,legacyWorld,paintedMap,{version:1,id,name:`Existing stroke ${i}`,archived:false,geographyId:null,type:"terrain",kind:i?"forest":"mountains",points:[{id:randomUUID(),x:400+i*200,y:400}],radius:55,spacing:40,density:2,seed:i+1}]);}const paintedBefore=(await pool.query("select to_jsonb(d) as row from world_atlas_drawing d where map_id=$1 order by id",[paintedMap])).rows;
    await migrate(drizzle(pool),{migrationsFolder:path.resolve("drizzle")});assert.deepEqual((await pool.query("select to_jsonb(d)-'sort_order' as row from world_atlas_drawing d where map_id=$1 order by id",[paintedMap])).rows,paintedBefore);assert.deepEqual((await pool.query("select to_jsonb(m)-'presentation' as row from world_atlas_map m where id=$1",[oldMap])).rows,oldMapBefore);assert.deepEqual((await pool.query("select to_jsonb(f) as row from world_atlas_feature f where id=$1",[oldFeature])).rows,atlasUpgradeBefore);assert.deepEqual(await runtimeSnapshot(),before);assert.deepEqual(await legacySnapshot(),legacyBefore);
    assert.equal((await pool.query("select * from world_historical_entry where dating_system_id is not null or source_dating is not null")).rowCount,1);assert.equal((await pool.query("select * from world_dating_system")).rowCount,1);assert.equal((await pool.query("select * from world_chronology_preference")).rowCount,1);
    assert.equal((await pool.query("select count(*)::int as count from drizzle.__drizzle_migrations")).rows[0].count,journal.entries.length);
    // Code rollback retains the additive schema and source metadata. Rehearse an older reader.
    assert.deepEqual((await pool.query("select historical_time from world_historical_entry where world_id=$1 order by title",[legacyWorld])).rows.map(({historical_time})=>historical_time),legacyTimes);
    await migrate(drizzle(pool),{migrationsFolder:path.resolve("drizzle")});assert.deepEqual(await legacySnapshot(),legacyBefore);
    console.log("PASS: migrations 0102/0103 and new 0104/0105 upgrade existing data through 0103 and painted 0104 maps and preserve existing 0102 geometry, including existing calendar evolution, original source snapshots, calendars and preferences, with existing Worlds/all five date representations, user, catalog, Campaign and active-session data unchanged; ledger complete, reapply safe and old read projection compatible.");
    process.env.DATABASE_URL=databaseUrl;const service=await import("../src/features/worlds/world-service");applicationPool=(await import("../src/db")).pool;
    const references=await service.worldReferences("world-god"),validTag=references.find((tag)=>tag.name==="High Fantasy")!;
    assert.equal(references.some((tag)=>tag.name==="Mechanical"),false);
    const publicNames = ["Ancient","High Fantasy"];
    for (const [id,names] of [["world-god",["God A Era","God A Genre"]],["other-god",["God B Era","God B Genre"]],["world-admin",["Admin Era","Admin Genre"]]] as const)
      assert.deepEqual((await service.worldReferences(id)).map(({name})=>name).sort(),[...publicNames,...names].sort());
    for (const name of ["God B Era","God B Genre","Unattributed Era","Unlinked Genre","Archived Era","Mechanical"])
      await assert.rejects(service.createWorld("world-god",{name:"Forged classification",tagIds:[classificationIds.get(name)!]}),/available Era or Genre/);
    const primary=await service.createWorld("world-god",{name:"Asterfall",description:"Beneath a broken sky, the old kingdoms remember.",tone:"info",tagIds:[validTag.id]});
    const second=await service.createWorld("world-god",{name:"The Quiet Sea"});
    const foreign=await service.createWorld("other-god",{name:"Other owner's private world"});
    const adminWorld=await service.createWorld("world-admin",{name:"Administrator's own world"});
    assert.deepEqual((await service.listWorlds("world-god")).map((world)=>world.id).sort(),[primary,second].sort());
    await assert.rejects(service.getWorld("other-god",primary),/unavailable/);await assert.rejects(service.getWorld("world-admin",primary),/unavailable/);
    assert.equal((await service.getWorld("world-admin",primary,true)).canEdit,false);assert.equal((await service.getWorld("world-admin",adminWorld)).canEdit,true);
    assert.ok((await service.listWorlds("world-admin","review")).some((world)=>world.id===foreign));await assert.rejects(service.listWorlds("world-god","review"),/Administrator/);
    await assert.rejects(service.createWorld("world-player",{name:"Forbidden"}),/access/);await assert.rejects(service.listWorlds("anonymous"),/access/);
    await assert.rejects(service.worldReferences("world-player"),/access/);await assert.rejects(service.worldReferences("anonymous"),/access/);
    await assert.rejects(service.worldReferences("world-god","review"),/Administrator/);
    // Model labels legitimately saved before their backing Items were archived, including legacy Pass 1 associations.
    await pool.query("insert into world_classification_tag (world_id,tag_id) values ($1,$2),($3,$4),($5,$6)",[primary,classificationIds.get("Retained Lost Genre"),foreign,classificationIds.get("Other Retained Genre"),second,classificationIds.get("Archived Era")]);
    assert.ok((await service.worldReferences("world-god")).some(({name})=>name==="Retained Lost Genre"));
    assert.ok((await service.worldReferences("other-god")).some(({name})=>name==="Other Retained Genre"));
    assert.equal((await service.worldReferences("world-god")).some(({name})=>name==="Other Retained Genre"),false);
    assert.equal((await service.worldReferences("other-god")).some(({name})=>name==="Retained Lost Genre"),false);
    assert.equal((await service.worldReferences("world-admin")).some(({name})=>name==="Retained Lost Genre"),false);
    assert.ok((await service.worldReferences("world-admin","review")).some(({name})=>name==="Retained Lost Genre"));
    assert.ok((await service.worldReferences("world-admin","review")).some(({name})=>name==="Other Retained Genre"));
    assert.equal((await service.worldReferences("world-admin","review")).some(({name})=>name==="God B Genre"),false);
    await assert.rejects(service.createWorld("world-admin",{name:"Review cannot grant assignment",tagIds:[classificationIds.get("Other Retained Genre")!]}),/available Era or Genre/);
    const retainedWorld = await service.getWorld("world-god",primary);
    await assert.rejects(service.changeWorld("world-god",primary,{action:"save",revision:retainedWorld.world.revision,draft:{...worldDraftOf(retainedWorld.world),tagIds:[classificationIds.get("God B Genre")!]}}),/available Era or Genre/);
    assert.deepEqual((await service.getWorld("world-god",primary)).world,retainedWorld.world,"A rejected tag replacement must roll back the whole save.");
    const labelWorld = await service.createWorld("world-god",{name:"Era positioning rehearsal",tagIds:[classificationIds.get("Retained Lost Genre")!]});
    for (const [name,startYear,endYear] of [["Early age",0,100],["Overlapping age",40,140],["Later age",180,240],["No beginning",null,70],["No ending",210,null],["One year",150,150]] as const)
      await service.changeHistory("world-god",labelWorld,{entity:"era",action:"save",draft:{name,startYear,endYear}});
    console.log("PASS: shared catalog tag discovery for two G.O.D. users and Admin, hidden private/unattributed/unlinked/archived metadata, retained own/review labels, reuse and forged-selection rollback.");
    const openEra=await service.changeHistory("world-god",primary,{entity:"era",action:"save",draft:{name:"Before the First Dawn",description:"An age with no known beginning.",startYear:null,endYear:50,tone:"primary"}});
    const overlapEra=await service.changeHistory("world-god",primary,{entity:"era",action:"save",draft:{name:"The Golden Kingdoms",description:"The kingdoms' history overlaps the dawn.",startYear:0,endYear:null,tone:"secondary"}});
    const secondEra=await service.changeHistory("world-god",second,{entity:"era",action:"save",draft:{name:"Another world's era",startYear:null,endYear:null,tone:"primary"}});
    const entryDraft=(title:string,time:HistoricalTime,extra:Partial<EntryDraft>={}):EntryDraft=>({title,account:"At the beginning of the record, the sky opened.\n\nThe survivors carried its memory into the new kingdoms.",notes:"A private author note.",time,accuracy:"established",narrative:"recorded",eraIds:[openEra,overlapEra],...extra});
    const known=await service.changeHistory("world-god",primary,{entity:"entry",action:"save",draft:entryDraft("The First Dawn",{version:1,scale:"world-year",kind:"known",year:0})});
    const cases:EntryDraft[]=[entryDraft("The lost expedition",{version:1,scale:"world-year",kind:"approximate",year:-100},{accuracy:"disputed"}),entryDraft("A crown in the dark",{version:1,scale:"world-year",kind:"window",startYear:100,endYear:110},{accuracy:"unverified"}),entryDraft("The Eleven-Year War",{version:1,scale:"world-year",kind:"duration",startYear:100,endYear:110}),entryDraft("A planned assassination",{version:1,scale:"world-year",kind:"known",year:120},{narrative:"planned"}),entryDraft("The nameless legend",{version:1,scale:"world-year",kind:"undated"},{accuracy:"disproven",eraIds:[]}),entryDraft("The beginning of all things",{version:1,scale:"world-year",kind:"known",year:-10000000})];
    for(const draft of cases)await service.changeHistory("world-god",primary,{entity:"entry",action:"save",draft});
    const saved=await service.getWorld("world-god",primary);assert.equal(saved.entries.length,7);assert.equal(saved.entries.find((entry)=>entry.id===known)!.eraIds.length,2);
    await assert.rejects(service.changeHistory("world-god",primary,{entity:"entry",action:"save",draft:entryDraft("Foreign association",{version:1,scale:"world-year",kind:"undated"},{eraIds:[secondEra]})}),/belong to this world/);
    await assert.rejects(pool.query("insert into world_entry_era (world_id,entry_id,era_id) values ($1,$2,$3)",[primary,known,secondEra]),/foreign key/);
    await assert.rejects(pool.query("insert into world_historical_entry (id,world_id,title,account,historical_time) values ($1,$2,'Invalid','Invalid',$3)",[randomUUID(),primary,{version:1,scale:"world-year",kind:"known",year:1.5}]),/check constraint/);
    const worldDraft=worldDraftOf(saved.world);worldDraft.introduction="The stars are scars in Asterfall's sky.\n\nEvery kingdom tells a different story of the first dawn.";worldDraft.historicalOverview="From the ages before memory to the Golden Kingdoms, Asterfall's history is a tapestry of contested accounts.";
    const results=await Promise.allSettled([service.changeWorld("world-god",primary,{action:"save",revision:1,draft:worldDraft}),service.changeWorld("world-god",primary,{action:"save",revision:1,draft:{...worldDraft,description:"A competing draft"}})]);assert.equal(results.filter((result)=>result.status==="fulfilled").length,1);assert.equal(results.filter((result)=>result.status==="rejected").length,1);
    await assert.rejects(service.changeWorld("world-admin",primary,{action:"archive",revision:2}),/unavailable/);await assert.rejects(service.changeHistory("other-god",primary,{entity:"era",id:openEra,revision:1,action:"archive"}),/unavailable/);
    await service.changeHistory("world-god",primary,{entity:"era",id:openEra,revision:1,action:"archive"});assert.equal((await service.getWorld("world-god",primary)).entries.find((entry)=>entry.id===known)!.eraIds.includes(openEra),true);
    await service.changeHistory("world-god",primary,{entity:"era",id:openEra,revision:2,action:"restore"});
    await service.changeHistory("world-god",primary,{entity:"entry",id:known,revision:1,action:"archive"});await service.changeHistory("world-god",primary,{entity:"entry",id:known,revision:2,action:"restore"});
    const changed=await service.getWorld("world-god",primary),oldEntry=changed.entries.find((entry)=>entry.id===known)!;
    await service.changeHistory("world-god",primary,{entity:"entry",id:known,revision:oldEntry.revision,action:"save",draft:{...entryDraftOf(oldEntry),notes:"Updated notes"}});await assert.rejects(service.changeHistory("world-god",primary,{entity:"entry",id:known,revision:oldEntry.revision,action:"save",draft:entryDraftOf(oldEntry)}),/newer version/);
    await service.changeWorld("world-god",second,{action:"archive",revision:1});assert.ok((await service.worldReferences("world-god")).some(({name})=>name==="Archived Era"));await assert.rejects(service.changeHistory("world-god",second,{entity:"era",action:"save",draft:{name:"Blocked",startYear:null,endYear:null}}),/Restore this world/);await service.changeWorld("world-god",second,{action:"restore",revision:2});
    await service.changeHistory("world-god",primary,{entity:"era",id:overlapEra,revision:1,action:"save",draft:{name:"The Golden Kingdoms",description:"An amended account of the kingdoms.",startYear:0,endYear:null,tone:"secondary"}});
    console.log("PASS: private ownership, explicit Admin review, persistence, independent date/status representations, overlapping/open eras, archive/restore, composite FK rejection and concurrent stale edits.");
    // Dense fixture exists only in this disposable database, never in product seed data.
    for(let index=0;index<60;index++)await service.changeHistory("world-god",primary,{entity:"entry",action:"save",draft:entryDraft(`Gathering ${index+1}`,{version:1,scale:"world-year",kind:"known",year:500},{eraIds:[]})});
    const chronologyFixture=await chronologyServiceChecks(service,pool,primary,foreign);
    const calendarService=await import("../src/features/worlds/calendar-service");
    const calendarFixture=await calendarServiceChecks(calendarService,service,pool,primary,foreign,adminWorld);
    const evolutionService=await import("../src/features/worlds/calendar-evolution-service");
    const evolutionFixture=await evolutionServiceChecks(service,calendarService,evolutionService,pool,foreign,calendarFixture.foreignVersion);
    const atlasService=await import("../src/features/worlds/atlas-service");
    const atlasFixture=await atlasServiceChecks(atlasService,service,pool,foreign);
    const artFixture=await cartographyServiceChecks(atlasService,pool,{worldId:legacyWorld,mapId:oldMap,featureId:oldFeature,geographyId:oldGeography},foreign);
    const environment:NodeJS.ProcessEnv={...process.env,NODE_ENV:"production",DATABASE_URL:databaseUrl,BETTER_AUTH_URL:baseUrl,BETTER_AUTH_SECRET:"worlds-pass-one-disposable-secret-only",SERRIAN_TEST_NEXT_DIST_DIR:distName,NEXT_TELEMETRY_DISABLED:"1"};
    await new Promise<void>((resolve,reject)=>{const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env:environment,stdio:["ignore","pipe","pipe"],windowsHide:true});build.stdout!.pipe(log,{end:false});build.stderr!.pipe(log,{end:false});build.once("error",reject);build.once("exit",(code)=>code===0?resolve():reject(new Error(`Build failed (${code}); see artifacts/guidance/worlds-pass-one-next.log`)));});
    console.log("PASS: isolated production build and TypeScript verification.");
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port",String(appPort)],{env:environment,stdio:["ignore","pipe","pipe"],windowsHide:true});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});
    const deadline=Date.now()+120000;let ready=false;while(Date.now()<deadline){assert.equal(server.exitCode,null);try{if((await fetch(`${baseUrl}/login`,{signal:AbortSignal.timeout(5000)})).ok){ready=true;break;}}catch{}await new Promise((resolve)=>setTimeout(resolve,300));}assert.ok(ready);
    browser=await chromium.launch({executablePath:process.env.SERRIAN_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
    const god=await browser.newContext({viewport:{width:1440,height:900},extraHTTPHeaders:{"X-Forwarded-For":"203.0.113.40"}});await signIn(god,baseUrl,"world-god");
    const page=await god.newPage();activePage=page;page.on("pageerror",(error)=>errors.push(error.message));
    await checkEraLabelNavigation(page,baseUrl,labelWorld,artifactRoot);
    await chronologyBrowserChecks(service,page,god,baseUrl,chronologyFixture,artifactRoot);
    await calendarBrowserChecks(calendarService,page,god,baseUrl,calendarFixture,artifactRoot);
    await evolutionBrowserChecks(page,god,baseUrl,evolutionFixture,artifactRoot);
    await atlasBrowserChecks(page,god,baseUrl,atlasFixture,artifactRoot);
    await cartographyBrowserChecks(browser,baseUrl,artFixture,artifactRoot);
    await page.goto(`${baseUrl}/worlds`);await hydrated(page);await page.getByRole("heading",{name:"Worlds",exact:true}).waitFor();assert.equal(await page.getByText("Other owner's private world",{exact:true}).count(),0);
    await page.getByRole("button",{name:"Create world",exact:true}).click();await page.getByLabel("World name",{exact:true}).fill("Lantern Reach");
    await page.getByRole("button",{name:"Choose",exact:true}).click();await page.getByRole("group",{name:"Available Genre classifications",exact:true}).getByRole("button",{name:"High Fantasy",exact:true}).click();await page.getByRole("button",{name:"Era",exact:true}).click();await page.getByLabel("Search classifications",{exact:true}).fill("Anc");await page.getByRole("group",{name:"Available Era classifications",exact:true}).getByRole("button",{name:"Ancient",exact:true}).click();
    await page.getByLabel("Search classifications",{exact:true}).evaluate((element)=>element.scrollIntoView({block:"center"}));await page.screenshot({path:path.join(artifactRoot,"worlds-classifications-desktop.png"),fullPage:false});await page.setViewportSize({width:390,height:844});await assertNoOverflow(page);await page.getByLabel("Search classifications",{exact:true}).evaluate((element)=>element.scrollIntoView({block:"center"}));await page.screenshot({path:path.join(artifactRoot,"worlds-classifications-mobile.png"),fullPage:false});
    await page.getByRole("button",{name:"Remove Ancient classification",exact:true}).click();await page.getByRole("group",{name:"Available Era classifications",exact:true}).getByRole("button",{name:"Ancient",exact:true}).click();await page.getByRole("button",{name:"Done",exact:true}).click();await page.setViewportSize({width:1440,height:900});
    await page.getByRole("dialog").getByRole("button",{name:"Create world",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});await page.getByRole("link",{name:"Open Lantern Reach",exact:true}).waitFor();assert.equal((await service.listWorlds("world-god")).find((world)=>world.name==="Lantern Reach")!.tagIds.length,2);await page.reload();await page.getByRole("link",{name:"Open Lantern Reach",exact:true}).waitFor();
    await page.getByLabel("Search worlds",{exact:true}).fill("Asterfall");assert.equal(await page.getByRole("link",{name:"Open Lantern Reach",exact:true}).count(),0);await page.getByLabel("Search worlds",{exact:true}).fill("");
    await page.screenshot({path:path.join(artifactRoot,"worlds-registry-desktop.png"),fullPage:true});
    await page.getByRole("link",{name:"Open Asterfall",exact:true}).click();await page.getByRole("heading",{name:"Introduction",exact:true}).waitFor();await hydrated(page);await page.screenshot({path:path.join(artifactRoot,"worlds-overview-desktop.png"),fullPage:true});
    await page.getByRole("button",{name:/^History \d/}).click();const timeline=page.getByRole("region",{name:/Timeline canvas/});
    const range=page.locator("p").filter({hasText:/^Years -/}).last();const previous=await range.textContent();await timeline.focus();await timeline.press("ArrowRight");assert.notEqual(await range.textContent(),previous);await timeline.press("+");assert.ok(await timeline.evaluate((element)=>element.querySelectorAll("button").length)<100);await timeline.press("Home");
    await page.locator("#history-year").fill("500");await page.getByRole("button",{name:"Go",exact:true}).click();
    const crowd=page.getByRole("button",{name:/Open \d+ entries near Year/}).first();await crowd.click();const beforeDetail=await range.textContent();await page.getByRole("region",{name:"Grouped historical entries"}).getByRole("button").nth(1).click();await page.getByRole("button",{name:"Close historical details"}).click();assert.equal(await range.textContent(),beforeDetail);await page.getByRole("button",{name:"Close group"}).click();
    await page.getByRole("button",{name:"Fit history",exact:true}).click();
    await page.getByRole("button",{name:"New era",exact:true}).click();await page.getByLabel("Era name",{exact:true}).fill("The Age of Lanterns");await page.getByLabel("Starting year",{exact:true}).fill("1000");await page.getByLabel("Ending year",{exact:true}).fill("1200");await page.getByRole("button",{name:"Save history",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});await page.getByRole("button",{name:/The Age of Lanterns.*1,000/}).last().waitFor();
    await page.getByRole("button",{name:"New entry",exact:true}).click();await page.getByLabel("Entry title",{exact:true}).fill("The Lantern Pact");await page.getByLabel("Historical account",{exact:true}).fill("The city lights were raised together.\n\nTheir pact survived the long winter.");await page.getByLabel("Date representation",{exact:true}).selectOption("window");await page.getByLabel("Starting year",{exact:true}).fill("1000");await page.getByLabel("Ending year",{exact:true}).fill("1010");await page.getByLabel("Historical accuracy",{exact:true}).selectOption("disputed");await page.getByRole("dialog").getByLabel("Narrative status",{exact:true}).selectOption("planned");
    await page.route(`**/api/worlds/${primary}/history`,(route)=>route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:"Simulated temporary save failure."})}));await page.getByRole("button",{name:"Save history",exact:true}).click();await page.getByRole("alert").filter({hasText:"Simulated temporary save failure."}).waitFor();assert.equal(await page.getByLabel("Entry title",{exact:true}).inputValue(),"The Lantern Pact");await page.unroute(`**/api/worlds/${primary}/history`);await page.getByRole("button",{name:"Save history",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});
    await page.getByRole("button",{name:"Chronological list",exact:true}).click();await page.getByLabel("Search history",{exact:true}).fill("Lantern Pact");await page.getByRole("button",{name:"The Lantern Pact",exact:true}).click();await page.getByRole("button",{name:"Edit entry",exact:true}).click();await page.getByLabel("Entry title",{exact:true}).fill("Unsaved Lantern draft");
    const browserEntry=(await service.getWorld("world-god",primary)).entries.find((entry)=>entry.title==="The Lantern Pact")!;
    await service.changeHistory("world-god",primary,{entity:"entry",id:browserEntry.id,revision:browserEntry.revision,action:"save",draft:{...entryDraftOf(browserEntry),notes:"A second tab saved this."}});await page.getByRole("button",{name:"Save changes",exact:true}).click();await page.getByRole("button",{name:"Load latest version",exact:true}).waitFor();assert.equal(await page.getByLabel("Entry title",{exact:true}).inputValue(),"Unsaved Lantern draft");await closeEditor(page);
    await page.getByLabel("Search history",{exact:true}).fill("");await page.getByLabel("Narrative status",{exact:true}).selectOption("planned");assert.ok((await page.getByText("2 matching entries",{exact:true}).count())>0);await page.getByLabel("Narrative status",{exact:true}).selectOption("");await page.getByRole("button",{name:"Timeline",exact:true}).click();
    await page.screenshot({path:path.join(artifactRoot,"worlds-history-desktop.png"),fullPage:true});
    console.log("PASS: gallery creation/search/reload, keyboard timeline navigation, crowded markers, era/entry writing, independent planned/disputed status, failed-save drafts and stale-edit conflict UI.");
    const tab2=await god.newPage();await tab2.goto(`${baseUrl}/worlds/${primary}`);await hydrated(tab2);await page.getByRole("button",{name:"Overview",exact:true}).click();await page.getByRole("button",{name:"Write introduction",exact:true}).click();await page.getByLabel("Introductory story",{exact:true}).fill("This first tab's draft must survive.");await tab2.getByRole("button",{name:"Write introduction",exact:true}).click();await tab2.getByLabel("Introductory story",{exact:true}).fill("This is the newer introduction from the second tab.");await tab2.getByRole("button",{name:"Save changes",exact:true}).click();await tab2.getByRole("dialog").waitFor({state:"hidden"});await page.getByRole("button",{name:"Save changes",exact:true}).click();await page.getByRole("button",{name:"Load latest version",exact:true}).waitFor();assert.equal(await page.getByLabel("Introductory story",{exact:true}).inputValue(),"This first tab's draft must survive.");page.once("dialog",(dialog)=>dialog.accept());await page.getByRole("button",{name:"Load latest version",exact:true}).click();await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>("dialog[open] textarea")?.value==="This is the newer introduction from the second tab.");await closeEditor(page);await tab2.close();
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await assertNoOverflow(page);await page.screenshot({path:path.join(artifactRoot,"worlds-overview-mobile.png"),fullPage:true});await page.getByRole("button",{name:/^History \d/}).click();await assertNoOverflow(page);await page.screenshot({path:path.join(artifactRoot,"worlds-history-mobile.png"),fullPage:true});await page.getByRole("region",{name:"Historical timeline",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifactRoot,"worlds-timeline-mobile.png"),fullPage:false});
    await page.getByRole("button",{name:"New entry",exact:true}).click();await page.getByLabel("Entry title",{exact:true}).fill("A mobile legend");await page.getByLabel("Historical account",{exact:true}).fill("Written from a small window onto a very large world.");await page.getByLabel("Help for Date representation",{exact:true}).click();await page.screenshot({path:path.join(artifactRoot,"worlds-entry-editor-mobile.png"),fullPage:false});await assertNoOverflow(page);await page.getByRole("button",{name:"Save history",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});await page.reload();await hydrated(page);assert.ok((await service.getWorld("world-god",primary)).entries.some((entry)=>entry.title==="A mobile legend"));
    await page.goto(`${baseUrl}/worlds`);await hydrated(page);await page.screenshot({path:path.join(artifactRoot,"worlds-registry-mobile.png"),fullPage:true});await assertNoOverflow(page);
    const quietCard=page.locator("article").filter({has:page.getByRole("heading",{name:"The Quiet Sea",exact:true})});await quietCard.getByRole("button",{name:"Archive",exact:true}).click();await quietCard.getByRole("button",{name:"Archive world",exact:true}).click();await page.getByRole("button",{name:/^Archived/}).click();await quietCard.getByRole("button",{name:"Restore",exact:true}).click();await quietCard.getByRole("button",{name:"Restore world",exact:true}).click();await page.getByRole("button",{name:/^Active/}).click();await page.getByRole("heading",{name:"The Quiet Sea",exact:true}).waitFor();
    console.log("PASS: actual two-tab conflicts, explicit latest-version reload, 390x844 editing and persistence, world archive/restore UI, and desktop/mobile screenshots captured.");
    const anon=await browser.newContext();const player=await browser.newContext({extraHTTPHeaders:{"X-Forwarded-For":"203.0.113.41"}});const other=await browser.newContext({extraHTTPHeaders:{"X-Forwarded-For":"203.0.113.42"}});const admin=await browser.newContext({extraHTTPHeaders:{"X-Forwarded-For":"203.0.113.43"}});await signIn(player,baseUrl,"world-player");await signIn(other,baseUrl,"other-god");await signIn(admin,baseUrl,"world-admin");
    for (const [context,id,hidden] of [[god,"world-god",["God B Era","God B Genre","Other Retained Genre"]],[other,"other-god",["God A Era","God A Genre","Retained Lost Genre"]],[admin,"world-admin",["God A Era","God B Genre","Retained Lost Genre"]]] as const) {
      const response = await context.request.get(`${baseUrl}/api/worlds`);assert.equal(response.status(),200);assert.match(response.headers()["cache-control"],/private, no-store/);
      const body = await response.json();assert.deepEqual(body.tags,await service.worldReferences(id));
      for (const name of [...hidden,"Unlinked Genre","Unattributed Era"]) assert.equal(JSON.stringify(body).includes(name),false,`${id}: private tag names and descriptions must not enter the response.`);
    }
    const reviewed = await admin.request.get(`${baseUrl}/api/worlds?scope=review`);assert.equal(reviewed.status(),200);
    const reviewBody = await reviewed.json();assert.ok(reviewBody.tags.some((tag:{name:string})=>tag.name==="Other Retained Genre"));assert.equal(reviewBody.tags.some((tag:{name:string})=>tag.name==="God B Genre"),false);
    for (const context of [god,admin]) {
      const forged = await context.request.post(`${baseUrl}/api/worlds`,{headers:{Origin:baseUrl},data:{name:"Forged HTTP tag",tagIds:[classificationIds.get("God B Genre")]}});assert.equal(forged.status(),400);assert.equal((await forged.text()).includes("Description for God B Genre"),false);
    }
    assert.equal((await anon.request.get(`${baseUrl}/api/worlds`)).status(),401);assert.equal((await player.request.get(`${baseUrl}/api/worlds`)).status(),403);
    console.log("PASS: authenticated HTTP tag responses match visibility/retention for both G.O.D. users and Admin; private metadata and forged assignments stay blocked.");
    for(const [context,status] of [[anon,401],[player,403],[other,404]] as const) {
      const read=await context.request.get(`${baseUrl}/api/worlds/${primary}`);assert.equal(read.status(),status);assert.equal((await read.text()).includes("Asterfall"),false);assert.match(read.headers()["cache-control"],/no-store/);
      const change=await context.request.patch(`${baseUrl}/api/worlds/${primary}`,{headers:{Origin:baseUrl},data:{action:"archive",revision:1}});assert.equal(change.status(),status);
      const historical=await context.request.post(`${baseUrl}/api/worlds/${primary}/history`,{headers:{Origin:baseUrl},data:{entity:"entry",id:known,revision:1,action:"archive"}});assert.equal(historical.status(),status);
      const chronology=await context.request.post(`${baseUrl}/api/worlds/${chronologyFixture.worldId}/chronology`,{headers:{Origin:baseUrl},data:{action:"default",revision:1,systemId:chronologyFixture.foreignSystem}});assert.equal(chronology.status(),status);assert.equal((await chronology.text()).includes("Foreign secret reckoning"),false);
    }
    for(const context of [anon,player]) {const blocked=await context.newPage();await blocked.goto(`${baseUrl}/worlds/${primary}`);assert.equal((await blocked.content()).includes("Asterfall"),false);assert.ok(!new URL(blocked.url()).pathname.startsWith("/worlds"));}
    const adminPage=await admin.newPage();await adminPage.goto(`${baseUrl}/worlds?scope=review`);await hydrated(adminPage);await adminPage.getByRole("link",{name:"Open Asterfall",exact:true}).click();await adminPage.getByText(/Administrator review · Read-only/).waitFor();assert.equal(await adminPage.getByRole("button",{name:"Write introduction",exact:true}).count(),0);assert.equal((await admin.request.get(`${baseUrl}/api/worlds/${primary}`)).status(),404);assert.equal((await admin.request.get(`${baseUrl}/api/worlds/${primary}?review=1`)).status(),200);assert.equal((await admin.request.patch(`${baseUrl}/api/worlds/${primary}`,{headers:{Origin:baseUrl},data:{action:"archive",revision:1}})).status(),404);
    assert.equal((await god.request.post(`${baseUrl}/api/worlds`,{headers:{Origin:"https://untrusted.example.invalid"},data:{name:"CSRF"}})).status(),403);
    assert.equal((await god.request.get(`${baseUrl}/api/worlds/${foreign}?review=1`)).status(),404);assert.equal((await god.request.get(`${baseUrl}/api/worlds?scope=review`)).status(),403);
    await adminPage.goto(`${baseUrl}/worlds/${chronologyFixture.worldId}?review=1`);await hydrated(adminPage);await adminPage.getByRole("button",{name:"Chronology",exact:true}).click();await adminPage.getByRole("heading",{name:"Founding Reckoning",exact:true}).waitFor();assert.equal(await adminPage.getByRole("button",{name:"New dating system",exact:true}).count(),0);assert.equal(await adminPage.getByRole("button",{name:/^(Edit|Archive|Use).*Count/}).count(),0);
    assert.equal((await admin.request.post(`${baseUrl}/api/worlds/${chronologyFixture.worldId}/chronology?review=1`,{headers:{Origin:baseUrl},data:{action:"save",draft:{name:"Forbidden"}}})).status(),400);
    const reviewWrite=await admin.request.post(`${baseUrl}/api/worlds/${chronologyFixture.worldId}/chronology?review=1`,{headers:{Origin:baseUrl},data:{action:"default",revision:1,systemId:null}});assert.equal(reviewWrite.status(),404);
    const chronologyBundle=await service.getWorld("world-god",chronologyFixture.worldId);const forgedDefault=await god.request.post(`${baseUrl}/api/worlds/${chronologyFixture.worldId}/chronology`,{headers:{Origin:baseUrl},data:{action:"default",revision:chronologyBundle.world.revision,systemId:chronologyFixture.foreignSystem}});assert.equal(forgedDefault.status(),404);assert.equal((await forgedDefault.text()).includes("Foreign secret reckoning"),false);
    for(const [context,status] of [[anon,401],[player,403],[other,404],[admin,404]] as const){const read=await context.request.get(baseUrl+'/api/worlds/'+calendarFixture.worldId+'/calendars');assert.equal(read.status(),status);assert.equal((await read.text()).includes('Coastal Calendar'),false);const write=await context.request.post(baseUrl+'/api/worlds/'+calendarFixture.worldId+'/calendars',{headers:{Origin:baseUrl},data:{action:'default',revision:1,versionId:null}});assert.equal(write.status(),status);}
    await adminPage.goto(baseUrl+'/worlds/'+calendarFixture.worldId+'?review=1');await hydrated(adminPage);await adminPage.getByRole('button',{name:'Calendars',exact:true}).click();await adminPage.getByRole('button',{name:'Open Coastal Calendar',exact:true}).waitFor();assert.equal(await adminPage.getByRole('button',{name:'New calendar',exact:true}).count(),0);assert.equal((await admin.request.get(baseUrl+'/api/worlds/'+calendarFixture.worldId+'/calendars?review=1')).status(),200);
    assert.equal((await god.request.post(baseUrl+'/api/worlds/'+calendarFixture.worldId+'/calendars',{headers:{Origin:'https://untrusted.example.invalid'},data:{action:'default',revision:1,versionId:null}})).status(),403);
    for(const [context,status] of [[anon,401],[player,403],[other,404],[admin,404]] as const){
      const result=await context.request.post(`${baseUrl}/api/worlds/${evolutionFixture.worldId}/calendars/history`,{headers:{Origin:baseUrl},data:{action:"origin",label:"Forged origin",description:"Forbidden"}});assert.equal(result.status(),status);assert.equal((await result.text()).includes("Days since the First Dawn"),false);
      const read=await context.request.get(`${baseUrl}/api/worlds/${evolutionFixture.worldId}/calendars`);assert.equal(read.status(),status);assert.equal((await read.text()).includes("Imperial reform"),false);
    }
    await adminPage.goto(`${baseUrl}/worlds/${evolutionFixture.worldId}?review=1`);await hydrated(adminPage);await adminPage.getByRole("button",{name:"Calendars",exact:true}).click();await adminPage.getByRole("button",{name:"Open Imperial Tradition",exact:true}).click();await adminPage.getByText("History, adoption & date comparison",{exact:true}).click();await adminPage.getByRole("heading",{name:"Imperial reform",exact:true}).waitFor();assert.equal(await adminPage.getByRole("button",{name:"Record reform",exact:true}).count(),0);assert.equal(await adminPage.getByRole("button",{name:"Set effective period",exact:true}).count(),0);
    assert.equal((await admin.request.post(`${baseUrl}/api/worlds/${evolutionFixture.worldId}/calendars/history?review=1`,{headers:{Origin:baseUrl},data:{action:"period",versionId:evolutionFixture.newId,revision:1,period:{time:{version:1,scale:"world-year",kind:"undated"},notes:""}}})).status(),404);
    assert.equal((await god.request.post(`${baseUrl}/api/worlds/${evolutionFixture.worldId}/calendars/history`,{headers:{Origin:"https://untrusted.example.invalid"},data:{action:"origin",label:"CSRF",description:"Forbidden"}})).status(),403);
    for(const [context,status] of [[anon,401],[player,403],[other,404],[admin,404]] as const){const r=await context.request.get(`${baseUrl}/api/worlds/${atlasFixture.worldId}/atlas`);assert.equal(r.status(),status);assert.match(r.headers()["cache-control"],/no-store/);assert.equal((await r.text()).includes("Valdoria"),false);const write=await context.request.post(`${baseUrl}/api/worlds/${atlasFixture.worldId}/atlas`,{headers:{Origin:baseUrl},data:{action:"create",name:"Forbidden",description:"",scope:"world"}});assert.equal(write.status(),status);}
    await adminPage.goto(`${baseUrl}/worlds/${atlasFixture.worldId}?review=1`);await hydrated(adminPage);await adminPage.getByRole("button",{name:"Atlas",exact:true}).click();await adminPage.getByRole("button",{name:"Open The Northern Seas",exact:true}).click();await adminPage.getByRole("application",{name:"Editable map canvas"}).waitFor();assert.equal(await adminPage.getByRole("button",{name:"Draw landmass",exact:true}).count(),0);assert.equal(await adminPage.getByRole("button",{name:"Save map",exact:true}).count(),0);assert.equal((await admin.request.get(`${baseUrl}/api/worlds/${atlasFixture.worldId}/atlas?review=1`)).status(),200);assert.equal((await admin.request.post(`${baseUrl}/api/worlds/${atlasFixture.worldId}/atlas?review=1`,{headers:{Origin:baseUrl},data:{action:"create",name:"Forbidden",description:"",scope:"world"}})).status(),404);assert.equal((await god.request.post(`${baseUrl}/api/worlds/${atlasFixture.worldId}/atlas`,{headers:{Origin:"https://untrusted.example.invalid"},data:{action:"create",name:"CSRF",description:"",scope:"world"}})).status(),403);
    assert.deepEqual(await runtimeSnapshot(),before);assert.deepEqual(errors,[]);
    console.log("PASS: G.O.D./Admin/Player/anonymous direct route and HTTP authorization, no private ID leaks, no-store responses, CSRF rejection, unchanged Campaign/combat/Form/Evolution data and no browser runtime errors.");
  } catch (failure) {
    if(activePage) { await activePage.screenshot({path:path.join(artifactRoot,"worlds-failure.png"),fullPage:false}).catch(()=>{}); console.log(JSON.stringify({browserErrors:errors,alerts:await activePage.getByRole("alert").allTextContents().catch(()=>[]),invalidFields:await activePage.locator("dialog :invalid").evaluateAll((fields)=>fields.map((field)=>({tag:field.tagName,name:field.getAttribute("aria-labelledby"),message:(field as HTMLInputElement).validationMessage}))).catch(()=>[])})); }
    throw failure;
  } finally {
    if(browser)await browser.close();if(server?.pid&&server.exitCode===null){if(process.platform==="win32")execFileSync("taskkill",["/pid",String(server.pid),"/t","/f"],{stdio:"ignore",windowsHide:true});else{server.kill();await new Promise<void>((resolve)=>server!.once("exit",()=>resolve()));}}
    log.end();if(applicationPool)await applicationPool.end();if(pool)await pool.end();if(started&&existsSync(path.join(data,"postmaster.pid")))execFileSync(executable("pg_ctl"),["-D",data,"-m","fast","-w","stop"],{stdio:"ignore",windowsHide:true});
    assert.equal(path.dirname(temporaryRoot),temporaryParent);assert.ok(path.basename(temporaryRoot).startsWith("serrian-worlds-pass-one-"));await rm(temporaryRoot,{recursive:true,force:true});
    assert.equal(path.dirname(distPath),artifactRoot);assert.equal(path.basename(distPath),`worlds-next-${appPort}`);await rm(distPath,{recursive:true,force:true});
    const config=JSON.parse(await readFile("tsconfig.json","utf8")) as {include:string[]};
    config.include=config.include.filter((entry)=>!entry.startsWith(`${distName}/`));
    const ending=originalConfig.includes("\r\n") ? "\r\n" : "\n";
    await writeFile("tsconfig.json",`${JSON.stringify(config,null,2)}\n`.replaceAll("\n",ending));
    const nextEnv=await readFile("next-env.d.ts","utf8");
    await writeFile("next-env.d.ts",nextEnv.replaceAll(`./${distName}/`,originalNextEnv.includes("./.next/dev/") ? "./.next/dev/" : "./.next/"));
  }
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
