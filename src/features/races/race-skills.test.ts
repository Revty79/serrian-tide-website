import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertRaceSkillsEligible, isRaceSkillEligible } from "./race-skills";

test("races accept only Tier 1 Skills, with a tier-independent Special Ability exception", () => {
  for (const classification of ["standard", "sphere", "spell", "discipline", "psionic skill", "resonance", "reverberation"]) {
    for (const tier of [null, 1, 2, 3, 42]) {
      assert.equal(isRaceSkillEligible({ classification, tier }), tier === 1);
    }
  }
  for (const tier of [null, 1, 2, 42]) {
    assert.equal(isRaceSkillEligible({ classification: " Special Ability ", tier }), true);
  }
});

test("invalid saved Skill metadata produces an actionable error", () => {
  assert.doesNotThrow(() => assertRaceSkillsEligible([
    { name: "Root", classification: "standard", tier: 1 },
    { name: "Gift", classification: "special ability", tier: null },
  ]));
  assert.throws(() => assertRaceSkillsEligible([
    { name: "Specialty", classification: "standard", tier: 2 },
  ]), /Specialty.*Tier 1 Skill or Special Ability/);
});

test("race actions filter before limiting and validate stored metadata before inserting links", () => {
  const actions = readFileSync("src/app/heavens/races/actions.ts", "utf8");
  const picker = actions.slice(actions.indexOf("export async function listRaceSkillCandidates"), actions.indexOf("export async function saveRace"));
  assert.match(picker, /requireGodOrAdminAccessContext/);
  assert.match(picker, /\.where\(raceSkillCandidateFilter\(search, classification\)\)[\s\S]*\.limit\(30\)/);
  const save = actions.slice(actions.indexOf("export async function saveRace"));
  assert.match(save, /db\.transaction/);
  assert.match(save, /const existingSkills = await tx[\s\S]*name: skill\.name[\s\S]*tier: skill\.tier[\s\S]*\.from\(skill\)[\s\S]*assertRaceSkillsEligible\(existingSkills\)[\s\S]*tx\.insert\(raceSkillLink\)/);
});
