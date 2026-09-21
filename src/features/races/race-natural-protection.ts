import { CHARACTER_HUMANOID_HIT_LOCATIONS } from "@/features/characters/character-rules";

export const NATURAL_PROTECTION_LOCATIONS = CHARACTER_HUMANOID_HIT_LOCATIONS.map(({ result, name }) => ({ key: String(result), name }));
export type NaturalProtectionCoverage = { kind: "all" } | { kind: "locations"; locationKeys: string[] };
export type RaceNaturalProtection = {
  key: string;
  name: string;
  naturalArmor: number;
  naturalSoak: number;
  coverage: NaturalProtectionCoverage;
  sortOrder: number;
};

export function normalizeRaceNaturalProtection(input: readonly RaceNaturalProtection[]): RaceNaturalProtection[] {
  if (!Array.isArray(input)) throw new Error("Natural Protection must be a list.");
  const keys = new Set<string>();
  return input.map((entry, index) => {
    if (!entry || typeof entry.key !== "string" || !entry.key.trim() || keys.has(entry.key.trim())) throw new Error("Each Natural Protection needs a unique identity.");
    const key = entry.key.trim(); keys.add(key);
    if (typeof entry.name !== "string" || !entry.name.trim()) throw new Error("Protection Name is required.");
    for (const [label, value] of [["Natural Armor", entry.naturalArmor], ["Natural Soak", entry.naturalSoak]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a number zero or greater.`);
    }
    let coverage: NaturalProtectionCoverage;
    if (entry.coverage?.kind === "all") coverage = { kind: "all" };
    else if (entry.coverage?.kind === "locations" && Array.isArray(entry.coverage.locationKeys) && entry.coverage.locationKeys.length) {
      const selected: string[] = entry.coverage.locationKeys;
      if (selected.some((key) => !NATURAL_PROTECTION_LOCATIONS.some((location) => location.key === key)) || new Set(selected).size !== selected.length) throw new Error("Choose each supported Coverage location only once.");
      coverage = { kind: "locations", locationKeys: NATURAL_PROTECTION_LOCATIONS.filter(({ key }) => selected.includes(key)).map(({ key }) => key) };
    } else throw new Error("Coverage needs All locations or at least one selected location.");
    return { key, name: entry.name.trim(), naturalArmor: entry.naturalArmor, naturalSoak: entry.naturalSoak, coverage, sortOrder: index };
  });
}
