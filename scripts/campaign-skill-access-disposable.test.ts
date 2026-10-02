import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

test("Campaign Skill restrictions: disposable migration and real server actions", { timeout: 240_000 }, async () => {
  const parent = path.resolve(tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "serrian-campaign-skills-")));
  assert.equal(path.dirname(root), parent);
  const data = path.join(root, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const listener = createServer();
  await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const url = `postgresql://postgres@127.0.0.1:${address.port}/serrian_campaign_skills_test`;
  let started = false;
  let pool: pg.Pool | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { windowsHide: true, stdio: "pipe" });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${address.port} -h 127.0.0.1`, "-w", "start"], { windowsHide: true, stdio: "ignore" }); started = true;
    pool = new pg.Pool({ connectionString: url.replace("/serrian_campaign_skills_test", "/postgres") });
    await pool.query("create database serrian_campaign_skills_test"); await pool.end();
    pool = new pg.Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url }; delete env.NODE_TEST_CONTEXT;
    try {
      process.stdout.write(execFileSync(process.execPath, ["--experimental-test-module-mocks", "--conditions=react-server", "--import", "tsx", "--test", "scripts/campaign-skill-actions-db.test.mjs"], { env, windowsHide: true, encoding: "utf8", timeout: 180_000 }));
    } catch (error) {
      process.stdout.write((error as { stdout?: string }).stdout ?? ""); throw error;
    }
  } finally {
    await pool?.end();
    if (started) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], { windowsHide: true, stdio: "pipe" });
    assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("serrian-campaign-skills-"));
    await rm(root, { recursive: true, force: true });
  }
});
