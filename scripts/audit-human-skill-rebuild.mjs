import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
assert.ok(process.argv.length === 2, "No arguments are supported; this is a read-only audit.");
const plan = JSON.parse(await readFile("data/canon/serrian-tide-human-skill-system.json", "utf8"));
const targets = new Map(plan.records.map((row) => [row.id, row]));
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_dev"), "Loopback DEV database required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin isolation level repeatable read read only");
  const skills = (await client.query("select * from public.skill order by id")).rows;
  const relationships = (await client.query("select * from public.skill_relationship order by id")).rows;
  const extensionHashes = (await client.query("select id, skill_id, extension_type, md5(row_to_json(e)::text) as hash from public.skill_extension e order by id")).rows;
  const allocations = (await client.query(`select a.id, a.character_id, a.skill_id, a.points, a.parent_allocation_id,
    p.skill_id as parent_skill_id from campaign_character_skill_allocation a
    left join campaign_character_skill_allocation p on p.id=a.parent_allocation_id order by a.id`)).rows;
  const additional = skills.filter((row) => row.classification === "standard" && !targets.has(row.id));
  const referenceColumns = (await client.query(`select c.conrelid::regclass::text as table_name, a.attname as column_name
    from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and c.confrelid='public.skill'::regclass order by 1,2`)).rows;
  const consumerCounts = [];
  const extraIds = additional.map(({ id }) => id);
  const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
  for (const reference of referenceColumns) {
    const table = reference.table_name.split(".").map(quote).join(".");
    const column = quote(reference.column_name);
    const counts = (await client.query(`select count(*)::int as total,
      count(*) filter (where ${column}=any($1::int[]))::int as target_references,
      count(*) filter (where ${column}=any($2::int[]))::int as extra_references from ${table}`, [[...targets.keys()], extraIds])).rows[0];
    consumerCounts.push({ ...reference, ...counts });
  }
  await client.query("rollback");
  const byId = new Map(skills.map((row) => [row.id, row]));
  const metadataChanges = [];
  const relationshipChanges = [];
  const fieldMap = { name: "name", tier: "tier", primaryAttribute: "primary_attribute", secondaryAttribute: "secondary_attribute", definition: "definition" };
  for (const target of plan.records) {
    const current = byId.get(target.id);
    assert.ok(current && current.classification === "standard" && current.archived_at === null, `Missing/ineligible target #${target.id}`);
    const changed = Object.fromEntries(Object.entries(fieldMap).filter(([field, column]) => target[field] !== current[column]).map(([field, column]) => [field, { from: current[column], to: target[field] }]));
    if (Object.keys(changed).length) metadataChanges.push({ id: target.id, oldName: current.name, finalName: target.name, changed });
    const parents = relationships.filter((row) => row.skill_id === target.id && row.relationship_type === "parent");
    assert.ok(parents.length <= 1, `Multiple parents need review for #${target.id}`);
    const existing = parents[0];
    if (target.parentId === null && existing) relationshipChanges.push({ action: "delete", id: existing.id, skillId: target.id, from: existing.related_skill_id });
    else if (target.parentId !== null && !existing) relationshipChanges.push({ action: "insert", skillId: target.id, to: target.parentId, sortOrder: target.sortOrder });
    else if (existing && (existing.related_skill_id !== target.parentId || existing.sort_order !== target.sortOrder)) relationshipChanges.push({ action: "update", id: existing.id, skillId: target.id, from: existing.related_skill_id, to: target.parentId, oldSortOrder: existing.sort_order, sortOrder: target.sortOrder });
  }
  const extras = additional.map((row) => ({ id: row.id, name: row.name, tier: row.tier, primaryAttribute: row.primary_attribute, archived: row.archived_at !== null, matchingTargetIds: plan.records.filter((target) => target.name.toLowerCase() === row.name.toLowerCase()).map(({ id }) => id) }));
  const allocationConflicts = allocations.filter((row) => targets.has(row.skill_id) && row.parent_skill_id !== targets.get(row.skill_id).parentId).map((row) => ({ allocationId: row.id, characterId: row.character_id, skillId: row.skill_id, points: row.points, currentName: byId.get(row.skill_id).name, finalName: targets.get(row.skill_id).name, existingParentSkillId: row.parent_skill_id, finalParentSkillId: targets.get(row.skill_id).parentId, finalParentAlreadyAllocated: targets.get(row.skill_id).parentId === null || allocations.some((other) => other.character_id === row.character_id && other.skill_id === targets.get(row.skill_id).parentId) }));
  const inheritedExtraParentChanges = relationships.filter((row) => !targets.has(row.skill_id) && targets.has(row.related_skill_id) && row.relationship_type === "parent").map((row) => ({ childId: row.skill_id, childName: byId.get(row.skill_id).name, parentId: row.related_skill_id, previousParentName: byId.get(row.related_skill_id).name, finalParentName: targets.get(row.related_skill_id).name }));
  const snapshot = { skills, relationships, extensionHashes, allocations };
  const report = {
    checkedAt: new Date().toISOString(), database: url.pathname.slice(1), transaction: "read only", sourceSha256: plan.sourceSha256,
    skillCount: skills.length, standardSkillCount: skills.filter(({ classification }) => classification === "standard").length,
    targetCount: targets.size, metadataChangeCount: metadataChanges.length,
    fieldChangeCounts: Object.fromEntries(Object.keys(fieldMap).map((field) => [field, metadataChanges.filter((row) => field in row.changed).length])),
    relationshipChangeCounts: Object.fromEntries(["insert", "update", "delete"].map((action) => [action, relationshipChanges.filter((row) => row.action === action).length])),
    suppliedSqlGuardsSatisfied: extras.length === 0,
    extraStandardSkills: extras, allocationConflicts, inheritedExtraParentChanges, consumerCounts,
    metadataChanges, relationshipChanges,
    snapshotSha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
  };
  const existingAudit = await readFile("artifacts/human-skill-rebuild/preflight.json", "utf8").then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  assert.ok(!existingAudit, "The reviewed preflight already exists; preserve it and prepare a separate audit for a future source.");
  await mkdir("node_modules/.cache/human-skill-rebuild", { recursive: true });
  await writeFile("node_modules/.cache/human-skill-rebuild/database-before.json", JSON.stringify(snapshot, null, 2) + "\n");
  await mkdir("artifacts/human-skill-rebuild", { recursive: true });
  await writeFile("artifacts/human-skill-rebuild/preflight.json", JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...report, metadataChanges: undefined, relationshipChanges: undefined, consumerCounts: consumerCounts.filter((row) => !row.table_name.startsWith("skill_")) }, null, 2));
} finally {
  await client.end();
}
