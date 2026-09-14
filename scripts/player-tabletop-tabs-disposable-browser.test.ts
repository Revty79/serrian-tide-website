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

test("player Tabletop and Realms browser workflows use a disposable migrated database", { timeout: 900_000 }, async () => {
  const parent = path.resolve(tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "serrian-tabletop-tabs-")));
  assert.equal(path.dirname(root), parent);
  assert.ok(path.basename(root).startsWith("serrian-tabletop-tabs-"));
  const data = path.join(root, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/serrian_tabletop_tabs_dev`;
  let started = false;
  let pool: pg.Pool | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await pool.query("create database serrian_tabletop_tabs_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    assert.equal((await pool.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count, JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries.length);
    await pool.end();
    pool = null;
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    if (process.env.SERRIAN_TABLETOP_TOOLS_TESTS === "true") {
      for (const script of ["scripts/called-check-db.test.ts", "scripts/tabletop-source-use-db.test.ts", "scripts/closeout-awards-db.test.ts"]) {
        execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", script], {
          cwd: process.cwd(), windowsHide: true, stdio: "inherit", timeout: 180_000,
          env: { ...environment, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_DISPOSABLE_COMBAT_SCREENS: "true", SERRIAN_DISPOSABLE_TABLETOP_TABS: "true" },
        });
      }
    }
    if (process.env.SERRIAN_TABLETOP_DB_ONLY === "true") return;
    execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/player-tabletop-tabs-browser.ts"], {
      cwd: process.cwd(), windowsHide: true, stdio: "inherit", timeout: 840_000,
      env: { ...environment, DATABASE_URL: databaseUrl, NODE_ENV: "test", SERRIAN_DISPOSABLE_COMBAT_SCREENS: "true", SERRIAN_DISPOSABLE_TABLETOP_TABS: "true" },
    });
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(existsSync(path.join(data, "postmaster.pid")), false);
    await rm(root, { recursive: true, force: true });
  }
});
