import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const sourceConnectionString = process.env.DATABASE_URL;
if (!sourceConnectionString) {
  throw new Error("DATABASE_URL is required for the lifecycle migration rehearsal.");
}

const sourceUrl = new URL(sourceConnectionString);
const sourceDatabase = sourceUrl.pathname.slice(1);
if (
  !["localhost", "127.0.0.1", "::1"].includes(sourceUrl.hostname)
  || !sourceDatabase.endsWith("_dev")
) {
  throw new Error(
    "Refusing lifecycle migration rehearsal outside a loopback _dev database.",
  );
}

const migrationRoot = path.resolve(process.cwd(), "drizzle");
const expectedMigration = "0032_safe_entity_lifecycles";
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
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  if (!port) throw new Error("A disposable PostgreSQL port could not be reserved.");
  return port;
}

test("0032 upgrades populated 0031 data and the complete migration chain replays cleanly", async () => {
  const marker = `lifecycle-migration-${Date.now()}-${process.pid}`;
  const temporaryMigrations = await mkdtemp(path.join(tmpdir(), "serrian-lifecycle-migrations-"));
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-lifecycle-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await findLoopbackPort();
  let targetPool: pg.Pool | null = null;
  let clusterStarted = false;

  try {
    execFileSync(initdbExecutable, [
      "--auth=trust",
      "--encoding=UTF8",
      "--no-locale",
      "--username=postgres",
      "-D",
      dataDirectory,
    ], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, [
      "-D",
      dataDirectory,
      "-l",
      logPath,
      "-o",
      `-p ${port} -h 127.0.0.1`,
      "-w",
      "start",
    ], {
      // A Windows postmaster can retain the pipe handles inherited from
      // pg_ctl after pg_ctl itself exits. Ignoring stdio here (the server has
      // its own -l log file) lets execFileSync observe pg_ctl's completion.
      stdio: "ignore",
      windowsHide: true,
    });
    clusterStarted = true;

    const journal = JSON.parse(
      await readFile(path.join(migrationRoot, "meta", "_journal.json"), "utf8"),
    ) as {
      version: string;
      dialect: string;
      entries: Array<{
        idx: number;
        version: string;
        when: number;
        tag: string;
        breakpoints: boolean;
      }>;
    };
    assert.equal(journal.entries.at(-1)?.tag, expectedMigration);
    const priorEntries = journal.entries.slice(0, -1);
    assert.ok(priorEntries.length > 0);
    await mkdir(path.join(temporaryMigrations, "meta"), { recursive: true });
    await writeFile(
      path.join(temporaryMigrations, "meta", "_journal.json"),
      `${JSON.stringify({ ...journal, entries: priorEntries }, null, 2)}\n`,
    );
    for (const entry of priorEntries) {
      await copyFile(
        path.join(migrationRoot, `${entry.tag}.sql`),
        path.join(temporaryMigrations, `${entry.tag}.sql`),
      );
    }

    targetPool = new pg.Pool({
      connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    });
    await migrate(drizzle(targetPool), { migrationsFolder: temporaryMigrations });

    await targetPool.query("begin");
    try {
      await targetPool.query(
        `insert into "user" (id, name, email, email_verified)
         values ($1, $2, $3, true)`,
        [marker, marker, `${marker}@example.invalid`],
      );
      await targetPool.query(
        "insert into user_role (user_id, role) values ($1, 'god')",
        [marker],
      );
      const campaignResult = await targetPool.query<{ id: number }>(
        `insert into campaign (
           name, attribute_points, skill_points, max_starting_skill,
           points_to_unlock_next_tier, max_points_in_skill,
           starting_credit_amount, currency_system, fate_point_method,
           assigned_fate_points, created_by_user_id
         ) values ($1, 100, 100, 25, 10, 100, 100, 'Credits', 'Assigned', 0, $2)
         returning id`,
        [`${marker}-campaign`, marker],
      );
      const campaignId = campaignResult.rows[0]!.id;
      await targetPool.query(
        "insert into campaign_player (campaign_id, user_id, is_npc_controller) values ($1, $2, true)",
        [campaignId, marker],
      );
      await targetPool.query(
        `insert into campaign_character (campaign_id, player_user_id, name, is_npc, npc_kind)
         values
           ($1, $2, $3, false, 'race'),
           ($1, $2, $4, true, 'race'),
           ($1, $2, $5, true, 'creature')`,
        [campaignId, marker, `${marker}-pc`, `${marker}-race-npc`, `${marker}-creature-npc`],
      );
      await targetPool.query(
        "insert into races (name, created_by_user_id) values ($1, $2)",
        [`${marker}-race`, marker],
      );
      await targetPool.query(
        "insert into creatures (canonical_id, canonical_name, size, created_by_user_id) values ($1, $2, 'Medium', $3)",
        [`TEST-CREATURE-${Date.now()}-${process.pid}`, `${marker}-creature`, marker],
      );
      await targetPool.query(
        "insert into skill (name, created_by_user_id) values ($1, $2)",
        [`${marker}-skill`, marker],
      );
      await targetPool.query(
        `insert into items (
           canonical_id, name, catalog_scope, record_type, family, category,
           price_basis, is_magical, created_by_user_id
        ) values ($1, $2, 'inventory', 'test', 'test', 'test', 'each', false, $3)`,
        [`TEST-ITEM-${Date.now()}-${process.pid}`, `${marker}-item`, marker],
      );
      await targetPool.query(
        "insert into derived_ability (name, created_by_user_id) values ($1, $2)",
        [`${marker}-ability`, marker],
      );
      await targetPool.query("commit");
    } catch (error) {
      await targetPool.query("rollback");
      throw error;
    }

    const before = await targetPool.query<{ value: number }>(
      `select (
         (select count(*) from campaign where name like $1)
         + (select count(*) from campaign_character where name like $1)
         + (select count(*) from races where name like $1)
         + (select count(*) from creatures where canonical_name like $1)
         + (select count(*) from skill where name like $1)
         + (select count(*) from items where name like $1)
         + (select count(*) from derived_ability where name like $1)
       )::int as value`,
      [`${marker}%`],
    );
    assert.equal(Number(before.rows[0]?.value), 9);

    await migrate(drizzle(targetPool), { migrationsFolder: migrationRoot });

    const after = await targetPool.query<{ value: number }>(
      `select (
         (select count(*) from campaign where name like $1)
         + (select count(*) from campaign_character where name like $1)
         + (select count(*) from races where name like $1)
         + (select count(*) from creatures where canonical_name like $1)
         + (select count(*) from skill where name like $1)
         + (select count(*) from items where name like $1)
         + (select count(*) from derived_ability where name like $1)
       )::int as value`,
      [`${marker}%`],
    );
    assert.equal(Number(after.rows[0]?.value), 9, "0032 must preserve every seeded root");

    const characterModes = await targetPool.query<{
      is_npc: boolean;
      npc_build_mode: string | null;
    }>(
      "select is_npc, npc_build_mode from campaign_character where name like $1 order by id",
      [`${marker}%`],
    );
    assert.deepEqual(
      characterModes.rows,
      [
        { is_npc: false, npc_build_mode: null },
        { is_npc: true, npc_build_mode: "detailed" },
        { is_npc: true, npc_build_mode: "detailed" },
      ],
    );

    const archiveColumns = await targetPool.query<{ value: number }>(
      `select count(*)::int as value
       from information_schema.columns
       where table_schema = 'public'
         and column_name = 'archived_at'
         and table_name = any($1::text[])`,
      [["campaign", "campaign_character", "races", "creatures", "skill", "items", "derived_ability"]],
    );
    assert.equal(Number(archiveColumns.rows[0]?.value), 7);
    const auditTable = await targetPool.query<{ value: string | null }>(
      "select to_regclass('public.lifecycle_audit_event')::text as value",
    );
    assert.equal(auditTable.rows[0]?.value, "lifecycle_audit_event");
    const ledger = await targetPool.query<{ value: number }>(
      "select count(*)::int as value from drizzle.__drizzle_migrations",
    );
    assert.equal(Number(ledger.rows[0]?.value), journal.entries.length);
  } finally {
    if (targetPool) await targetPool.end().catch(() => undefined);
    if (clusterStarted && existsSync(path.join(dataDirectory, "postmaster.pid"))) {
      execFileSync(pgCtlExecutable, [
        "-D",
        dataDirectory,
        "-m",
        "fast",
        "-w",
        "stop",
      ], { stdio: "ignore", windowsHide: true });
    }
    await rm(temporaryMigrations, { recursive: true, force: true });
    await rm(temporaryCluster, { recursive: true, force: true });
    assert.equal(existsSync(temporaryMigrations), false, "temporary migration files must be removed");
    assert.equal(existsSync(temporaryCluster), false, "the disposable PostgreSQL cluster must be removed");
  }
});
