import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Disposable staged upgrade with populated immutable events from before Return existed. */
export async function verifyReturnHistoryUpgrade(connectionString: string, root: string) {
  assert.match(connectionString, /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_evolution_return_upgrade_dev$/);
  const pool = new pg.Pool({connectionString});
  try {
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    const entries = journal.entries.filter((entry: {idx: number}) => entry.idx < 87), folder = path.join(root, "before-return");
    await mkdir(path.join(folder, "meta"), {recursive: true});
    await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({...journal, entries}));
    for (const entry of entries) await copyFile(path.join("drizzle", `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
    await migrate(drizzle(pool), {migrationsFolder: folder});
    const insert = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id;
    await pool.query(`insert into "user"(id,name,email) values('return-upgrade','Upgrade','return-upgrade@example.invalid')`);
    const campaign = await insert("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Return upgrade',100,100,50,10,100,0,'Credits','Assigned','return-upgrade') returning id");
    await pool.query("insert into campaign_player(campaign_id,user_id) values($1,'return-upgrade')", [campaign]);
    for (const kind of ["race", "creature"]) {
      const ids = [];
      for (const name of ["Source", "Destination"]) ids.push(await insert(kind === "race" ? "insert into races(name) values($1) returning id" : "insert into creatures(canonical_id,canonical_name,size) values(upper($1),$1,'Medium') returning id", [name]));
      const id = await insert("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values($1,'return-upgrade',$2,$3,$4,case when $3 then 'detailed' else null end) returning id", [campaign, kind, kind === "creature", kind]);
      const pathId = await insert(`insert into ${kind}_evolution_paths(source_${kind}_id,destination_${kind}_id,name) values($1,$2,'Legacy forward path') returning id`, ids);
      await pool.query(`insert into ${kind}_evolution_events(campaign_id,character_id,source_${kind}_id,destination_${kind}_id,path_id,path_version,executed_by_user_id,idempotency_key,request_hash,evidence${kind === "creature" ? ",source_baseline_snapshot_json,source_current_snapshot_json,destination_baseline_snapshot_json,destination_current_snapshot_json,hp_adjustment" : ""}) values($1,$2,$3,$4,$5,1,'return-upgrade',$6,'historical-hash','{"historical":"unchanged"}'${kind === "creature" ? ",'{}','{}','{}','{}',7" : ""})`, [campaign,id,...ids,pathId,`legacy-${kind}-request`]);
    }
    const tables = (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows as {tablename: string}[];
    const before = new Map<string, unknown>();
    for (const {tablename} of tables) before.set(tablename, (await pool.query(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)).rows);
    await migrate(drizzle(pool), {migrationsFolder: "drizzle"});
    for (const {tablename} of tables) {
      const isEvent = ["race_evolution_events", "creature_evolution_events"].includes(tablename);
      assert.deepEqual((await pool.query(`select to_jsonb(t) ${isEvent ? "- 'operation' - 'reverses_event_id'" : ""} body from "${tablename}" t order by to_jsonb(t)::text`)).rows, before.get(tablename), `${tablename}: pre-Return values retained`);
      if (isEvent) assert.deepEqual((await pool.query(`select operation,reverses_event_id from ${tablename}`)).rows, [{operation:"evolution",reverses_event_id:null}]);
    }
    console.log(`PASS: populated 0086-to-0087 upgrade preserves all ${tables.length} public tables and original history; no inferred Returns.`);
  } finally { await pool.end(); }
}
