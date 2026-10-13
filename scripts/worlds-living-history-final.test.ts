/** Phase 6B Final: clone completed 6B-D evidence; preserve every prior record. */
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
import type { SettlementHistoryFixture } from "./worlds-historical-settlement-checks";

import { livingHistoryFixture,livingHistoryServices,livingHistoryBrowser,type LivingFixture } from "./worlds-living-history-checks";
import type { TerritoryFixture } from "./worlds-historical-territory-checks";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";




const directory="artifacts/guidance/worlds-living-history-final", receipt=`${directory}/${process.argv.includes("--migration-only")?"final-migration-environment":"environment"}.json`;
type Environment = { data: string; temporaryRoot: string; dbPort: number; databaseUrl: string; appPort: number;
  baseUrl: string; distName: string; fixtures: MapFixtures; bridge: LinkingFixtures; historical?:SettlementHistoryFixture;political?:TerritoryFixture;coordinated?:unknown;journey?:LivingFixture };
async function freePort() {
  const server = createServer(); await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>(resolve => server.close(() => resolve())); return address.port;
}
async function main() {
  await mkdir(directory, { recursive: true });
  const completed: Environment = JSON.parse(await readFile("artifacts/guidance/worlds-historical-connections/environment.json", "utf8"));
  assert.equal(path.dirname(path.resolve(completed.temporaryRoot)), path.resolve(tmpdir()));
  assert.ok(path.basename(completed.temporaryRoot).startsWith("serrian-worlds-linking-"));
  assert.equal(path.resolve(completed.data), path.join(path.resolve(completed.temporaryRoot), "data"));
  assert.match(completed.databaseUrl, new RegExp(`^postgresql://postgres@127\\.0\\.0\\.1:${completed.dbPort}/serrian_coordination_[0-9]+$`));
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
        const database = `serrian_livinghistory_${Date.now()}`, appPort = await freePort();
        const templateName = new URL(completed.databaseUrl).pathname.slice(1); assert.match(templateName, /^serrian_coordination_[0-9]+$/);
        // Snapshot pool must release its connection before PostgreSQL clones the template.
        await template.end(); template = undefined;
        await admin.query(`create database "${database}" template "${templateName}"`);
        template = new pg.Pool({ connectionString: completed.databaseUrl });
        e = { ...completed, appPort, databaseUrl: `postgresql://postgres@127.0.0.1:${completed.dbPort}/${database}`,
          baseUrl: `http://127.0.0.1:${appPort}`, distName: `${directory}-next-${appPort}` };
        await writeFile(receipt, JSON.stringify(e, null, 2));
      }
    } finally { await admin.end(); }
    assert.equal(e.data, completed.data); assert.equal(e.dbPort, completed.dbPort);
    assert.match(e.databaseUrl, new RegExp(`^postgresql://postgres@127\\.0\\.0\\.1:${completed.dbPort}/serrian_livinghistory_[0-9]+$`));
    assert.equal(e.baseUrl, `http://127.0.0.1:${e.appPort}`); assert.equal(e.distName, `${directory}-next-${e.appPort}`);
    pool = new pg.Pool({ connectionString: e.databaseUrl }); process.env.DATABASE_URL = e.databaseUrl;
    const before = await sourceSnapshot(pool, true);
    const journal=JSON.parse(execFileSync("git",["show","HEAD:drizzle/meta/_journal.json"],{encoding:"utf8",windowsHide:true}));
    assert.equal(journal.entries.at(-1).idx,127);
    const hashes:Record<string,string>={},migrationFolder=path.join(e.temporaryRoot,`living-history-migrations-${Date.now()}`);await mkdir(path.join(migrationFolder,"meta"),{recursive:true});
    for(const entry of journal.entries){const file=`drizzle/${entry.tag}.sql`,bytes=execFileSync("git",["show",`HEAD:${file}`],{maxBuffer:32*1024*1024,windowsHide:true});assert.equal((await readFile(file,"utf8")).replaceAll("\r\n","\n"),bytes.toString("utf8"));hashes[entry.tag]=createHash("sha256").update(bytes).digest("hex");await writeFile(path.join(migrationFolder,`${entry.tag}.sql`),bytes);}
    await writeFile(path.join(migrationFolder,"meta","_journal.json"),JSON.stringify(journal));
    assert.equal(hashes["0127_worlds_historical_connections"],"30b597d392112bf0173140d15dcb21214cc083718d542ad5eb57a2c3f9d03ff2");
    const evidence=JSON.parse(await readFile("artifacts/guidance/worlds-historical-connections/migration-results.json","utf8"));assert.ok(evidence.fresh&&evidence.populated6BCUpgrade);assert.equal(evidence.migration0127Sha256,hashes["0127_worlds_historical_connections"]);
    await migrate(drizzle(pool),{migrationsFolder:migrationFolder});assert.deepEqual(await sourceSnapshot(pool,true),before);assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,128);
    await writeFile(`${directory}/migration-results.json`,JSON.stringify({unchangedCommittedMigrations:128,noNewMigration:true,existing105WorldTablesPreserved:Object.keys(before).length>=105,migratorNoOpPreserved:true,reusedExactFreshPopulatedEvidence:"worlds-historical-connections/migration-results.json",hashes},null,2));
    console.log("PASS frozen 0123-0127, approved fresh/populated evidence, schema-0127 no-op and existing World rows");
    application = await import("../src/db");
    if(process.argv.includes("--migration-only"))return;
    if(!e.journey){e.journey=await livingHistoryFixture(pool,directory);await writeFile(receipt,JSON.stringify(e,null,2));}
    if(!process.argv.includes("--browser-only")&&!process.argv.includes("--build-only"))await livingHistoryServices(pool,e.journey,directory);
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
      if(process.argv.includes("--build-only"))return;
      server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(e.appPort)], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      server.stdout!.pipe(log, { end: false }); server.stderr!.pipe(log, { end: false });
      const deadline = Date.now() + 90000; let ready = false;
      while (Date.now() < deadline) {
        assert.equal(server.exitCode, null);
        try { if ((await fetch(`${e.baseUrl}/login`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch { /* Starting task server. */ }
        await new Promise(resolve => setTimeout(resolve, 300));
      } assert.ok(ready);
      const browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
      try {
        await livingHistoryBrowser(browser,e.baseUrl,e.journey!,pool,directory);
      } finally { await browser.close(); }
    }
    const after=await sourceSnapshot(pool,true);for(const [table,rows] of Object.entries(templateBefore as Record<string,unknown[]>)){const retained=new Set((after as Record<string,unknown[]>)[table].map(row=>JSON.stringify(row)));for(const row of rows)assert.ok(retained.has(JSON.stringify(row)),`Pre-existing source changed: ${table}`);}
    assert.deepEqual(await sourceSnapshot(template!, true), templateBefore);
    await writeFile(`${directory}/preservation-results.json`,JSON.stringify({startingCommit:"81098e07cd7227db80aff5659e3a86b45bfda8d0",migrationsExecuted:0,worldTables:Object.keys(templateBefore).length,allPreexistingWorldRowsUnchanged:true,completed6BDEvidenceDatabaseUnchanged:true},null,2));
    console.log("PASS all pre-existing World rows, versions, sources, timeline heads and completed evidence unchanged");
  } finally {
    if (server?.pid && server.exitCode === null) execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    log.end(); if (application) await application.pool.end(); if (pool) await pool.end(); if (template) await template.end();
    await writeFile("tsconfig.json", originalConfig); await writeFile("next-env.d.ts", originalNext);
    if (started) execFileSync(pgCtl, ["-D", completed.data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
