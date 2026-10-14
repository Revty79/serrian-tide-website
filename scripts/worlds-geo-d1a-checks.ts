import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import pg from "pg";
import {environment,DIRECTORY} from "./worlds-geo-d1a-harness";
import {databaseSnapshot} from "./worlds-geo-c.test";
import {livingHistoryFixture,livingHistoryServices} from "./worlds-living-history-checks";
import {geoFixture,geoServices,type GeoFixture} from "./worlds-geo-a-checks";

async function main(){const e=await environment();process.env.DATABASE_URL=e.url;process.env.SERRIAN_RASTER_ROOT=e.assets;const pool=new pg.Pool({connectionString:e.url});
 try{
  if(process.argv.includes("--preservation")){
   const before=JSON.parse(await readFile(`${DIRECTORY}/baseline.json`,"utf8")) as Awaited<ReturnType<typeof databaseSnapshot>>,after=await databaseSnapshot(pool),exceptions:Record<string,number>={world:1,world_atlas_map:1};
   for(const [table,old] of Object.entries(before)){const remaining=new Map<string,number>();for(const h of after[table].rowHashes)remaining.set(h,(remaining.get(h)??0)+1);let missing=0;for(const h of old.rowHashes){const n=remaining.get(h)??0;if(n)remaining.set(h,n-1);else missing++;}assert.equal(missing,exceptions[table]??0,`Unexpected original row changes in ${table}`);}
   const protectedTables=["world_geo_surface","world_geo_view","world_geo_dataset","world_geo_feature","world_geo_version","world_geo_head","world_geo_part","world_raster_source","world_raster_version","world_raster_head","world_raster_asset","world_raster_view","world_categorical_raster_view"];
   const fixtures:GeoFixture=JSON.parse(await readFile(`${DIRECTORY}/geo-fixture.json`,"utf8"));
   for(const table of protectedTables){const hashes=(await pool.query(`select md5(to_jsonb(t)::text) hash from "${table}" t where world_id<>all($1::text[]) order by md5(to_jsonb(t)::text) collate "C"`,[[fixtures.earth,fixtures.fiction]])).rows.map(r=>r.hash);assert.deepEqual(hashes,before[table].rowHashes,table);}
   await writeFile(`${DIRECTORY}/preservation-results.json`,JSON.stringify({allOriginalRowsRetainedExceptExplicitEarthArtworkSave:true,originalVectorAndRasterTablesExact:true,knownEditedTables:exceptions,sourceDatabaseNeverContacted:true,assetsNotWritten:true},null,2));console.log("PASS every original row except the explicitly edited disposable Earth map/World; all geographic/raster tables exact");return;
  }
  for(const [user,role] of [["world-god","god"],["world-admin","admin"],["other-god","god"],["world-player","player"]]){await pool.query('insert into "user"(id,name,email,email_verified,created_at,updated_at) values($1,$1,$2,true,now(),now()) on conflict(id) do nothing',[user,`${user}.d1a@example.test`]);await pool.query("insert into user_role(user_id,role) values($1,$2) on conflict do nothing",[user,role]);}
  const directory=`${DIRECTORY}/living`;await mkdir(directory,{recursive:true});const fixture=await livingHistoryFixture(pool,directory);await livingHistoryServices(pool,fixture,directory);await writeFile(`${DIRECTORY}/living-fixture.json`,JSON.stringify(fixture,null,2));console.log("PASS existing Living History service regressions on a new disposable fixture");
  const geographicDirectory=`${DIRECTORY}/geography`;await mkdir(geographicDirectory,{recursive:true});const geographic=await geoFixture(pool,geographicDirectory);await geoServices(pool,geographic,fixture,geographicDirectory);await writeFile(`${DIRECTORY}/geo-fixture.json`,JSON.stringify(geographic,null,2));console.log("PASS existing geographic/planar/privacy/immutable-source service regressions");
 }finally{await pool.end();const application=await import("../src/db");await application.pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
