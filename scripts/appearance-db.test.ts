import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg, { type PoolClient } from "pg";

const defaultWindowsPostgresBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN
  ?? (existsSync(defaultWindowsPostgresBin) ? defaultWindowsPostgresBin : "");
const initdbExecutable = postgresBin ? path.join(postgresBin, "initdb.exe") : "initdb";
const pgCtlExecutable = postgresBin ? path.join(postgresBin, "pg_ctl.exe") : "pg_ctl";

async function findLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  if (!port) throw new Error("A disposable Appearance-test PostgreSQL port could not be reserved.");
  return port;
}

let rejectionSequence = 0;
async function expectRejection(client: PoolClient, operation: () => Promise<unknown>, expected: RegExp) {
  const savepoint = `appearance_rejection_${++rejectionSequence}`;
  await client.query(`savepoint ${savepoint}`);
  let caught: unknown;
  try { await operation(); } catch (error) { caught = error; }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert.ok(caught, "Expected the appearance database operation to be rejected.");
  assert.match(caught instanceof Error ? caught.message : String(caught), expected);
}

test("0037 replays cleanly and enforces the singleton appearance contract", { timeout: 120_000 }, async () => {
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-appearance-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await findLoopbackPort();
  let pool: pg.Pool | null = null;
  let clusterStarted = false;
  try {
    execFileSync(initdbExecutable, ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", dataDirectory], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const client = await pool.connect();
    try {
      await client.query("begin");
      assert.equal(Number((await client.query("select count(*)::int value from site_appearance_setting")).rows[0].value), 0);
      await client.query(`insert into "user" (id,name,email,email_verified) values ('appearance-admin','Appearance Admin','appearance@example.invalid',true)`);
      await client.query(`insert into site_appearance_setting (
        key,preset_id,page_background,surface_background,primary_accent,
        secondary_accent,main_text,muted_text,updated_by_user_id
      ) values ('site','serrian-tide','#04030C','#0B1018','#4DA97D','#F9D34E','#E7EAD9','#9EADA4','appearance-admin')`);
      assert.deepEqual((await client.query("select key,preset_id,primary_accent,updated_by_user_id from site_appearance_setting")).rows, [{
        key: "site",
        preset_id: "serrian-tide",
        primary_accent: "#4DA97D",
        updated_by_user_id: "appearance-admin",
      }]);
      await client.query(`insert into site_appearance_setting (
        key,preset_id,page_background,surface_background,primary_accent,
        secondary_accent,main_text,muted_text,updated_by_user_id
      ) values ('site','classic','#06080F','#0A0F1E','#8B5CF6','#F5CA73','#E2E8F0','#9DA9B7','appearance-admin')
      on conflict (key) do update set preset_id=excluded.preset_id,primary_accent=excluded.primary_accent`);
      assert.deepEqual((await client.query("select preset_id,primary_accent from site_appearance_setting where key='site'")).rows, [{ preset_id: "classic", primary_accent: "#8B5CF6" }]);
      await expectRejection(client, () => client.query(`insert into site_appearance_setting (key,preset_id,page_background,surface_background,primary_accent,secondary_accent,main_text,muted_text) values ('other','classic','#06080F','#0A0F1E','#8B5CF6','#F5CA73','#E2E8F0','#9DA9B7')`), /site_appearance_singleton_key/);
      await expectRejection(client, () => client.query("update site_appearance_setting set primary_accent='purple' where key='site'"), /site_appearance_primary_accent_hex/);
      await expectRejection(client, () => client.query("update site_appearance_setting set preset_id='unknown' where key='site'"), /site_appearance_preset_valid/);
      await client.query("rollback");
    } finally {
      client.release();
    }
  } finally {
    if (pool) await pool.end();
    if (clusterStarted && existsSync(path.join(dataDirectory, "postmaster.pid"))) {
      execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    }
    await rm(temporaryCluster, { recursive: true, force: true });
  }
});
