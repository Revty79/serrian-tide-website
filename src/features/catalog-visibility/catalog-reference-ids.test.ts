import assert from "node:assert/strict";
import test from "node:test";
import { storedSkillReferenceIds } from "./catalog-reference-ids";

test("stored Item Skill references include powers, frameworks, governance and mechanical targets without unrelated numeric IDs", () => {
  assert.deepEqual(storedSkillReferenceIds({ id: 99, itemId: 98, source: { sourceSkillId: 7 },
    powers: [{ frameworkSkillId: 8, endpointSkillId: 9 }, { skillId: 7 }],
    effects: [{ targetKey: "skill:10" }, { targetKey: "attribute:11" }],
    invalid: [{ skillId: -1 }, { sourceSkillId: 1.5 }, { skillId: "12" }, { targetKey: "skill:0" }],
  }), [7, 8, 9, 10]);
  assert.deepEqual(storedSkillReferenceIds(null), []);
});
