import {
  getCharacterHp,
  getCharacterHpBreakdown,
} from "@/features/characters/character-rules";
import {
  resolveCreatureHpPoolMaximum,
  resolveCreatureTotalMaximumHp,
} from "@/features/creatures/creature-size-rules";

import type { ActiveHealthAnatomy } from "./models";

export type CreatureHealthSnapshot = {
  core: {
    size: string;
    hpMultiplierSteps: number;
    baseMovementSteps: number;
    baseMagicSteps: number;
  };
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
  const totalMaximumHp = resolveCreatureTotalMaximumHp(snapshot, hpAdjustment);
  const pools = [...snapshot.hpPools]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((pool) => ({
      key: pool.canonicalId,
      name: pool.poolName,
      maximumHp: resolveCreatureHpPoolMaximum(totalMaximumHp, pool.hpPercentage),
      percentage: pool.hpPercentage,
      sortOrder: pool.sortOrder,
    }));
  const poolsByKey = new Map(pools.map((pool) => [pool.key, pool]));

  return {
    kind: "creature",
    totalMaximumHp,
    maximumHpNote: totalMaximumHp === null
      ? "Creature Constitution is required to calculate Total HP."
      : null,
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
