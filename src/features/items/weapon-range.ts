export const WEAPON_RANGE_MODES = ["melee", "ranged", "hybrid"] as const;
export type WeaponRangeMode = (typeof WEAPON_RANGE_MODES)[number];

export type StructuredWeaponRange = {
  mode: WeaponRangeMode | null;
  unit: string | null;
  reach: number | null;
  short: number | null;
  medium: number | null;
  long: number | null;
};

export type WeaponRangeBand = "reach" | "short" | "medium" | "long" | "beyond-long";

export type ResolvedWeaponRange = {
  band: WeaponRangeBand;
  distance: number;
  unit: string;
  adjustment: number;
  label: string;
};

function positive(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return value;
}

function normalizedUnit(value: string | null): string | null {
  const unit = value?.trim().toLowerCase() ?? "";
  return unit || null;
}

export function validateStructuredWeaponRange(input: StructuredWeaponRange): StructuredWeaponRange {
  if (input.mode !== null && !WEAPON_RANGE_MODES.includes(input.mode)) throw new Error("Weapon Range Mode is invalid.");
  const unit = normalizedUnit(input.unit);
  const reach = positive(input.reach, "Reach");
  const short = positive(input.short, "Short Range");
  const medium = positive(input.medium, "Medium Range");
  const long = positive(input.long, "Long Range");
  if (short !== null && medium !== null && short > medium) throw new Error("Short Range must not exceed Medium Range.");
  if (medium !== null && long !== null && medium > long) throw new Error("Medium Range must not exceed Long Range.");
  if ((reach !== null || short !== null || medium !== null || long !== null) && unit === null) {
    throw new Error("A distance unit is required when structured Weapon ranges are entered.");
  }
  return { mode: input.mode, unit, reach, short, medium, long };
}

export function resolveWeaponRange(input: {
  profile: StructuredWeaponRange;
  attackMode: "melee" | "ranged";
  distance: number | null | undefined;
  unit: string | null | undefined;
  beyondLongModifier?: number | null;
  beyondLongReason?: string;
}): ResolvedWeaponRange {
  const profile = validateStructuredWeaponRange(input.profile);
  if (input.distance === null || input.distance === undefined) throw new Error("Enter the actual target distance before declaring this ranged attack.");
  if (!Number.isFinite(input.distance) || input.distance < 0) throw new Error("Target distance must be zero or greater.");
  const unit = normalizedUnit(input.unit ?? null);
  if (!unit) throw new Error("Enter the target distance unit before declaring this ranged attack.");
  if (!profile.unit || unit !== profile.unit) throw new Error(`Target distance must use the authored unit: ${profile.unit ?? "an authored unit"}.`);
  if (input.attackMode === "melee") {
    if (profile.mode !== "melee" && profile.mode !== "hybrid") throw new Error("This Weapon has no authored melee Reach mode.");
    if (profile.reach === null) throw new Error("This melee attack needs an authored Reach value and unit.");
    if (input.distance > profile.reach) throw new Error("The target is beyond this Weapon's authored Reach.");
    return { band: "reach", distance: input.distance, unit, adjustment: 0, label: `Reach (${input.distance} ${unit})` };
  }
  if (profile.mode !== "ranged" && profile.mode !== "hybrid") throw new Error("This ranged attack needs an authored ranged mode and limits.");
  if (profile.short === null || profile.medium === null || profile.long === null) throw new Error("This ranged attack needs authored Short, Medium, and Long limits with a unit.");
  if (input.distance <= profile.short) return { band: "short", distance: input.distance, unit, adjustment: 10, label: `Short (${input.distance} ${unit})` };
  if (input.distance <= profile.medium) return { band: "medium", distance: input.distance, unit, adjustment: 0, label: `Medium (${input.distance} ${unit})` };
  if (input.distance <= profile.long) return { band: "long", distance: input.distance, unit, adjustment: -10, label: `Long (${input.distance} ${unit})` };
  const modifier = input.beyondLongModifier;
  if (modifier === null || modifier === undefined || !Number.isFinite(modifier)) throw new Error("Beyond Long range requires an explicit G.O.D. modifier; enter zero when the ruling is neutral.");
  const reason = input.beyondLongReason?.trim() ?? "";
  if (!reason) throw new Error("Beyond Long range requires an explicit G.O.D. ruling reason.");
  return { band: "beyond-long", distance: input.distance, unit, adjustment: modifier === 0 ? 0 : -modifier, label: `Beyond Long (${input.distance} ${unit})` };
}
