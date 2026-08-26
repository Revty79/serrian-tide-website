import type {
  CharacterAttributeKey,
  CharacterAuthorizedItem,
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

function weaponUses(item: CharacterAuthorizedItem): WeaponUse[] {
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

export function getCharacterWeaponDamageSummary(
  item: CharacterAuthorizedItem,
  attributes: Record<CharacterAttributeKey, number>,
): CharacterWeaponDamageSummary {
  const uses = weaponUses(item).map((use) => {
    const modifier = getAttributeModifier(attributes[use.attribute]);
    return { ...use, modifier, totalDamage: addModifier(item.damage, modifier) };
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
