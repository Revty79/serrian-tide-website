import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
assert.ok(process.argv.slice(2).every((arg) => arg === "--apply"), "Omit arguments for read-only review, or pass --apply.");
const apply = process.argv.includes("--apply");
const source = JSON.parse(await readFile("data/canon/serrian-tide-human-skill-system.json", "utf8"));
const preflight = JSON.parse(await readFile("artifacts/human-skill-rebuild/preflight.json", "utf8"));
const ids = Array.from({ length: 28 }, (_, index) => 1139 + index);
assert.equal(source.sourceSha256, preflight.sourceSha256);
assert.deepEqual(preflight.extraStandardSkills.map(({ id }) => id), ids);
const targetMap = new Map(source.records.map((row) => [row.id, row]));
for (const id of ids) assert.ok(!targetMap.has(id), `Refusing to delete active workbook ID #${id}`);
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_dev"));
assert.equal(url.pathname.slice(1), preflight.database);
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let transaction = false;

async function inspect() {
  const skills = (await client.query("select * from public.skill order by id")).rows;
  const relationships = (await client.query("select * from public.skill_relationship order by id")).rows;
  const byId = new Map(skills.map((row) => [row.id, row]));
  const present = skills.filter((row) => ids.includes(row.id));
  assert.ok(present.length === 0 || present.length === 28, "Unexpected partial removal; review the current database before proceeding.");
  for (const extra of preflight.extraStandardSkills) {
    const archived = byId.get(extra.id);
    if (archived) {
      assert.equal(archived.classification, "standard");
      assert.ok(archived.archived_at, `Skill #${extra.id} is active; refusing deletion.`);
      assert.equal(archived.name, extra.name);
      assert.ok(archived.archive_reason.includes(source.sourceFile), `Unrecognized archive reason #${extra.id}`);
    }
    assert.equal(extra.matchingTargetIds.length, 1);
    const target = targetMap.get(extra.matchingTargetIds[0]);
    const replacement = byId.get(target.id);
    assert.ok(replacement && !replacement.archived_at, `Missing active replacement for #${extra.id}`);
    assert.equal(replacement.name, extra.name);
  }
  for (const target of source.records) {
    const actual = byId.get(target.id);
    assert.ok(actual && !actual.archived_at);
    for (const [field, column] of Object.entries({ name: "name", definition: "definition", tier: "tier", primaryAttribute: "primary_attribute", secondaryAttribute: "secondary_attribute" })) assert.equal(actual[column], target[field], `Workbook metadata drift #${target.id}.${field}`);
    const parents = relationships.filter((row) => row.skill_id === target.id && row.relationship_type === "parent");
    assert.deepEqual(parents.map((row) => ({ parentId: row.related_skill_id, sortOrder: row.sort_order })), target.parentId === null ? [] : [{ parentId: target.parentId, sortOrder: target.sortOrder }]);
  }
  const removableRelationships = relationships.filter((row) => ids.includes(row.skill_id) || ids.includes(row.related_skill_id));
  for (const row of removableRelationships) {
    assert.ok(ids.includes(row.skill_id), `Remaining Skill #${row.skill_id} depends on archived Skill #${row.related_skill_id}; refusing removal.`);
    assert.equal(row.relationship_type, "parent", "Unexpected non-parent relationship needs review.");
  }
  const references = (await client.query(`select c.conrelid::regclass::text as table_name, a.attname as column_name
    from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and c.confrelid='public.skill'::regclass order by 1,2`)).rows;
  const consumerReferences = [];
  for (const reference of references.filter((row) => row.table_name !== "skill_relationship")) {
    const table = reference.table_name.split(".").map(quote).join(".");
    const count = (await client.query(`select count(*)::int as count from ${table} where ${quote(reference.column_name)}=any($1::int[])`, [ids])).rows[0].count;
    consumerReferences.push({ ...reference, count });
    assert.equal(count, 0, `Archived Skills have references in ${reference.table_name}; refusing removal.`);
  }
  return { skills, relationships, removableRelationships, consumerReferences, presentIds: present.map(({ id }) => id) };
}

async function digests() {
  const tables = (await client.query("select schemaname, tablename from pg_tables where schemaname in ('public','drizzle') order by schemaname,tablename")).rows;
  const result = {};
  for (const { schemaname, tablename } of tables) result[`${schemaname}.${tablename}`] = (await client.query(`select count(*)::int as count, md5(coalesce(string_agg(h, ',' order by h), '')) as hash from (select md5(to_jsonb(t)::text) as h from ${quote(schemaname)}.${quote(tablename)} t) rows`)).rows[0];
  return result;
}

async function backup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "serrian-before-archived-skill-removal-"));
  const file = path.join(directory, `${preflight.database}.dump`);
  const binaryDirectory = process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const environment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: preflight.database, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
  function run(binary, parameters) {
    const result = spawnSync(path.join(binaryDirectory, binary), parameters, { env: environment, encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${binary} failed: ${result.stderr}`);
    return result.stdout;
  }
  run("pg_dump.exe", ["--format=custom", "--no-password", "--file", file]);
  assert.ok(run("pg_restore.exe", ["--list", file]).includes("TABLE DATA public skill "));
  run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", file]);
  const dataFile = path.join(directory, "catalog-before-removal.sql");
  run("pg_restore.exe", ["--data-only", "--schema=public", "--table=skill", "--table=skill_relationship", "--file", dataFile, file]);
  const bytes = await readFile(file);
  const dataBytes = await readFile(dataFile);
  return { path: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), archiveListingVerified: true, fullArchiveDecodeVerified: true, exactCatalogData: { path: dataFile, sha256: createHash("sha256").update(dataBytes).digest("hex") }, restoreRehearsalRun: false };
}

try {
  await client.query("begin isolation level repeatable read read only");
  transaction = true;
  const initial = await inspect();
  await client.query("rollback");
  transaction = false;
  if (!apply || initial.presentIds.length === 0) {
    console.log(JSON.stringify({ mode: "read only", status: initial.presentIds.length ? "ready" : "already-removed", archivedSkillIds: initial.presentIds, obsoleteParentLinks: initial.removableRelationships.length, consumerReferences: initial.consumerReferences, activeWorkbookSkillsVerified: 637 }, null, 2));
  } else {
    const recovery = await backup();
    await client.query("begin isolation level repeatable read");
    transaction = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("lock table public.skill, public.skill_relationship, public.skill_extension in share row exclusive mode");
    await client.query("select id from public.skill where id=any($1::int[]) order by id for update", [ids]);
    const before = await inspect();
    assert.equal(hash(before), hash(initial), "Catalog or references changed during backup; refusing deletion.");
    const beforeTables = await digests();
    const removedLinks = await client.query("delete from public.skill_relationship where id=any($1::int[])", [before.removableRelationships.map(({ id }) => id)]);
    assert.equal(removedLinks.rowCount, before.removableRelationships.length);
    const deleted = await client.query("delete from public.skill where id=any($1::int[]) and archived_at is not null returning id", [ids]);
    assert.deepEqual(deleted.rows.map(({ id }) => id).sort((a, b) => a - b), ids);
    const after = await inspect();
    assert.deepEqual(after.presentIds, []);
    assert.deepEqual(after.skills, before.skills.filter((row) => !ids.includes(row.id)));
    const removedLinkIds = new Set(before.removableRelationships.map(({ id }) => id));
    assert.deepEqual(after.relationships, before.relationships.filter(({ id }) => !removedLinkIds.has(id)));
    const afterTables = await digests();
    assert.deepEqual(Object.keys(afterTables), Object.keys(beforeTables));
    for (const table of Object.keys(beforeTables)) if (!["public.skill", "public.skill_relationship"].includes(table)) assert.deepEqual(afterTables[table], beforeTables[table], `Unrelated table changed: ${table}`);
    assert.equal(after.skills.filter(({ classification }) => classification === "standard").length, 637);
    const report = { checkedAt: new Date().toISOString(), database: preflight.database, sourceSha256: source.sourceSha256, status: "removed-and-verified", userDirection: "Remove the 28 archived superseded Skill records after confirming their active counterparts and references.", deletedSkillIds: ids, removedRelationshipIds: [...removedLinkIds], skillCountBefore: before.skills.length, skillCountAfter: after.skills.length, activeWorkbookSkillsUnchanged: 637, allRemainingSkillRowsUnchanged: true, allRemainingRelationshipsUnchanged: true, consumerReferences: before.consumerReferences, unrelatedTablesUnchanged: Object.keys(beforeTables).length - 2, beforeTables, afterTables, backup: recovery, humanInvestmentReview: "Unchanged: four paid allocations remain for human review; no character data changed.", production: "Not inspected or modified. No deployment performed." };
    await client.query("commit");
    transaction = false;
    console.log("Removed only the 28 archived superseded Skills and their obsolete parent links.");
    await writeFile(path.join(path.dirname(recovery.path), "removal-report.json"), JSON.stringify(report, null, 2) + "\n");
    await mkdir("artifacts/human-skill-rebuild", { recursive: true });
    await writeFile("artifacts/human-skill-rebuild/archived-skill-removal.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ status: report.status, removedSkills: ids.length, removedParentLinks: removedLinks.rowCount, skillCountAfter: after.skills.length, activeWorkbookSkillsUnchanged: 637, unrelatedTablesUnchanged: report.unrelatedTablesUnchanged, backup: recovery }, null, 2));
  }
} finally {
  if (transaction) await client.query("rollback");
  await client.end();
}
