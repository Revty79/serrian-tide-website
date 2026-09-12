import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const args = new Set(process.argv.slice(2));
for (const arg of args) assert.ok(["--apply", "--archive-extras", "--preserve-extras", "--preserve-investments"].includes(arg), `Unknown argument ${arg}`);
const apply = args.has("--apply");
const archiveExtras = args.has("--archive-extras");
assert.ok(!(archiveExtras && args.has("--preserve-extras")), "Choose one disposition for extra records.");
if (apply) {
  assert.ok(archiveExtras || args.has("--preserve-extras"), "A reviewed disposition for the 28 extras is required.");
  assert.ok(args.has("--preserve-investments"), "Character investment review decision is required.");
}
const plan = JSON.parse(await readFile("data/canon/serrian-tide-human-skill-system.json", "utf8"));
const preflight = JSON.parse(await readFile("artifacts/human-skill-rebuild/preflight.json", "utf8"));
const removalReport = await readFile("artifacts/human-skill-rebuild/archived-skill-removal.json", "utf8").then(JSON.parse, (error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
assert.equal(plan.sourceSha256, preflight.sourceSha256);
assert.equal(plan.sourceSha256, "7dd476986b5b56dae6c579a7580f1650e32d53818ca2dbadb11ff7fb9634108f", "This operation is pinned to the reviewed workbook.");
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname));
assert.ok(url.pathname.endsWith("_dev"));
assert.equal(url.pathname.slice(1), preflight.database);
const targets = new Map(plan.records.map((row) => [row.id, row]));
assert.equal(targets.size, 637);
assert.equal(plan.records.length, 637);
assert.equal(new Set(plan.records.map(({ name }) => name.trim().toLowerCase())).size, 637);
const fields = { name: "name", tier: "tier", primaryAttribute: "primary_attribute", secondaryAttribute: "secondary_attribute", definition: "definition" };
const expectedCounts = { STR: [4, 13, 38], DEX: [10, 39, 123], CON: [4, 14, 34], INT: [10, 42, 136], WIS: [7, 24, 59], CHA: [6, 23, 51] };
for (const [attribute, counts] of Object.entries(expectedCounts)) assert.deepEqual([1, 2, 3].map((tier) => plan.records.filter((row) => row.primaryAttribute === attribute && row.tier === tier).length), counts);
for (const row of plan.records) {
  assert.ok(row.name.trim() && row.definition.trim());
  assert.equal(row.secondaryAttribute, null);
  if (row.tier === 1) assert.equal(row.parentId, null);
  else {
    assert.ok(targets.has(row.parentId));
    assert.equal(targets.get(row.parentId).tier, row.tier - 1);
    assert.equal(targets.get(row.parentId).primaryAttribute, row.primaryAttribute);
    assert.ok(Number.isSafeInteger(row.sortOrder) && row.sortOrder >= 0);
  }
}
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let inTransaction = false;

async function snapshot() {
  return {
    skills: (await client.query("select * from public.skill order by id")).rows,
    relationships: (await client.query("select * from public.skill_relationship order by id")).rows,
    extensionHashes: (await client.query("select id, skill_id, extension_type, md5(row_to_json(e)::text) as hash from public.skill_extension e order by id")).rows,
    allocations: (await client.query(`select a.id, a.character_id, a.skill_id, a.points, a.parent_allocation_id,
      p.skill_id as parent_skill_id from campaign_character_skill_allocation a
      left join campaign_character_skill_allocation p on p.id=a.parent_allocation_id order by a.id`)).rows,
  };
}

function inspect(state) {
  const metadata = [];
  const parents = [];
  for (const target of plan.records) {
    const current = state.skills.find(({ id }) => id === target.id);
    assert.ok(current && current.classification === "standard" && current.archived_at === null, `Ineligible existing Skill #${target.id}`);
    const changed = Object.entries(fields).filter(([key, column]) => current[column] !== target[key]);
    if (changed.length) metadata.push({ id: target.id, changed });
    const edges = state.relationships.filter((row) => row.skill_id === target.id && row.relationship_type === "parent");
    assert.ok(edges.length <= 1, `Unexpected multiple parents #${target.id}`);
    const edge = edges[0];
    if (!edge && target.parentId !== null) parents.push({ action: "insert", childId: target.id, parentId: target.parentId, sortOrder: target.sortOrder });
    else if (edge && target.parentId === null) parents.push({ action: "delete", id: edge.id });
    else if (edge && (edge.related_skill_id !== target.parentId || edge.sort_order !== target.sortOrder)) parents.push({ action: "update", id: edge.id, childId: target.id, parentId: target.parentId, sortOrder: target.sortOrder });
  }
  const extras = state.skills.filter((row) => row.classification === "standard" && !targets.has(row.id));
  const expectedExtraIds = preflight.extraStandardSkills.map(({ id }) => id);
  const extraIdsRemoved = extras.length === 0;
  if (extraIdsRemoved) {
    // The later, explicitly approved cleanup removed these IDs. Accept only a
    // recorded complete removal with the current workbook graph still intact.
    assert.ok(removalReport, "Missing evidence for the removal of the original extra Skills.");
    assert.equal(removalReport.status, "removed-and-verified");
    assert.equal(removalReport.database, preflight.database);
    assert.equal(removalReport.sourceSha256, plan.sourceSha256);
    assert.deepEqual(removalReport.deletedSkillIds, expectedExtraIds);
    assert.ok(state.skills.every(({ id }) => !expectedExtraIds.includes(id)));
    assert.ok(state.relationships.every(({ skill_id, related_skill_id }) => !expectedExtraIds.includes(skill_id) && !expectedExtraIds.includes(related_skill_id)));
    assert.equal(metadata.length, 0, "Mapped metadata changed after cleanup; prepare a fresh reviewed baseline.");
    assert.equal(parents.length, 0, "Mapped hierarchy changed after cleanup; prepare a fresh reviewed baseline.");
  } else assert.deepEqual(extras.map(({ id }) => id), expectedExtraIds);
  return { metadata, parents, extras, extraIdsRemoved };
}

async function tableDigests() {
  const tables = (await client.query("select schemaname, tablename from pg_tables where schemaname in ('public', 'drizzle') order by schemaname, tablename")).rows;
  const result = {};
  for (const { schemaname, tablename } of tables) {
    result[`${schemaname}.${tablename}`] = (await client.query(`select count(*)::int as count, md5(coalesce(string_agg(h, ',' order by h), '')) as hash from (select md5(to_jsonb(t)::text) as h from ${quote(schemaname)}.${quote(tablename)} t) rows`)).rows[0];
  }
  return result;
}

async function backup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "serrian-before-human-skills-"));
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
  const bytes = await readFile(file);
  return { path: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), archiveListingVerified: true, fullArchiveDecodeVerified: true, restoreRehearsalRun: false };
}

try {
  await client.query("begin isolation level repeatable read read only");
  inTransaction = true;
  const initial = await snapshot();
  const changes = inspect(initial);
  const alreadyMatches = changes.metadata.length === 0 && changes.parents.length === 0;
  if (apply && alreadyMatches && archiveExtras) assert.ok(changes.extras.every(({ archived_at }) => archived_at !== null), "The catalog matches but extra archival does not; review a fresh baseline before changing the extra records.");
  if (!alreadyMatches) assert.equal(hash(initial), preflight.snapshotSha256, "Database changed since preflight; review it before applying.");
  await client.query("rollback");
  inTransaction = false;
  if (!apply || alreadyMatches) {
    const report = { checkedAt: new Date().toISOString(), database: preflight.database, sourceSha256: plan.sourceSha256, mode: "read only", status: alreadyMatches ? "mapped-records-already-match" : "prepared-awaiting-reviewed-dispositions", metadataRows: changes.metadata.length, parentOperations: changes.parents.length, extraSkills: changes.extras.map(({ id, archived_at }) => ({ id, archived: archived_at !== null })), extraDisposition: changes.extraIdsRemoved ? "removed by the separately recorded, user-approved cleanup" : "original extra IDs still present; see archived flags", removalEvidence: changes.extraIdsRemoved ? "archived-skill-removal.json" : null, baselineStoredAllocationPathDifferences: preflight.allocationConflicts.length, currentCharacterReview: "See hierarchy-verification.json for current editor-draft reconciliation and remaining paid path reviews." };
    await mkdir("artifacts/human-skill-rebuild", { recursive: true });
    await writeFile("artifacts/human-skill-rebuild/current-state-check.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } else {
    const backupReport = await backup();
    await client.query("begin isolation level repeatable read");
    inTransaction = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("lock table public.skill, public.skill_relationship, public.skill_extension in share row exclusive mode");
    const before = await snapshot();
    assert.equal(hash(before), hash(initial), "Database changed during backup; no updates allowed.");
    const beforeTables = await tableDigests();
    // Keep the prior catalog separately from full database recovery, without publishing raw snapshots.
    const rollbackFile = path.join(path.dirname(backupReport.path), "catalog-before.json");
    await writeFile(rollbackFile, JSON.stringify(before, null, 2) + "\n", { flag: "wx" });
    backupReport.catalogSnapshotPath = rollbackFile;
    backupReport.catalogSnapshotSha256 = hash(before);
    for (const entry of changes.metadata) {
      const target = targets.get(entry.id);
      const assignments = entry.changed.map(([, column], index) => `${quote(column)}=$${index + 2}`);
      const result = await client.query(`update public.skill set ${assignments.join(", ")}, updated_at=now() where id=$1`, [entry.id, ...entry.changed.map(([field]) => target[field])]);
      assert.equal(result.rowCount, 1);
    }
    const newRelationships = [];
    for (const operation of changes.parents) {
      if (operation.action === "delete") assert.equal((await client.query("delete from public.skill_relationship where id=$1", [operation.id])).rowCount, 1);
      else if (operation.action === "update") assert.equal((await client.query("update public.skill_relationship set related_skill_id=$1, sort_order=$2 where id=$3", [operation.parentId, operation.sortOrder, operation.id])).rowCount, 1);
      else newRelationships.push((await client.query("insert into public.skill_relationship (skill_id, related_skill_id, relationship_type, sort_order) values ($1,$2,'parent',$3) returning *", [operation.childId, operation.parentId, operation.sortOrder])).rows[0]);
    }
    const archiveReasons = new Map();
    if (archiveExtras) {
      for (const extra of preflight.extraStandardSkills) {
        assert.equal(extra.matchingTargetIds.length, 1, `Unreviewed replacement for #${extra.id}`);
        const reason = `Superseded by existing Skill #${extra.matchingTargetIds[0]} in ${plan.sourceFile}; archived during the user-approved DEV catalog reconciliation. Existing ID and history preserved.`;
        archiveReasons.set(extra.id, reason);
        assert.equal((await client.query("update public.skill set archived_at=now(), archived_by_user_id=null, archive_reason=$1, updated_at=now() where id=$2 and archived_at is null", [reason, extra.id])).rowCount, 1);
      }
    }
    const after = await snapshot();
    const remaining = inspect(after);
    assert.equal(remaining.metadata.length, 0);
    assert.equal(remaining.parents.length, 0);
    assert.deepEqual(after.skills.map(({ id }) => id), before.skills.map(({ id }) => id));
    for (let i = 0; i < before.skills.length; i++) {
      const previous = before.skills[i];
      const current = after.skills[i];
      const mutable = targets.has(previous.id) ? [...Object.values(fields), "updated_at"] : archiveReasons.has(previous.id) ? ["archived_at", "archived_by_user_id", "archive_reason", "updated_at"] : [];
      for (const field of Object.keys(previous)) if (!mutable.includes(field)) assert.deepEqual(current[field], previous[field], `Preserved Skill field changed: #${previous.id}.${field}`);
      if (archiveReasons.has(previous.id)) {
        assert.ok(current.archived_at);
        assert.equal(current.archived_by_user_id, null);
        assert.equal(current.archive_reason, archiveReasons.get(previous.id));
      }
    }
    const operations = new Map(changes.parents.filter((row) => row.id).map((row) => [row.id, row]));
    const expectedRelationships = before.relationships.filter(({ id }) => operations.get(id)?.action !== "delete").map((row) => {
      const operation = operations.get(row.id);
      return operation?.action === "update" ? { ...row, related_skill_id: operation.parentId, sort_order: operation.sortOrder } : row;
    }).concat(newRelationships).sort((a, b) => a.id - b.id);
    assert.deepEqual(after.relationships, expectedRelationships);
    assert.deepEqual(after.extensionHashes, before.extensionHashes);
    assert.deepEqual(after.allocations, before.allocations);
    const afterTables = await tableDigests();
    assert.deepEqual(Object.keys(afterTables), Object.keys(beforeTables));
    for (const table of Object.keys(beforeTables)) if (!["public.skill", "public.skill_relationship"].includes(table)) assert.deepEqual(afterTables[table], beforeTables[table], `Unrelated table changed: ${table}`);
    const activeStandardCount = after.skills.filter((row) => row.classification === "standard" && !row.archived_at).length;
    assert.equal(activeStandardCount, archiveExtras ? 637 : 665);
    const activeNames = new Map();
    for (const row of after.skills.filter((row) => !row.archived_at)) activeNames.set(row.name.toLowerCase(), [...activeNames.get(row.name.toLowerCase()) ?? [], row.id]);
    const collisions = [...activeNames].filter(([, ids]) => ids.length > 1);
    if (archiveExtras) assert.deepEqual(collisions, []);
    const report = {
      checkedAt: new Date().toISOString(), database: preflight.database, sourceSha256: plan.sourceSha256, sqlSha256: plan.sqlSha256,
      status: "applied-and-verified", targetSkillCount: 637, activeStandardSkillCount: activeStandardCount,
      skillCountBefore: before.skills.length, skillCountAfter: after.skills.length, newSkills: 0, deletedSkills: 0,
      changedFieldCounts: preflight.fieldChangeCounts, parentOperations: preflight.relationshipChangeCounts,
      relationshipCountBefore: before.relationships.length, relationshipCountAfter: after.relationships.length,
      extraDisposition: archiveExtras ? "archived; existing IDs, definitions, source identities, relationships and history preserved" : "preserved unchanged",
      archivedSkillIds: [...archiveReasons.keys()], activeDuplicateNames: collisions,
      protectedNonStandardSkillRowsUnchanged: before.skills.filter(({ classification }) => classification !== "standard").length,
      extensionRowsUnchanged: before.extensionHashes.length, unrelatedTablesUnchanged: Object.keys(beforeTables).length - 2,
      characterAllocationsUnchanged: before.allocations.length, allocationsRequiringHumanReview: preflight.allocationConflicts,
      backup: backupReport, beforeTables, afterTables, finalSnapshotSha256: hash(after),
      sourceSqlAdaptation: "Exact source metadata and parent/order targets verified against the workbook. Updated parent rows in place where possible. The raw SQL's 637-total-standard guard was replaced with the reviewed current-baseline and extra-record disposition checks; no source file was executed or edited.",
      humanAcceptance: "Pending; existing investment IDs and points preserved for review, without inventing new parent anchors or reallocating purchases.",
      production: "Not inspected or modified. No deployment performed.",
    };
    await client.query("commit");
    inTransaction = false;
    console.log("Committed the reviewed human Skill catalog update; no Skills inserted or deleted.");
    await mkdir("artifacts/human-skill-rebuild", { recursive: true });
    await writeFile("artifacts/human-skill-rebuild/application.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ status: report.status, activeStandardSkillCount: activeStandardCount, archivedSkills: archiveReasons.size, parentOperations: report.parentOperations, allocationReviewCount: preflight.allocationConflicts.length, backup: backupReport }, null, 2));
  }
} finally {
  if (inTransaction) await client.query("rollback");
  await client.end();
}
