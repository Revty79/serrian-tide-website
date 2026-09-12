import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const directory = path.resolve("node_modules/.cache/skill-rebuild");
const workbook = JSON.parse(await readFile(path.join(directory, "workbook.json"), "utf8"));
const sheet = workbook.sheets.find(({ name }) => name === "FINAL MASTER MAP");
const headers = Object.fromEntries(Object.entries(sheet.rows.find(({ row }) => row === 3).cells).map(([cell, { value }]) => [cell.replace(/\d+$/, ""), value]));
const targets = sheet.rows.filter(({ row }) => row > 3).map(({ row, cells }) => ({
  workbookRow: row,
  ...Object.fromEntries(Object.entries(cells).map(([cell, { value }]) => [headers[cell.replace(/\d+$/, "")], value])),
}));
const workbookProblems = [];
const targetById = new Map(targets.map((row) => [Number(row["Existing Skill ID"]), row]));
const names = new Set();
const expectedAttributeCounts = { STR: [78, 6, 18, 54], DEX: [143, 10, 34, 99], CON: [91, 7, 21, 63], INT: [104, 8, 24, 72], WIS: [117, 9, 27, 81], CHR: [104, 8, 24, 72] };
const attributeCounts = {};
for (const [attribute, expected] of Object.entries(expectedAttributeCounts)) {
  const rows = targets.filter((row) => row.Attribute === attribute);
  const actual = [rows.length, ...[1, 2, 3].map((tier) => rows.filter((row) => Number(row["Final Tier"]) === tier).length)];
  attributeCounts[attribute] = { total: actual[0], tiers: actual.slice(1), matches: JSON.stringify(actual) === JSON.stringify(expected) };
  if (!attributeCounts[attribute].matches) workbookProblems.push({ problem: "attribute-count", attribute, expected, actual });
}
for (const target of targets) {
  const id = Number(target["Existing Skill ID"]);
  const finalName = target["FINAL Skill"]?.trim().toLowerCase();
  if (!Number.isInteger(id) || id <= 0) workbookProblems.push({ problem: "invalid-id", id });
  if (!finalName || names.has(finalName)) workbookProblems.push({ problem: "blank-or-duplicate-name", id });
  names.add(finalName);
  if (!target["FINAL Definition"]?.trim()) workbookProblems.push({ problem: "blank-definition", id });
  const parent = target["FINAL Parent ID"] ? targetById.get(Number(target["FINAL Parent ID"])) : null;
  if (Number(target["Final Tier"]) === 1 ? Boolean(target["FINAL Parent ID"]) : !parent || Number(parent["Final Tier"]) !== Number(target["Final Tier"]) - 1 || parent.Attribute !== target.Attribute || parent["FINAL Skill"] !== target["FINAL Parent"]) {
    workbookProblems.push({ problem: "invalid-parent-tier-name-or-attribute", id });
  }
}
const tree = workbook.sheets.find(({ name }) => name === "TREE VIEW");
const treeRows = tree.rows.filter(({ row }) => row > 3);
for (const { row, cells } of treeRows) {
  const target = targetById.get(Number(cells[`E${row}`]?.value));
  if (!target || target["FINAL Skill"] !== cells[`F${row}`]?.value || (target["FINAL Parent"] ?? "") !== (cells[`G${row}`]?.value ?? "")) workbookProblems.push({ problem: "tree-view-disagrees", row });
}
if (targets.length !== 637 || targetById.size !== 637 || treeRows.length !== 637) workbookProblems.push({ problem: "master-or-tree-count" });
const formulaCount = workbook.sheets.reduce((total, sheet) => total + sheet.rows.reduce((count, row) => count + Object.values(row.cells).filter((cell) => "formula" in cell).length, 0), 0);
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !url.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Skill reconciliation is restricted to a loopback _dev database.");
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin isolation level repeatable read read only");
  const skills = (await client.query("select * from public.skill order by id")).rows;
  const relationships = (await client.query("select * from public.skill_relationship order by id")).rows;
  const extensionHashes = (await client.query("select id, skill_id, extension_type, md5(row_to_json(e)::text) as hash from public.skill_extension e order by id")).rows;
  const references = (await client.query(`select c.conname, c.conrelid::regclass::text as table_name,
    a.attname as column_name from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and c.confrelid='public.skill'::regclass order by 2,3`)).rows;
  const consumerCounts = [];
  const ids = targets.map((row) => Number(row["Existing Skill ID"]));
  const additionalDexSkills = skills.filter((row) => row.classification === "standard" && row.primary_attribute === "DEX" && !ids.includes(row.id));
  const additionalIds = additionalDexSkills.map(({ id }) => id);
  for (const reference of references) {
    const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
    const table = reference.table_name.split(".").map(quote).join(".");
    const column = quote(reference.column_name);
    const counts = (await client.query(`select count(*)::int as total, count(*) filter (where ${column}=any($1::int[]))::int as targeted, count(*) filter (where ${column}=any($2::int[]))::int as additional_dex from ${table}`, [ids, additionalIds])).rows[0];
    consumerCounts.push({ ...reference, ...counts });
  }
  const allocations = (await client.query(`select a.id, a.skill_id, p.skill_id as parent_skill_id
    from campaign_character_skill_allocation a
    left join campaign_character_skill_allocation p on p.id=a.parent_allocation_id order by a.id`)).rows;
  await client.query("rollback");
  const byId = new Map(skills.map((row) => [row.id, row]));
  const mismatches = [];
  const changes = [];
  for (const target of targets) {
    const id = Number(target["Existing Skill ID"]);
    const actual = byId.get(id);
    if (!actual) { mismatches.push({ id, problem: "missing-existing-id" }); continue; }
    const parents = relationships.filter((edge) => edge.skill_id === id && edge.relationship_type === "parent");
    const expectedParent = target["Legacy Parent ID"] ? Number(target["Legacy Parent ID"]) : null;
    const comparisons = {
      name: [actual.name, target["Old Skill"]],
      tier: [actual.tier, Number(target["Old Tier"])],
      primary_attribute: [actual.primary_attribute, target["DB Attribute"]],
      definition: [actual.definition, target["Legacy Definition"] ?? ""],
      parents: [parents.map((edge) => edge.related_skill_id), expectedParent === null ? [] : [expectedParent]],
    };
    for (const [field, [current, expected]] of Object.entries(comparisons)) {
      if (JSON.stringify(current) !== JSON.stringify(expected)) mismatches.push({ id, field, current, expected });
    }
    const final = { name: target["FINAL Skill"], tier: Number(target["Final Tier"]), definition: target["FINAL Definition"], parentId: target["FINAL Parent ID"] ? Number(target["FINAL Parent ID"]) : null };
    changes.push({ id, workbookRow: target.workbookRow, oldName: actual.name, final, parentRelationshipIds: parents.map(({ id }) => id), changes: Object.fromEntries(Object.entries(final).filter(([field, value]) => JSON.stringify(field === "parentId" ? parents.map((edge) => edge.related_skill_id) : actual[field]) !== JSON.stringify(field === "parentId" ? value === null ? [] : [value] : value))) });
  }
  const targetIds = new Set(ids);
  const collisions = targets.flatMap((target) => skills.filter((row) => !targetIds.has(row.id) && row.name.toLowerCase() === target["FINAL Skill"].toLowerCase()).map((row) => ({ targetId: Number(target["Existing Skill ID"]), finalName: target["FINAL Skill"], otherId: row.id })));
  const finalParents = new Map(targets.map((row) => [Number(row["Existing Skill ID"]), row["FINAL Parent ID"] ? Number(row["FINAL Parent ID"]) : null]));
  const allocationParentConflicts = allocations.filter((row) => targetIds.has(row.skill_id) && finalParents.get(row.skill_id) !== row.parent_skill_id);
  const report = {
    checkedAt: new Date().toISOString(), sourceFile: workbook.sourceFile, sourceSha256: workbook.sourceSha256,
    database: { host: url.hostname, name: url.pathname.slice(1), transaction: "read only" },
    skillCount: skills.length, relationshipCount: relationships.length,
    targetCount: targets.length, uniqueTargetIds: targetIds.size, workbookProblems, attributeCounts, formulaCount,
    targetFinalTiers: Object.fromEntries([1,2,3].map((tier) => [tier, targets.filter((row) => Number(row["Final Tier"]) === tier).length])),
    mismatchCount: mismatches.length, mismatches, collisions, consumerCounts, changes,
    additionalDexSkills: additionalDexSkills.map(({ id, name, tier, archived_at }) => ({ id, name, tier, archived: archived_at !== null })),
    allocationParentConflicts: allocationParentConflicts.map(({ skill_id, parent_skill_id }) => ({ skillId: skill_id, currentAllocationParentSkillId: parent_skill_id, workbookParentSkillId: finalParents.get(skill_id) })),
  };
  await mkdir(directory, { recursive: true });
  const snapshot = { skills, relationships, extensionHashes };
  await writeFile(path.join(directory, "database-before.json"), JSON.stringify(snapshot, null, 2) + "\n");
  report.snapshotSha256 = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  await writeFile(path.join(directory, "audit.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(path.join(directory, "targets.json"), JSON.stringify(targets, null, 2) + "\n");
  console.log(JSON.stringify({ checkedAt: report.checkedAt, database: report.database, workbookProblems, attributeCounts, formulaCount, skillCount: skills.length, relationshipCount: relationships.length, targetCount: targets.length, mismatchCount: mismatches.length, collisions, additionalDexSkillCount: additionalDexSkills.length, allocationParentConflicts: report.allocationParentConflicts, changes: { names: changes.filter(({ changes }) => "name" in changes).length, definitions: changes.filter(({ changes }) => "definition" in changes).length, tiers: changes.filter(({ changes }) => "tier" in changes).length, parents: changes.filter(({ changes }) => "parentId" in changes).length } }, null, 2));
} finally {
  await client.end();
}
