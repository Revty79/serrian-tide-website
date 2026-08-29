import assert from "node:assert/strict";
import test from "node:test";

import { getCharacterAttributeCardDetails } from "./character-attribute-card";
import type { CharacterAttributeReference } from "./models";

const references: CharacterAttributeReference[] = [
  {
    attributeKey: "STR",
    score: 25,
    maxCarry: 250,
    maxLift: 275,
    maxSpheres: null,
    spellWeaving: null,
    teachingBase: null,
    loyaltyBase: null,
  },
  {
    attributeKey: "INT",
    score: 40,
    maxCarry: null,
    maxLift: null,
    maxSpheres: 16,
    spellWeaving: 1,
    teachingBase: null,
    loyaltyBase: null,
  },
  {
    attributeKey: "WIS",
    score: 30,
    maxCarry: null,
    maxLift: null,
    maxSpheres: null,
    spellWeaving: null,
    teachingBase: 7,
    loyaltyBase: null,
  },
  {
    attributeKey: "CHR",
    score: 30,
    maxCarry: null,
    maxLift: null,
    maxSpheres: null,
    spellWeaving: null,
    teachingBase: null,
    loyaltyBase: 6,
  },
];

test("Attribute card details keep canon values under STR, INT, WIS, and CHR", () => {
  assert.deepEqual(
    getCharacterAttributeCardDetails(references, "STR", 25).stats.map(
      ({ label, value }) => [label, value],
    ),
    [
      ["Max Carry", 250],
      ["Max Lift", 275],
    ],
  );
  assert.deepEqual(
    getCharacterAttributeCardDetails(references, "INT", 40).stats.map(
      ({ label, value }) => [label, value],
    ),
    [
      ["Max Spheres", 16],
      ["Spell Weaving", 1],
    ],
  );
  assert.equal(
    getCharacterAttributeCardDetails(references, "WIS", 30).stats[0]?.value,
    7,
  );
  assert.equal(
    getCharacterAttributeCardDetails(references, "CHR", 30).stats[0]?.value,
    6,
  );
});

test("DEX card details use the existing Initiative helpers for every Race movement mode", () => {
  const details = getCharacterAttributeCardDetails(references, "DEX", 25, [
    { movementMode: "Walk", baseValue: 3 },
    { movementMode: "Run", baseValue: 5 },
  ]);

  assert.deepEqual(details.stats, [
    {
      key: "baseInitiative",
      label: "Base Initiative",
      value: 6,
      source: "derived",
    },
  ]);
  assert.deepEqual(details.movements, [
    { movementMode: "Walk", baseMovement: 3, initiative: 18 },
    { movementMode: "Run", baseMovement: 5, initiative: 30 },
  ]);
});

test("CON card details use the existing HP helper", () => {
  assert.deepEqual(
    getCharacterAttributeCardDetails(references, "CON", 25).stats,
    [
      {
        key: "totalHp",
        label: "Total HP",
        value: 50,
        source: "derived",
      },
    ],
  );
});

test("missing canon references remain missing instead of being invented", () => {
  assert.deepEqual(
    getCharacterAttributeCardDetails(references, "STR", 26).stats.map(
      ({ value }) => value,
    ),
    [null, null],
  );
  assert.deepEqual(
    getCharacterAttributeCardDetails(references, "INT", 40.5).stats.map(
      ({ value }) => value,
    ),
    [null, null],
  );
});
