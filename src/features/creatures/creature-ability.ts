import {
  decodeMechanicalEffect,
  encodeMechanicalEffect,
  MECHANICAL_EFFECT_SCHEMA_VERSION,
  type MechanicalEffect,
  type MechanicalEffectDefinition,
  type MechanicalEffectSource,
} from "@/features/mechanical-effects";

export type CreatureAbilityEffectDefinition = {
  effectKey: string;
  schemaVersion: number;
  effect: MechanicalEffect;
  sortOrder: number;
};

export type CreatureAbilityDefinition = {
  canonicalId: string;
  abilityName: string;
  abilityType: string;
  activation: string;
  requirements: string;
  usesRecharge: string;
  description: string;
  mechanicalEffect: string;
  notes: string;
  sortOrder: number;
  crImpact: string;
  effects: CreatureAbilityEffectDefinition[];
};

export type AdaptedCreatureAbilityEffect = {
  abilityCanonicalId: string;
  abilityName: string;
  effectKey: string;
  sortOrder: number;
  definition: MechanicalEffectDefinition;
  compatibilityFallback: boolean;
};

export type CreatureAbilityAdapterResult =
  | {
      valid: true;
      source: MechanicalEffectSource;
      effects: AdaptedCreatureAbilityEffect[];
      issues: [];
    }
  | {
      valid: false;
      source: MechanicalEffectSource;
      effects: [];
      issues: string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCreatureAbilityEffects(input: unknown): CreatureAbilityEffectDefinition[] {
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

export function normalizeCreatureAbilityDefinition(input: unknown): CreatureAbilityDefinition {
  if (!isRecord(input)) throw new Error("Creature Ability definition is invalid.");
  return {
    canonicalId: requiredText(input.canonicalId, "Creature Ability ID"),
    abilityName: requiredText(input.abilityName, "Creature Ability Name"),
    abilityType: optionalText(input.abilityType),
    activation: optionalText(input.activation),
    requirements: optionalText(input.requirements),
    usesRecharge: optionalText(input.usesRecharge),
    description: optionalText(input.description),
    mechanicalEffect: optionalText(input.mechanicalEffect),
    notes: optionalText(input.notes),
    sortOrder: Number.isSafeInteger(input.sortOrder) ? input.sortOrder as number : 0,
    crImpact: optionalText(input.crImpact) || "None",
    effects: normalizeCreatureAbilityEffects(input.effects),
  };
}

export function normalizeCreatureSnapshotAbilities<T extends { abilities: unknown }>(snapshot: T): Omit<T, "abilities"> & { abilities: CreatureAbilityDefinition[] } {
  if (!Array.isArray(snapshot.abilities)) throw new Error("Creature snapshot Abilities must be an ordered list.");
  const abilities = snapshot.abilities.map(normalizeCreatureAbilityDefinition);
  const seenIds = new Set<string>();
  for (const ability of abilities) {
    const identity = ability.canonicalId.toLocaleLowerCase("en-US");
    if (seenIds.has(identity)) throw new Error(`Creature Ability ID ${JSON.stringify(ability.canonicalId)} is duplicated.`);
    seenIds.add(identity);
  }
  return { ...snapshot, abilities };
}

export function copyCreatureAbility(ability: CreatureAbilityDefinition): CreatureAbilityDefinition {
  return {
    ...ability,
    effects: ability.effects.map((entry) => ({
      ...entry,
      effect: structuredClone(entry.effect),
    })),
  };
}

export function createCreatureAbilityEffectKey(
  effects: readonly Pick<CreatureAbilityEffectDefinition, "effectKey">[],
): string {
  const used = new Set(effects.map(({ effectKey }) => effectKey.toLocaleLowerCase("en-US")));
  for (let sequence = 1; sequence <= 9999; sequence += 1) {
    const candidate = `effect-${sequence}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No available Creature Ability effect key remains.");
}

export function createCreatureAbilityEffect(
  effectKey: string,
  effect: MechanicalEffect,
  sortOrder: number,
): CreatureAbilityEffectDefinition {
  const encoded = encodeMechanicalEffect(effect);
  return {
    effectKey: requiredText(effectKey, "Creature Ability effect key"),
    schemaVersion: encoded.schemaVersion,
    effect: decodeMechanicalEffect(encoded),
    sortOrder,
  };
}

export function reorderCreatureAbilityEffects(
  effects: readonly CreatureAbilityEffectDefinition[],
): CreatureAbilityEffectDefinition[] {
  return effects.map((entry, sortOrder) => ({ ...entry, sortOrder }));
}

function legacyInstructions(ability: CreatureAbilityDefinition): string {
  return [
    ability.requirements ? `Requirements: ${ability.requirements}` : "",
    ability.usesRecharge ? `Uses / Recharge: ${ability.usesRecharge}` : "",
    ability.description ? `Description: ${ability.description}` : "",
    ability.mechanicalEffect ? `Mechanical Notes: ${ability.mechanicalEffect}` : "",
  ].filter(Boolean).join("\n");
}

export function adaptCreatureAbilityToMechanicalEffects(
  input: CreatureAbilityDefinition,
): CreatureAbilityAdapterResult {
  const source: MechanicalEffectSource = {
    kind: "creature-ability",
    id: input.canonicalId,
    name: input.abilityName,
  };
  let ability: CreatureAbilityDefinition;
  try {
    ability = normalizeCreatureAbilityDefinition(input);
  } catch (error) {
    return {
      valid: false,
      source,
      effects: [],
      issues: [error instanceof Error ? error.message : "Creature Ability effects are invalid."],
    };
  }
  if (ability.effects.length > 0) {
    return {
      valid: true,
      source,
      effects: ability.effects.map((entry) => ({
        abilityCanonicalId: ability.canonicalId,
        abilityName: ability.abilityName,
        effectKey: entry.effectKey,
        sortOrder: entry.sortOrder,
        definition: {
          schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
          effect: entry.effect,
          source,
        },
        compatibilityFallback: false,
      })),
      issues: [],
    };
  }
  const instructions = legacyInstructions(ability);
  if (!instructions) {
    return {
      valid: false,
      source,
      effects: [],
      issues: ["This Creature Ability has no structured or descriptive runtime consequence."],
    };
  }
  return {
    valid: true,
    source,
    effects: [{
      abilityCanonicalId: ability.canonicalId,
      abilityName: ability.abilityName,
      effectKey: "legacy-manual",
      sortOrder: 0,
      definition: {
        schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
        effect: {
          kind: "manual",
          title: ability.abilityName,
          description: instructions,
        },
        source,
      },
      compatibilityFallback: true,
    }],
    issues: [],
  };
}
