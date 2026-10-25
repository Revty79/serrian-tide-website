import type {ShopCatalogItem} from "./shop-builder";
import {getCharacterWeaponDamage} from "@/features/characters/character-sheet-rules";
function displayNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
export function getCatalogItemDetails(catalogItem: ShopCatalogItem): Array<[string, string]> {
  const details: Array<[string, string]> = [];
  const damageProfile = getCharacterWeaponDamage(catalogItem);
  if (catalogItem.weaponType) details.push(["Weapon", catalogItem.weaponType]);
  if (catalogItem.handedness) details.push(["Hands", catalogItem.handedness]);
  if (damageProfile.damage) {
    details.push(["Damage", `${damageProfile.damage}${damageProfile.damageType ? ` ${damageProfile.damageType}` : ""}`]);
  }
  if (damageProfile.sourceName) details.push(["Ammunition", damageProfile.sourceName]);
  if (catalogItem.rangeText) details.push(["Range", catalogItem.rangeText]);
  if (catalogItem.reachText) details.push(["Reach", catalogItem.reachText]);
  if (catalogItem.armorType) details.push(["Armor", catalogItem.armorType]);
  if (catalogItem.coverage) details.push(["Coverage", catalogItem.coverage]);
  if (catalogItem.baseSoak !== null) details.push(["Base Soak", displayNumber(catalogItem.baseSoak)]);
  if (catalogItem.armorDamageModifiers) details.push(["Damage Modifiers", catalogItem.armorDamageModifiers]);
  if (catalogItem.weight !== null) {
    details.push(["Weight", `${displayNumber(catalogItem.weight)} ${catalogItem.weightUnit}`.trim()]);
  }
  if (catalogItem.durability !== null) details.push(["Durability", displayNumber(catalogItem.durability)]);
  return details;
}
