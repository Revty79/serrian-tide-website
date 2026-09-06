import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

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
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  if (!port) throw new Error("A disposable account-lifecycle PostgreSQL port could not be reserved.");
  return port;
}

async function main(): Promise<void> {
  const temporaryCluster = await mkdtemp(path.join(tmpdir(), "serrian-account-lifecycle-postgres-"));
  const dataDirectory = path.join(temporaryCluster, "data");
  const logPath = path.join(temporaryCluster, "postgres.log");
  const port = await findLoopbackPort();
  const maintenanceConnectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/serrian_account_lifecycle_dev`;
  let pool: pg.Pool | null = null;
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
    ], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;

    pool = new pg.Pool({ connectionString: maintenanceConnectionString });
    await pool.query("create database serrian_account_lifecycle_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    await pool.end();
    pool = null;

    execFileSync(process.execPath, [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--test",
      "scripts/admin-account-lifecycle-db.test.ts",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        NODE_ENV: "test",
        SERRIAN_TIDE_ENABLE_PERMANENT_DELETION: "true",
      },
      stdio: "inherit",
      windowsHide: true,
    });
  } finally {
    if (pool) await pool.end();
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
    await rm(temporaryCluster, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
