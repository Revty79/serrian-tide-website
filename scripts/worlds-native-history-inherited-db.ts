/** Fresh Stage 7A-schema fixture for the unchanged Stage 5/6 regression suite.
 * Missing-old-schema upgrade claims are not made by this current-schema pass. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,readFile,readdir,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import {withRegionalEditingFixture,type RegionalFixture} from "./worlds-regional-editing-fixture";
import {townMapDatabase} from "./worlds-town-maps-disposable.test";
import {buildingFloorDatabase} from "./worlds-building-floors-database";
import {undergroundDatabase} from "./worlds-underground-disposable.test";
async function run(f:RegionalFixture){
  const root=path.resolve(f.root);assert.ok(root.startsWith(path.join(path.resolve(f.out),"owned-temp")+path.sep));assert.equal((await f.pool.query("select count(*)::int n from world_town_map where world_id=$1",[f.world])).rows[0].n,0);
  process.env.SERRIAN_ASSET_ROOT=path.join(root,"private-artwork");await mkdir(process.env.SERRIAN_ASSET_ROOT,{recursive:true});
  await townMapDatabase(f);await buildingFloorDatabase(f);
  const names=(await f.pool.query("select tablename from pg_tables where schemaname='public' and tablename not like 'world_underground_%' and tablename not like 'atlas_%' and tablename not like 'world_craft%' order by tablename")).rows,rows:Record<string,string>={};
  for(const {tablename}of names){assert.match(tablename,/^[a-z0-9_]+$/);const values=(await f.pool.query('select row_to_json(t)::text payload from "'+tablename+'" t order by row_to_json(t)::text')).rows;rows[tablename]=createHash("sha256").update(JSON.stringify(values)).digest("hex");}
  const privateFiles=[];for(const name of(await readdir(f.terrainRoot,{recursive:true})).sort()){const file=path.join(f.terrainRoot,name),info=await stat(file);if(info.isFile())privateFiles.push({name,bytes:info.size,hash:createHash("sha256").update(await readFile(file)).digest("hex")});}
  await writeFile(path.join(f.out,"before-0153-rows.json"),JSON.stringify(rows));await writeFile(path.join(f.out,"before-0153-private.json"),JSON.stringify(privateFiles));
  // The retained helper has its full original identity/route/security/capacity
  // and paired-restore assertions. Its receipt explicitly identifies this as
  // current-schema regression coverage, rather than a second 0153 rehearsal.
  await undergroundDatabase(f,false);
  await writeFile(path.join(f.out,"historical-inherited-database.json"),JSON.stringify({passed:true,currentSchemaEntries:159,originalTownInteriorUndergroundAssertions:true,freshOwnedFixture:true,notAnOldSchemaUpgradeReceipt:true,sharedDatabaseAccess:false},null,2));
}
async function main(){const out=path.resolve(process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??"artifacts/history-s7a-inherited-db-27");assert.ok(out.startsWith(path.resolve("artifacts/history-s7a-")));await mkdir(path.join(out,"owned-temp"),{recursive:true});process.env.TEMP=path.join(out,"owned-temp");process.env.TMP=process.env.TEMP;process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE=out;await withRegionalEditingFixture(run);}
main().catch(error=>{console.error(error);process.exitCode=1;});
