import {
  decodeMechanicalEffect,
  encodeMechanicalEffect,
  MECHANICAL_EFFECT_SCHEMA_VERSION,
  type MechanicalEffect,
  type MechanicalEffectDefinition,
  type MechanicalEffectSource,
  type RuntimeDuration,
} from "../mechanical-effects";

export type DerivedAbilityEffectPersistenceRecord = {
  id?: number;
  derivedAbilityId?: number;
  schemaVersion: number;
  effectJson: unknown;
  sortOrder: number;
};

export type DecodedDerivedAbilityEffectRow = {
  derivedAbilityId: number;
  id?: number;
  sortOrder: number;
  effect: MechanicalEffect;
};

export type AdaptedDerivedAbilityEffect = {
  derivedAbilityId: number;
  derivedAbilityName: string;
  sortOrder: number;
  definition: MechanicalEffectDefinition;
  compatibilityFallback: boolean;
};

export type DerivedAbilityMechanicalEffectAdapterResult = {
  source: MechanicalEffectSource;
  effects: AdaptedDerivedAbilityEffect[];
};

function durationSummary(duration: RuntimeDuration): string {
  if (duration.label?.trim()) return duration.label.trim();
  if (duration.kind === "until-removed") return "until removed";
  if (duration.kind === "scene") return "scene";
  const count = duration.value ?? 0;
  const unit = duration.kind === "combat-steps" ? "step" : "round";
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function formatDerivedAbilityMechanicalEffectSummary(
  effect: MechanicalEffect,
): string {
  if (effect.kind === "health.heal") {
    return `HEAL · ${effect.amount} · ${effect.scope === "full-body" ? "FULL BODY" : "AREA"}`;
  }
  if (effect.kind === "health.damage") {
    return `DAMAGE · ${effect.amount} · LOCALIZED`;
  }
  if (effect.kind === "condition.apply") {
    return `CONDITION · ${effect.name.trim()} · ${durationSummary(effect.duration)}`;
  }
  if (effect.kind === "modifier.apply") {
    const amount = `${effect.amount > 0 ? "+" : ""}${effect.amount}`;
    const channel = effect.channel[0]!.toUpperCase() + effect.channel.slice(1);
    return `MODIFIER · ${channel} ${amount} · ${durationSummary(effect.duration)}`;
  }
  return `MANUAL · ${effect.title.trim()}`;
}

function positiveAbilityId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Derived Ability Mechanical Effect source requires a positive saved ID.");
  }
  return value;
}

function requiredName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("Derived Ability Mechanical Effect source name is required.");
  return name;
}

export function getDerivedAbilityMechanicalEffectSource(
  ability: { id: number; name: string },
): MechanicalEffectSource {
  return {
    kind: "derived-ability",
    id: positiveAbilityId(ability.id),
    name: requiredName(ability.name),
  };
}

/** Validates untrusted authoring state through the shared v2 codec. */
export function normalizeDerivedAbilityEffects(input: unknown): MechanicalEffect[] {
  if (!Array.isArray(input)) {
    throw new Error("Derived Ability Mechanical Effects must be an ordered list.");
  }
  return input.map((effect, index) => {
    try {
      return decodeMechanicalEffect(encodeMechanicalEffect(effect as MechanicalEffect));
    } catch (error) {
      throw new Error(
        `Mechanical Effect ${index + 1}: ${error instanceof Error ? error.message : "Invalid Mechanical Effect."}`,
      );
    }
  });
}

export function encodeDerivedAbilityEffects(
  effects: readonly MechanicalEffect[],
): DerivedAbilityEffectPersistenceRecord[] {
  return normalizeDerivedAbilityEffects(effects).map((effect, sortOrder) => ({
    ...encodeMechanicalEffect(effect),
    sortOrder,
  }));
}

export function decodeDerivedAbilityEffects(
  rows: readonly DerivedAbilityEffectPersistenceRecord[],
): MechanicalEffect[] {
  const ordered = [...rows].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      (left.id ?? Number.MAX_SAFE_INTEGER) -
        (right.id ?? Number.MAX_SAFE_INTEGER),
  );
  const seen = new Set<number>();
  return ordered.map((row) => {
    if (
      !Number.isSafeInteger(row.sortOrder) ||
      row.sortOrder < 0 ||
      seen.has(row.sortOrder)
    ) {
      throw new Error(
        "Persisted Derived Ability Mechanical Effects contain an invalid or duplicate sort order.",
      );
    }
    seen.add(row.sortOrder);
    return decodeMechanicalEffect(row);
  });
}

/** Decodes independently loaded child rows without mixing sort-order domains. */
export function decodeDerivedAbilityEffectRows(
  rows: readonly (DerivedAbilityEffectPersistenceRecord & {
    derivedAbilityId: number;
  })[],
): DecodedDerivedAbilityEffectRow[] {
  const grouped = new Map<number, typeof rows>();
  for (const row of rows) {
    const abilityRows = grouped.get(row.derivedAbilityId) ?? [];
    grouped.set(row.derivedAbilityId, [...abilityRows, row]);
  }
  return [...grouped.entries()]
    .sort(([leftId], [rightId]) => leftId - rightId)
    .flatMap(([derivedAbilityId, abilityRows]) =>
      decodeDerivedAbilityEffects(abilityRows).map((effect, sortOrder) => ({
        derivedAbilityId,
        sortOrder,
        effect,
      })),
    );
}

export function adaptDerivedAbilityToMechanicalEffects(
  ability: {
    id: number;
    name: string;
    mechanicalEffect: string;
    effects: readonly MechanicalEffect[];
  },
): DerivedAbilityMechanicalEffectAdapterResult {
  const source = getDerivedAbilityMechanicalEffectSource(ability);
  const effects = normalizeDerivedAbilityEffects(ability.effects);
  if (effects.length > 0) {
    return {
      source,
      effects: effects.map((effect, sortOrder) => ({
        derivedAbilityId: ability.id,
        derivedAbilityName: source.name,
        sortOrder,
        definition: {
          schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
          effect,
          source,
        },
        compatibilityFallback: false,
      })),
    };
  }
  const rulesText = ability.mechanicalEffect.trim();
  if (!rulesText) return { source, effects: [] };
  return {
    source,
    effects: [{
      derivedAbilityId: ability.id,
      derivedAbilityName: source.name,
      sortOrder: 0,
      definition: {
        schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
        effect: {
          kind: "manual",
          title: source.name,
          description: rulesText,
        },
        source,
      },
      compatibilityFallback: true,
    }],
  };
}
