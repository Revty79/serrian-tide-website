import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile,writeFile,mkdir,copyFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {DEFAULT_MAP_APPEARANCE} from "../src/features/worlds/terrain-appearance";
import {restoreTerrainBackup} from "./terrain-backup-restore";

export async function checkCartographyMigration(pool:pg.Pool){
 const url=new URL(process.env.DATABASE_URL!),root=path.dirname(process.env.SERRIAN_TERRAIN_ROOT!);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");assert.match(url.pathname,/^\/serrian_atlas_s3[12]$/);assert.ok(root.startsWith(path.join(tmpdir(),url.pathname.endsWith("s32")?"serrian-atlas-s32-":"serrian-atlas-s31-")));
 const folder=path.join(root,"through-0138"),journal=JSON.parse(await readFile(path.join(process.env.SERRIAN_INHERITED_MIGRATIONS_FOLDER??"drizzle","meta/_journal.json"),"utf8")),entries=journal.entries.filter((e:{idx:number})=>e.idx<=138);await mkdir(path.join(folder,"meta"),{recursive:true});await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries}));for(const e of entries)await copyFile(`drizzle/${e.tag}.sql`,path.join(folder,`${e.tag}.sql`));
 const bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",exe=(name:string)=>path.join(bin,name+".exe"),adminUrl=new URL(url);adminUrl.pathname="/postgres";const admin=new pg.Pool({connectionString:adminUrl.toString()});let upgrade:pg.Pool|undefined,restored:pg.Pool|undefined;
 const names=(await pool.query("select tablename from pg_tables where schemaname='public' and tablename not in ('world_labels','world_labels_version','world_map_appearance','world_terrain_material','world_terrain_material_version','world_hydrology','world_hydrology_version','world_environment','world_environment_version','world_map_style','world_artwork','world_artwork_version') order by tablename")).rows.map(r=>String(r.tablename)),snapshot=async(p:pg.Pool,tables=names)=>{const result:Record<string,unknown>={};for(const table of tables){assert.match(table,/^[a-z0-9_]+$/);result[table]=(await p.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) data from "${table}" t`)).rows[0].data;}return result;};
 try{
  await admin.query("create database serrian_atlas_s31_upgrade");const upgradeUrl=new URL(url);upgradeUrl.pathname="/serrian_atlas_s31_upgrade";upgrade=new pg.Pool({connectionString:upgradeUrl.toString()});await migrate(drizzle(upgrade),{migrationsFolder:folder});
  // This newly owned target already contains migration-seeded catalog rows. Replace
  // those fixture rows with the exact owned source data before testing the upgrade.
  assert.equal((await upgrade.query("select current_database() as name")).rows[0].name,"serrian_atlas_s31_upgrade");
  for(const table of names)await upgrade.query(`alter table "${table}" disable trigger all`);
  await upgrade.query(`truncate table ${names.map(name=>'"'+name+'"').join(',')} restart identity cascade`);
  // Restore owned fixture DATA into the real 0138 schema. No ledger rows are manufactured.
  const dump=path.join(root,"stage2-fixture-data.dump");execFileSync(exe("pg_dump"),["--format=custom","--data-only","--exclude-table=public.world_labels*","--no-owner","--exclude-schema=drizzle","--exclude-table=public.world_map_appearance","--exclude-table=public.world_terrain_material*","--exclude-table=public.world_hydrology*","--exclude-table=public.world_environment*","--exclude-table=public.world_map_style","--exclude-table=public.world_artwork*","--file",dump,url.toString()],{windowsHide:true,stdio:"pipe"});await restoreTerrainBackup({pgRestore:exe("pg_restore"),psql:exe("psql"),dump,sql:path.join(root,"stage2-fixture-data.sql"),host:"127.0.0.1",port:Number(url.port),user:"postgres",database:"serrian_atlas_s31_upgrade",dataOnly:true});
  assert.deepEqual(await snapshot(upgrade),await snapshot(pool));assert.equal((await upgrade.query("select to_regclass('public.world_map_appearance') as t")).rows[0].t,null);assert.ok(Number((await upgrade.query("select count(*) n from world_terrain_refinement_version")).rows[0].n)>0);
  const before=await snapshot(upgrade);await migrate(drizzle(upgrade),{migrationsFolder:process.env.SERRIAN_INHERITED_MIGRATIONS_FOLDER??"drizzle"});assert.deepEqual(await snapshot(upgrade),before);
  const {map_id,world_id}=(await upgrade.query("select map_id,world_id from world_map_canvas limit 1")).rows[0];await upgrade.query("insert into world_map_appearance(map_id,world_id,revision,spec,request_id,updated_by_user_id) values($1,$2,1,$3,'appearance-restore-request','world-god')",[map_id,world_id,{...DEFAULT_MAP_APPEARANCE,style:"illustrated-fantasy"}]);
  await assert.rejects(upgrade.query("update world_map_appearance set spec='{\"version\":2,\"style\":\"invented\"}'"));
  const full=path.join(root,"appearance-and-stage2.dump");execFileSync(exe("pg_dump"),["--format=custom","--no-owner","--file",full,upgradeUrl.toString()],{windowsHide:true,stdio:"pipe"});await admin.query("create database serrian_atlas_s31_restored");const restoredUrl=new URL(url);restoredUrl.pathname="/serrian_atlas_s31_restored";await restoreTerrainBackup({pgRestore:exe("pg_restore"),psql:exe("psql"),dump:full,sql:path.join(root,"appearance-and-stage2.sql"),host:"127.0.0.1",port:Number(url.port),user:"postgres",database:"serrian_atlas_s31_restored"});restored=new pg.Pool({connectionString:restoredUrl.toString()});
  assert.deepEqual(await snapshot(restored,[...names,"world_map_appearance"]),await snapshot(upgrade,[...names,"world_map_appearance"]));assert.equal(Number((await restored.query("select count(*) n from drizzle.__drizzle_migrations")).rows[0].n),journal.entries.length);await migrate(drizzle(restored),{migrationsFolder:process.env.SERRIAN_INHERITED_MIGRATIONS_FOLDER??"drizzle"});
  await writeFile(`${process.env.SERRIAN_PASS8_EVIDENCE_DIR}/appearance-migration.json`,JSON.stringify({passed:true,migration:"0139_world_cartographic_appearance",freshReplay:true,populated0138Upgrade:true,stage2NumericalRefinementsPresent:true,existingTablesExact:names.length,appearanceBackupRestore:true,repeatMigrationNoChange:true,invalidSqlSpecRejected:true,ledger:journal.entries.length,sharedDatabaseWrites:false,productionContacted:false},null,2)+"\n");
 }finally{await Promise.allSettled([upgrade?.end(),restored?.end()]);await admin.end();}
}
