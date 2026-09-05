import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import pg from "pg";

import { PASS14_BROWSER_SUITES } from "./tabletop-full-rehearsal-manifest";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Pass 14 browser rehearsal.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing the Pass 14 browser rehearsal outside a loopback _dev database.");
}

function runNpmScript(script: string): void {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Pass 14 rehearsal must be launched through npm so child validation scripts are exact.");
  const result = spawnSync(process.execPath, [npmCli, "run", script], {
    cwd: process.cwd(),
    env: { ...process.env, PASS14_COMPOSITE_REHEARSAL: "1" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${script} failed during the Pass 14 browser rehearsal.`);
}

async function assertFixtureCleanup(): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ campaigns: number; users: number; creatures: number }>(`select
      (select count(*)::int from campaign where name like 'pass11-%-browser-%' or name like 'pass12-browser-%' or name like 'pass13-browser-%' or name like 'weapon-governance-browser-%') campaigns,
      (select count(*)::int from "user" where id like 'pass11-%-browser-%' or id like 'pass12-browser-%' or id like 'pass13-browser-%' or id like 'weapon-governance-browser-%') users,
      (select count(*)::int from creatures where source_system like 'pass13-browser-%' or source_system like 'weapon-governance-browser-%') creatures`);
    assert.deepEqual(result.rows[0], { campaigns: 0, users: 0, creatures: 0 });
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  for (const suite of PASS14_BROWSER_SUITES) runNpmScript(suite);
  await assertFixtureCleanup();
  console.log(JSON.stringify({ pass: 14, kind: "browser", suites: PASS14_BROWSER_SUITES.length, roles: ["campaign-owning G.O.D.", "Player one", "Player two", "persistent NPC", "two direct Creature occurrences"], cleanup: "verified" }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
