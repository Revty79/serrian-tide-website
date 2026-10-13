/** Focused corrections only: clone completed 6B-A evidence; never migrate or run Phase 9. */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright-core";
import { sourceSnapshot, type LinkingFixtures } from "./worlds-linking-checks";
import type { MapFixtures } from "./worlds-map-state-checks";
import { privacyBrowser, privacyServices } from "./worlds-map-state-privacy-checks";

const directory = "artifacts/guidance/worlds-map-state-privacy", receipt = `${directory}/environment.json`;
type Environment = { data: string; temporaryRoot: string; dbPort: number; databaseUrl: string; appPort: number;
  baseUrl: string; distName: string; fixtures: MapFixtures; bridge: LinkingFixtures };
async function freePort() {
  const server = createServer(); await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>(resolve => server.close(() => resolve())); return address.port;
}
async function main() {
  await mkdir(directory, { recursive: true });
  const completed: Environment = JSON.parse(await readFile("artifacts/guidance/worlds-map-states/environment.json", "utf8"));
  assert.equal(path.dirname(path.resolve(completed.temporaryRoot)), path.resolve(tmpdir()));
  assert.ok(path.basename(completed.temporaryRoot).startsWith("serrian-worlds-linking-"));
  assert.equal(path.resolve(completed.data), path.join(path.resolve(completed.temporaryRoot), "data"));
  assert.match(completed.databaseUrl, new RegExp(`^postgresql://postgres@127\\.0\\.0\\.1:${completed.dbPort}/serrian_mapstates_[0-9]+$`));
  assert.ok(completed.fixtures && completed.bridge);
  assert.ok(!existsSync(path.join(completed.data, "postmaster.pid")), "Only the stopped task-owned test cluster is permitted.");
  const pgCtl = path.join(process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin", "pg_ctl.exe");
  const originalConfig = await readFile("tsconfig.json", "utf8"), originalNext = await readFile("next-env.d.ts", "utf8");
  let pool: pg.Pool | undefined, template: pg.Pool | undefined, application: typeof import("../src/db") | undefined;
  let server: ChildProcess | undefined, started = false;
  const log = createWriteStream(`${directory}/production.log`, { flags: "a" });
  try {
    execFileSync(pgCtl, ["-D", completed.data, "-l", path.join(completed.temporaryRoot, "postgres.log"), "-o", `-p ${completed.dbPort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true }); started = true;
    template = new pg.Pool({ connectionString: completed.databaseUrl }); const templateBefore = await sourceSnapshot(template, true);
    const admin = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${completed.dbPort}/postgres` });
    let e: Environment;
    try {
      if (process.argv.includes("--resume")) e = JSON.parse(await readFile(receipt, "utf8"));
      else {
        const database = `serrian_mapprivacy_${Date.now()}`, appPort = await freePort();
        const templateName = new URL(completed.databaseUrl).pathname.slice(1); assert.match(templateName, /^serrian_mapstates_[0-9]+$/);
        // Snapshot pool must release its connection before PostgreSQL clones the template.
        await template.end(); template = undefined;
        await admin.query(`create database "${database}" template "${templateName}"`);
        template = new pg.Pool({ connectionString: completed.databaseUrl });
        e = { ...completed, appPort, databaseUrl: `postgresql://postgres@127.0.0.1:${completed.dbPort}/${database}`,
          baseUrl: `http://127.0.0.1:${appPort}`, distName: `artifacts/guidance/worlds-map-state-privacy-next-${appPort}` };
        await writeFile(receipt, JSON.stringify(e, null, 2));
      }
    } finally { await admin.end(); }
    assert.equal(e.data, completed.data); assert.equal(e.dbPort, completed.dbPort);
    assert.match(e.databaseUrl, new RegExp(`^postgresql://postgres@127\\.0\\.0\\.1:${completed.dbPort}/serrian_mapprivacy_[0-9]+$`));
    assert.equal(e.baseUrl, `http://127.0.0.1:${e.appPort}`); assert.equal(e.distName, `artifacts/guidance/worlds-map-state-privacy-next-${e.appPort}`);
    pool = new pg.Pool({ connectionString: e.databaseUrl }); process.env.DATABASE_URL = e.databaseUrl;
    const before = await sourceSnapshot(pool, true);
    const committed = execFileSync("git", ["show", "278686d4000eb42794d61bad06543c2213c12cb4:drizzle/0124_worlds_map_states.sql"], { windowsHide: true });
    const hash = createHash("sha256").update(committed).digest("hex");
    assert.equal(hash, "acd146d910a170dec6374b93016a7b749d55e9bf765cdfe29a5f81733a0edfaa");
    // Windows checkout line endings do not change the committed migration bytes.
    assert.equal((await readFile("drizzle/0124_worlds_map_states.sql", "utf8")).replaceAll("\r\n", "\n"), committed.toString("utf8"));
    application = await import("../src/db");
    if (!process.argv.includes("--browser-only")) await privacyServices(e.fixtures, e.bridge, directory);
    if (!process.argv.includes("--services-only")) {
      const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DATABASE_URL: e.databaseUrl, BETTER_AUTH_URL: e.baseUrl,
        BETTER_AUTH_SECRET: "worlds-mapprivacy-task-disposable-secret-only", SERRIAN_TEST_NEXT_DIST_DIR: e.distName, NEXT_TELEMETRY_DISABLED: "1" };
      if (!process.argv.includes("--no-build")) {
        await new Promise<void>((resolve, reject) => {
          const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
          build.stdout!.pipe(log, { end: false }); build.stderr!.pipe(log, { end: false });
          build.once("error", reject); build.once("exit", code => code === 0 ? resolve() : reject(new Error(`Production build failed ${code}; see ${directory}/production.log`)));
        }); console.log("PASS isolated production build");
      }
      server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(e.appPort)], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      server.stdout!.pipe(log, { end: false }); server.stderr!.pipe(log, { end: false });
      const deadline = Date.now() + 90000; let ready = false;
      while (Date.now() < deadline) {
        assert.equal(server.exitCode, null);
        try { if ((await fetch(`${e.baseUrl}/login`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch { /* Starting task server. */ }
        await new Promise(resolve => setTimeout(resolve, 300));
      } assert.ok(ready);
      const browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
      try { await privacyBrowser(browser, e.baseUrl, e.fixtures, e.bridge, directory); } finally { await browser.close(); }
    }
    assert.deepEqual(await sourceSnapshot(pool, true), before);
    assert.deepEqual(await sourceSnapshot(template!, true), templateBefore);
    await writeFile(`${directory}/preservation-results.json`, JSON.stringify({ migration0124Sha256: hash, migrationsExecuted: 0,
      worldTables: Object.keys(before).length, allWorldRowsUnchanged: true, completedEvidenceDatabaseUnchanged: true }, null, 2));
    console.log("PASS all World rows, versions, sources, timeline heads and completed evidence unchanged");
  } finally {
    if (server?.pid && server.exitCode === null) execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    log.end(); if (application) await application.pool.end(); if (pool) await pool.end(); if (template) await template.end();
    await writeFile("tsconfig.json", originalConfig); await writeFile("next-env.d.ts", originalNext);
    if (started) execFileSync(pgCtl, ["-D", completed.data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
