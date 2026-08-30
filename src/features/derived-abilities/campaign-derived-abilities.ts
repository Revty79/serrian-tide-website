export function normalizeCampaignDerivedAbilityIds(
  ids: readonly number[],
): number[] {
  const normalized = ids.map((id) => {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Allowed Derived Abilities contain an invalid record.");
    }
    return id;
  });
  return [...new Set(normalized)];
}

export function validateCampaignDerivedAbilitySelection(
  requestedIds: readonly number[],
  existingIds: readonly number[],
): number[] {
  const normalized = normalizeCampaignDerivedAbilityIds(requestedIds);
  const existing = new Set(existingIds);
  if (normalized.some((id) => !existing.has(id))) {
    throw new Error("An Allowed Derived Ability is no longer available.");
  }
  return normalized;
}
