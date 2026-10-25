import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
/** Restore a locally created, verified backup into an EMPTY, newly owned target.
 * Legacy CHECK validators call other public validators without qualification.
 * pg_restore's empty session search_path makes those valid retained rows fail.
 * Set the replay session path explicitly; do not change any function or row.
 * The caller must verify target identity and supply the private SQL destination.
 */
export async function restoreTerrainBackup(options: { pgRestore: string; psql: string; dump: string; sql: string; host: string; port: number; user: string; database: string; env?: NodeJS.ProcessEnv }) {
  execFileSync(options.pgRestore, ["--no-owner", "--no-privileges", "--file", options.sql, options.dump], { windowsHide: true, stdio: "pipe", env: options.env });
  const original = await readFile(options.sql, "utf8"), statement = "SELECT pg_catalog.set_config('search_path', '', false);";
  assert.equal(original.split(statement).length, 2, "Review a changed dump preamble before restoration");
  await writeFile(options.sql, original.replace(statement, "SELECT pg_catalog.set_config('search_path', 'pg_catalog,public', false);"));
  execFileSync(options.psql, ["-h", options.host, "-p", String(options.port), "-U", options.user, "-d", options.database, "-v", "ON_ERROR_STOP=1", "--file", options.sql], { windowsHide: true, stdio: "pipe", env: options.env, maxBuffer: 32 * 1024 * 1024 });
}
