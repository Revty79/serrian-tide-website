import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pool } from "../src/db";
import { classifySystemCanon } from "../src/features/catalog-visibility/canon-classification-service";

async function main() {
  const { values } = parseArgs({ options: { apply: { type: "boolean", default: false }, "administrator-email": { type: "string" }, "expect-database": { type: "string" }, report: { type: "string" } }, strict: true });
  if (values.apply && !values["expect-database"]) throw new Error("Apply requires --expect-database with the reviewed plan's database name.");
  // Reserve the report before any mutations so an existing/unwritable path cannot
  // turn a successful commit into an apparent preflight failure.
  const file = values.report ? await open(values.report, "wx") : null;
  let report;
  try {
    report = await classifySystemCanon({ apply: values.apply, administratorEmail: values["administrator-email"], expectedDatabase: values["expect-database"] });
    if (file) await file.writeFile(JSON.stringify(report, null, 2) + "\n");
    else console.log(JSON.stringify(report, null, 2));
  } finally { await file?.close(); }
  console.log(JSON.stringify({ database: report.database, mode: report.mode, ready: report.ready, catalogs: Object.fromEntries(Object.entries(report.catalogs).map(([key, value]) => [key, { expected: value.expected, wouldPromote: value.wouldPromote.length, alreadyCanon: value.alreadyCanon.length, missing: value.missing.length, duplicates: value.duplicates.length, ambiguousUntouched: value.ambiguousUntouched.length, userAuthoredUntouched: value.userAuthoredUntouched.length, classified: report.classified[key] }])) }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => pool.end());
