import assert from "node:assert/strict";
import test from "node:test";

import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";

import { referencesFrameworkSkill } from "./skill-semantic-reference";

test("recognizes the app's top-level numeric framework Skill reference", () => {
  const document = {
    ...createEmptySpell(),
    frameworkSkillId: 417,
  };

  assert.equal(referencesFrameworkSkill(JSON.stringify(document), 417), true);
  assert.equal(referencesFrameworkSkill(JSON.stringify(document), 418), false);
});

test("ignores non-semantic lookalikes and malformed legacy extension data", () => {
  for (const serialized of [
    JSON.stringify({ frameworkSkillId: "417" }),
    JSON.stringify({ framework: { frameworkSkillId: 417 } }),
    JSON.stringify([{ frameworkSkillId: 417 }]),
    '{"frameworkSkillId":',
  ]) {
    assert.equal(referencesFrameworkSkill(serialized, 417), false, serialized);
  }
});
