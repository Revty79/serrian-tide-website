import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}
async function main() {
  const parent = path.resolve(tmpdir()), root = path.resolve(await mkdtemp(path.join(parent, "serrian-mechanics-authoring-")));
  const data = path.join(root, "data"), bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const exe = (name: string) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
  const port = await freePort(), appPort = await freePort();
  const url = `postgresql://postgres@127.0.0.1:${port}/serrian_mechanics_authoring_dev`;
  const originalTsconfig = await readFile("tsconfig.json"), originalNextEnv = await readFile("next-env.d.ts");
  let pool: pg.Pool | null = null, started = false;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
    await pool.query("create database serrian_mechanics_authoring_dev"); await pool.end();
    pool = new pg.Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") }); await pool.end(); pool = null;
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url, MECHANICS_BROWSER_PORT: String(appPort), SERRIAN_MECHANICS_DISPOSABLE: "true",
      BETTER_AUTH_SECRET: "special-ability-synthetic-browser-only-secret", NEXT_TELEMETRY_DISABLED: "1" };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["--import", "tsx", "scripts/special-ability-authoring-browser.test.ts"], { env, stdio: "inherit", windowsHide: true, timeout: 600000 });
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("serrian-mechanics-authoring-"));
    await rm(root, { recursive: true, force: true });
    await writeFile("tsconfig.json", originalTsconfig); await writeFile("next-env.d.ts", originalNextEnv);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
