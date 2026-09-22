import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

test("multiple active Scenes: migration preservation and focused action/database regressions", { timeout: 240_000 }, async () => {
  const parent = path.resolve(tmpdir()), root = path.resolve(await mkdtemp(path.join(parent, "serrian-multiple-scenes-")));
  assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("serrian-multiple-scenes-"));
  const data = path.join(root, "data"), bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const executable = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/serrian_multiple_scenes_dev`;
  let started = false, pool: pg.Pool | null = null;
  try {
    execFileSync(executable("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(executable("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true }); started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await pool.query("create database serrian_multiple_scenes_dev"); await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const legacy = path.join(root, "legacy"); await mkdir(path.join(legacy, "meta"), { recursive: true });
    const entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 65);
    await writeFile(path.join(legacy, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const entry of entries) await copyFile(path.resolve("drizzle", `${entry.tag}.sql`), path.join(legacy, `${entry.tag}.sql`));
    await migrate(drizzle(pool), { migrationsFolder: legacy });
    await pool.query('insert into "user"(id,name,email) values (\'migration-god\',\'Migration G.O.D.\',\'migration@example.invalid\')');
    const campaignId = (await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Historical Campaign',0,0,0,0,100,0,'Credits','Assigned','migration-god') returning id")).rows[0].id;
    const sessionId = (await pool.query("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Historical Session',1,'active',now()) returning id", [campaignId])).rows[0].id;
    await pool.query("insert into campaign_session_scene(campaign_id,session_id,title,sequence_number,status,started_at,completed_at) values($1,$2,'Active Scene',1,'active',now(),null),($1,$2,'Planned Scene',7,'planned',null,null),($1,$2,'Completed Scene',9,'completed',now(),now())", [campaignId, sessionId]);
    await assert.rejects(pool.query("update campaign_session_scene set status='active',started_at=now() where title='Planned Scene'"), /campaign_session_scene_one_active_per_session_uq/);
    const tables = (await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const { tablename } of tables) {
        assert.match(tablename, /^[a-z_]+$/);
        result[tablename] = (await pool!.query(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)).rows;
      }
      return result;
    };
    const before = await snapshot();
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    assert.deepEqual(await snapshot(), before, "Migration must preserve every existing public row exactly");
    assert.equal((await pool.query("select count(*)::int n from pg_indexes where indexname='campaign_session_scene_one_active_per_session_uq'")).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n, journal.entries.length);
    console.log(`PASS: migration preserves all ${tables.length} public tables and removes only the active-Scene index`);
    await pool.end(); pool = null;
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_DISPOSABLE_SCENES: "true" };
    delete env.NODE_TEST_CONTEXT;
    for (const script of ["scripts/multiple-active-scenes-db.test.mjs", "scripts/tabletop-operations-db.test.ts", "scripts/tabletop-session-closeout-db.test.ts", "scripts/player-tabletop-console-db.test.ts", "scripts/tabletop-location-placement-db.test.ts"]) {
      let output: string;
      try {
        output = execFileSync(process.execPath, ["--experimental-test-module-mocks", "--conditions=react-server", "--import", "tsx", "--test", "--test-reporter=tap", script], { env, windowsHide: true, encoding: "utf8", timeout: 100_000 });
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        process.stdout.write(failure.stdout ?? ""); process.stderr.write(failure.stderr ?? "");
        throw new Error(`${script} failed; see the test output above.`);
      }
      process.stdout.write(output);
      assert.match(output, /# fail 0\b/);
      assert.ok(Number(/# tests (\d+)/.exec(output)?.[1]) > 0);
    }
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(executable("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(existsSync(path.join(data, "postmaster.pid")), false);
    await rm(root, { recursive: true, force: true });
  }
});
