import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = source("src/db/item-schema.ts");
const migration = source("drizzle/0023_canonical_weapon_skill_governance.sql");
const domain = source("src/features/items/weapon-skill-governance.ts");
const service = source("src/features/items/weapon-skill-governance-service.ts");
const actions = source("src/app/heavens/items/actions.ts");
const editor = source("src/app/heavens/items/item-workspace.tsx");
const architecture = source("docs/architecture/weapon-skill-governance.md");

test("canonical governance persistence uses exact endpoint and weapon-mode ownership", () => {
  assert.match(schema, /export const weaponSkillPathMapping = pgTable/);
  assert.match(schema, /endpointSkillId: integer\("endpoint_skill_id"\).*skill\.id.*onDelete: "restrict"/);
  assert.match(schema, /weapon_skill_path_mappings_mode_profile_fk/);
  assert.match(schema, /foreignColumns: \[weaponFiringMode\.id, weaponFiringMode\.weaponProfileId\]/);
  assert.match(schema, /weapon_skill_path_mappings_default_endpoint_uq/);
  assert.match(schema, /weapon_skill_path_mappings_mode_endpoint_uq/);
  assert.match(schema, /weapon_skill_path_mappings_default_order_uq/);
  assert.match(schema, /weapon_skill_path_mappings_mode_order_uq/);
  assert.match(schema, /review-required.*approved/);
  assert.match(schema, /updatedByUserId/);
});

test("migration is additive and assigns no guessed weapon mappings", () => {
  assert.match(migration, /CREATE TABLE "weapon_skill_path_mappings"/);
  assert.match(migration, /CREATE UNIQUE INDEX "weapon_firing_modes_id_profile_uq"/);
  assert.doesNotMatch(migration, /^(?:INSERT|UPDATE|DELETE)\b/im);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN|CONSTRAINT|INDEX)/i);
  assert.doesNotMatch(migration, /Handgun Mastery|Rifle Mastery|Shotgun Mastery|Automatic Fire Control/);
});

test("path validation follows exact relationships without tier, name, or Character logic", () => {
  assert.match(domain, /validateCanonicalSkillPath/);
  assert.match(domain, /ambiguous-parent/);
  assert.match(domain, /broken-parent/);
  assert.match(domain, /normalizedRootName === "spellcraft"/);
  assert.match(domain, /normalizedRootName === "talismanism"/);
  assert.match(domain, /normalizedRootName === "faith"/);
  assert.doesNotMatch(domain, /tier\s*[<>]=?|tier\s*[+-]/i);
  assert.doesNotMatch(service, /campaignCharacter|SkillAllocation|calculatedPercentage|resolvePercentileCheck/);
});

test("Heavens authoring reauthorizes and offers review, path, order, notes, and mode inheritance controls", () => {
  assert.match(actions, /export async function saveCanonicalWeaponSkillGovernance/);
  assert.match(actions, /const session = await requireGod\(\)/);
  assert.match(editor, /Governing Skill Paths/);
  assert.match(editor, /Search canonical Skills/);
  assert.match(editor, /Exact endpoint Skill/);
  assert.match(editor, /Approve Valid Path/);
  assert.match(editor, /Return to Review/);
  assert.match(editor, /Move Up/);
  assert.match(editor, /Move Down/);
  assert.match(editor, /inherits the weapon default/);
  assert.match(editor, /No mapping has been inferred/);
  assert.match(editor, /!ammunitionProfile \? <WeaponGovernanceEditor/);
  assert.match(service, /Ammunition Profiles do not author weapon Governing Skill Paths/);
});

test("governance persistence has no Roll, damage, ammunition, Initiative, or override side effects", () => {
  assert.doesNotMatch(service, /campaignSessionRoll|activeHealth|pendingAction|Reaction|consume.*ammunition|Character override/i);
  assert.doesNotMatch(schema, /character_id|character_skill_allocation|calculated_percentage/);
  assert.match(actions, /Remove a Firing Mode's Governing Skill Paths before removing that mode/);
  assert.match(actions, /Remove this Weapon Profile's Governing Skill Paths before removing the profile/);
});

test("Pass 4 notes preserve the Builder's exact Skill ID and parent-allocation lineage", () => {
  assert.match(architecture, /campaign_character_skill_allocation\.skill_id/);
  assert.match(architecture, /parent_allocation_id/);
  assert.match(architecture, /root-to-endpoint Skill ID vector/);
  assert.match(architecture, /must not match by name, tier, classification/);
  assert.match(architecture, /Pass 3 does not alter Builder or advancement behavior/);
});
