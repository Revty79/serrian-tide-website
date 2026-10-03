import { parseDamageTypes } from "@/features/damage-types/damage-types";
import { ExactAmount } from "@/features/incoming-effects/exact-amount";

export type ArmorDamageModifier = { damageType: string; modifier: string; modifierText: string; notes: string };

/** The entire structured field must be a signed decimal, never a prose fragment. */
export function parseArmorSoakModifier(value: string): number | null {
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function overlappingArmorDamageTypes(rows: readonly ArmorDamageModifier[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) for (const type of parseDamageTypes(row.damageType).types) counts.set(type, (counts.get(type) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([type]) => type);
}

/** One layer of the shared resolver. Prose is retained in its input, never interpreted. */
export function resolveWornArmorSoak(armor: { baseSoak: number | null; damageModifiers: readonly (ArmorDamageModifier & { id: number })[] }, incomingType: string | null) {
  const issues: Array<{ code: string; message: string }> = [];
  const evaluations: Array<{ damageType: string | null; modifierId: number | null; modifier: number; soak: number; exactSoak: string }> = [];
  let exactSoak: ExactAmount | null = null;
  if (armor.baseSoak === null || !Number.isFinite(armor.baseSoak) || armor.baseSoak < 0) {
    issues.push({ code: "worn-value", message: "Base Soak must be finite and non-negative." });
    return { soak: null, exactSoak, evaluations, issues };
  }
  const source = incomingType === null ? null : parseDamageTypes(incomingType);
  if (!armor.damageModifiers.length) return { soak: armor.baseSoak, exactSoak: ExactAmount.from(armor.baseSoak), evaluations, issues };
  if (!source || !source.types.length || source.unrecognized.length) {
    issues.push({ code: "armor-damage-type-required", message: "Armor modifiers need an authoritative approved incoming Damage Type." });
    return { soak: null, exactSoak, evaluations, issues };
  }
  const definitions = armor.damageModifiers.map(row => ({ row, types: parseDamageTypes(row.damageType) }));
  if (definitions.some(({ types }) => !types.types.length || types.unrecognized.length)) {
    issues.push({ code: "armor-modifier-type", message: "An unrecognized armor Damage Type needs a G.O.D. ruling." });
  }
  for (const type of source.types) {
    const matches = definitions.filter(({ types }) => types.types.includes(type));
    if (matches.some(({ types }) => types.types.length !== 1)) {
      issues.push({ code: "armor-modifier-type", message: `${type}: a combined armor modifier definition needs its matching rule determined by the G.O.D.` });
      continue;
    }
    if (matches.length > 1) {
      issues.push({ code: "armor-modifier-duplicate", message: `${type}: multiple armor modifiers match; they are not added or selected automatically.` });
      continue;
    }
    const matched = matches[0]?.row;
    const modifier = matched ? parseArmorSoakModifier(matched.modifier) : 0;
    if (modifier === null) {
      issues.push({ code: "armor-modifier-value", message: `${type}: the structured Modifier is not a finite signed decimal; a G.O.D. ruling is required.` });
      continue;
    }
    const exact = ExactAmount.from(armor.baseSoak).add(ExactAmount.from(modifier)).floorZero();
    const soak = exact.toNumber();
    if (!Number.isFinite(soak)) {
      issues.push({ code: "armor-modifier-value", message: `${type}: effective armor Soak exceeds finite numerical precision.` });
      continue;
    }
    exactSoak ??= exact;
    evaluations.push({ damageType: type, modifierId: matched?.id ?? null, modifier, soak, exactSoak: exact.toString() });
  }
  if (new Set(evaluations.map(({ exactSoak }) => exactSoak)).size > 1) issues.push({ code: "armor-mixed-damage", message: "Unsplit mixed damage receives different armor Soak by type; an authoritative split or G.O.D. ruling is required." });
  return { soak: issues.length ? null : evaluations[0]?.soak ?? armor.baseSoak, exactSoak: issues.length ? null : exactSoak, evaluations, issues };
}
