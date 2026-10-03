/** Approved Serrian Tide damage categories. Keep every authoring control on this list. */
export const DAMAGE_TYPES = [
  "Blunt", "Crushing", "Piercing", "Slashing", "Ballistic", "Fire", "Cold", "Acid", "Poison",
  "Energy", "Explosive", "Supernatural",
] as const;
export type DamageType = typeof DAMAGE_TYPES[number];

export const DAMAGE_TYPE_HELP = "Choose an approved damage type. Leave an unfinished attack unspecified. For an attack with several types, add each type separately and explain any damage split in its notes; selecting types does not decide how to split damage.";
export const DAMAGE_TYPE_MATCH_HELP = "Choose the approved damage types this defense describes. Defenses listing several types currently need a G.O.D. ruling for matching. Mixed incoming damage also needs an explicit damage split or ruling.";
export const ARMOR_DAMAGE_TYPE_HELP = "For one matching Damage Type, effective armor Soak is Base Soak plus the signed Modifier, with a minimum of zero. Fire +2 strengthens protection; Piercing -2 weakens it. Use one row per type. Combined armor types and unsplit incoming types with different protection need a G.O.D. ruling. Source Text, Notes and Armor Rules are descriptive only.";

/** Only the explicitly approved synonym is accepted; source qualifiers are never guessed. */
export function parseDamageTypes(value: string): { types: DamageType[]; unrecognized: string[] } {
  const types: DamageType[] = [], unrecognized: string[] = [];
  if (!value.trim()) return { types, unrecognized };
  for (const part of value.split("/")) {
    const label = part.trim();
    const canonical = label.toLowerCase() === "bludgeoning" ? "Blunt"
      : DAMAGE_TYPES.find(type => type.toLowerCase() === label.toLowerCase());
    if (canonical) { if (!types.includes(canonical)) types.push(canonical); }
    else unrecognized.push(label || "(empty type)");
  }
  return { types: DAMAGE_TYPES.filter(type => types.includes(type)), unrecognized };
}

export function normalizeDamageTypes(value: unknown, options: { multiple?: boolean; required?: boolean; label?: string; retainedValue?: string } = {}): string {
  const label = options.label ?? "Damage Type";
  if (typeof value !== "string") throw new Error(`${label} must use the approved damage-type list.`);
  const parsed = parseDamageTypes(value);
  if (parsed.unrecognized.length) {
    if (value === options.retainedValue) return value;
    throw new Error(`${label}: review the unapproved value “${value}” and choose from the approved damage types. Keep any special rule in the notes.`);
  }
  if (options.required && !parsed.types.length) throw new Error(`${label} is required.`);
  if (!options.multiple && parsed.types.length > 1) throw new Error(`${label}: this field accepts one damage type.`);
  return parsed.types.join(" / ");
}

/**
 * Validate submitted authoring definitions, including nested Forms and ability rules.
 * Stored definitions are supplied by the server so unresolved legacy values may be
 * retained at the same stable row identity. This never runs on history/runtime reads.
 */
export function normalizeAuthoredDamageTypes<T>(input: T, stored?: unknown, path = "Definition"): T {
  if (Array.isArray(input)) {
    const previous = Array.isArray(stored) ? [...stored] : [];
    return input.map((row, index) => {
      const identity = row && typeof row === "object" ? ["key", "canonicalId", "id"].find(key => row[key] !== undefined && row[key] !== "") : undefined;
      const match = identity ? previous.findIndex(old => old && old[identity] === row[identity])
        : previous.findIndex(old => JSON.stringify(old) === JSON.stringify(row));
      return normalizeAuthoredDamageTypes(row, match < 0 ? undefined : previous.splice(match, 1)[0], `${path}[${index + 1}]`);
    }) as T;
  }
  if (!input || typeof input !== "object") return input;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return input;
  const row = input as Record<string, unknown>;
  const previous = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "damageType"
    ? normalizeDamageTypes(value, { multiple: true, required: row.kind === "damage-type", label: `${path}: Damage Type`, retainedValue: typeof previous.damageType === "string" ? previous.damageType : undefined })
    : normalizeAuthoredDamageTypes(value, previous[key], `${path}.${key}`),
  ])) as T;
}

/**
 * A mixed attack cannot apply a type-specific percentage to its entire unsplit damage.
 * Multi-type defense matching remains manual until its Any/All interpretation is ruled.
 */
export function matchDamageType(incoming: string | null, expected: string): boolean | null {
  if (incoming === null) return null;
  const source = parseDamageTypes(incoming), target = parseDamageTypes(expected);
  if (source.unrecognized.length || target.unrecognized.length || !source.types.length || target.types.length !== 1) return null;
  if (!source.types.includes(target.types[0])) return false;
  return source.types.length === 1 ? true : null;
}
