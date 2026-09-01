import type {
  ActiveHealthAnatomy,
  ActiveHealthPoolState,
  ActiveHealthState,
  ActiveHealthTrack,
  ActiveHealthView,
  LocalizedDamageInput,
  ResolvedLocalizedDamage,
} from "./models";

const EPSILON = 0.000001;

function requirePositiveAmount(amount: number, label: string): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return amount;
}

function poolDamageMap(pools: readonly ActiveHealthPoolState[]) {
  return new Map(pools.map((pool) => [pool.poolKey, pool]));
}

function setPoolDamage(
  pools: readonly ActiveHealthPoolState[],
  poolKey: string,
  poolName: string,
  damage: number,
): ActiveHealthPoolState[] {
  const existing = pools.find((pool) => pool.poolKey === poolKey);
  if (!existing) {
    return [...pools, { poolKey, poolNameSnapshot: poolName, damage }];
  }
  return pools.map((pool) =>
    pool.poolKey === poolKey
      ? { ...pool, poolNameSnapshot: poolName, damage }
      : pool,
  );
}

export function createEmptyActiveHealthState(characterId: number): ActiveHealthState {
  return { characterId, totalDamage: 0, pools: [], injuries: [] };
}

export function resolveLocalizedDamageTarget(
  anatomy: ActiveHealthAnatomy,
  input: LocalizedDamageInput,
): ResolvedLocalizedDamage {
  const amount = requirePositiveAmount(input.amount, "Damage");
  const hasLocation = input.hitLocationNumber !== null && input.hitLocationNumber !== undefined;
  const location = hasLocation
    ? anatomy.hitLocations.find((entry) => entry.result === input.hitLocationNumber)
    : null;

  if (hasLocation && !location) {
    throw new Error(`Hit Location ${input.hitLocationNumber} is not part of this anatomy.`);
  }

  const poolKey = location?.poolKey ?? input.poolKey?.trim() ?? "";
  if (!poolKey) {
    throw new Error("Damage requires a hit location mapped to an HP Pool or a direct HP Pool target.");
  }
  const pool = anatomy.pools.find((entry) => entry.key === poolKey);
  if (!pool) {
    throw new Error(`HP Pool ${JSON.stringify(poolKey)} is not part of the current anatomy.`);
  }
  if (location && !location.poolKey) {
    throw new Error(`Hit Location ${location.result} is not mapped to an HP Pool.`);
  }

  return {
    amount,
    poolKey: pool.key,
    poolName: pool.name,
    hitLocationNumber: location?.result ?? null,
    hitLocationName: location?.name ?? null,
  };
}

export function applyLocalizedDamage(
  state: ActiveHealthState,
  anatomy: ActiveHealthAnatomy,
  input: LocalizedDamageInput,
): ActiveHealthState {
  const target = resolveLocalizedDamageTarget(anatomy, input);
  const currentPoolDamage = poolDamageMap(state.pools).get(target.poolKey)?.damage ?? 0;
  return {
    ...state,
    totalDamage: state.totalDamage + target.amount,
    pools: setPoolDamage(
      state.pools,
      target.poolKey,
      target.poolName,
      currentPoolDamage + target.amount,
    ),
  };
}

export function applyFullBodyHealing(
  state: ActiveHealthState,
  amountInput: number,
): ActiveHealthState {
  const amount = requirePositiveAmount(amountInput, "Healing");
  return {
    ...state,
    totalDamage: Math.max(0, state.totalDamage - amount),
    pools: state.pools.map((pool) => ({
      ...pool,
      damage: Math.max(0, pool.damage - amount),
    })),
  };
}

export function applyAreaHealing(
  state: ActiveHealthState,
  anatomy: ActiveHealthAnatomy,
  poolKey: string,
  amountInput: number,
): ActiveHealthState {
  const amount = requirePositiveAmount(amountInput, "Healing");
  const pool = anatomy.pools.find((entry) => entry.key === poolKey);
  if (!pool) throw new Error(`HP Pool ${JSON.stringify(poolKey)} is not part of the current anatomy.`);
  const currentDamage = poolDamageMap(state.pools).get(poolKey)?.damage ?? 0;
  return {
    ...state,
    pools: setPoolDamage(
      state.pools,
      pool.key,
      pool.name,
      Math.max(0, currentDamage - amount),
    ),
  };
}

export function restoreAllHealth(state: ActiveHealthState, restoredAt = new Date()): ActiveHealthState {
  const timestamp = restoredAt.toISOString();
  return {
    ...state,
    totalDamage: 0,
    pools: state.pools.map((pool) => ({ ...pool, damage: 0 })),
    injuries: state.injuries.map((injury) =>
      injury.resolved
        ? injury
        : { ...injury, resolved: true, resolvedAt: timestamp, updatedAt: timestamp },
    ),
  };
}

function deriveTrack(
  name: string,
  maximumHp: number | null,
  damage: number,
): Omit<ActiveHealthTrack, "key" | "percentage" | "orphaned"> {
  if (maximumHp === null) {
    return { name, maximumHp: null, damage, remainingHp: null, overDamage: null };
  }
  return {
    name,
    maximumHp,
    damage,
    remainingHp: Math.max(0, maximumHp - damage),
    overDamage: Math.max(0, damage - maximumHp),
  };
}

export function resolveActiveHealthView(
  anatomy: ActiveHealthAnatomy,
  state: ActiveHealthState,
): ActiveHealthView {
  const damageByPool = poolDamageMap(state.pools);
  const anatomyKeys = new Set(anatomy.pools.map((pool) => pool.key));
  const tracks: ActiveHealthTrack[] = anatomy.pools.map((pool) => ({
    key: pool.key,
    percentage: pool.percentage,
    orphaned: false,
    ...deriveTrack(pool.name, pool.maximumHp, damageByPool.get(pool.key)?.damage ?? 0),
  }));

  for (const persisted of state.pools) {
    if (!anatomyKeys.has(persisted.poolKey) && persisted.damage > EPSILON) {
      tracks.push({
        key: persisted.poolKey,
        percentage: null,
        orphaned: true,
        ...deriveTrack(persisted.poolNameSnapshot, null, persisted.damage),
      });
    }
  }

  return {
    ...state,
    anatomy,
    total: deriveTrack("Total Health", anatomy.totalMaximumHp, state.totalDamage),
    tracks,
    unresolvedInjuryCount: state.injuries.filter((injury) => !injury.resolved).length,
  };
}
