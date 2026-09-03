import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = source("src/db/item-schema.ts");
const migration = source("drizzle/0021_structured_firearm_timing_profiles.sql");
const actions = source("src/app/heavens/items/actions.ts");
const editor = source("src/app/heavens/items/item-workspace.tsx");
const equipmentService = source("src/features/items/equipment-state-service.ts");
const timing = source("src/features/items/firearm-timing.ts");
const importer = source("scripts/import-ststandalone-canon.mjs");

test("schema adds normalized ordered firing modes with stable identity and cascading ownership", () => {
  assert.match(schema, /export const weaponFiringMode = pgTable/);
  assert.match(schema, /"weapon_firing_modes"/);
  assert.match(schema, /weaponProfileId: integer\("weapon_profile_id"\)\.notNull\(\)\.references\(\(\) => weaponProfile\.id, \{ onDelete: "cascade" \}\)/);
  assert.match(schema, /uniqueIndex\("weapon_firing_modes_profile_name_uq"\)/);
  assert.match(schema, /baseCyclingInitiativeCost: integer\("base_cycling_initiative_cost"\)/);
  assert.match(schema, /baseRecoilResetInitiativeCost: integer\("base_recoil_reset_initiative_cost"\)/);
  assert.match(schema, /deliveryCadence: text\("delivery_cadence"\)/);
  assert.match(schema, /roundsPerCadence: integer\("rounds_per_cadence"\)/);
  assert.match(schema, /mechanicsReviewRequired: boolean\("mechanics_review_required"\)/);
});

test("one additive migration preserves legacy mode names and order without inventing mechanics", () => {
  assert.match(migration, /jsonb_array_elements_text\("weapon_profiles"\."fire_modes"::jsonb\)/);
  assert.match(migration, /WITH ORDINALITY/);
  assert.match(migration, /PARTITION BY "weapon_profile_id"[\s\S]*ORDER BY "legacy_order"/);
  assert.match(migration, /"base_cycling_initiative_cost"[\s\S]*"base_recoil_reset_initiative_cost"[\s\S]*"mechanics_review_required"/);
  assert.match(migration, /\sNULL,\s*\n\s*NULL,\s*\n\s*NULL,\s*\n\s*NULL,\s*\n\s*true/);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN)/i);
  assert.doesNotMatch(migration, /reload_initiative[^;]*(?:cycling|recoil)/i);
});

test("ammunition modifiers are signed integer properties on the ammunition definition", () => {
  assert.match(schema, /ammunitionCyclingInitiativeModifier: integer\("ammunition_cycling_initiative_modifier"\)\.default\(0\)\.notNull\(\)/);
  assert.match(schema, /ammunitionRecoilResetInitiativeModifier: integer\("ammunition_recoil_reset_initiative_modifier"\)\.default\(0\)\.notNull\(\)/);
  assert.match(actions, /Ammunition Cycling Initiative modifier/);
  assert.match(actions, /wholeInteger/);
  assert.match(equipmentService, /ammunition\.cyclingInitiativeModifier/);
  assert.match(equipmentService, /ammunition\.recoilResetInitiativeModifier/);
});

test("Equipment authoring uses repeatable structured modes with review, totals, and reorder controls", () => {
  assert.doesNotMatch(editor, /profile\.fireModes\.join/);
  assert.match(editor, /title="Structured Firing Modes"/);
  assert.match(editor, /Cycling Initiative Cost/);
  assert.match(editor, /Recoil Reset Initiative Cost/);
  assert.match(editor, /Delivery Cadence/);
  assert.match(editor, /Rounds Per Cadence/);
  assert.match(editor, /Sustained per Initiative/);
  assert.match(editor, /Base follow-up preparation/);
  assert.match(editor, /Mechanical review required/);
  assert.match(editor, /Move Up/);
  assert.match(editor, /Move Down/);
  assert.match(editor, /Trigger pull \(normally 1 Initiative\), Aim, Reload, and live ammunition use are handled separately/);
  assert.match(editor, /Zero leaves that part of the weapon unchanged/i);
});

test("Item saves retain mode identities, mirror legacy names, and clone independent children", () => {
  assert.match(actions, /tx\.update\(weaponProfile\)/);
  assert.match(actions, /tx\.update\(weaponFiringMode\)/);
  assert.match(actions, /tx\.insert\(weaponFiringMode\)/);
  assert.match(actions, /fireModes: JSON\.stringify\(normalized\.weapon\.firingModes\.map/);
  assert.match(actions, /resolvedFiringModes: firingModeRows\.map/);
  assert.match(actions, /copyFirearmFiringModes\(parent\.weaponProfile\.firingModes\)/);
  assert.match(actions, /Firing Mode identities do not belong to this Weapon Profile/);
});

test("future canon writes populate reviewed-later child modes while preserving the compatibility mirror", () => {
  assert.match(importer, /INSERT INTO weapon_firing_modes/);
  assert.match(importer, /NULL,NULL,NULL,NULL,true/);
  assert.match(importer, /JSON\.stringify\(weapon\.fireModes \?\? \[\]\)/);
});

test("equipment read models expose ordered calculated timing without activating combat or changing damage", () => {
  assert.match(equipmentService, /orderBy\(asc\(weaponFiringMode\.weaponProfileId\), asc\(weaponFiringMode\.sortOrder\), asc\(weaponFiringMode\.id\)\)/);
  assert.match(equipmentService, /resolveFirearmFiringMode/);
  assert.match(equipmentService, /ammunitionTiming/);
  assert.doesNotMatch(timing, /damage|attack roll|skill percentage/i);
  assert.match(equipmentService, /getCharacterWeaponDamage\(damageInput\)/);
  assert.doesNotMatch(equipmentService, /spend.*follow|consume.*ammunition/i);
});
