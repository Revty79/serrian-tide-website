import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { applyRepair, auditCatalog, digest, planRepair, readCatalog, type Catalog } from "./weapon-catalog-repair";

async function main() {
dotenv.config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
const mode = args[0];
assert.ok(["--capture-review", "--plan", "--apply"].includes(mode), "Choose --capture-review, --plan or --apply <plan digest> <administrator user ID>.");
const url = new URL(process.env.DATABASE_URL!);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && (url.port || "5432") === "5432" && url.pathname === "/serrian_tide_dev", "Only loopback port 5432 serrian_tide_dev is supported.");
const directory = "artifacts/weapon-catalog-repair";
await mkdir(directory, { recursive: true });
const reviewFile = path.join(directory, "reviewed-catalog.json");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let open = false;
try {
  const target = (await client.query("select current_database() database, host(inet_server_addr()) address, inet_server_port() port")).rows[0];
  assert.equal(target.database, "serrian_tide_dev");
  assert.ok(["127.0.0.1", "::1"].includes(target.address));
  assert.equal(target.port, 5432);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const expectedLedger: { hash: string; created_at: string }[] = [];
  for (const entry of journal.entries) expectedLedger.push({ hash: createHash("sha256").update(await readFile(`drizzle/${entry.tag}.sql`)).digest("hex"), created_at: String(entry.when) });
  const ledger = async () => assert.deepEqual((await client.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at")).rows, expectedLedger, "Migration ledger differs; stop for review.");
  await ledger();
  if (mode !== "--apply") {
    await client.query("begin isolation level repeatable read read only"); open = true;
    const catalog = await readCatalog(client);
    if (mode === "--capture-review") {
      await writeFile(reviewFile, JSON.stringify(catalog, null, 2) + "\n", { flag: "wx" });
      console.log(`Captured immutable review source: ${reviewFile}; ${digest(catalog)}`);
    } else {
      const reviewed: Catalog = JSON.parse(await readFile(reviewFile, "utf8"));
      const plan = planRepair(catalog, reviewed);
      await writeFile(path.join(directory, "plan.json"), JSON.stringify({ target, ...plan, audit: auditCatalog(catalog) }, null, 2) + "\n");
      console.log(JSON.stringify({ target, digest: plan.digest, additions: plan.additions.length, profilesToFill: plan.patches.length, ammunition: plan.ammunition.length, file: `${directory}/plan.json` }));
    }
    await client.query("rollback"); open = false;
  } else {
    assert.match(args[1] ?? "", /^[a-f0-9]{64}$/, "Supply the exact reviewed --plan digest.");
    assert.ok(args[2], "Supply the authorizing administrator ID.");
    const reviewed: Catalog = JSON.parse(await readFile(reviewFile, "utf8"));
    const backupDirectory = await mkdtemp(path.join(os.tmpdir(), "serrian-before-weapon-catalog-"));
    const backupPath = path.join(backupDirectory, "serrian_tide_dev.dump");
    const environment = { ...process.env, PGHOST: url.hostname, PGPORT: "5432", PGDATABASE: "serrian_tide_dev", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
    function run(binary: string, parameters: string[]) {
      const r = spawnSync(path.join(process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin", binary), parameters, { env: environment, encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 8*1024*1024 });
      if (r.error) throw r.error;
      assert.equal(r.status, 0, `${binary} failed: ${r.stderr}`);
      return r.stdout;
    }
    run("pg_dump.exe", ["--format=custom", "--no-password", "--file", backupPath]);
    assert.ok(run("pg_restore.exe", ["--list", backupPath]).includes("TABLE DATA public weapon_skill_path_mappings"));
    run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", backupPath]);
    const bytes = await readFile(backupPath);
    const backup = { path: backupPath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), fullArchiveDecodeVerified: true, restoreRehearsalRun: false };
    console.log(JSON.stringify({ target, backup }));
    await client.query("begin"); open = true;
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='30s'");
    const tables: string[] = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((r) => r.tablename);
    const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
    // Briefly exclude concurrent writes so protected-state evidence is meaningful.
    await client.query(`lock table drizzle.__drizzle_migrations, ${tables.map((t) => `public.${quote(t)}`).join(", ")} in share row exclusive mode`);
    await ledger();
    const protectedDigests = async (newItemIds: number[] = []) => {
      const result: Record<string, unknown> = {};
      for (const table of tables.filter((t) => !["weapon_profiles", "weapon_skill_path_mappings"].includes(t))) {
        const where = table === "items" ? " where id <> all($1::int[])" : "";
        result[table] = (await client.query(`select count(*)::int count, md5(coalesce(string_agg(h,',' order by h),'')) hash from (select md5(to_jsonb(t)::text) h from public.${quote(table)} t${where}) rows`, table === "items" ? [newItemIds] : [])).rows[0];
      }
      return result;
    };
    const before = await protectedDigests();
    const result = await applyRepair(client, reviewed, args[1], args[2]);
    assert.deepEqual(await protectedDigests(result.createdItems.map((i) => i.id)), before, "Protected data changed; rollback required.");
    const report = {
      verifiedAt: new Date().toISOString(), target, backup, migrationCount: expectedLedger.length,
      planDigest: args[1], approvedByUserId: args[2], additions: result.plan.additions.map((p) => ({ ...p, record: result.inserted.find((m) => m.weapon_profile_id === p.profileId) })),
      profileChanges: result.plan.patches.map((p) => ({ ...p, before: result.before.profiles.find((r) => r.id === p.profileId), after: result.after.profiles.find((r) => r.id === p.profileId) })),
      itemsCreated: result.createdItems, ammunitionProfilesCreated: result.createdProfiles, ammunitionLinks: result.ammunitionLinks,
      preservedTables: before, existingMappingsUnchanged: true, otherProfilesUnchanged: true,
      inventoryAndHistoryUnchanged: true, repeatPlanHasNoChanges: true, productionAccessed: false,
      catalogAudit: auditCatalog(result.after), gameplayVerifiedByThisRepair: false,
    };
    const receipt = path.join(directory, `applied-${Date.now()}.json`);
    await writeFile(receipt + ".pending", JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    await client.query("commit"); open = false;
    await rename(receipt + ".pending", receipt);
    console.log(JSON.stringify({ committed: true, target, additions: result.inserted.length, profiles: result.plan.patches.length, ammunitionCreated: result.createdItems.length, receipt }));
  }
} finally {
  if (open) await client.query("rollback");
  await client.end();
}
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
