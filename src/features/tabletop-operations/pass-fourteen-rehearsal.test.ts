import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PASS14_BROWSER_SUITES,
  PASS14_DATABASE_SUITES,
  PASS14_EDGE_CASE_COVERAGE,
  PASS14_JOURNEY_COVERAGE,
} from "../../../scripts/tabletop-full-rehearsal-manifest";
import { allocateFirearmBullets, planFirearmDelivery } from "./firearm-attack";
import {
  calculatePerSuccessQuantity,
  compareAttackAndDefense,
  resolvePercentileCheck,
} from "./percentile-resolution";

test("Pass 14 maps all 47 journey checkpoints to guarded database evidence", () => {
  assert.deepEqual(PASS14_JOURNEY_COVERAGE.map(({ step }) => step), Array.from({ length: 47 }, (_, index) => index + 1));
  const databaseSuites = new Set<string>(PASS14_DATABASE_SUITES);
  for (const checkpoint of PASS14_JOURNEY_COVERAGE) {
    assert.ok(checkpoint.label.trim());
    assert.ok(checkpoint.suites.some((suite) => databaseSuites.has(suite)), `Checkpoint ${checkpoint.step} is not exercised by the database rehearsal.`);
  }
  assert.equal(new Set(PASS14_DATABASE_SUITES).size, PASS14_DATABASE_SUITES.length);
  assert.equal(new Set(PASS14_BROWSER_SUITES).size, PASS14_BROWSER_SUITES.length);
});

test("Pass 14 percentile boundaries retain exact targets, critical rulings, ties, and per-success quantities", () => {
  const automatic = resolvePercentileCheck({ resultTotal: 20, originalTarget: -10 });
  assert.deepEqual({ target: automatic.finalTarget, automatic: automatic.automaticSuccess, successes: automatic.totalSuccesses }, { target: -10, automatic: true, successes: 4 });

  const impossible = resolvePercentileCheck({ resultTotal: 99, originalTarget: 101 });
  assert.deepEqual({ target: impossible.finalTarget, impossible: impossible.impossibleTarget, successes: impossible.totalSuccesses }, { target: 101, impossible: true, successes: 0 });

  const one = resolvePercentileCheck({ resultTotal: 1, originalTarget: -10 });
  assert.equal(one.succeeded, false);
  assert.deepEqual(one.rulingReasons, ["critical-failure"]);

  const hundred = resolvePercentileCheck({ resultTotal: 100, originalTarget: 50 });
  assert.equal(hundred.doubleOtt, true);
  assert.equal(calculatePerSuccessQuantity(hundred, 2).appliedQuantity, 12);

  const impossibleHundred = resolvePercentileCheck({ resultTotal: 100, originalTarget: 101 });
  assert.equal(impossibleHundred.succeeded, false);
  assert.deepEqual(impossibleHundred.rulingReasons, ["double-ott-critical-success", "double-ott-impossible-target-collision"]);

  const tie = compareAttackAndDefense(
    resolvePercentileCheck({ resultTotal: 70, originalTarget: 50 }),
    resolvePercentileCheck({ resultTotal: 80, originalTarget: 60 }),
  );
  assert.equal(tie.outcome, "defense-wins");

  const collision = compareAttackAndDefense(
    resolvePercentileCheck({ resultTotal: 100, originalTarget: 50 }),
    resolvePercentileCheck({ resultTotal: 100, originalTarget: 50 }),
  );
  assert.equal(collision.outcome, "god-ruling-required");
  assert.ok(collision.rulingReasons.includes("opposed-critical-collision"));
});

test("Pass 14 multiple defenders cancel bullets exactly once and Called overflow requires a survivor", () => {
  const delivery = planFirearmDelivery({ deliveryCadence: "per-trigger", roundsPerCadence: 3, loadedRounds: 3, targetCount: 1 });
  const resolution = resolvePercentileCheck({ resultTotal: 85, originalTarget: 45 });
  const defenses = [
    { reactionId: 1, defenderParticipantId: 10, defenseRollId: 100, defenseTotalSuccesses: 1, applicable: true, rulingReasons: [] },
    { reactionId: 2, defenderParticipantId: 11, defenseRollId: 101, defenseTotalSuccesses: 1, applicable: true, rulingReasons: [] },
  ] as const;
  const partial = allocateFirearmBullets({ delivery, resolution, calledShot: true, defenses });
  assert.deepEqual({ cancelled: partial.bulletsCancelled, surviving: partial.survivingBulletHits, overflow: partial.overflowDamage }, { cancelled: 2, surviving: 1, overflow: 2 });
  assert.deepEqual(partial.defenseContributions.map(({ bulletsCancelled }) => bulletsCancelled), [1, 1]);

  const full = allocateFirearmBullets({
    delivery,
    resolution,
    calledShot: true,
    defenses: [...defenses, { reactionId: 3, defenderParticipantId: 12, defenseRollId: 102, defenseTotalSuccesses: 1, applicable: true, rulingReasons: [] }],
  });
  assert.deepEqual({ cancelled: full.bulletsCancelled, surviving: full.survivingBulletHits, overflow: full.overflowDamage }, { cancelled: 3, surviving: 0, overflow: 0 });
});

test("Pass 14 keeps unsupported authored mechanics actionable and Player live refresh singular", () => {
  const resolver = readFileSync("src/features/tabletop-operations/action-source-resolver-service.ts", "utf8");
  assert.match(resolver, /current canonical Spell runtime does not author a casting Roll resolution mode/);
  assert.match(resolver, /no canonical Roll resolution-mode field/);
  assert.match(resolver, /Acquisition requirements and prose were not used to infer one/);

  for (const cases of Object.values(PASS14_EDGE_CASE_COVERAGE)) {
    assert.ok(cases.length >= 9);
    assert.equal(new Set(cases).size, cases.length);
  }

  const playerWorkspace = readFileSync("src/app/realms/tabletop/player-tabletop-workspace.tsx", "utf8");
  assert.equal(playerWorkspace.match(/<TabletopLiveRefresh\b/g)?.length, 1);
  const playerStyles = readFileSync("src/app/realms/tabletop/player-tabletop.module.css", "utf8");
  assert.match(playerStyles, /prefers-reduced-motion:\s*reduce/);
  assert.match(playerStyles, /overflow-x:\s*clip/);
});

test("Pass 14 guide is complete and migration 0031 and earlier remain untouched", () => {
  const guide = readFileSync("docs/testing/tabletop-human-test-guide.md", "utf8");
  for (const required of [
    "15-20 minute smoke test", "Complete tabletop rehearsal", "Two-Player interaction", "Direct Creature",
    "Called Checks and High/Low", "Firearm", "Effect approval", "Refresh, reconnect, and duplicate submission",
    "Closeout and historical review", "Known intentional ruling boundaries", "Defect report template", "Cleanup",
    "never run", "Exact route sequence", "Exact automated validation sequence", "Deferred findings",
  ]) assert.match(guide, new RegExp(required, "i"));

  const changedMigrations = execFileSync("git", ["diff", "--name-only", "c0608bcc98dd98d06821437be1265842cadc78dc", "--", "drizzle"], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const allowedForwardFiles = new Set([
    "drizzle/0032_safe_entity_lifecycles.sql",
    "drizzle/meta/0032_snapshot.json",
    "drizzle/0033_admin_account_lifecycle.sql",
    "drizzle/meta/0033_snapshot.json",
    "drizzle/0034_verification_user_delete_guard.sql",
    "drizzle/meta/0034_snapshot.json",
    "drizzle/meta/_journal.json",
  ]);
  assert.deepEqual(
    changedMigrations.filter((file) => !allowedForwardFiles.has(file)),
    [],
    "0031 and earlier migration artifacts must remain byte-for-byte unchanged",
  );

  const validationWorkflow = readFileSync(".github/workflows/validate.yml", "utf8");
  assert.match(validationWorkflow, /uses:\s*actions\/checkout@v4[\s\S]*fetch-depth:\s*0/);
});
