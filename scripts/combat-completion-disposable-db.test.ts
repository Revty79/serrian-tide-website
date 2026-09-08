import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const windowsBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? (existsSync(windowsBin) ? windowsBin : "");
const executable = (name: string) => bin ? path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;

async function loopbackPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test("combat completion service cases use a new disposable migrated PostgreSQL cluster", { timeout: 240_000 }, async () => {
  const temporaryParent = path.resolve(tmpdir());
  const temporaryCluster = await mkdtemp(path.join(temporaryParent, "serrian-completion-postgres-"));
  const resolvedCluster = path.resolve(temporaryCluster);
  if (path.dirname(resolvedCluster) !== temporaryParent || !path.basename(resolvedCluster).startsWith("serrian-completion-postgres-")) {
    throw new Error("Disposable PostgreSQL path escaped its dedicated temporary directory.");
  }
  const data = path.join(resolvedCluster, "data");
  const port = await loopbackPort();
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/serrian_combat_completion_dev`;
  let started = false;
  let pool: pg.Pool | null = null;
  try {
    execFileSync(executable("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(executable("pg_ctl"), ["-D", data, "-l", path.join(resolvedCluster, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await pool.query("create database serrian_combat_completion_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    const ledger = await pool.query<{ count: number }>("select count(*)::int count from drizzle.__drizzle_migrations");
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    assert.equal(ledger.rows[0].count, journal.entries.length);
    await pool.end();
    pool = null;
    for (const script of ["scripts/combat-completion-checkpoints-db.test.ts"]) {
      execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--test", script], {
        cwd: process.cwd(), windowsHide: true, stdio: "inherit",
        env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_DISPOSABLE_COMBAT_COMPLETION: "true" },
      });
    }
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) {
      execFileSync(executable("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    }
    if (existsSync(path.join(data, "postmaster.pid"))) throw new Error(`Disposable cluster is still running; preserved ${resolvedCluster}`);
    await rm(resolvedCluster, { recursive: true, force: true });
  }
});
