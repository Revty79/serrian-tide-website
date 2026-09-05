import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import pg from "pg";

import { PASS14_DATABASE_SUITES, PASS14_JOURNEY_COVERAGE } from "./tabletop-full-rehearsal-manifest";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Pass 14 database rehearsal.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing the Pass 14 database rehearsal outside a loopback _dev database.");
}

const COUNT_QUERY = `select
  (select count(*)::int from "user") users,
  (select count(*)::int from campaign) campaigns,
  (select count(*)::int from campaign_character) characters,
  (select count(*)::int from items) items,
  (select count(*)::int from creatures) creatures,
  (select count(*)::int from campaign_session) sessions,
  (select count(*)::int from campaign_session_scene) scenes,
  (select count(*)::int from campaign_session_encounter) encounters,
  (select count(*)::int from campaign_session_roll) rolls,
  (select count(*)::int from campaign_session_encounter_action_declaration) declarations,
  (select count(*)::int from campaign_session_encounter_reaction) reactions,
  (select count(*)::int from campaign_session_encounter_effect_plan) effect_plans,
  (select count(*)::int from campaign_session_player_ruling_request) ruling_requests`;

async function databaseCounts(): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<Record<string, number>>(COUNT_QUERY);
    return result.rows[0]!;
  } finally {
    await client.end();
  }
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
  assert.equal(result.status, 0, `${script} failed during the Pass 14 database rehearsal.`);
}

async function main(): Promise<void> {
  assert.deepEqual(PASS14_JOURNEY_COVERAGE.map(({ step }) => step), Array.from({ length: 47 }, (_, index) => index + 1));
  const declaredSuites = new Set(PASS14_DATABASE_SUITES);
  for (const checkpoint of PASS14_JOURNEY_COVERAGE) {
    assert.ok(checkpoint.suites.some((suite) => declaredSuites.has(suite as typeof PASS14_DATABASE_SUITES[number])), `Journey step ${checkpoint.step} has no database rehearsal suite.`);
  }

  const before = await databaseCounts();
  for (const suite of PASS14_DATABASE_SUITES) runNpmScript(suite);
  const after = await databaseCounts();
  assert.deepEqual(after, before, "The Pass 14 database rehearsal did not completely clean up its isolated records.");
  console.log(JSON.stringify({ pass: 14, kind: "database", journeySteps: PASS14_JOURNEY_COVERAGE.length, suites: PASS14_DATABASE_SUITES.length, cleanup: "verified" }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
