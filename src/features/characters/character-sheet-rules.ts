import type {
  CharacterAttributeKey,
  CharacterAuthorizedItem,
  CharacterOwnedItem,
} from "./models";
import { getAttributeModifier } from "./character-rules";

type WeaponUse = {
  attribute: CharacterAttributeKey;
  label: "Melee" | "Ranged";
};

export type CharacterWeaponDamageSummary = {
  modifier: string;
  totalDamage: string;
};

export type CharacterWeaponDamage = {
  damage: string | null;
  damageType: string | null;
  sourceName: string | null;
};

export type CharacterWeaponDamageInput = Pick<
  CharacterAuthorizedItem,
  | "damageSource"
  | "damage"
  | "damageType"
  | "ammunitionItemId"
  | "ammunitionItemName"
  | "ammunitionDamage"
  | "ammunitionDamageType"
  | "weaponType"
  | "rangeText"
  | "reachText"
>;

export type CharacterEncumbrance = {
  totals: Array<{ weight: number; unit: string }>;
  unknownQuantity: number;
};

export function getCharacterEncumbrance(
  items: readonly CharacterOwnedItem[],
): CharacterEncumbrance {
  const totalsByUnit = new Map<string, { weight: number; unit: string }>();
  let unknownQuantity = 0;

  for (const item of items) {
    const unit = item.weightUnit.trim();
    if (
      item.weight === null ||
      !Number.isFinite(item.weight) ||
      item.weight < 0 ||
      !unit
    ) {
      unknownQuantity += item.quantity;
      continue;
    }

    const normalizedUnit = unit.toLowerCase();
    const current = totalsByUnit.get(normalizedUnit) ?? { weight: 0, unit };
    current.weight += item.weight * item.quantity;
    totalsByUnit.set(normalizedUnit, current);
  }

  return {
    totals: [...totalsByUnit.values()].sort((left, right) =>
      left.unit.localeCompare(right.unit),
    ),
    unknownQuantity,
  };
}

export function getCharacterWeaponDamage(
  item: CharacterWeaponDamageInput,
): CharacterWeaponDamage {
  const usesLinkedAmmunition =
    item.damageSource?.trim().toLowerCase() === "ammunition" &&
    item.ammunitionItemId !== null;

  if (usesLinkedAmmunition) {
    return {
      damage: item.ammunitionDamage?.trim() || item.damage?.trim() || null,
      damageType: item.ammunitionDamageType?.trim() || item.damageType?.trim() || null,
      sourceName: item.ammunitionItemName?.trim() || "Ammunition",
    };
  }

  return {
    damage: item.damage?.trim() || null,
    damageType: item.damageType?.trim() || null,
    sourceName: null,
  };
}

function displayNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function signedNumber(value: number): string {
  return value > 0 ? `+${displayNumber(value)}` : displayNumber(value);
}

function addModifier(damage: string | null, modifier: number): string {
  const base = damage?.trim();
  if (!base) return "—";
  if (/^-?\d+(?:\.\d+)?$/.test(base)) {
    return displayNumber(Number(base) + modifier);
  }
  if (modifier === 0) return base;
  return `${base} ${modifier > 0 ? "+" : "−"} ${displayNumber(Math.abs(modifier))}`;
}

function weaponUses(item: CharacterWeaponDamageInput): WeaponUse[] {
  const hasRange = Boolean(item.rangeText?.trim());
  const hasReach = Boolean(item.reachText?.trim());
  const explicitlyRanged =
    /bow|crossbow|firearm|pistol|rifle|cannon|ranged/i.test(
      item.weaponType ?? "",
    );

  if ((hasRange || explicitlyRanged) && hasReach) {
    return [
      { attribute: "STR", label: "Melee" },
      { attribute: "DEX", label: "Ranged" },
    ];
  }
  if (hasRange || explicitlyRanged) {
    return [{ attribute: "DEX", label: "Ranged" }];
  }
  return [{ attribute: "STR", label: "Melee" }];
}

export function getCharacterWeaponDamageAttributeKeys(
  item: CharacterWeaponDamageInput,
): CharacterAttributeKey[] {
  return weaponUses(item).map(({ attribute }) => attribute);
}

export function getCharacterWeaponDamageSummary(
  item: CharacterWeaponDamageInput,
  attributes: Record<CharacterAttributeKey, number>,
): CharacterWeaponDamageSummary {
  const profile = getCharacterWeaponDamage(item);
  const uses = weaponUses(item).map((use) => {
    const modifier = getAttributeModifier(attributes[use.attribute]);
    return { ...use, modifier, totalDamage: addModifier(profile.damage, modifier) };
  });

  if (uses.length === 1) {
    const [use] = uses;
    return {
      modifier: `${use.attribute} ${signedNumber(use.modifier)}`,
      totalDamage: use.totalDamage,
    };
  }

  return {
    modifier: uses
      .map((use) => `${use.attribute} ${signedNumber(use.modifier)}`)
      .join(" / "),
    totalDamage: uses
      .map((use) => `${use.label === "Melee" ? "M" : "R"} ${use.totalDamage}`)
      .join(" / "),
  };
}
