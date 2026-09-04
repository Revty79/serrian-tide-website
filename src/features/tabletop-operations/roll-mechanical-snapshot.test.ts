import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRollMechanicalSnapshot,
  normalizeRollMechanicalRequest,
  parseRollMechanicalSnapshot,
  type AttributeGoverningSourceSnapshot,
  type SkillGoverningSourceSnapshot,
} from "./roll-mechanical-snapshot";

test("manual snapshots preserve the exact Pass 1 modifier calculation", () => {
  const snapshot = buildRollMechanicalSnapshot(
    { kind: "manual", label: "Storm crossing", originalTarget: 55 },
    73,
    [
      { kind: "bonus", label: "Secured line", magnitude: 10 },
      { kind: "penalty", label: "Heavy wind", magnitude: 20 },
    ],
    "original-roll",
  );
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.governingSource.kind, "manual");
  if (snapshot.governingSource.kind !== "manual") throw new Error("Expected manual snapshot.");
  assert.equal(snapshot.governingSource.label, "Storm crossing");
  assert.deepEqual(snapshot.resolution.modifiers, [
    { kind: "bonus", label: "Secured line", magnitude: 10 },
    { kind: "penalty", label: "Heavy wind", magnitude: 20 },
  ]);
  assert.equal(snapshot.resolution.originalTarget, 55);
  assert.equal(snapshot.resolution.totalBonuses, 10);
  assert.equal(snapshot.resolution.totalPenalties, 20);
  assert.equal(snapshot.resolution.finalTarget, 65);
  assert.equal(snapshot.resolution.basicSuccess, true);
  assert.equal(snapshot.resolution.additionalSuccesses, 0);
  assert.equal(snapshot.resolution.totalSuccesses, 1);
});

test("snapshots retain negative, impossible, 01, double-ott, and ruling states", () => {
  const cases = [
    {
      snapshot: buildRollMechanicalSnapshot(
        { kind: "manual", label: "Automatic", originalTarget: -20 },
        1,
        [],
        "original-roll",
      ),
      expected: { finalTarget: -20, automaticSuccess: true, criticalFailure: true, doubleOtt: false, reasons: ["critical-failure"] },
    },
    {
      snapshot: buildRollMechanicalSnapshot(
        { kind: "manual", label: "Impossible", originalTarget: 120 },
        100,
        [],
        "corrected-result",
      ),
      expected: { finalTarget: 120, automaticSuccess: false, criticalFailure: false, doubleOtt: true, reasons: ["double-ott-critical-success", "double-ott-impossible-target-collision"] },
    },
  ] as const;
  for (const { snapshot, expected } of cases) {
    assert.equal(snapshot.resolution.finalTarget, expected.finalTarget);
    assert.equal(snapshot.resolution.automaticSuccess, expected.automaticSuccess);
    assert.equal(snapshot.resolution.criticalFailure, expected.criticalFailure);
    assert.equal(snapshot.resolution.doubleOtt, expected.doubleOtt);
    assert.equal(snapshot.resolution.requiresGodRuling, true);
    assert.deepEqual(snapshot.resolution.rulingReasons, expected.reasons);
  }
});

test("Attribute and exact Skill allocation identity are immutable snapshot data", () => {
  const attribute: AttributeGoverningSourceSnapshot = {
    kind: "attribute", characterId: 7, attributeKey: "DEX", attributeDisplayName: "Dexterity",
    attributeValue: 37, originalTarget: 63,
  };
  const skill: SkillGoverningSourceSnapshot = {
    kind: "skill", characterId: 7, allocationId: 23, skillId: 11, skillName: "Rigging",
    skillClassification: "standard", skillTier: 2,
    skillPath: [
      { allocationId: 20, skillId: 9, skillName: "Seamanship", skillTier: 1 },
      { allocationId: 23, skillId: 11, skillName: "Rigging", skillTier: 2 },
    ],
    calculatedPercentage: 48, originalTarget: 48,
  };
  assert.deepEqual(parseRollMechanicalSnapshot(buildRollMechanicalSnapshot(attribute, 70, [], "original-roll"))?.governingSource, attribute);
  assert.deepEqual(parseRollMechanicalSnapshot(buildRollMechanicalSnapshot(skill, 70, [], "original-roll"))?.governingSource, skill);
});

test("browser mechanical input is normalized and cannot inject resolution output", () => {
  const normalized = normalizeRollMechanicalRequest({
    governingSource: { kind: "manual", label: "  G.O.D. target  ", originalTarget: 50 },
    modifiers: [{ kind: "bonus", label: "  Prepared  ", magnitude: 10 }],
    resolution: { finalTarget: -999, totalSuccesses: 999, criticalSuccess: true },
  });
  assert.deepEqual(normalized, {
    governingSource: { kind: "manual", label: "G.O.D. target", originalTarget: 50 },
    modifiers: [{ kind: "bonus", label: "Prepared", magnitude: 10 }],
  });
});

test("stored snapshots are read as history rather than recalculated with current rules", () => {
  const snapshot = buildRollMechanicalSnapshot(
    { kind: "manual", label: "Historical interpretation", originalTarget: 50 },
    75,
    [],
    "original-roll",
  );
  const historicallyStored = { ...snapshot, resolution: { ...snapshot.resolution, outcome: "failure" as const, succeeded: false } };
  const loaded = parseRollMechanicalSnapshot(historicallyStored);
  assert.equal(loaded?.resolution.outcome, "failure");
  assert.equal(loaded?.resolution.succeeded, false);
});

test("legacy null snapshot stays unresolved", () => {
  assert.equal(parseRollMechanicalSnapshot(null), null);
});
