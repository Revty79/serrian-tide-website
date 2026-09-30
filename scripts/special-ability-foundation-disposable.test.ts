import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

test("Special Ability foundation in a new isolated PostgreSQL cluster", { timeout: 240000 }, async () => {
  const parent = path.resolve(tmpdir()), root = path.resolve(await mkdtemp(path.join(parent, "serrian-special-ability-")));
  const data = path.join(root, "data"), server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const exe = (name: string) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
  const url = `postgresql://postgres@127.0.0.1:${port}/serrian_special_ability_disposable_dev`;
  let pool: pg.Pool | null = null, started = false;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await pool.query("create database serrian_special_ability_disposable_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    assert.equal((await pool.query("select current_database() name")).rows[0].name, "serrian_special_ability_disposable_dev");
    await pool.end(); pool = null;
    const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url, NODE_ENV: "test", SERRIAN_SPECIAL_ABILITY_DISPOSABLE: "true", SERRIAN_TIDE_ENABLE_PERMANENT_DELETION: "true" };
    delete environment.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["--experimental-test-module-mocks", "--conditions=react-server", "--import", "tsx", "--test", "scripts/special-ability-foundation-db.test.mjs"], {
      cwd: process.cwd(), stdio: "inherit", windowsHide: true, timeout: 180000,
      env: environment,
    });
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(path.dirname(root), parent);
    assert.ok(path.basename(root).startsWith("serrian-special-ability-"));
    await rm(root, { recursive: true, force: true });
  }
});
