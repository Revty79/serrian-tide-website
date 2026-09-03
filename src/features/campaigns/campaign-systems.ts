import type { CampaignSystem } from "@/db/campaign-schema";

export type CampaignSystemCompatibility = {
  hasLegacyDerivedAbilityConfiguration: boolean;
  legacyDerivedAbilityCompatibilityResolved: boolean;
};

export function getEffectiveCampaignSystems(
  persistedSystems: readonly CampaignSystem[],
  compatibility: CampaignSystemCompatibility,
): CampaignSystem[] {
  const effectiveSystems = [...new Set(persistedSystems)];
  if (
    !effectiveSystems.includes("Derived Abilities") &&
    compatibility.hasLegacyDerivedAbilityConfiguration &&
    !compatibility.legacyDerivedAbilityCompatibilityResolved
  ) {
    effectiveSystems.push("Derived Abilities");
  }
  return effectiveSystems;
}
