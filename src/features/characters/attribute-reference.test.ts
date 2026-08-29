import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getAttributeReference,
  getAttributeReferenceFields,
} from "./attribute-reference";
import type {
  CharacterAttributeReference,
  CharacterAttributeReferenceKey,
} from "./models";

type SourceRow = {
  score: number;
  maxCarry?: number;
  maxLift?: number;
  maxSpheres?: number;
  spellWeaving?: number;
  teachingBase?: number;
  loyaltyBase?: number;
};

type AttributeReferenceCanon = {
  title: string;
  version: number;
  strength: SourceRow[];
  intelligence: SourceRow[];
  wisdom: SourceRow[];
  charisma: SourceRow[];
};

const canonPath = path.resolve(
  process.cwd(),
  "data",
  "canon",
  "serrian-tide-attribute-reference-canon.json",
);
const canon = JSON.parse(
  readFileSync(canonPath, "utf8"),
) as AttributeReferenceCanon;

function materializeRows(): CharacterAttributeReference[] {
  const definitions: Array<{
    source: SourceRow[];
    attributeKey: CharacterAttributeReferenceKey;
  }> = [
    { source: canon.strength, attributeKey: "STR" },
    { source: canon.intelligence, attributeKey: "INT" },
    { source: canon.wisdom, attributeKey: "WIS" },
    { source: canon.charisma, attributeKey: "CHR" },
  ];

  return definitions.flatMap(({ source, attributeKey }) =>
    source.map((row) => ({
      attributeKey,
      score: row.score,
      maxCarry: row.maxCarry ?? null,
      maxLift: row.maxLift ?? null,
      maxSpheres: row.maxSpheres ?? null,
      spellWeaving: row.spellWeaving ?? null,
      teachingBase: row.teachingBase ?? null,
      loyaltyBase: row.loyaltyBase ?? null,
    })),
  );
}

const rows = materializeRows();

test("checked-in Attribute Reference canon contains exactly 100 scores per supported Attribute", () => {
  assert.equal(canon.title, "Serrian Tide Attribute Reference Canon");
  assert.equal(canon.version, 1);
  assert.equal(rows.length, 400);

  for (const attributeKey of ["STR", "INT", "WIS", "CHR"] as const) {
    const attributeRows = rows.filter(
      (row) => row.attributeKey === attributeKey,
    );
    assert.equal(attributeRows.length, 100);
    assert.deepEqual(
      attributeRows.map((row) => row.score),
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
  }

  assert.equal(
    new Set(rows.map((row) => `${row.attributeKey}:${row.score}`)).size,
    400,
  );
});

test("Strength canon sentinels match the supplied source", () => {
  const expected = [
    [1, 1, 2],
    [10, 16, 26],
    [25, 250, 275],
    [50, 1254, 1304],
    [51, 1631, 1682],
    [75, 8785, 8860],
    [98, 25168, 25266],
    [100, 38094, 38194],
  ] as const;

  for (const [score, maxCarry, maxLift] of expected) {
    const reference = getAttributeReference(rows, "STR", score);
    assert.equal(reference?.maxCarry, maxCarry);
    assert.equal(reference?.maxLift, maxLift);
  }
});

test("Intelligence canon sentinels match the supplied source", () => {
  const expected = [
    [1, 0, 0],
    [5, 1, 0],
    [35, 14, 0],
    [40, 16, 1],
    [95, 16, 16],
    [100, 16, 16],
  ] as const;

  for (const [score, maxSpheres, spellWeaving] of expected) {
    const reference = getAttributeReference(rows, "INT", score);
    assert.equal(reference?.maxSpheres, maxSpheres);
    assert.equal(reference?.spellWeaving, spellWeaving);
  }
});

test("Wisdom and Charisma canon sentinels match the supplied source", () => {
  for (const [score, teachingBase] of [
    [1, 1],
    [30, 7],
    [100, 35],
  ] as const) {
    assert.equal(
      getAttributeReference(rows, "WIS", score)?.teachingBase,
      teachingBase,
    );
  }

  for (const [score, loyaltyBase] of [
    [1, 0],
    [30, 6],
    [100, 34],
  ] as const) {
    assert.equal(
      getAttributeReference(rows, "CHR", score)?.loyaltyBase,
      loyaltyBase,
    );
  }
});

test("Attribute Reference lookup never clamps, interpolates, or extrapolates", () => {
  assert.equal(getAttributeReference(rows, "STR", 0), null);
  assert.equal(getAttributeReference(rows, "STR", 101), null);
  assert.equal(getAttributeReference(rows, "STR", 10.5), null);
  assert.equal(getAttributeReference(rows, "STR", undefined), null);
  assert.equal(getAttributeReference(rows, "DEX", 25), null);
  assert.equal(
    getAttributeReference(
      rows.filter((row) => !(row.attributeKey === "STR" && row.score === 10)),
      "STR",
      10,
    ),
    null,
  );
});

test("Attribute Reference field descriptions are limited to the canonical Attributes", () => {
  assert.deepEqual(
    getAttributeReferenceFields("STR").map((field) => field.label),
    ["Max Carry", "Max Lift"],
  );
  assert.deepEqual(
    getAttributeReferenceFields("INT").map((field) => field.label),
    ["Max Spheres", "Spell Weaving"],
  );
  assert.deepEqual(
    getAttributeReferenceFields("WIS").map((field) => field.label),
    ["Teaching Base"],
  );
  assert.deepEqual(
    getAttributeReferenceFields("CHR").map((field) => field.label),
    ["Loyalty Base"],
  );
  assert.deepEqual(getAttributeReferenceFields("DEX"), []);
  assert.deepEqual(getAttributeReferenceFields("CON"), []);
});
