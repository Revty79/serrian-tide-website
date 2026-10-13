/** Phase 6B-C: preserve approved 6B-B evidence; clone only the stopped disposable cluster. */
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
import { territoryIntegrity } from "./worlds-historical-territory-integrity";
import { territoryServices,territoryBrowser,type TerritoryFixture } from "./worlds-historical-territory-checks";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";


import { explorerFailureChecks } from "./worlds-explorer-failure-checks";

const directory="artifacts/guidance/worlds-historical-territories", receipt=`${directory}/${process.argv.includes("--migration-only")?"final-migration-environment":"environment"}.json`;
type Environment = { data: string; temporaryRoot: string; dbPort: number; databaseUrl: string; appPort: number;
  baseUrl: string; distName: string; fixtures: MapFixtures; bridge: LinkingFixtures; historical?:SettlementHistoryFixture;political?:TerritoryFixture };
async function freePort() {
  const server = createServer(); await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>(resolve => server.close(() => resolve())); return address.port;
}
async function main() {
  await mkdir(directory, { recursive: true });
  const completed: Environment = JSON.parse(await readFile("artifacts/guidance/worlds-historical-settlements/environment.json", "utf8"));
  assert.equal(path.dirname(path.resolve(completed.temporaryRoot)), path.resolve(tmpdir()));
  assert.ok(path.basename(completed.temporaryRoot).startsWith("serrian-worlds-linking-"));
  assert.equal(path.resolve(completed.data), path.join(path.resolve(completed.temporaryRoot), "data"));
  assert.match(completed.databaseUrl, new RegExp(`^postgresql://postgres@127\\.0\\.0\\.1:${completed.dbPort}/serrian_settlementhistory_[0-9]+$`));
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
        const database = `serrian_territoryhistory_${Date.now()}`, appPort = await freePort();
        const templateName = new URL(completed.databaseUrl).pathname.slice(1); assert.match(templateName, /^serrian_settlementhistory_[0-9]+$/);
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
    assert.match(e.databaseUrl, new RegExp(`^postgresql://postgres@127\\.0\\.0\\.1:${completed.dbPort}/serrian_territoryhistory_[0-9]+$`));
    assert.equal(e.baseUrl, `http://127.0.0.1:${e.appPort}`); assert.equal(e.distName, `${directory}-next-${e.appPort}`);
    pool = new pg.Pool({ connectionString: e.databaseUrl }); process.env.DATABASE_URL = e.databaseUrl;
    const before = await sourceSnapshot(pool, true);
    const committed = execFileSync("git", ["show", "278686d4000eb42794d61bad06543c2213c12cb4:drizzle/0124_worlds_map_states.sql"], { windowsHide: true });
    const hash = createHash("sha256").update(committed).digest("hex");
    assert.equal(hash, "acd146d910a170dec6374b93016a7b749d55e9bf765cdfe29a5f81733a0edfaa");
    const frozen0125=createHash("sha256").update(execFileSync("git",["show","9ac678fc03a6f39a9989e9991d34f3e48b5a6d0f:drizzle/0125_worlds_historical_settlements.sql"],{windowsHide:true})).digest("hex");
    assert.equal(frozen0125,"6339cddc47e8821fa66758fec97f72b6b5a81b5498d904380cf3461f6379c638");
    const journal=JSON.parse(execFileSync("git",["show",":drizzle/meta/_journal.json"],{encoding:"utf8",windowsHide:true}));
    const migrationFolder=path.join(e.temporaryRoot,`territory-history-migrations-${Date.now()}`);await mkdir(path.join(migrationFolder,"meta"),{recursive:true});
    for(const entry of journal.entries){const file=`drizzle/${entry.tag}.sql`;const bytes=execFileSync("git",["show",`${entry.idx===126?":":"HEAD:"}${file}`],{maxBuffer:32*1024*1024,windowsHide:true});assert.equal((await readFile(file,"utf8")).replaceAll("\r\n","\n"),bytes.toString("utf8"));await writeFile(path.join(migrationFolder,`${entry.tag}.sql`),bytes);}
    await writeFile(path.join(migrationFolder,"meta","_journal.json"),JSON.stringify(journal));
    await migrate(drizzle(pool),{migrationsFolder:migrationFolder});const upgraded=await sourceSnapshot(pool,true);for(const [table,rows] of Object.entries(before))assert.deepEqual(upgraded[table],rows);for(const table of Object.keys(upgraded).filter(t=>!(t in before)))assert.deepEqual(upgraded[table],[],`New migration table starts empty: ${table}`);await migrate(drizzle(pool),{migrationsFolder:migrationFolder});assert.deepEqual(await sourceSnapshot(pool,true),upgraded);
    const migration=await readFile(path.join(migrationFolder,"0126_worlds_historical_territories.sql"),"utf8");
    const reapply=await pool.connect();try{await reapply.query("BEGIN");for(const statement of migration.split("--> statement-breakpoint"))if(statement.trim())await reapply.query(statement);await reapply.query("COMMIT");}catch(error){await reapply.query("ROLLBACK");throw error;}finally{reapply.release();}assert.deepEqual(await sourceSnapshot(pool,true),upgraded);
    if(!process.argv.includes("--resume")){const admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${e.dbPort}/postgres`}),freshName=`serrian_territoryhistory_fresh_${Date.now()}`;try{await admin.query(`create database "${freshName}"`);}finally{await admin.end();}const fresh=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${e.dbPort}/${freshName}`});try{await migrate(drizzle(fresh),{migrationsFolder:migrationFolder});await migrate(drizzle(fresh),{migrationsFolder:migrationFolder});assert.equal((await fresh.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,journal.entries.length);}finally{await fresh.end();}assert.deepEqual(await sourceSnapshot(template!,true),templateBefore);await writeFile(`${directory}/migration-results.json`,JSON.stringify({fresh:true,populated6BBUpgrade:true,migratorReapplication:true,directSqlReapplication:true,allExistingWorldRowsUnchanged:true,completedEvidenceDatabaseUnchanged:true,worldTablesBefore:Object.keys(before).length,migrationEntries:journal.entries.length,migration0126Sha256:createHash("sha256").update(migration).digest("hex"),frozen0124Sha256:hash,frozen0125Sha256:frozen0125},null,2));}
    console.log("PASS exact Git migration, populated upgrade, reapplication and preserved sources");
    // Windows checkout line endings do not change the committed migration bytes.
    assert.equal((await readFile("drizzle/0124_worlds_map_states.sql", "utf8")).replaceAll("\r\n", "\n"), committed.toString("utf8"));
    application = await import("../src/db");
    if(!e.political&&!process.argv.includes("--migration-only")){e.political=await territoryServices(pool,e.historical!,directory);await writeFile(receipt,JSON.stringify(e,null,2));}
    if(process.argv.includes("--migration-only"))return;
    if(process.argv.includes("--integrity-only")){await territoryIntegrity(pool,e.political!,directory);await writeFile(receipt,JSON.stringify(e,null,2));}
    if (!process.argv.includes("--services-only")&&!process.argv.includes("--integrity-only")) {
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
        if(process.argv.includes("--failure-only"))await explorerFailureChecks(browser,e.baseUrl,e.political!,directory,{failureOnly:true,receiptName:"failure-results.json"});
        else await territoryBrowser(browser,e.baseUrl,e.political!,e.historical!,directory);
      } finally { await browser.close(); }
    }
    const after=await sourceSnapshot(pool,true);for(const [table,rows] of Object.entries(templateBefore as Record<string,unknown[]>)){const retained=new Set((after as Record<string,unknown[]>)[table].map(row=>JSON.stringify(row)));for(const row of rows)assert.ok(retained.has(JSON.stringify(row)),`Pre-existing source changed: ${table}`);}
    assert.deepEqual(await sourceSnapshot(template!, true), templateBefore);
    await writeFile(`${directory}/preservation-results.json`, JSON.stringify({ migration0124Sha256: hash, migration0126Sha256:createHash("sha256").update(migration).digest("hex"), migrationsExecuted: 1,
      worldTables: Object.keys(before).length, allPreexistingWorldRowsUnchanged: true, completedEvidenceDatabaseUnchanged: true }, null, 2));
    console.log("PASS all pre-existing World rows, versions, sources, timeline heads and completed evidence unchanged");
  } finally {
    if (server?.pid && server.exitCode === null) execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    log.end(); if (application) await application.pool.end(); if (pool) await pool.end(); if (template) await template.end();
    await writeFile("tsconfig.json", originalConfig); await writeFile("next-env.d.ts", originalNext);
    if (started) execFileSync(pgCtl, ["-D", completed.data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
