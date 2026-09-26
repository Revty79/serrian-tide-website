import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormAuthoredDetails } from "@/components/forms/form-preview";
import { wolfFormMechanics } from "../../../scripts/race-form-mechanics-fixture";
import { creatureFormFixture } from "../../../scripts/creature-form-fixture";

test("shared Form detail display retains nested on-hit effects and native costs without exposing storage keys", () => {
  const value = [wolfFormMechanics(1, 2).attacks[0].authoring, creatureFormFixture().mechanics.abilities.rows[0].authoring];
  const before = structuredClone(value);
  const html = renderToStaticMarkup(createElement(FormAuthoredDetails, { value }));
  for (const text of ["Effects on a hit", "Bite rider", "Sight cost", "At night", "When uses return", "Maximum Uses"]) assert.ok(html.includes(text), text);
  for (const field of ["schemaVersion", "Schema Version", "Effect Key", "Sort Order"]) assert.ok(!html.includes(field), field);
  assert.deepEqual(value, before);
});
