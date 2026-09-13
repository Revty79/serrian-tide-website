import { projectileWeaponFamily } from "./firearm-classification";
import { resolveFirearmFiringMode, type FirearmFiringModeDraft, type ResolvedFirearmFiringMode } from "./firearm-timing";

export function rangedShotInitiativeCost(profile: { weaponType: string; reloadInitiativeCost: number | null }): number {
  if (projectileWeaponFamily(profile.weaponType) !== "bow") return 1;
  const cost = profile.reloadInitiativeCost;
  if (cost === null || !Number.isFinite(cost) || cost <= 0) {
    throw new Error("Author the bow's positive Nock / Draw / Shoot Initiative cost before shooting.");
  }
  return cost;
}

export function ammunitionSelectionInitiativeCost(profile: { weaponType?: string; reloadInitiativeCost: number | null }): number | null {
  // The bow pays its entire preparation cost with the shot, never twice.
  return projectileWeaponFamily(profile.weaponType ?? "") === "bow" ? 0 : profile.reloadInitiativeCost;
}

export function resolveAmmunitionWeaponMode(weaponType: string, mode: FirearmFiringModeDraft,
  cyclingModifier = 0, recoilModifier = 0): ResolvedFirearmFiringMode {
  if (!projectileWeaponFamily(weaponType)) return resolveFirearmFiringMode(mode, cyclingModifier, recoilModifier);
  // Retain the catalog mode identity and Skill links. Bow/crossbow preparation
  // belongs to reload/shot timing, not firearm cycling or recoil modifiers.
  if (mode.name.trim().toLowerCase() !== "single") return { ...mode, timing: null };
  return resolveFirearmFiringMode({ ...mode, baseCyclingInitiativeCost: 0, baseRecoilResetInitiativeCost: 0,
    deliveryCadence: "per-trigger", roundsPerCadence: 1, mechanicsReviewRequired: false });
}
