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
import pg from "pg";

const defaultWindowsPostgresBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN
  ?? (existsSync(defaultWindowsPostgresBin) ? defaultWindowsPostgresBin : "");
const initdbExecutable = postgresBin ? path.join(postgresBin, "initdb.exe") : "initdb";
const pgCtlExecutable = postgresBin ? path.join(postgresBin, "pg_ctl.exe") : "pg_ctl";

async function findLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("A disposable Shop-correction PostgreSQL port could not be reserved.");
  return port;
}

test("Shop commerce corrections rehearse against disposable migrated PostgreSQL", { timeout: 180_000 }, async () => {
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-shop-corrections-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await findLoopbackPort();
  const maintenanceUrl = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/serrian_shop_corrections_dev`;
  let pool: pg.Pool | null = null;
  let clusterStarted = false;

  try {
    execFileSync(initdbExecutable, ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", dataDirectory], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;
    pool = new pg.Pool({ connectionString: maintenanceUrl });
    await pool.query("create database serrian_shop_corrections_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const ledger = await pool.query<{ count: number }>("select count(*)::int count from drizzle.__drizzle_migrations");
    assert.equal(ledger.rows[0]?.count, 41);
    await pool.end();
    pool = null;

    execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/tabletop-shop-commerce-db.test.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" },
      stdio: "inherit",
      windowsHide: true,
    });
  } finally {
    if (pool) await pool.end();
    if (clusterStarted && existsSync(path.join(dataDirectory, "postmaster.pid"))) {
      execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    }
    await rm(temporaryCluster, { recursive: true, force: true });
  }
});
