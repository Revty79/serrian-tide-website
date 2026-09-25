import { CHARACTER_HUMANOID_HIT_LOCATIONS, CHARACTER_HUMANOID_HP_POOLS } from "@/features/characters/character-rules";

/** Null retains the existing humanoid rules. Pool identities survive renames. */
export type RaceAnatomy = {
  schemaVersion: 1;
  hpPools: Array<{ canonicalId: string; poolName: string; hpPercentage: number | null; notes: string; sortOrder: number }>;
  hitLocations: Array<{ hitLocationNumber: number; locationName: string; bodyPartsIncluded: string; hpPoolCanonicalId: string | null; locationEffect: string; notes: string; sortOrder: number }>;
};

export function createHumanoidRaceAnatomy(): RaceAnatomy {
  return {
    schemaVersion: 1,
    hpPools: CHARACTER_HUMANOID_HP_POOLS.map((pool, sortOrder) => ({ canonicalId: pool.key, poolName: pool.name, hpPercentage: pool.percentage, notes: "", sortOrder })),
    hitLocations: CHARACTER_HUMANOID_HIT_LOCATIONS.map((location, sortOrder) => ({ hitLocationNumber: location.result, locationName: location.name, bodyPartsIncluded: location.name, hpPoolCanonicalId: location.poolKey, locationEffect: "", notes: "", sortOrder })),
  };
}

export function normalizeRaceAnatomy(input: RaceAnatomy | null): RaceAnatomy | null {
  if (input === null) return null;
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.hpPools) || !Array.isArray(input.hitLocations)) throw new Error("Race anatomy needs HP Pools and Hit Locations.");
  const text = (value: unknown, label: string, required = false) => {
    if (typeof value !== "string" || (required && !value.trim())) throw new Error(`${label} is required.`);
    return value.trim();
  };
  const identities = new Set<string>();
  const hpPools = input.hpPools.map((pool, sortOrder) => {
    if (!pool) throw new Error("Invalid HP Pool.");
    const canonicalId = text(pool.canonicalId, "HP Pool identity", true);
    if (identities.has(canonicalId)) throw new Error("HP Pool identities must be unique.");
    identities.add(canonicalId);
    if (pool.hpPercentage !== null && (typeof pool.hpPercentage !== "number" || !Number.isFinite(pool.hpPercentage) || pool.hpPercentage < 0)) throw new Error("HP percentage must be blank or a finite number zero or greater.");
    return { canonicalId, poolName: text(pool.poolName, "Pool Name", true), hpPercentage: pool.hpPercentage, notes: text(pool.notes, "Pool Notes"), sortOrder };
  });
  const numbers = new Set<number>();
  const hitLocations = input.hitLocations.map((location, sortOrder) => {
    if (!location || !Number.isInteger(location.hitLocationNumber) || location.hitLocationNumber < 0 || location.hitLocationNumber > 9 || numbers.has(location.hitLocationNumber)) throw new Error("Each Hit Location must use a different roll from 0 to 9.");
    numbers.add(location.hitLocationNumber);
    if (location.hpPoolCanonicalId !== null && !identities.has(location.hpPoolCanonicalId)) throw new Error("Every assigned Hit Location must use an existing HP Pool.");
    return { hitLocationNumber: location.hitLocationNumber, locationName: text(location.locationName, "Location Name", true), bodyPartsIncluded: text(location.bodyPartsIncluded, "Body Parts"), hpPoolCanonicalId: location.hpPoolCanonicalId, locationEffect: text(location.locationEffect, "Location Effect"), notes: text(location.notes, "Location Notes"), sortOrder };
  });
  return { schemaVersion: 1, hpPools, hitLocations };
}

export function raceHitLocations(anatomy?: RaceAnatomy | null) {
  return anatomy ? anatomy.hitLocations.map((row) => ({ key: String(row.hitLocationNumber), name: row.locationName })) : CHARACTER_HUMANOID_HIT_LOCATIONS.map((row) => ({ key: String(row.result), name: row.name }));
}
