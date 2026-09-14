import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

import { applyRaceSkillCleanup, readRaceSkillCleanupPlan } from "./race-skill-cleanup";

async function main() {
  dotenv.config({ path: ".env.local", quiet: true });
  const [mode = "--plan", expectedTarget, expectedDigest] = process.argv.slice(2);
  assert.ok(["--plan", "--apply"].includes(mode), "Use --plan <host:port/database> or --apply <host:port/database> <reviewed plan digest>.");
  const url = new URL(process.env.DATABASE_URL!);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.match(database, /^[a-zA-Z0-9_-]+$/, "The database name must be safe for the backup filename.");
  assert.equal(`${url.hostname}:${url.port || "5432"}/${database}`, expectedTarget, "Explicit target does not match DATABASE_URL; no database access performed.");
  const directory = "artifacts/race-skill-cleanup";
  await mkdir(directory, { recursive: true });
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let open = false;
  try {
    const target = (await client.query("select current_database() database,host(inet_server_addr()) address,inet_server_port() port")).rows[0];
    assert.equal(target.database, database, "The connected database does not match the approved target.");
    if (mode === "--plan") {
      await client.query("begin isolation level repeatable read read only"); open = true;
      const plan = await readRaceSkillCleanupPlan(client);
      await writeFile(path.join(directory, "plan.json"), JSON.stringify({ target, ...plan }, null, 2) + "\n");
      console.log(JSON.stringify({ target, digest: plan.digest, remove: plan.remove.length, keep: plan.keep.length,
        affectedRaces: [...new Set(plan.remove.map((row) => row.raceName))],
        preservedSpecialAbilities: plan.keep.filter((row) => row.classification.trim().toLowerCase() === "special ability").length }));
      return;
    }
    assert.match(expectedDigest ?? "", /^[a-f0-9]{64}$/);
    const backupDirectory = await mkdtemp(path.join(os.tmpdir(), "serrian-before-race-skills-"));
    const backupPath = path.join(backupDirectory, `${database}.dump`);
    function run(binary: string, args: string[]) {
      const result = spawnSync(path.join(process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin", binary), args, {
        env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: database, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) },
        encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024,
      });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, `${binary} failed: ${result.stderr}`);
      return result.stdout;
    }
    run("pg_dump.exe", ["--format=custom", "--no-password", "--file", backupPath]);
    assert.ok(run("pg_restore.exe", ["--list", backupPath]).includes("TABLE DATA public race_skill_links"));
    run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", backupPath]);
    const bytes = await readFile(backupPath);
    const backup = { path: backupPath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), fullArchiveDecodeVerified: true };
    await client.query("begin"); open = true;
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='30s'");
    const tables: string[] = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row) => row.tablename);
    const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    await client.query(`lock table ${tables.map((table) => `public.${quote(table)}`).join(",")} in share row exclusive mode`);
    const protectedDigests = async () => {
      const result: Record<string, unknown> = {};
      for (const table of tables.filter((name) => name !== "race_skill_links")) {
        result[table] = (await client.query(`select count(*)::int count,md5(coalesce(string_agg(h,',' order by h),'')) hash
          from(select md5(to_jsonb(t)::text) h from public.${quote(table)} t) rows`)).rows[0];
      }
      return result;
    };
    const before = await protectedDigests();
    const plan = await applyRaceSkillCleanup(client, expectedDigest!);
    assert.deepEqual(await protectedDigests(), before, "A protected table changed; roll back.");
    const receipt = path.join(directory, `applied-${Date.now()}.json`);
    await writeFile(receipt + ".pending", JSON.stringify({ verifiedAt: new Date().toISOString(), target, backup, plan,
      approvedTarget: expectedTarget, preservedTables: before, characterDataUnchanged: true }, null, 2) + "\n", { flag: "wx" });
    await client.query("commit"); open = false;
    await rename(receipt + ".pending", receipt);
    console.log(JSON.stringify({ committed: true, removed: plan.remove.length, kept: plan.keep.length, backup, receipt }));
  } finally {
    if (open) await client.query("rollback");
    await client.end();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
