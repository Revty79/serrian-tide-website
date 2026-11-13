/** Fresh, owned loopback PostgreSQL only. This module never loads env files. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "better-auth/crypto";

export const collaborationAccounts = [
  { id: "collab-owner-a", username: "owner_a", name: "Owner A", role: "god" },
  { id: "collab-owner-b", username: "owner_b", name: "Owner B", role: "god" },
  { id: "collab-viewer", username: "invited_viewer", name: "Invited Viewer", role: "player" },
  { id: "collab-editor", username: "invited_editor", name: "Invited Editor", role: "player" },
  { id: "collab-uninvited", username: "uninvited_god", name: "Uninvited G.O.D.", role: "god" },
  { id: "collab-player", username: "ordinary_player", name: "Ordinary Player", role: "player" },
  { id: "collab-admin", username: "site_administrator", name: "Administrator", role: "admin" },
] as const;
export const collaborationPassword = "Collaboration-Test-Only!2026";
export type CollaborationFixture = { accountIds?:Partial<Record<typeof collaborationAccounts[number]["id"],string>>; out: string; root: string; databaseUrl: string; freshUrl: string; restoredUrl: string; terrainRoot: string; assetRoot: string; pool: pg.Pool; sessions: Map<string,string>; worldA: string; worldB: string; timelineA: string; ordinaryEntry: string; protectedEntry: string; runPostgres: (name: string, args: string[]) => void };
export async function publicTableDigests(pool: pg.Pool) {
  const tables = (await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>r.tablename), result:Record<string,string>={};
  for(const table of tables){assert.match(table,/^[a-zA-Z0-9_]+$/);const rows=(await pool.query(`select to_jsonb(t)::text row from "${table}" t`)).rows.map(r=>r.row).sort();result[table]=createHash("sha256").update(JSON.stringify(rows)).digest("hex");}
  return result;
}
async function freePort(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address==="object");const port=address.port;await new Promise<void>(resolve=>server.close(()=>resolve()));assert.notEqual(port,5432);return port;}
export async function withCollaborationFixture(run:(fixture:CollaborationFixture)=>Promise<void>){
  const out=path.resolve(process.env.SERRIAN_COLLAB_OUT??"artifacts/collaboration-s7b-foundation-1"),artifacts=path.resolve("artifacts");assert.ok(out.startsWith(artifacts+path.sep)&&/^collaboration-s7b-/.test(path.basename(out)));assert.equal(await access(out).then(()=>true,()=>false),false,"Use a new evidence target");
  const root=path.join(out,"owned"),data=path.join(root,"data"),terrainRoot=path.join(root,"terrain"),assetRoot=path.join(root,"private-artwork");await mkdir(root,{recursive:true});await mkdir(terrainRoot);await mkdir(assetRoot);const port=await freePort();
  const databaseUrl=`postgresql://postgres@127.0.0.1:${port}/collaboration_upgrade`,freshUrl=`postgresql://postgres@127.0.0.1:${port}/collaboration_fresh`,restoredUrl=`postgresql://postgres@127.0.0.1:${port}/collaboration_restored`,bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin";
  const runPostgres=(name:string,args:string[])=>{execFileSync(path.join(bin,name+(process.platform==="win32"?".exe":"")),args,{windowsHide:true,stdio:name==="pg_ctl"?"ignore":"pipe",maxBuffer:32*1024*1024});};let started=false,pool:pg.Pool|undefined;
  try{
    runPostgres("initdb",["-D",data,"-U","postgres","-A","trust","--encoding=UTF8","--locale=C"]);runPostgres("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);started=true;
    const admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${port}/postgres`});for(const name of ["collaboration_upgrade","collaboration_fresh","collaboration_restored"])await admin.query(`create database ${name}`);await admin.end();
    pool=new pg.Pool({connectionString:databaseUrl});const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));assert.equal(journal.entries.length,164);assert.equal(journal.entries[160].tag,"0160_world_canon_geography_copy");assert.equal(journal.entries[161].tag,"0161_atlas_expanded_numerical_terrain");assert.equal(journal.entries[162].tag,"0162_atlas_source_rights");assert.equal(journal.entries[163].tag,"0163_atlas_refinement_expansion");const oldFolder=path.join(root,"through-0158");await mkdir(path.join(oldFolder,"meta"),{recursive:true});await writeFile(path.join(oldFolder,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.slice(0,159)}));for(const entry of journal.entries.slice(0,159))await cp(`drizzle/${entry.tag}.sql`,path.join(oldFolder,entry.tag+".sql"));await migrate(drizzle(pool),{migrationsFolder:oldFolder});
    process.env.DATABASE_URL=databaseUrl;process.env.BETTER_AUTH_URL="http://127.0.0.1:1";process.env.BETTER_AUTH_SECRET="owned-collaboration-only-auth-secret-at-least-32-characters";process.env.SERRIAN_TERRAIN_ROOT=terrainRoot;process.env.SERRIAN_ASSET_ROOT=assetRoot;process.env.SERRIAN_RASTER_ROOT=path.join(root,"raster");
    const password=await hashPassword(collaborationPassword),sessions=new Map<string,string>();
    for(const account of collaborationAccounts){await pool.query('insert into "user"(id,name,email,username,display_username) values($1,$2,$3,$4,$4)',[account.id,account.name,account.username+"@example.invalid",account.username]);await pool.query('insert into user_role(user_id,role) values($1,$2)',[account.id,account.role]);await pool.query('insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,$2,$3,$4,$3,$5,now())',[randomUUID(),"local:credential",account.id,"credential",password]);const id=randomUUID();sessions.set(account.id,id);await pool.query('insert into session(id,user_id,token,expires_at,updated_at) values($1,$2,$3,$4,now())',[id,account.id,randomUUID(),new Date(Date.now()+86_400_000)]);}
    const service=await import("../src/features/worlds/world-service"),draft=(name:string)=>({name,description:"Owned collaboration fixture",introduction:"Shared introductory prose",historicalOverview:"",tone:"primary",tagIds:[],associatedCampaigns:[]});
    const worldA=await service.createWorld("collab-owner-a",draft("Owner A private World")),worldB=await service.createWorld("collab-owner-b",draft("Owner B private World"));const timelineA=(await pool.query('select id from world_timeline where world_id=$1 and is_primary',[worldA])).rows[0].id;
    const entry=(title:string,visibility:"ordinary"|"protected")=>({title,account:"Recorded account",notes:"Private creator note "+title,visibility,time:{version:1,scale:"world-year",kind:"known",year:100},accuracy:"established",narrative:"recorded",eraIds:[]});
    const ordinaryEntry=await service.changeHistory("collab-owner-a",worldA,{entity:"entry",timelineId:timelineA,action:"save",draft:entry("Ordinary milestone","ordinary")}),protectedEntry=await service.changeHistory("collab-owner-a",worldA,{entity:"entry",timelineId:timelineA,action:"save",draft:entry("Hidden protected milestone","protected")});
    const before=await publicTableDigests(pool);await migrate(drizzle(pool),{migrationsFolder:"drizzle"});const after=await publicTableDigests(pool);for(const[table,digest]of Object.entries(before))assert.equal(after[table],digest,"Upgrade changed "+table);
    const fresh=new pg.Pool({connectionString:freshUrl});await migrate(drizzle(fresh),{migrationsFolder:"drizzle"});assert.equal((await fresh.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0].n,journal.entries.length);await fresh.end();
    await writeFile(path.join(out,"migration.json"),JSON.stringify({passed:true,priorPublicTablesExact:Object.keys(before).length,newPublicTables:Object.keys(after).filter(t=>!Object.hasOwn(before,t)),freshLedgerEntries:journal.entries.length,upgradeLedgerEntries:(await pool.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0].n,migrationSha256:createHash("sha256").update(await readFile("drizzle/0160_world_canon_geography_copy.sql")).digest("hex"),sharedDatabaseAccess:false},null,2));
    await writeFile(path.join(out,"environment.json"),JSON.stringify({root,databaseUrl,freshUrl,restoredUrl,terrainRoot,assetRoot,worldA,worldB,timelineA},null,2));
    // This fixture authored these two tiny Worlds itself before the upgrade.
    // Prove the migration holds them, then use the real administrative review
    // service to certify only this known synthetic input. No owner data is used.
    const {assertWorldSourceUse}=await import("../src/features/worlds/source-rights-store");
    const {db}=await import("../src/db");
    const {withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context");
    const {changeSourceRights}=await import("../src/features/worlds/source-rights-service");
    for(const worldId of [worldA,worldB]){
      await assert.rejects(assertWorldSourceUse(db,worldId,["modify"]),/licensing hold/);
      const sourceId=(await pool.query("select id from atlas_source_rights where subject_kind='legacy-world' and subject_id=$1",[worldId])).rows[0].id;
      await withWorldRequestAuthority({userId:"collab-admin",sessionId:sessions.get("collab-admin")!,proof:null,review:true,operationId:randomUUID(),reads:new Map()},()=>changeSourceRights("collab-admin",worldId,{action:"review",requestId:randomUUID(),sourceId,revision:0,review:{decision:"approved",classification:"original",reason:"Owned synthetic fixture created entirely in this script",evidence:"The inline authored fixture above contains no external geographic or artwork input.",uses:["display","modify","customer-access","digital-images","print","editable-data"],credits:"",serviceVerified:true,upstreamVerified:true,noCostVerified:true,outputVerified:true,recipientRightsVerified:true}}));
    }
    await run({out,root,databaseUrl,freshUrl,restoredUrl,terrainRoot,assetRoot,pool,sessions,worldA,worldB,timelineA,ordinaryEntry,protectedEntry,runPostgres});
  }finally{
    if(process.env.DATABASE_URL===databaseUrl){try{await(await import("../src/db")).pool.end();}catch{}}
    await pool?.end();if(started)runPostgres("pg_ctl",["-D",data,"-m","fast","-w","stop"]);
    await writeFile(path.join(out,"owned-services-stopped.json"),JSON.stringify({stopped:true,ownedDataPath:data,noSharedServiceTouched:true}));
  }
}
