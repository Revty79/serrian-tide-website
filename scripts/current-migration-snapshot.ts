import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type MigrationJournal = {
  entries: Array<{ idx: number; tag: string }>;
};

export function currentMigrationSnapshotName(
  migrationRoot = path.resolve(process.cwd(), "drizzle"),
): string {
  const journal = JSON.parse(
    readFileSync(path.join(migrationRoot, "meta", "_journal.json"), "utf8"),
  ) as MigrationJournal;
  const current = journal.entries.at(-1);
  if (!current || !Number.isSafeInteger(current.idx)) {
    throw new Error("The migration journal does not identify a current migration.");
  }
  const prefix = String(current.idx).padStart(4, "0");
  if (!current.tag.startsWith(`${prefix}_`)) {
    throw new Error(`Migration journal tail ${current.tag} does not match index ${current.idx}.`);
  }
  const snapshotName = `${prefix}_snapshot.json`;
  if (!existsSync(path.join(migrationRoot, "meta", snapshotName))) {
    throw new Error(`Current migration snapshot ${snapshotName} is missing.`);
  }
  return snapshotName;
}
