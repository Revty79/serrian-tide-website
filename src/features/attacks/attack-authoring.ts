import { validateStructuredWeaponRange, type StructuredWeaponRange } from "@/features/items/weapon-range";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import type { SpellDocument } from "@/features/spell-construction/models/spell";
import { normalizeEffectDefinitions, type EffectDefinition } from "@/features/mechanical-effects/effect-definitions";

/** Shared authored mechanics only; each owner supplies its own attack resolution basis. */
export const ATTACK_MODES = ["melee", "ranged", "hybrid", "aoe"] as const;
export type AttackMagicConstruction = { document: SpellDocument };
export type AttackAuthoring = {
  schemaVersion: 1;
  initiativeCost: number | null;
  mode: typeof ATTACK_MODES[number] | null;
  range: Omit<StructuredWeaponRange, "mode">;
  magical: boolean | null;
  onHitEffects: EffectDefinition[];
  magic: AttackMagicConstruction | null;
};
export type AttackDescription = { attackName: string; damage: string | null; damageType: string; notes: string };
export function normalizeAttackDescription(input: AttackDescription): AttackDescription {
  if (typeof input.attackName !== "string" || !input.attackName.trim()) throw new Error("Attack Name is required.");
  for (const field of ["damage", "damageType", "notes"] as const) {
    if (input[field] != null && typeof input[field] !== "string") throw new Error(`Attack ${field} must be text.`);
  }
  return { attackName: input.attackName.trim(), damage: input.damage?.trim() || null, damageType: input.damageType?.trim() ?? "", notes: input.notes?.trim() ?? "" };
}
export function emptyAttackAuthoring(): AttackAuthoring {
  return { schemaVersion: 1, initiativeCost: null, mode: null, range: { unit: null, reach: null, short: null, medium: null, long: null }, magical: null, onHitEffects: [], magic: null };
}
function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object.`);
  return input as Record<string, unknown>;
}
function version(input: Record<string, unknown>) {
  if (input.schemaVersion !== 1) throw new Error("Unsupported attack authoring schema version.");
}
function number(input: unknown, label: string): number | null {
  if (input == null) return null;
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) throw new Error(`${label} must be a nonnegative number.`);
  return input;
}
function initiative(input: unknown, label: string): number | null {
  if (input == null) return null;
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) throw new Error(`${label} must be greater than zero.`);
  return input;
}
function magical(input: unknown): boolean | null {
  if (input == null) return null;
  if (typeof input !== "boolean") throw new Error("Magical qualifier must be Yes, No, or Unspecified.");
  return input;
}
function magic(input: unknown): AttackMagicConstruction | null {
  if (input == null) return null;
  const construction = record(input, "Attack Magic");
  // Preserve authoring drafts. The shared editor/calculator reports incomplete or manual effects;
  // adding a construction never grants a new casting or execution path.
  return { document: parseSpellDocument(JSON.stringify(construction.document)) };
}
function optionalText(input: unknown): string | null { return typeof input === "string" ? input.trim() || null : null; }

export function normalizeAttackAuthoring(input: unknown): AttackAuthoring | null {
  if (input == null) return null;
  const row = record(input, "Attack authoring");
  version(row);
  if (row.mode != null && !ATTACK_MODES.includes(row.mode as AttackAuthoring["mode"] & string)) throw new Error("Choose a supported Attack Mode.");
  const mode = row.mode as AttackAuthoring["mode"] ?? null;
  const range = record(row.range, "Attack range");
  const normalizedRange = validateStructuredWeaponRange({
    mode: mode === "aoe" ? "ranged" : mode,
    unit: optionalText(range.unit), reach: number(range.reach, "Reach"),
    short: number(range.short, "Short range"), medium: number(range.medium, "Medium range"), long: number(range.long, "Long range"),
  });
  if (normalizedRange.short !== null && normalizedRange.long !== null && normalizedRange.short > normalizedRange.long) throw new Error("Short range cannot exceed Long range.");
  const construction = magic(row.magic);
  const qualifier = magical(row.magical);
  if (construction && qualifier === false) throw new Error("A Spell Construction cannot be explicitly nonmagical.");
  return {
    schemaVersion: 1, initiativeCost: initiative(row.initiativeCost, "Attack Initiative"), mode,
    range: { unit: normalizedRange.unit, reach: normalizedRange.reach, short: normalizedRange.short, medium: normalizedRange.medium, long: normalizedRange.long },
    magical: qualifier, onHitEffects: normalizeEffectDefinitions(row.onHitEffects, "Attack"), magic: construction,
  };
}
