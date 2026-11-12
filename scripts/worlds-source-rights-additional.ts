import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {mkdir,copyFile,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {publicTableDigests,type CollaborationFixture} from "./worlds-collaboration-fixture";
import type {WorldEditorProof} from "../src/features/worlds/world-permissions";

export async function rightsMigrationRollback(f:CollaborationFixture){
 await f.pool.query("create database a3_owned_rollback");const target=new URL(f.databaseUrl);target.pathname="/a3_owned_rollback";const pool=new pg.Pool({connectionString:target.toString()});
 try{
  const folder=path.join(f.out,"a3-prior-migrations"),journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));await mkdir(path.join(folder,"meta"),{recursive:true});await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.slice(0,162)}));
  for(const e of journal.entries.slice(0,162))await copyFile(`drizzle/${e.tag}.sql`,path.join(folder,e.tag+".sql"));await migrate(drizzle(pool),{migrationsFolder:folder});
  const before=await publicTableDigests(pool),client=await pool.connect();try{await client.query("begin");for(const statement of(await readFile("drizzle/0162_atlas_source_rights.sql","utf8")).split("--> statement-breakpoint"))await client.query(statement);await assert.rejects(client.query("select a3_deliberate_failed_migration()"));await client.query("rollback");}finally{client.release();}
  assert.equal((await pool.query("select to_regclass('public.atlas_source_rights') name")).rows[0].name,null);assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,162);assert.deepEqual(await publicTableDigests(pool),before);
  await migrate(drizzle(pool),{migrationsFolder:"drizzle"});assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,163);
 }finally{await pool.end();}
}

/** Exact same original services as the website; only newly owned synthetic Worlds. */
export async function rightsCopies(f:CollaborationFixture,sourceId:string,proof:WorldEditorProof){
 const owner="collab-owner-a",admin="collab-admin",player="collab-player",{withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context"),canon=await import("../src/features/worlds/world-canon-service"),templates=await import("../src/features/worlds/map-template-service"),lineage=await import("../src/features/worlds/source-rights-template"),store=await import("../src/features/worlds/source-rights-store"),{db}=await import("../src/db"),world=await import("../src/features/worlds/world-service"),collab=await import("../src/features/worlds/world-collaboration-service");
 const actor=<T>(id:string,p:WorldEditorProof|null,run:()=>T,review=false)=>withWorldRequestAuthority({userId:id,sessionId:f.sessions.get(id)!,proof:p,review,operationId:randomUUID(),reads:new Map()},run);
 const owned=<T>(run:()=>T)=>actor(owner,proof,run),review=<T>(run:()=>T)=>actor(admin,null,run,true);
 const catalogue=await import("../src/features/worlds/map-template-catalogue"),templateId=randomUUID(),content=catalogue.builtInTemplate("atlas-template:geography:island")!.content;
 await owned(()=>templates.changeMapTemplate(owner,f.worldA,{action:"save",requestId:randomUUID(),templateId,revision:0,name:"Owned reference-derived template",description:"Synthetic-only",subtype:"island",genre:"natural",attribution:"Owned fixture creator",content}));
 const target=await actor(owner,null,()=>world.createWorld(owner,{name:"A3 new template destination"})),targetId=target;
 await assert.rejects(actor(owner,null,()=>templates.getMapTemplates(owner,targetId,{id:templateId})),/Retain this template/);
 const targetProof:WorldEditorProof={clientId:randomUUID(),token:randomBytes(32).toString("hex")};targetProof.fence=(await actor(owner,targetProof,()=>collab.changeWorldCollaboration(owner,targetId,{action:"acquire-control",requestId:randomUUID(),proof:targetProof}))).access.editor.fence!;
 await actor(owner,targetProof,()=>lineage.retainTemplateSources(owner,targetId,templateId,1));await actor(owner,targetProof,()=>templates.getMapTemplates(owner,targetId,{id:templateId}));assert.ok((await store.worldRightsSources(db,targetId)).sources.some(s=>s.id===sourceId));
 await actor(owner,targetProof,()=>collab.changeWorldCollaboration(owner,targetId,{action:"release-control",requestId:randomUUID(),proof:targetProof}));
 const marked=await review(()=>canon.changeWorldCanon(admin,f.worldA,{requestId:randomUUID(),revision:0,isCanon:true,confirm:true,note:"Only this newly owned synthetic fixture"})) as {revision:number};
 const command={requestId:randomUUID(),revision:marked.revision as number,name:"A3 synthetic personal variation"};let copy:Awaited<ReturnType<typeof canon.createPersonalCanonWorld>>|undefined;
 for(let i=0;i<64;i++){copy=await actor(player,null,()=>canon.createPersonalCanonWorld(player,f.worldA,command));if(!copy.pending)break;}
 assert.ok(copy&&!copy.pending);const copyId=copy.id;assert.ok((await store.worldRightsSources(db,copyId)).sources.some(s=>s.id===sourceId));
 await review(()=>canon.changeWorldCanon(admin,f.worldA,{requestId:randomUUID(),revision:marked.revision,isCanon:false,confirm:true,note:"End owned publication test"}));
 proof.fence=(await actor(owner,proof,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof}))).access.editor.fence!;
 return{copyId,targetId,templateId};
}
