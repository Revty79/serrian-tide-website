import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const page = source("src/app/heavens/skills/page.tsx");
const workspace = source("src/app/heavens/skills/skills-workspace.tsx");
const library = source("src/app/heavens/skills/skill-library.tsx");
const editor = source("src/app/heavens/skills/skill-editor.tsx");
const pathEditor = source("src/app/heavens/skills/skill-path-editor.tsx");
const actions = source("src/app/heavens/skills/actions.ts");
const service = source("src/features/skills/recursive-skill-library-service.ts");
const styles = source("src/app/heavens/skills/skills.css");
const schema = source("src/db/skill-schema.ts");
const realmSchema = source("src/db/realm-schema.ts");
const raceSchema = source("src/db/race-schema.ts");

test("the existing Heavens Skills route loads one shared recursive hierarchy", () => {
  assert.match(page, /getRecursiveSkillLibrary/);
  assert.match(page, /<SkillsWorkspace/);
  assert.match(workspace, /initialHierarchy/);
  assert.doesNotMatch(workspace, /Tier 1[\s\S]*Tier 2[\s\S]*Tier 3/);
});

test("the library groups roots and drills one exact path instead of expanding the database", () => {
  assert.match(library, /GOVERNING ATTRIBUTES/);
  assert.match(library, /Hierarchy review ledger/);
  assert.match(library, /library\.reviewReasons/);
  assert.match(library, /Immediate Children/);
  assert.match(library, /getRecursiveSkillChildren/);
  assert.match(library, /rootToEndpointIds/);
  assert.doesNotMatch(library, /createTreeRows/);
});

test("breadcrumbs, parent, root, overview, sibling, and child navigation remain exact-ID based", () => {
  for (const label of [
    "Attribute Overview",
    "Back to Root",
    "Up One Level",
    "Sibling Skills",
    "Create Child",
  ]) assert.match(library, new RegExp(label));
  assert.match(library, /Selected Skill lineage/);
  assert.match(library, /Skill #\{selectedSkill\.id\}/);
});

test("search disambiguates duplicate names with exact identities and complete lineage", () => {
  assert.match(library, /searchRecursiveSkillLibrary/);
  assert.match(library, /result\.skill\.id/);
  assert.match(library, /result\.lineageLabel/);
  assert.match(library, /result\.path\.key/);
});

test("creation and reparenting preview canonical placement and reject invalid cycles", () => {
  assert.match(workspace, /newSkillDraft\(\{ id: parentId, name: parentName \}\)/);
  assert.match(pathEditor, /previewSkillStructureChange/);
  assert.match(pathEditor, /Current path/);
  assert.match(pathEditor, /Proposed path/);
  assert.match(pathEditor, /validationErrors/);
  assert.match(actions, /must be reviewed and explicitly confirmed/);
});

test("structural confirmation reports descendants and canonical consumers without rewriting them", () => {
  assert.match(workspace, /Affected Skill identities/);
  assert.match(workspace, /Canonical consumers \(unchanged\)/);
  assert.match(service, /campaignCharacterSkillAllocation/);
  assert.match(service, /raceSkillLink/);
  assert.match(service, /weaponSkillPathMapping/);
  assert.match(service, /campaignSessionCalledCheckBatch/);
  assert.match(service, /derivedAbilityRequirement/);
  assert.match(service, /creatureSkillLink/);
  assert.doesNotMatch(service, /\.update\(|\.delete\(|\.insert\(/);
});

test("every Skill read and mutation retains G.O.D. master-content authorization", () => {
  assert.match(page, /eq\(userRole\.role, "god"\)/);
  for (const actionName of [
    "getRecursiveSkillLibrary",
    "previewSkillMutation",
    "saveSkill",
    "deleteSkill",
  ]) {
    const actionStart = actions.indexOf(`export async function ${actionName}`);
    assert.notEqual(actionStart, -1);
    assert.match(actions.slice(actionStart, actionStart + 900), /requireGod\(\)/);
  }
  assert.doesNotMatch(library, /administrator|campaign owner|player mutation/i);
});

test("errors are visible and announced while all hierarchy interactions use native keyboard controls", () => {
  assert.match(editor, /role=\{feedback\.kind === "error" \? "alert" : "status"\}/);
  assert.match(pathEditor, /role="alert"/);
  assert.match(workspace, /role="alertdialog"/);
  assert.match(library, /aria-current/);
  assert.doesNotMatch(library, /onClick=\{[^}]+\}[^>]*role="button"/);
  assert.ok((library.match(/<button/g) ?? []).length >= 10);
});

test("desktop and narrow-phone layouts prevent page-level horizontal overflow", () => {
  assert.match(styles, /\.skills-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(320px/);
  assert.match(styles, /\.skills-page\s*\{\s*overflow-x:\s*clip;/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*\.skill-library__navigation-actions[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /button:focus-visible/);
});

test("the schema retains exact many-parent and allocation identities without a new migration", () => {
  assert.match(schema, /export const skillRelationship/);
  assert.match(schema, /relatedSkillId/);
  assert.match(schema, /skill_relationship_unique_idx/);
  assert.doesNotMatch(schema, /parent_skill_id/);
  assert.match(realmSchema, /parentAllocationId/);
  assert.match(realmSchema, /campaign_character_skill_branch_uq/);
  assert.match(raceSchema, /race_skill_links_identity_uq/);
});
