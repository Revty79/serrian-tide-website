import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const address = listener.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function main() {
  const parent = path.resolve(tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "serrian-npc-browser-")));
  const data = path.join(root, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const executable = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const port = await freePort(), appPort = await freePort();
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/serrian_npc_browser_dev`;
  const nextEnv = await readFile("next-env.d.ts");
  let started = false, pool: pg.Pool | undefined;
  try {
    execFileSync(executable("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(executable("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await pool.query("create database serrian_npc_browser_dev"); await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    await pool.end(); pool = undefined;
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, NPC_LIFECYCLE_BROWSER_PORT: String(appPort), BETTER_AUTH_SECRET: "npc-browser-disposable-only-secret", NEXT_TELEMETRY_DISABLED: "1" };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["--import", "tsx", "scripts/npc-lifecycle-browser.test.ts", ...process.argv.slice(2)], { cwd: process.cwd(), env, stdio: "inherit", windowsHide: true, timeout: 600_000 });
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(executable("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("serrian-npc-browser-"));
    await rm(root, { recursive: true, force: true });
    await writeFile("next-env.d.ts", nextEnv);
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
