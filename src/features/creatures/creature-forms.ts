import type { FormAccess } from "@/features/forms/form-access";
import type { CreatureDraft } from "./models";
import { normalizeCreatureDefinition } from "./creature-definition";
import { CREATURE_SIZE_OPTIONS } from "@/db/creature-schema";
import { normalizeInteractionRuleProfile, type InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { normalizeFormTransformation, type FormTransformation } from "@/features/forms/form-transformation";
import { FORM_MANIPULATION_OPTIONS, FORM_SPEECH_OPTIONS, FORM_EQUIPMENT_OPTIONS, type FormCapability } from "@/features/forms/form-capabilities";

export const CREATURE_FORM_MANIPULATION = { creature: "Same as the normal Creature", ...FORM_MANIPULATION_OPTIONS } as const;
export const CREATURE_FORM_SPEECH = { creature: "Same as the normal Creature", ...FORM_SPEECH_OPTIONS } as const;
export const CREATURE_FORM_EQUIPMENT = { creature: "Same as the normal Creature", ...FORM_EQUIPMENT_OPTIONS } as const;
export const CREATURE_FORM_COLLECTIONS = ["attributes", "movement", "attacks", "abilities", "defenses"] as const;
export type CreatureFormCollection = typeof CREATURE_FORM_COLLECTIONS[number];
export type CreatureFormMode = "creature" | "override";
type Collections = { [K in CreatureFormCollection]: { mode: CreatureFormMode; rows: CreatureDraft[K] } };
export type CreatureFormMechanics = Collections & {
  schemaVersion: 1;
  size: CreatureDraft["core"]["size"] | null;
  hpMultiplierSteps: number | null;
  baseMovementSteps: number | null;
  baseMagicSteps: number | null;
  body: { mode: CreatureFormMode; hpPools: CreatureDraft["hpPools"]; hitLocations: CreatureDraft["hitLocations"] };
  skills: { mode: "creature" | "add" | "replace"; rows: CreatureDraft["skillLinks"] };
  interactionMode: "creature" | "add" | "replace";
  interactionRules: InteractionRuleProfile | null;
  manipulation: FormCapability<keyof typeof CREATURE_FORM_MANIPULATION>;
  speech: FormCapability<keyof typeof CREATURE_FORM_SPEECH>;
  equipment: FormCapability<keyof typeof CREATURE_FORM_EQUIPMENT>;
  restrictions: Array<{ key: string; name: string; notes: string }>;
};
export type CreatureForm = {
  access?: FormAccess;
  id?: number;
  creatureId?: number;
  key: string;
  name: string;
  description: string;
  notes: string;
  sortOrder: number;
  mechanics: CreatureFormMechanics;
  transformation: FormTransformation | null;
};
export type SavedCreatureForm = CreatureForm & { id: number; creatureId: number };

export function emptyCreatureFormMechanics(): CreatureFormMechanics {
  return { schemaVersion: 1, size: null, hpMultiplierSteps: null, baseMovementSteps: null, baseMagicSteps: null,
    attributes: { mode: "creature", rows: [] }, movement: { mode: "creature", rows: [] },
    attacks: { mode: "creature", rows: [] }, abilities: { mode: "creature", rows: [] }, defenses: { mode: "creature", rows: [] },
    body: { mode: "creature", hpPools: [], hitLocations: [] }, skills: { mode: "creature", rows: [] },
    interactionMode: "creature", interactionRules: null, manipulation: { state: "creature", notes: "" },
    speech: { state: "creature", notes: "" }, equipment: { state: "creature", notes: "" }, restrictions: [] };
}

/** A detached authoring projection. Runtime readers never call this function. */
export function projectCreatureFormDefinition(creature: CreatureDraft, mechanics: CreatureFormMechanics): CreatureDraft {
  const result = structuredClone(creature);
  delete result.forms;
  for (const field of ["size", "hpMultiplierSteps", "baseMovementSteps", "baseMagicSteps"] as const) {
    Object.assign(result.core, { [field]: mechanics[field] ?? creature.core[field] });
  }
  for (const key of CREATURE_FORM_COLLECTIONS) {
    if (mechanics[key].mode === "override") Object.assign(result, { [key]: structuredClone(mechanics[key].rows) });
  }
  if (mechanics.body.mode === "override") {
    result.hpPools = structuredClone(mechanics.body.hpPools);
    result.hitLocations = structuredClone(mechanics.body.hitLocations);
  }
  if (mechanics.skills.mode === "replace") result.skillLinks = structuredClone(mechanics.skills.rows);
  if (mechanics.skills.mode === "add") {
    // A Form's same-Skill rank replaces that link; unrelated Creature knowledge remains.
    const additions = new Map(mechanics.skills.rows.map(row => [row.skillId, row]));
    result.skillLinks = structuredClone([...creature.skillLinks.filter(row => !additions.has(row.skillId)), ...additions.values()]);
  }
  if (mechanics.interactionMode === "replace") result.core.interactionRules = structuredClone(mechanics.interactionRules);
  // Add rules are rendered as two ordered sources, avoiding collisions between source-local keys.
  return result;
}

const text = (value: string, label: string, required = false) => {
  if (typeof value !== "string" || (required && !value.trim())) throw new Error(`${label} is required.`);
  return value.trim();
};
function choice<T extends string>(value: T, choices: readonly T[], label: string): T {
  if (!choices.includes(value)) throw new Error(`${label} is invalid.`);
  return value;
}
function capability<T extends string>(input: FormCapability<T>, choices: Record<T, string>, label: string) {
  return { state: choice(input.state, Object.keys(choices) as T[], label), notes: text(input.notes, `${label} notes`) };
}

export function normalizeCreatureForm(form: CreatureForm, creature: CreatureDraft, sortOrder: number): CreatureForm {
  const m = structuredClone(form.mechanics);
  if (!m || m.schemaVersion !== 1) throw new Error("These Creature Form details could not be read. Reload the editor and try again.");
  if (m.size !== null && !CREATURE_SIZE_OPTIONS.includes(m.size as typeof CREATURE_SIZE_OPTIONS[number])) throw new Error("Invalid Form Size.");
  for (const field of ["hpMultiplierSteps", "baseMovementSteps", "baseMagicSteps"] as const) {
    if (m[field] !== null && (!Number.isSafeInteger(m[field]) || m[field]! < 0)) throw new Error(`${field} must be blank or a nonnegative whole number.`);
  }
  for (const key of CREATURE_FORM_COLLECTIONS) {
    choice(m[key].mode, ["creature", "override"], `${key} source`);
    if (!Array.isArray(m[key].rows) || (m[key].mode === "creature" && m[key].rows.length)) throw new Error(`Choose different ${key} for this Form before entering its details.`);
  }
  choice(m.body.mode, ["creature", "override"], "Body source");
  if (m.body.mode === "creature" && (m.body.hpPools.length || m.body.hitLocations.length)) throw new Error("Choose a different body for this Form before entering its HP pools and hit locations.");
  choice(m.skills.mode, ["creature", "add", "replace"], "Skill source");
  if (m.skills.mode === "creature" && m.skills.rows.length) throw new Error("Choose to add more Skills or use only these Skills before entering them.");
  const effective = projectCreatureFormDefinition(creature, m);
  // Reuse all native validation, including pool references, fixed attack targets, ability effects and magic.
  const normalized = normalizeCreatureDefinition(effective);
  for (const key of CREATURE_FORM_COLLECTIONS) if (m[key].mode === "override") Object.assign(m[key], { rows: normalized[key] });
  if (m.body.mode === "override") m.body = { mode: "override", hpPools: normalized.hpPools, hitLocations: normalized.hitLocations };
  // Validate the Form links separately so duplicate links cannot be hidden by Add projection.
  m.skills.rows = normalizeCreatureDefinition({ ...effective, skillLinks: m.skills.rows }).skillLinks;
  choice(m.interactionMode, ["creature", "add", "replace"], "Interaction Rule source");
  m.interactionRules = normalizeInteractionRuleProfile(m.interactionRules, "creature");
  if (m.interactionMode === "creature" && m.interactionRules !== null) throw new Error("Choose to add more rules or use only these rules before entering them.");
  m.manipulation = capability(m.manipulation, CREATURE_FORM_MANIPULATION, "Manipulation");
  m.speech = capability(m.speech, CREATURE_FORM_SPEECH, "Speech");
  m.equipment = capability(m.equipment, CREATURE_FORM_EQUIPMENT, "Equipment interaction");
  m.restrictions = m.restrictions.map(row => ({ key: text(row.key, "Restriction key", true), name: text(row.name, "Restriction name", true), notes: text(row.notes, "Restriction notes") }));
  if (new Set(m.restrictions.map(row => row.key)).size !== m.restrictions.length) throw new Error("A restriction was repeated. Remove the duplicate and add it again if needed.");
  return { key: text(form.key, "Form key", true), name: text(form.name, "Form Name", true), description: text(form.description, "Form description"), notes: text(form.notes, "Form notes"), sortOrder, mechanics: m, transformation: normalizeFormTransformation(form.transformation) };
}
