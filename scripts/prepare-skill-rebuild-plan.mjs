import { mkdir, readFile, writeFile } from "node:fs/promises";

const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const directory = "node_modules/.cache/skill-rebuild";
const workbook = await read(`${directory}/workbook.json`);
const targets = await read(`${directory}/targets.json`);
const audit = await read(`${directory}/audit.json`);
if (audit.workbookProblems.length || audit.targetCount !== 637 || audit.uniqueTargetIds !== 637) throw new Error("Workbook validation must pass before preparing the plan.");
const plan = {
  schemaVersion: 1,
  sourceFile: workbook.sourceFile,
  sourceSha256: workbook.sourceSha256,
  scope: "Update the workbook's 637 existing Skill IDs; preserve records outside the map for review. Never insert or delete Skills.",
  reviewedDevelopmentBaseline: {
    database: audit.database.name,
    checkedAt: audit.checkedAt,
    snapshotSha256: audit.snapshotSha256,
    skillCount: audit.skillCount,
    relationshipCount: audit.relationshipCount,
    additionalDexSkillIds: audit.additionalDexSkills.map(({ id }) => id),
    preservedNameCollisions: audit.collisions,
  },
  records: targets.map((row) => ({
    workbookRow: row.workbookRow,
    id: Number(row["Existing Skill ID"]),
    attribute: row["DB Attribute"],
    name: row["FINAL Skill"],
    tier: Number(row["Final Tier"]),
    definition: row["FINAL Definition"],
    parentId: row["FINAL Parent ID"] ? Number(row["FINAL Parent ID"]) : null,
  })),
};
await mkdir("data/canon", { recursive: true });
// Preserve the reviewed baseline; a future workbook needs its own reviewed map.
await writeFile("data/canon/serrian-tide-six-attribute-skill-rebuild.json", JSON.stringify(plan, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ records: plan.records.length, sourceSha256: plan.sourceSha256, baseline: plan.reviewedDevelopmentBaseline.database }));
