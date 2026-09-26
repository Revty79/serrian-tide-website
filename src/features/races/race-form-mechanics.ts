import { RACE_SIZE_OPTIONS, type RaceSize } from "@/db/race-schema";
import { CHARACTER_ATTRIBUTE_KEYS, type CharacterAttributeKey } from "@/features/characters/models";
import { normalizeInteractionRuleProfile, type InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { normalizeRaceAnatomy, raceHitLocations, type RaceAnatomy } from "./race-anatomy";
import { normalizeRaceNaturalAttacks, type RaceNaturalAttack } from "./race-natural-attacks";
import { normalizeRaceNaturalProtection, type RaceNaturalProtection } from "./race-natural-protection";

export type FormOverrideMode = "race" | "override";
export type FormMovement = { key: string; movementMode: string; baseValue: number; notes: string; sortOrder: number };
export type FormSkillLink = { skillId: number; skillName: string; skillClassification: string; linkType: string; value: number | null; sortOrder: number };
export const FORM_MANIPULATION = { race: "Use Race capability / unchanged", full: "Full manipulation", limited: "Limited manipulation", none: "No functional manipulation" } as const;
export const FORM_SPEECH = { race: "Use Race capability / unchanged", normal: "Normal speech", limited: "Limited speech", none: "No normal speech" } as const;
export const FORM_EQUIPMENT = { race: "Unchanged / follows Race", retained: "Retained normally", unusable: "Retained but unusable", dropped: "Dropped", merged: "Merges / becomes inaccessible", custom: "Custom / G.O.D. ruling" } as const;
export type FormCapability<T extends string> = { state: T; notes: string };
export type RaceFormMechanics = {
  schemaVersion: 1;
  size: RaceSize | null;
  attributeAdjustments: Record<CharacterAttributeKey, number>;
  anatomyMode: FormOverrideMode;
  anatomy: RaceAnatomy | null;
  movementMode: FormOverrideMode;
  movement: FormMovement[];
  protectionMode: FormOverrideMode;
  protections: RaceNaturalProtection[];
  attacksMode: FormOverrideMode;
  attacks: RaceNaturalAttack[];
  skillsMode: "race" | "add";
  skillLinks: FormSkillLink[];
  interactionMode: "race" | "add" | "replace";
  interactionRules: InteractionRuleProfile | null;
  manipulation: FormCapability<keyof typeof FORM_MANIPULATION>;
  speech: FormCapability<keyof typeof FORM_SPEECH>;
  equipment: FormCapability<keyof typeof FORM_EQUIPMENT>;
  restrictions: Array<{ key: string; name: string; notes: string }>;
};
/** Collection children live in relational tables under the stable Form ID. */
export type RaceFormMechanicsProfile = Omit<RaceFormMechanics, "movement" | "protections" | "attacks" | "skillLinks">;
export type FormRaceDefinition = { anatomy: RaceAnatomy | null; naturalAttacks: RaceNaturalAttack[]; naturalProtections: RaceNaturalProtection[] };

export function emptyRaceFormMechanics(): RaceFormMechanics {
  return { schemaVersion: 1, size: null, attributeAdjustments: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHR: 0 }, anatomyMode: "race", anatomy: null, movementMode: "race", movement: [],
    protectionMode: "race", protections: [], attacksMode: "race", attacks: [], skillsMode: "race", skillLinks: [],
    interactionMode: "race", interactionRules: null, manipulation: { state: "race", notes: "" },
    speech: { state: "race", notes: "" }, equipment: { state: "race", notes: "" }, restrictions: [] };
}

function text(value: unknown, label: string, required = false): string {
  if (typeof value !== "string" || (required && !value.trim())) throw new Error(`${label} ${required ? "is required" : "must be text"}.`);
  return value.trim();
}
function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (!values.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}
function unique(keys: string[], label: string) {
  if (new Set(keys).size !== keys.length) throw new Error(`${label} must be unique.`);
}
function list<T>(value: T[], label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  return value;
}
function capability<T extends string>(value: FormCapability<T>, choices: Record<T, string>, label: string): FormCapability<T> {
  if (!value) throw new Error(`${label} is required.`);
  return { state: choice(value.state, Object.keys(choices) as T[], label), notes: text(value.notes, `${label} notes`) };
}

/** Authoring validation only. It never resolves a Character's active state or executes effects. */
export function normalizeRaceFormMechanics(input: RaceFormMechanics, race: FormRaceDefinition): RaceFormMechanics {
  if (!input || input.schemaVersion !== 1) throw new Error("Form mechanics must use schemaVersion 1.");
  const size = input.size === null ? null : choice(input.size, RACE_SIZE_OPTIONS, "Form Size");
  const attributeAdjustments = { ...emptyRaceFormMechanics().attributeAdjustments };
  if (!input.attributeAdjustments || Object.keys(input.attributeAdjustments).some(key => !CHARACTER_ATTRIBUTE_KEYS.includes(key as CharacterAttributeKey))) throw new Error("Form Attribute adjustments must use the six existing Attributes.");
  for (const key of CHARACTER_ATTRIBUTE_KEYS) {
    const value = input.attributeAdjustments[key];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} adjustment must be a finite number; use zero for no change.`);
    attributeAdjustments[key] = value;
  }
  const anatomyMode = choice(input.anatomyMode, ["race", "override"], "Form Anatomy source");
  const anatomy = normalizeRaceAnatomy(input.anatomy);
  if (anatomyMode === "race" && anatomy !== null) throw new Error("Choose Override Anatomy to save Form Anatomy.");
  const effectiveAnatomy = anatomyMode === "override" ? anatomy : race.anatomy;
  const movementMode = choice(input.movementMode, ["race", "override"], "Form Movement source");
  const movement = list(input.movement, "Form Movement").map((row, sortOrder) => {
    if (!row || typeof row.baseValue !== "number" || !Number.isFinite(row.baseValue)) throw new Error("Form Base Movement must be a finite number.");
    return { key: text(row.key, "Movement identity", true), movementMode: text(row.movementMode, "Movement Mode", true), baseValue: row.baseValue, notes: text(row.notes, "Movement notes"), sortOrder };
  });
  unique(movement.map(row => row.key), "Form Movement identities");
  const protectionMode = choice(input.protectionMode, ["race", "override"], "Form Protection source");
  const protections = normalizeRaceNaturalProtection(input.protections);
  const attacksMode = choice(input.attacksMode, ["race", "override"], "Form Natural Attack source");
  const attacks = normalizeRaceNaturalAttacks(input.attacks, effectiveAnatomy);
  // An overridden body must also support any explicitly retained Race definitions.
  if (anatomyMode === "override" && attacksMode === "race") normalizeRaceNaturalAttacks(race.naturalAttacks, effectiveAnatomy);
  if (anatomyMode === "override" || protectionMode === "override") {
    const locations = new Set(raceHitLocations(effectiveAnatomy).map(row => row.key));
    for (const protection of protectionMode === "override" ? protections : race.naturalProtections) {
      if (protection.coverage.kind === "locations" && protection.coverage.locationKeys.some(key => !locations.has(key))) {
        throw new Error(`${protection.name}: Coverage must reference a location in the Form's effective Anatomy. Override or revise protection when changing Anatomy.`);
      }
    }
  }
  const skillsMode = choice(input.skillsMode, ["race", "add"], "Form Skill source");
  const skillLinks = list(input.skillLinks, "Form Skills").map((row, sortOrder) => {
    if (!row || !Number.isSafeInteger(row.skillId) || row.skillId <= 0) throw new Error("Form Skill links must reference a saved Skill.");
    if (row.value !== null && (typeof row.value !== "number" || !Number.isFinite(row.value))) throw new Error("Form Skill value must be blank or a finite number.");
    return { skillId: row.skillId, skillName: row.skillName ?? "", skillClassification: row.skillClassification ?? "",
      linkType: choice(row.linkType, ["Skill", "Granted"], "Form Skill link type"), value: row.value, sortOrder };
  });
  unique(skillLinks.map(row => `${row.skillId}:${row.linkType}`), "Form Skill links");
  for (const [mode, rows, label] of [[movementMode, movement, "Movement"], [protectionMode, protections, "Protection"], [attacksMode, attacks, "Natural Attacks"], [skillsMode, skillLinks, "Skills"]] as const) {
    if (mode === "race" && rows.length) throw new Error(`Choose a Form-specific ${label} source before saving its definitions.`);
  }
  const interactionMode = choice(input.interactionMode, ["race", "add", "replace"], "Form Interaction Rule source");
  const interactionRules = normalizeInteractionRuleProfile(input.interactionRules, "race");
  if (interactionMode === "race" && interactionRules !== null) throw new Error("Choose Add or Override to save Form Interaction Rules.");
  const restrictions = list(input.restrictions, "Form restrictions").map(row => {
    if (!row) throw new Error("Form restriction is required.");
    return { key: text(row.key, "Restriction identity", true), name: text(row.name, "Restriction Name", true), notes: text(row.notes, "Restriction Notes") };
  });
  unique(restrictions.map(row => row.key), "Restriction identities");
  return { schemaVersion: 1, size, attributeAdjustments, anatomyMode, anatomy, movementMode, movement, protectionMode, protections, attacksMode, attacks,
    skillsMode, skillLinks, interactionMode, interactionRules, manipulation: capability(input.manipulation, FORM_MANIPULATION, "Manipulation"),
    speech: capability(input.speech, FORM_SPEECH, "Speech"), equipment: capability(input.equipment, FORM_EQUIPMENT, "Equipment interaction"), restrictions };
}

export function raceFormMechanicsProfile(mechanics: RaceFormMechanics): RaceFormMechanicsProfile {
  return { schemaVersion: 1, size: mechanics.size, attributeAdjustments: mechanics.attributeAdjustments,
    anatomyMode: mechanics.anatomyMode, anatomy: mechanics.anatomy, movementMode: mechanics.movementMode,
    protectionMode: mechanics.protectionMode, attacksMode: mechanics.attacksMode, skillsMode: mechanics.skillsMode,
    interactionMode: mechanics.interactionMode, interactionRules: mechanics.interactionRules,
    manipulation: mechanics.manipulation, speech: mechanics.speech, equipment: mechanics.equipment, restrictions: mechanics.restrictions };
}
