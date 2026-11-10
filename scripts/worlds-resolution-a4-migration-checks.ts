import assert from "node:assert/strict";
import {mkdir,copyFile,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {publicTableDigests} from "./worlds-collaboration-fixture";

export async function resolutionMigrationChecks(pool:pg.Pool,root:string,out:string){
 const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")),folder=path.join(root,"through-0160");await mkdir(path.join(folder,"meta"),{recursive:true});assert.equal(journal.entries[160].tag,"0160_world_canon_geography_copy");assert.equal(journal.entries.length,162);
 await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.slice(0,161)}));for(const e of journal.entries.slice(0,161))await copyFile(`drizzle/${e.tag}.sql`,path.join(folder,e.tag+".sql"));await migrate(drizzle(pool),{migrationsFolder:folder});assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,161);
 const before=await publicTableDigests(pool),schema=async()=>(await pool.query("select c.relname,n.conname,pg_get_constraintdef(n.oid) definition from pg_constraint n join pg_class c on c.oid=n.conrelid join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' order by c.relname,n.conname")).rows,beforeSchema=await schema(),client=await pool.connect();
 try{await client.query("begin");const statements=(await readFile("drizzle/0161_atlas_expanded_numerical_terrain.sql","utf8")).split("--> statement-breakpoint");assert(statements.length>4);for(const statement of statements.slice(0,Math.floor(statements.length/2)))await client.query(statement);await assert.rejects(client.query("select a4_deliberately_interrupted_migration()"),/does not exist/);await client.query("rollback");}finally{client.release();}
 assert.deepEqual(await schema(),beforeSchema);assert.deepEqual(await publicTableDigests(pool),before);assert.equal((await pool.query("select to_regclass('public.world_terrain_transfer') value")).rows[0].value,null);
 await migrate(drizzle(pool),{migrationsFolder:"drizzle"});const after=await publicTableDigests(pool);for(const [table,hash]of Object.entries(before))assert.equal(after[table],hash,"161-to-162 changed "+table);assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,162);
 await writeFile(path.join(out,"resolution-migration.json"),JSON.stringify({passed:true,baselineMigrations:161,upgradedMigrations:162,priorTablesExact:Object.keys(before).length,interruptedDdlRollbackExact:true,oldConstraintDefinitionsRestored:true,noPartialPreparationTables:true,sharedAccess:false},null,2));
}
