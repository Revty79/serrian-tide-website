import {
  getCharacterHp,
  getCharacterHpBreakdown,
} from "@/features/characters/character-rules";

import type { ActiveHealthAnatomy } from "./models";

export type CreatureHealthSnapshot = {
  attributes: Array<{ attributeKey: string; value: number | null }>;
  hpPools: Array<{
    canonicalId: string;
    poolName: string;
    hpPercentage: number | null;
    sortOrder: number;
  }>;
  hitLocations: Array<{
    hitLocationNumber: number;
    locationName: string;
    bodyPartsIncluded: string;
    hpPoolCanonicalId: string | null;
    sortOrder: number;
  }>;
};

export function resolveHumanoidHealthAnatomy(
  constitution: number,
  hpMultiplierSteps: number,
): ActiveHealthAnatomy {
  const totalMaximumHp = getCharacterHp(constitution, hpMultiplierSteps);
  const breakdown = getCharacterHpBreakdown(totalMaximumHp);
  const poolsByKey = new Map(breakdown.pools.map((pool) => [pool.key, pool]));
  return {
    kind: "humanoid",
    totalMaximumHp,
    maximumHpNote: null,
    pools: breakdown.pools.map((pool, sortOrder) => ({
      key: pool.key,
      name: pool.name,
      maximumHp: pool.hp,
      percentage: pool.percentage,
      sortOrder,
    })),
    hitLocations: breakdown.locations.map((location) => ({
      result: location.result,
      name: location.name,
      bodyParts: location.name,
      poolKey: location.poolKey,
      poolName: poolsByKey.get(location.poolKey)?.name ?? null,
    })),
  };
}

export function resolveCreatureHealthAnatomy(
  snapshot: CreatureHealthSnapshot,
  hpAdjustment: number,
): ActiveHealthAnatomy {
  const pools = [...snapshot.hpPools]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((pool) => ({
      key: pool.canonicalId,
      name: pool.poolName,
      maximumHp: null,
      percentage: pool.hpPercentage,
      sortOrder: pool.sortOrder,
    }));
  const poolsByKey = new Map(pools.map((pool) => [pool.key, pool]));
  const adjustment = hpAdjustment === 0
    ? ""
    : ` The individual HP Adjustment is ${hpAdjustment > 0 ? "+" : ""}${hpAdjustment}, but no canonical base value exists to apply it to.`;

  return {
    kind: "creature",
    totalMaximumHp: null,
    maximumHpNote: `Creature Total HP is not defined by the current canonical data.${adjustment}`,
    pools,
    hitLocations: [...snapshot.hitLocations]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((location) => ({
        result: location.hitLocationNumber,
        name: location.locationName,
        bodyParts: location.bodyPartsIncluded,
        poolKey: location.hpPoolCanonicalId,
        poolName: location.hpPoolCanonicalId
          ? poolsByKey.get(location.hpPoolCanonicalId)?.name ?? null
          : null,
      })),
  };
}
