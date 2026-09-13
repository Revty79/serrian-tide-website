import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { readCatalog, type Catalog } from "./weapon-catalog-repair";
import { applyMagazineRepair, magazineReview, planMagazineRepair } from "./magazine-catalog-repair";

async function main() {
  dotenv.config({ path: ".env.local", quiet: true });
  const [mode, expectedDigest, actorId] = process.argv.slice(2);
  assert.ok(["--capture-review", "--plan", "--apply"].includes(mode), "Choose --capture-review, --plan, or --apply <plan digest> <administrator ID>.");
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && (url.port || "5432") === "5432" && url.pathname === "/serrian_tide_dev", "Only loopback port 5432 serrian_tide_dev is supported.");
  const directory = "artifacts/magazine-catalog-repair";
  await mkdir(directory, { recursive: true });
  const reviewFile = path.join(directory,"reviewed-targets.json");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let open = false;
  try {
    const target = (await client.query("select current_database() database,host(inet_server_addr()) address,inet_server_port() port")).rows[0];
    assert.ok(target.database === "serrian_tide_dev" && ["127.0.0.1","::1"].includes(target.address) && target.port === 5432);
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));
    const expectedLedger: { hash: string; created_at: string }[] = [];
    for (const entry of journal.entries) expectedLedger.push({ hash: createHash("sha256").update(await readFile(`drizzle/${entry.tag}.sql`)).digest("hex"), created_at: String(entry.when) });
    const ledger = async () => assert.deepEqual((await client.query("select hash,created_at from drizzle.__drizzle_migrations order by created_at")).rows,expectedLedger,"Migration ledger differs.");
    await ledger();
    if (mode !== "--apply") {
      await client.query("begin isolation level repeatable read read only"); open = true;
      const catalog = await readCatalog(client);
      if (mode === "--capture-review") {
        await writeFile(reviewFile,JSON.stringify(magazineReview(catalog),null,2)+"\n",{ flag: "wx" });
        console.log(`Captured immutable review: ${reviewFile}`);
      } else {
        const reviewed: Catalog = JSON.parse(await readFile(reviewFile,"utf8"));
        const plan = planMagazineRepair(catalog,reviewed);
        await writeFile(path.join(directory,"plan.json"),JSON.stringify({ target,...plan },null,2)+"\n");
        console.log(JSON.stringify({ target,digest: plan.digest,modelsToCreateOrLink: plan.models.length,weaponProfilesToConfigure: plan.patches.length }));
      }
      await client.query("rollback"); open = false;
      return;
    }
    assert.match(expectedDigest ?? "",/^[a-f0-9]{64}$/); assert.ok(actorId,"Select the authorizing administrator.");
    const reviewed: Catalog = JSON.parse(await readFile(reviewFile,"utf8"));
    const backupDirectory = await mkdtemp(path.join(os.tmpdir(),"serrian-before-magazine-catalog-"));
    const backupPath = path.join(backupDirectory,"serrian_tide_dev.dump");
    function run(binary: string, args: string[]) {
      const result = spawnSync(path.join(process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin",binary),args,{ env: { ...process.env,PGHOST: url.hostname,PGPORT: "5432",PGDATABASE: "serrian_tide_dev",PGUSER: decodeURIComponent(url.username),PGPASSWORD: decodeURIComponent(url.password) },encoding: "utf8",windowsHide: true,timeout: 60000,maxBuffer: 8*1024*1024 });
      if (result.error) throw result.error;
      assert.equal(result.status,0,`${binary} failed: ${result.stderr}`); return result.stdout;
    }
    run("pg_dump.exe",["--format=custom","--no-password","--file",backupPath]);
    assert.ok(run("pg_restore.exe",["--list",backupPath]).includes("TABLE DATA public magazine_profiles"));
    run("pg_restore.exe",["--file",process.platform === "win32" ? "NUL" : "/dev/null",backupPath]);
    const bytes = await readFile(backupPath);
    const backup = { path: backupPath,bytes: bytes.length,sha256: createHash("sha256").update(bytes).digest("hex"),fullArchiveDecodeVerified: true,restoreRehearsalRun: false };
    console.log(JSON.stringify({ target,backup }));
    await client.query("begin"); open = true;
    await client.query("set local lock_timeout='5s'"); await client.query("set local statement_timeout='30s'");
    const tables: string[] = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((r) => r.tablename);
    const quote = (s: string) => '"'+s.replaceAll('"','""')+'"';
    await client.query(`lock table drizzle.__drizzle_migrations,${tables.map((t) => `public.${quote(t)}`).join(",")} in share row exclusive mode`);
    await ledger();
    const protectedDigests = async (newItems: number[] = []) => {
      const result: Record<string,unknown> = {};
      for (const table of tables.filter((t) => !["weapon_profiles","magazine_profiles","magazine_ammunition","weapon_magazines"].includes(t))) {
        const where = table === "items" ? " where id <> all($1::int[])" : "";
        result[table] = (await client.query(`select count(*)::int count,md5(coalesce(string_agg(h,',' order by h),'')) hash from(select md5(to_jsonb(t)::text) h from public.${quote(table)} t${where}) rows`,table === "items" ? [newItems] : [])).rows[0];
      }
      return result;
    };
    const before = await protectedDigests();
    const result = await applyMagazineRepair(client,reviewed,expectedDigest,actorId);
    assert.deepEqual(await protectedDigests(result.createdItems.map((i) => i.id)),before,"Protected state changed; roll back.");
    const report = { verifiedAt: new Date().toISOString(),target,backup,migrationCount: expectedLedger.length,planDigest: expectedDigest,approvedByUserId: actorId,
      itemsCreated: result.createdItems,links: result.links,
      profileChanges: result.plan.patches.map((p) => ({ ...p,before: result.before.profiles.find((r) => r.id === p.profileId),after: result.after.profiles.find((r) => r.id === p.profileId) })),
      preservedTables: before,existingCatalogRowsPreserved: true,inventoryAndHistoryUnchanged: true,repeatPlanHasNoChanges: true,costsGuessed: false,productionAccessed: false };
    const receipt = path.join(directory,`applied-${Date.now()}.json`);
    await writeFile(receipt+".pending",JSON.stringify(report,null,2)+"\n",{ flag: "wx" });
    await client.query("commit"); open = false;
    await rename(receipt+".pending",receipt);
    console.log(JSON.stringify({ committed: true,itemsCreated: result.createdItems.map((i) => ({ id: i.id,name: i.name })),links: result.links,receipt }));
  } finally {
    if (open) await client.query("rollback");
    await client.end();
  }
}
main().catch((error: unknown) => { console.error(error);process.exitCode=1; });
