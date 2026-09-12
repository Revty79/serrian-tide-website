export const FIREARM_WEAPON_TYPES = ["firearm", "handgun", "pistol", "revolver", "rifle", "shotgun", "submachine gun", "machine gun"];

export function isFirearmWeaponType(weaponType: string): boolean {
  return FIREARM_WEAPON_TYPES.includes(weaponType.trim().toLowerCase());
}

export const UNSUPPORTED_PROJECTILE_MESSAGE = "This weapon's ranged family has no supported combat ammunition workflow yet. It cannot use firearm controls or fire through an ordinary attack. Choose a supported source; review Weapon Type in Heavens → Items if this is a firearm.";
