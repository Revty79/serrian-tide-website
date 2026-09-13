export const FIREARM_WEAPON_TYPES = ["firearm", "handgun", "pistol", "revolver", "rifle", "shotgun", "submachine gun", "machine gun"];

export function isFirearmWeaponType(weaponType: string): boolean {
  return FIREARM_WEAPON_TYPES.includes(weaponType.trim().toLowerCase());
}

export function projectileWeaponFamily(weaponType: string): "bow" | "crossbow" | null {
  const type = weaponType.trim().toLowerCase();
  return type === "bow" || type === "crossbow" ? type : null;
}

export const AMMUNITION_WEAPON_TYPES = [...FIREARM_WEAPON_TYPES, "bow", "crossbow"];

export function isSupportedAmmunitionWeaponType(weaponType: string): boolean {
  return isFirearmWeaponType(weaponType) || projectileWeaponFamily(weaponType) !== null;
}

export const UNSUPPORTED_PROJECTILE_MESSAGE = "This weapon's ranged family has no supported combat ammunition workflow yet. It cannot use firearm controls or fire through an ordinary attack. Choose a supported source; review Weapon Type in Heavens → Items if this is a firearm.";
