import { decodeMechanicalEffect, type MechanicalEffect } from "@/features/mechanical-effects";

export type CreatureEffectDefinition = {
  effectKey: string;
  schemaVersion: number;
  effect: MechanicalEffect;
  sortOrder: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function normalizeCreatureEffects(input: unknown): CreatureEffectDefinition[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new Error("Creature Ability structured effects must be an ordered list.");
  const seenKeys = new Set<string>();
  return input.map((raw, sortOrder) => {
    if (!isRecord(raw)) throw new Error(`Creature Ability effect ${sortOrder + 1} is invalid.`);
    const effectKey = requiredText(raw.effectKey, `Creature Ability effect ${sortOrder + 1} key`);
    const identity = effectKey.toLocaleLowerCase("en-US");
    if (seenKeys.has(identity)) throw new Error(`Creature Ability effect key ${JSON.stringify(effectKey)} is duplicated.`);
    seenKeys.add(identity);
    if (!Number.isSafeInteger(raw.schemaVersion) || (raw.schemaVersion as number) <= 0) {
      throw new Error(`Creature Ability effect ${JSON.stringify(effectKey)} schema version is invalid.`);
    }
    const effect = decodeMechanicalEffect({
      schemaVersion: raw.schemaVersion as number,
      effectJson: raw.effect,
    });
    return { effectKey, schemaVersion: raw.schemaVersion as number, effect, sortOrder };
  });
}
