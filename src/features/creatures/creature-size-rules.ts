import type { CreatureSize } from "@/db/creature-schema";
import {
  getCharacterBaseMagicBonus,
  getCharacterBaseMovementBonus,
  getCharacterHp,
  getCharacterHpMultiplier,
  getCharacterMovementBaseValue,
} from "@/features/characters/character-rules";

export const CREATURE_SIZE_ATTRIBUTE_MULTIPLIERS: Readonly<Record<CreatureSize, number>> = {
  Minuscule: 0.25,
  Tiny: 0.5,
  Small: 0.75,
  Medium: 1,
  Large: 1.25,
  Huge: 1.5,
  Gargantuan: 1.75,
  Colossal: 2,
};

export const CREATURE_ATTRIBUTE_NAMES = [
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

export type CreatureAttributeName = (typeof CREATURE_ATTRIBUTE_NAMES)[number];

export type CreatureStatisticsSource = {
  core: {
    size: string;
    hpMultiplierSteps?: number | null;
    baseMovementSteps?: number | null;
    baseMagicSteps?: number | null;
  };
  attributes: ReadonlyArray<{
    attributeKey: string;
    value: number | null;
  }>;
  movement?: ReadonlyArray<{
    movementMode: string;
    movementValue: number | null;
  }>;
};

export type CreatureHpPoolSource = {
  canonicalId: string;
  hpPercentage: number | null;
};

export type CreatureHpModel<TPool extends CreatureHpPoolSource> = {
  statistics: EffectiveCreatureStatistics;
  calculatedTotalHp: number | null;
  finalTotalHp: number | null;
  pools: Array<TPool & { maximumHp: number | null }>;
};

export type EffectiveCreatureStatistics = {
  size: CreatureSize;
  sizeMultiplier: number;
  attributes: Array<{
    attributeKey: string;
    baseValue: number | null;
    effectiveValue: number | null;
  }>;
  attributeValues: Record<CreatureAttributeName, number | null>;
  effectiveConstitution: number | null;
  hpMultiplierSteps: number;
  hpMultiplier: number;
  calculatedTotalMaximumHp: number | null;
  baseMovementSteps: number;
  baseMovementBonus: number;
  movement: Array<{
    movementMode: string;
    baseValue: number | null;
    effectiveValue: number | null;
  }>;
  baseMagicSteps: number;
  baseMagicBonus: number;
};

export function getCreatureSizeAttributeMultiplier(size: string): number {
  if (!Object.hasOwn(CREATURE_SIZE_ATTRIBUTE_MULTIPLIERS, size)) {
    throw new Error(`Unknown Creature Size ${JSON.stringify(size)}.`);
  }
  return CREATURE_SIZE_ATTRIBUTE_MULTIPLIERS[size as CreatureSize];
}

export function resolveEffectiveCreatureStatistics(
  source: CreatureStatisticsSource,
): EffectiveCreatureStatistics {
  const size = source.core.size as CreatureSize;
  const sizeMultiplier = getCreatureSizeAttributeMultiplier(size);
  const hpMultiplierSteps = source.core.hpMultiplierSteps ?? 0;
  const baseMovementSteps = source.core.baseMovementSteps ?? 0;
  const baseMagicSteps = source.core.baseMagicSteps ?? 0;
  const hpMultiplier = getCharacterHpMultiplier(hpMultiplierSteps);
  const baseMagicBonus = getCharacterBaseMagicBonus(baseMagicSteps);

  const attributeValues = Object.fromEntries(
    CREATURE_ATTRIBUTE_NAMES.map((attributeKey) => [attributeKey, null]),
  ) as Record<CreatureAttributeName, number | null>;
  const attributes = source.attributes.map((attribute) => {
    const effectiveValue = attribute.value === null
      ? null
      : attribute.value * sizeMultiplier;
    if (CREATURE_ATTRIBUTE_NAMES.includes(attribute.attributeKey as CreatureAttributeName)) {
      attributeValues[attribute.attributeKey as CreatureAttributeName] = effectiveValue;
    }
    return {
      attributeKey: attribute.attributeKey,
      baseValue: attribute.value,
      effectiveValue,
    };
  });
  const effectiveConstitution = attributeValues.Constitution;
  const baseMovementBonus = getCharacterBaseMovementBonus(baseMovementSteps);
  const movement = (source.movement ?? []).map((mode) => ({
    movementMode: mode.movementMode,
    baseValue: mode.movementValue,
    effectiveValue: mode.movementValue === null
      ? null
      : getCharacterMovementBaseValue(mode.movementValue, baseMovementSteps),
  }));

  return {
    size,
    sizeMultiplier,
    attributes,
    attributeValues,
    effectiveConstitution,
    hpMultiplierSteps,
    hpMultiplier,
    calculatedTotalMaximumHp: effectiveConstitution === null
      ? null
      : getCharacterHp(effectiveConstitution, hpMultiplierSteps),
    baseMovementSteps,
    baseMovementBonus,
    movement,
    baseMagicSteps,
    baseMagicBonus,
  };
}

export function resolveCreatureTotalMaximumHp(
  source: CreatureStatisticsSource,
  hpAdjustment = 0,
): number | null {
  if (!Number.isFinite(hpAdjustment)) {
    throw new Error("Creature NPC HP Adjustment must be a number.");
  }
  const calculated = resolveEffectiveCreatureStatistics(source).calculatedTotalMaximumHp;
  return calculated === null ? null : Math.max(0, calculated + hpAdjustment);
}

export function resolveCreatureHpPoolMaximum(
  totalMaximumHp: number | null,
  hpPercentage: number | null,
): number | null {
  if (totalMaximumHp === null || hpPercentage === null) return null;
  if (!Number.isFinite(totalMaximumHp) || !Number.isFinite(hpPercentage)) {
    throw new Error("Creature HP Pool requires finite Total HP and percentage values.");
  }
  return Math.max(0, Math.ceil((totalMaximumHp * hpPercentage) / 100));
}

export function resolveCreatureHpModel<TPool extends CreatureHpPoolSource>(
  source: CreatureStatisticsSource,
  pools: ReadonlyArray<TPool>,
  hpAdjustment = 0,
): CreatureHpModel<TPool> {
  const statistics = resolveEffectiveCreatureStatistics(source);
  const calculatedTotalHp = statistics.calculatedTotalMaximumHp;
  const finalTotalHp = resolveCreatureTotalMaximumHp(source, hpAdjustment);
  return {
    statistics,
    calculatedTotalHp,
    finalTotalHp,
    pools: pools.map((pool) => ({
      ...pool,
      maximumHp: resolveCreatureHpPoolMaximum(finalTotalHp, pool.hpPercentage),
    })),
  };
}

export function normalizeCreatureHpSnapshot<
  TCore extends CreatureStatisticsSource["core"] & { totalHp?: number | null },
  TAttribute extends { attributeKey: string; value: number | null },
  TPool extends CreatureHpPoolSource & { maximumHp?: number | null },
  TSnapshot extends {
    core: TCore;
    attributes: ReadonlyArray<TAttribute>;
    hpPools: ReadonlyArray<TPool>;
  },
>(
  snapshot: TSnapshot,
  hpAdjustment = 0,
): Omit<TSnapshot, "core" | "hpPools"> & {
  core: TCore & { totalHp: number | null };
  hpPools: Array<TPool & { maximumHp: number | null }>;
} {
  const hpModel = resolveCreatureHpModel(snapshot, snapshot.hpPools, hpAdjustment);
  return {
    ...snapshot,
    core: { ...snapshot.core, totalHp: hpModel.calculatedTotalHp },
    hpPools: hpModel.pools,
  };
}

export function getCreatureHpPercentageStatus(
  pools: ReadonlyArray<Pick<CreatureHpPoolSource, "hpPercentage">>,
): { totalPercentage: number; complete: boolean } {
  const totalPercentage = pools.reduce(
    (total, pool) => total + (pool.hpPercentage ?? 0),
    0,
  );
  return {
    totalPercentage,
    complete: pools.length > 0
      && pools.every(({ hpPercentage }) => hpPercentage !== null)
      && Math.abs(totalPercentage - 100) < 0.000001,
  };
}

export function resolveCreatureHitLocationMaximumHp(
  hpPoolCanonicalId: string | null,
  pools: ReadonlyArray<CreatureHpPoolSource & { maximumHp: number | null }>,
): number | null {
  if (!hpPoolCanonicalId) return null;
  const key = hpPoolCanonicalId.toLocaleLowerCase("en-US");
  return pools.find(({ canonicalId }) => canonicalId.toLocaleLowerCase("en-US") === key)?.maximumHp ?? null;
}
