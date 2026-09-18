export const WEAPON_PROFILE_RECORD_TYPES = ["Weapon", "Ammunition"] as const;
export const WEAPON_HANDEDNESS_CHOICES = ["One-Handed", "Two-Handed", "Versatile"] as const;
export const WEAPON_DAMAGE_SOURCE_CHOICES = ["Weapon", "Ammunition"] as const;

export const WEAPON_TYPE_CHOICES = [
  "Arrow", "Axe", "Ball", "Ball Charge", "Blunt / Close Weapon", "Bolt", "Bow", "Cannon", "Cannonball", "Cartridge",
  "Charge", "Chemical", "Club", "Crossbow", "Dart", "Dart Weapon", "Electroshock", "Electroshock / Energy", "Energy Weapon",
  "Exotic", "Explosive", "Explosive / Disruption", "Explosive / Trap", "Firearm", "Flare Cartridge", "Flexible / Control",
  "Garrote", "Grenade Round", "Hammer", "Handgun", "Harpoon", "Improvised / Tool", "Knife", "Knife / Blade", "Machine Gun",
  "Mace", "Net", "Pellet", "Pistol", "Polearm", "Projectile", "Revolver", "Rifle", "Shell", "Shot Charge", "Shotgun",
  "Sling", "Sling Ammunition", "Sonic Weapon", "Staff", "Submachine Gun", "Sword", "Whip",
] as const;

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function compact(value: string): string {
  return normalized(value).replace(/[\s_-]+/g, "");
}

export function isSupportedWeaponProfileRecordType(value: string): boolean {
  return WEAPON_PROFILE_RECORD_TYPES.some((choice) => normalized(choice) === normalized(value));
}

export function isSupportedWeaponHandedness(value: string): boolean {
  return ["onehanded", "1h", "twohanded", "2h", "versatile"].includes(compact(value));
}

export function isSupportedWeaponDamageSource(value: string): boolean {
  return WEAPON_DAMAGE_SOURCE_CHOICES.some((choice) => normalized(choice) === normalized(value));
}

export function isSupportedWeaponType(value: string): boolean {
  return WEAPON_TYPE_CHOICES.some((choice) => normalized(choice) === normalized(value));
}

export function defaultWeaponProfileRecordType(coreRecordType: string): (typeof WEAPON_PROFILE_RECORD_TYPES)[number] {
  return normalized(coreRecordType) === "ammunition" ? "Ammunition" : "Weapon";
}
