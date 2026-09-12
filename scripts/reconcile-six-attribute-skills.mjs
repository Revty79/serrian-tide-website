import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
assert.ok(process.argv.slice(2).every((arg) => arg === "--apply"), "Only --apply is supported; omit it for read-only preflight.");
const plan = JSON.parse(await readFile(new URL("../data/canon/serrian-tide-six-attribute-skill-rebuild.json", import.meta.url), "utf8"));
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname), "Loopback DEV database required.");
assert.equal(url.pathname.slice(1), plan.reviewedDevelopmentBaseline.database, "Database must match the reviewed development baseline.");
assert.ok(url.pathname.endsWith("_dev"));
assert.equal(plan.schemaVersion, 1);
assert.equal(plan.records.length, 637);
const targets = new Map(plan.records.map((row) => [row.id, row]));
assert.equal(targets.size, 637);
assert.equal(new Set(plan.records.map(({ name }) => name.trim().toLowerCase())).size, 637);
for (const row of plan.records) {
  assert.ok(row.definition.trim() && row.name.trim());
  assert.ok([1, 2, 3].includes(row.tier));
  if (row.tier === 1) assert.equal(row.parentId, null);
  else {
    const parent = targets.get(row.parentId);
    assert.ok(parent, `Missing parent for #${row.id}`);
    assert.equal(parent.tier, row.tier - 1);
    assert.equal(parent.attribute, row.attribute);
  }
}
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function snapshot() {
  return {
    skills: (await client.query("select * from public.skill order by id")).rows,
    relationships: (await client.query("select * from public.skill_relationship order by id")).rows,
    extensionHashes: (await client.query("select id, skill_id, extension_type, md5(row_to_json(e)::text) as hash from public.skill_extension e order by id")).rows,
  };
}

function differences(state) {
  const skillChanges = [];
  const parentChanges = [];
  for (const target of plan.records) {
    const current = state.skills.find(({ id }) => id === target.id);
    assert.ok(current, `Missing existing Skill #${target.id}; new Skills are forbidden.`);
    assert.equal(current.classification, "standard");
    assert.equal(current.primary_attribute, target.attribute);
    assert.equal(current.archived_at, null);
    const fields = ["name", "tier", "definition"].filter((field) => current[field] !== target[field]);
    if (fields.length) skillChanges.push({ id: target.id, fields });
    const parents = state.relationships.filter((row) => row.skill_id === target.id && row.relationship_type === "parent");
    if (target.parentId === null) assert.equal(parents.length, 0, `Unexpected parent on root #${target.id}`);
    else {
      assert.equal(parents.length, 1, `Expected one existing parent edge for #${target.id}; this reviewed baseline requires no inserts.`);
      if (parents[0].related_skill_id !== target.parentId) parentChanges.push({ relationshipId: parents[0].id, skillId: target.id, from: parents[0].related_skill_id, to: target.parentId });
    }
  }
  return { skillChanges, parentChanges };
}

async function tableDigests() {
  const tables = (await client.query("select schemaname, tablename from pg_tables where schemaname in ('public', 'drizzle') order by schemaname, tablename")).rows;
  const result = {};
  for (const { schemaname, tablename } of tables) {
    const identifier = `${quote(schemaname)}.${quote(tablename)}`;
    result[`${schemaname}.${tablename}`] = (await client.query(`select count(*)::int as count, md5(coalesce(string_agg(h, ',' order by h), '')) as hash from (select md5(to_jsonb(t)::text) as h from ${identifier} t) rows`)).rows[0];
  }
  return result;
}

async function backupDatabase() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "serrian-before-six-attribute-skills-"));
  const backupPath = path.join(directory, "serrian_tide_dev.dump");
  const binaryDirectory = process.env.POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const environment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: url.pathname.slice(1), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
  function run(binary, args) {
    const result = spawnSync(path.join(binaryDirectory, binary), args, { env: environment, encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 * 8 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${binary} failed: ${result.stderr}`);
    return result.stdout;
  }
  run("pg_dump.exe", ["--format=custom", "--no-password", "--file", backupPath]);
  const list = run("pg_restore.exe", ["--list", backupPath]);
  assert.ok(list.includes("TABLE DATA public skill ") && list.includes("TABLE DATA public skill_relationship "));
  // Decode every archive entry to the OS null sink, checking the whole archive without restoring or resetting any database.
  run("pg_restore.exe", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", backupPath]);
  const bytes = await readFile(backupPath);
  return { path: backupPath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), archiveListingVerified: true, fullArchiveDecodeVerified: true, restoreRehearsalRun: false };
}

let inTransaction = false;
try {
  await client.query("begin isolation level repeatable read read only");
  inTransaction = true;
  const initial = await snapshot();
  const initialDiff = differences(initial);
  const alreadyMatches = initialDiff.skillChanges.length === 0 && initialDiff.parentChanges.length === 0;
  if (!alreadyMatches) assert.equal(hash(initial), plan.reviewedDevelopmentBaseline.snapshotSha256, "Catalog changed since the reviewed baseline; rerun the read-only audit and review differences before applying.");
  await client.query("rollback");
  inTransaction = false;
  const report = {
    checkedAt: new Date().toISOString(), database: url.pathname.slice(1), sourceFile: plan.sourceFile, sourceSha256: plan.sourceSha256,
    mode: apply ? "apply" : "read-only", status: alreadyMatches ? "already-matches" : "ready",
    targetSkillCount: targets.size, skillCountBefore: initial.skills.length,
    changedFieldCounts: Object.fromEntries(["name", "tier", "definition"].map((field) => [field, initialDiff.skillChanges.filter((row) => row.fields.includes(field)).length])),
    parentChanges: initialDiff.parentChanges, newSkills: 0, deletedSkills: 0, newRelationships: 0,
    additionalDexSkillIdsPreserved: plan.reviewedDevelopmentBaseline.additionalDexSkillIds,
    nameCollisionsForHumanReview: plan.reviewedDevelopmentBaseline.preservedNameCollisions,
    humanAcceptance: "Pending: workbook target mapping and extra DEX records need a human walkthrough. Automated validation does not accept these rules on the user's behalf.",
    productionStatus: "Not inspected or modified by this local DEV operation. Deployment status is not verified by this script.",
  };
  if (apply && !alreadyMatches) {
    report.backup = await backupDatabase();
    await client.query("begin isolation level repeatable read");
    inTransaction = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("lock table public.skill, public.skill_relationship, public.skill_extension in share row exclusive mode");
    const before = await snapshot();
    assert.equal(hash(before), hash(initial), "Catalog changed during backup; aborting without updates.");
    const tableBefore = await tableDigests();
    for (const change of initialDiff.skillChanges) {
      const target = targets.get(change.id);
      const assignments = change.fields.map((field, index) => `${quote(field)}=$${index + 2}`);
      const result = await client.query(`update public.skill set ${assignments.join(", ")}, updated_at=now() where id=$1`, [target.id, ...change.fields.map((field) => target[field])]);
      assert.equal(result.rowCount, 1);
    }
    for (const change of initialDiff.parentChanges) {
      const result = await client.query("update public.skill_relationship set related_skill_id=$1 where id=$2 and skill_id=$3 and related_skill_id=$4 and relationship_type='parent'", [change.to, change.relationshipId, change.skillId, change.from]);
      assert.equal(result.rowCount, 1);
    }
    const after = await snapshot();
    assert.deepEqual(differences(after), { skillChanges: [], parentChanges: [] });
    assert.deepEqual(after.skills.map(({ id }) => id), before.skills.map(({ id }) => id));
    for (let i = 0; i < before.skills.length; i++) {
      const previous = before.skills[i];
      const current = after.skills[i];
      if (!targets.has(previous.id)) assert.deepEqual(current, previous);
      else for (const field of Object.keys(previous)) {
        if (!["name", "tier", "definition", "updated_at"].includes(field)) assert.deepEqual(current[field], previous[field], `Protected field #${previous.id}.${field} changed`);
      }
    }
    const parentUpdates = new Map(initialDiff.parentChanges.map((row) => [row.relationshipId, row.to]));
    assert.deepEqual(after.relationships, before.relationships.map((row) => parentUpdates.has(row.id) ? { ...row, related_skill_id: parentUpdates.get(row.id) } : row));
    assert.deepEqual(after.extensionHashes, before.extensionHashes);
    const tableAfter = await tableDigests();
    assert.deepEqual(Object.keys(tableAfter), Object.keys(tableBefore));
    for (const table of Object.keys(tableBefore)) {
      if (!["public.skill", "public.skill_relationship"].includes(table)) assert.deepEqual(tableAfter[table], tableBefore[table], `Unrelated table changed: ${table}`);
    }
    const allocationConflicts = (await client.query(`select count(*)::int as count from campaign_character_skill_allocation a
      left join campaign_character_skill_allocation p on p.id=a.parent_allocation_id
      where a.skill_id=any($1::int[]) and (
        (p.skill_id is not null and not exists (select 1 from skill_relationship r where r.skill_id=a.skill_id and r.related_skill_id=p.skill_id and r.relationship_type='parent'))
        or (p.skill_id is null and exists (select 1 from skill_relationship r where r.skill_id=a.skill_id and r.relationship_type='parent'))
      )`, [[...targets.keys()]])).rows[0].count;
    assert.equal(allocationConflicts, 0, "An existing character allocation would lose its canonical parent path.");
    report.verification = { targetRowsMatch: 637, skillCountAfter: after.skills.length, skillIdsUnchanged: true, sourceIdentitiesAndOtherProtectedColumnsUnchanged: true, nonTargetSkillRowsUnchanged: before.skills.length - targets.size, unrelatedRelationshipRowsUnchanged: before.relationships.length - parentUpdates.size, extensionRowsUnchanged: before.extensionHashes.length, unrelatedTablesUnchanged: Object.keys(tableBefore).length - 2, characterAllocationParentConflicts: allocationConflicts, tableDigestsBefore: tableBefore, tableDigestsAfter: tableAfter, finalCatalogSnapshotSha256: hash(after) };
    await client.query("commit");
    inTransaction = false;
    report.status = "applied-and-verified";
    console.log(`Committed ${initialDiff.skillChanges.length} existing Skill updates and ${initialDiff.parentChanges.length} existing parent-edge updates. No Skills or relationships inserted.`);
  }
  await mkdir("artifacts/skill-rebuild", { recursive: true });
  const reportFile = `artifacts/skill-rebuild/${alreadyMatches ? "verification" : apply ? "application" : "preflight"}.json`;
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, mode: report.mode, changedFieldCounts: report.changedFieldCounts, parentChanges: report.parentChanges, reportFile, ...(report.backup ? { backup: report.backup } : {}) }, null, 2));
} finally {
  if (inTransaction) await client.query("rollback");
  await client.end();
}
