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
test("combat screens run against a newly migrated disposable PostgreSQL cluster", { timeout: 1_500_000 }, async () => {
  const parent = path.resolve(tmpdir()), root = path.resolve(await mkdtemp(path.join(parent, "serrian-combat-screens-")));
  assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("serrian-combat-screens-"));
  const data = path.join(root, "data"), bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/serrian_combat_screens_dev`;
  let started = false, pool: pg.Pool | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true }); started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` }); await pool.query("create database serrian_combat_screens_dev"); await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl }); await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    assert.equal((await pool.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count, JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries.length);
    await pool.end(); pool = null;
    const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/combat-screens-browser.ts"], { cwd: process.cwd(), windowsHide: true, stdio: "inherit", timeout: 1_400_000,
      env: { ...environment, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_DISPOSABLE_COMBAT_SCREENS: "true" } });
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(existsSync(path.join(data, "postmaster.pid")), false); await rm(root, { recursive: true, force: true });
  }
});
