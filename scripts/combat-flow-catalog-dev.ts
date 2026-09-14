import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { readCatalog } from "./weapon-catalog-repair";
import { planCombatFlowCatalog } from "./combat-flow-catalog";

async function main() {
  dotenv.config({ path: ".env.local", quiet: true });
  const [mode = "--plan", expected] = process.argv.slice(2);
  assert.ok(["--plan", "--apply", "--apply-m4"].includes(mode));
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && (url.port || "5432") === "5432" && url.pathname === "/serrian_tide_dev", "Only loopback serrian_tide_dev is allowed.");
  const directory = "artifacts/player-tabletop-tabs/combat-flow";
  await mkdir(directory, { recursive: true });
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  let open = false;
  try {
    const target = (await client.query("select current_database() database,host(inet_server_addr()) address,inet_server_port() port")).rows[0];
    assert.equal(target.database, "serrian_tide_dev"); assert.ok(["127.0.0.1", "::1"].includes(target.address)); assert.equal(target.port, 5432);
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    const ledger = await Promise.all(journal.entries.map(async (entry: { tag: string; when: number }) => ({ hash: createHash("sha256").update(await readFile(`drizzle/${entry.tag}.sql`)).digest("hex"), created_at: String(entry.when) })));
    const verifyLedger = async () => assert.deepEqual((await client.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at")).rows, ledger);
    await verifyLedger();
    if (mode === "--plan") {
      await client.query("begin isolation level repeatable read read only"); open = true;
      const catalog = await readCatalog(client), plan = planCombatFlowCatalog(catalog);
      await writeFile(path.join(directory, "plan.json"), JSON.stringify({ target, at: new Date().toISOString(), ...plan }, null, 2));
      await writeFile(path.join(directory, "review-source.json"), JSON.stringify(catalog, null, 2));
      console.log(JSON.stringify({ target, digest: plan.digest, patches: plan.patches.length, fields: Object.fromEntries([...new Set(plan.patches.map((p) => p.field))].map((field) => [field, plan.patches.filter((p) => p.field === field).length])), unresolved: plan.notes.length }));
      await client.query("rollback"); open = false; return;
    }
    assert.match(expected ?? "", /^[a-f0-9]{64}$/, "Supply the exact reviewed plan digest.");
    const initialPlan = planCombatFlowCatalog(await readCatalog(client));
    assert.equal(initialPlan.digest, expected, "Catalog changed; regenerate the review.");
    const backupRoot = await mkdtemp(path.join(os.tmpdir(), "serrian-before-combat-flow-"));
    const backupPath = path.join(backupRoot, "serrian_tide_dev.dump");
    const environment = { ...process.env, PGHOST: url.hostname, PGPORT: "5432", PGDATABASE: "serrian_tide_dev", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
    const run = (binary: string, args: string[]) => {
      const result = spawnSync(path.join(process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin", binary), args, { env: environment, encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, result.stderr); return result.stdout;
    };
    run("pg_dump.exe", ["--format=custom", "--no-password", "--file", backupPath]);
    run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", backupPath]);
    const bytes = await readFile(backupPath);
    const backup = { path: backupPath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), fullArchiveDecodeVerified: true, restoreRehearsalRun: false };
    await client.query("begin"); open = true;
    await client.query("set local lock_timeout='5s'"); await client.query("set local statement_timeout='30s'");
    const tables: string[] = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((row) => row.tablename);
    const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    await client.query(`lock table drizzle.__drizzle_migrations, ${tables.map((name) => `public.${quote(name)}`).join(", ")} in share row exclusive mode`);
    await verifyLedger();
    const catalog = await readCatalog(client), fullPlan = planCombatFlowCatalog(catalog);
    const plan = mode === "--apply-m4" ? { ...fullPlan, patches: fullPlan.patches.filter((patch) => patch.name === "M4 Carbine / 3rd Burst" && patch.field === "rounds_per_cadence" && patch.before === 2 && patch.after === 3) } : fullPlan;
    if (mode === "--apply-m4") assert.equal(plan.patches.length, 1, "The explicit M4 correction must be exactly one field.");
    assert.equal(plan.digest, expected, "Catalog changed during backup; review again.");
    const changedTables = new Set(plan.patches.map((patch) => patch.table));
    const protectedState = async () => {
      const result: Record<string, unknown> = {};
      for (const table of tables.filter((name) => !changedTables.has(name as "weapon_profiles"))) result[table] = (await client.query(`select count(*)::int count,md5(coalesce(string_agg(h,',' order by h),'')) hash from (select md5(to_jsonb(t)::text) h from public.${quote(table)} t) rows`)).rows[0];
      return result;
    };
    const before = await protectedState();
    const expectedCatalog = structuredClone(catalog);
    for (const patch of plan.patches) {
      const rows = patch.table === "weapon_profiles" ? expectedCatalog.profiles : patch.table === "weapon_firing_modes" ? expectedCatalog.modes : expectedCatalog.magazines;
      rows.find((row) => row[patch.idColumn] === patch.id)![patch.field] = patch.after;
      const result = await client.query(`update ${quote(patch.table)} set ${quote(patch.field)}=$1 where ${quote(patch.idColumn)}=$2 and ${quote(patch.field)} is not distinct from $3`, [patch.after, patch.id, patch.before]);
      assert.equal(result.rowCount, 1);
    }
    assert.deepEqual(await readCatalog(client), expectedCatalog, "Unexpected catalog changes; rollback.");
    assert.deepEqual(await protectedState(), before, "Protected state changed; rollback.");
    const receipt = { target, at: new Date().toISOString(), digest: plan.digest, backup, patches: plan.patches, protectedTables: Object.keys(before), catalogOnly: true, remaining: planCombatFlowCatalog(expectedCatalog).notes };
    const receiptPath = path.join(directory, `applied-${Date.now()}.json`);
    await writeFile(receiptPath + ".pending", JSON.stringify(receipt, null, 2));
    await client.query("commit"); open = false;
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify({ receiptPath, patches: plan.patches.length, backup, remaining: receipt.remaining.length }));
  } finally { if (open) await client.query("rollback"); await client.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
