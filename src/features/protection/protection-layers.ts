import type { ActiveModifier } from "@/features/active-state/active-effects";
import type { WornArmorRuntimeContext } from "@/features/items/equipment-state";
import { creatureProtectionValue } from "@/features/tabletop-operations/creature-protection";
import { NATURAL_PROTECTION_LOCATIONS, type NaturalProtectionCoverage, type RaceNaturalProtection } from "@/features/races/race-natural-protection";

export type ProtectionTarget = { kind: "character"; characterId: number } | { kind: "encounter-participant"; campaignId: number; encounterId: number; participantId: number };
type ProtectionSource = { kind: "race" | "creature-snapshot"; id: string; name: string };
export type WornProtection = WornArmorRuntimeContext & {
  damageModifiersSourceText: string;
  damageModifiers: Array<{ id: number; damageType: string; modifier: string; modifierText: string; notes: string }>;
};
export type NaturalProtection = {
  name: string;
  coverage: NaturalProtectionCoverage;
} & ({
  source: ProtectionSource & { kind: "race" };
  soak: number;
  armor?: never;
  authored?: never;
} | {
  source: ProtectionSource & { kind: "creature-snapshot" };
  armor: number | null;
  soak: number | null;
  /** Exact snapshot fields, including old blanks, remain available for explanation. */
  authored?: { naturalArmor: unknown; soak: unknown };
});
export type TemporaryProtection = {
  id: string;
  name: string;
  channel: "soak";
  targetKey: string;
  amount: number | null;
  coverage: NaturalProtectionCoverage | { kind: "unresolved" };
  /** Keep the full source, duration and lifecycle record; never relabel an Item passive as worn armor. */
  modifier: Record<string, unknown>;
};
export type ProtectionLayers = {
  target: ProtectionTarget;
  locations: Array<{ key: string; name: string }>;
  worn: WornProtection[];
  natural: NaturalProtection[];
  temporary: TemporaryProtection[];
  issues: string[];
};

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function projectCreatureNaturalProtection(snapshot: unknown, identity: string) {
  const value = typeof snapshot === "string" ? JSON.parse(snapshot) as unknown : snapshot;
  const root = object(value), core = object(root?.core);
  if (!root || !Array.isArray(root.hitLocations)) throw new Error("Creature protection requires snapshot hit locations.");
  const locations: ProtectionLayers["locations"] = [], natural: NaturalProtection[] = [], issues: string[] = [];
  for (const entry of root.hitLocations) {
    const location = object(entry);
    if (!location || !Number.isInteger(location.hitLocationNumber) || Number(location.hitLocationNumber) < 0 || Number(location.hitLocationNumber) > 9) throw new Error("Creature protection has an invalid hit location.");
    const key = String(location.hitLocationNumber);
    if (locations.some((location) => location.key === key)) throw new Error("Creature protection has duplicate hit locations.");
    const name = typeof location.locationName === "string" && location.locationName.trim() ? location.locationName : `Location ${key}`;
    locations.push({ key, name });
    const armor = creatureProtectionValue(location.naturalArmor), soak = creatureProtectionValue(location.soak);
    if (armor === null || soak === null) issues.push(`${name} has unsupported natural protection; a G.O.D. ruling is needed.`);
    natural.push({ source: { kind: "creature-snapshot", id: `${identity}:location:${key}`, name: typeof core?.canonicalName === "string" ? core.canonicalName : "Creature snapshot" },
      name: `${name} natural protection`, coverage: { kind: "locations", locationKeys: [key] }, armor, soak,
      authored: { naturalArmor: location.naturalArmor ?? null, soak: location.soak ?? null } });
  }
  return { locations, natural, issues };
}

export function projectRaceNaturalProtection(race: { id: number; name: string; protections: readonly RaceNaturalProtection[] }): NaturalProtection[] {
  return race.protections.map((definition) => ({
    source: { kind: "race", id: `race:${race.id}:protection:${definition.key}`, name: race.name },
    name: definition.name, coverage: structuredClone(definition.coverage), soak: definition.naturalSoak,
  }));
}

export function projectTemporaryProtection(modifiers: readonly (ActiveModifier | Record<string, unknown>)[]): TemporaryProtection[] {
  return modifiers.flatMap((entry, index) => {
    const modifier: Record<string, unknown> = { ...entry };
    if (modifier.channel !== "soak" || modifier.endedAt || modifier.expiredAt) return [];
    const targetKey = typeof modifier.targetKey === "string" ? modifier.targetKey : "";
    return [{ id: String(modifier.id ?? modifier.effectPlanEffectId ?? `local:${index}`), name: typeof modifier.label === "string" ? modifier.label : "Temporary Protection",
      channel: "soak" as const, targetKey, amount: typeof modifier.amount === "number" && Number.isFinite(modifier.amount) ? modifier.amount : null,
      coverage: targetKey === "self" ? { kind: "all" as const } : { kind: "unresolved" as const }, modifier: structuredClone(modifier) }];
  });
}

/** Projection only. No aggregation, stacking, damage reduction, interaction execution or HP effects. */
export function buildProtectionLayers(input: {
  target: ProtectionTarget;
  creature?: { snapshot: unknown; identity: string };
  race?: { id: number; name: string; protections: readonly RaceNaturalProtection[] };
  worn?: readonly WornProtection[];
  modifiers?: readonly (ActiveModifier | Record<string, unknown>)[];
}): ProtectionLayers {
  if (input.creature && input.race) throw new Error("Choose the target's authoritative Creature snapshot or assigned Race.");
  const creature = input.creature ? projectCreatureNaturalProtection(input.creature.snapshot, input.creature.identity) : null;
  const temporary = projectTemporaryProtection(input.modifiers ?? []);
  const worn = structuredClone([...(input.worn ?? [])]);
  return { target: { ...input.target }, locations: creature?.locations ?? NATURAL_PROTECTION_LOCATIONS.map((location) => ({ ...location })),
    worn, natural: creature?.natural ?? (input.race ? projectRaceNaturalProtection(input.race) : []), temporary,
    issues: [...(creature?.issues ?? []),
      ...worn.filter((entry) => entry.baseSoak === null || !entry.coveredLocationKeys.length).map((entry) => `${entry.itemName} has incomplete authored protection or coverage.`),
      ...temporary.filter((entry) => entry.amount === null || entry.coverage.kind === "unresolved").map((entry) => `${entry.name} needs an authoritative value or coverage ruling.`)],
  };
}

export function protectionAtLocation(profile: ProtectionLayers, locationKey: string) {
  const location = profile.locations.find(({ key }) => key === locationKey);
  if (!location) throw new Error("Choose a hit location in this target's anatomy.");
  const covers = (coverage: TemporaryProtection["coverage"]) => coverage.kind === "all" || coverage.kind === "locations" && coverage.locationKeys.includes(locationKey);
  return { location, worn: profile.worn.filter(({ coveredLocationKeys }) => coveredLocationKeys.includes(locationKey)),
    natural: profile.natural.filter(({ coverage }) => covers(coverage)), temporary: profile.temporary.filter(({ coverage }) => covers(coverage)),
    unresolvedTemporary: profile.temporary.filter(({ coverage }) => coverage.kind === "unresolved"), issues: [...profile.issues] };
}
