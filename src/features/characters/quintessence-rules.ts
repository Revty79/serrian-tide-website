export const ATTRIBUTE_QUINTESSENCE_COST = 5;
export const FATE_POINT_QUINTESSENCE_COST = 10;
export const EXPERIENCE_PER_QUINTESSENCE = 10;

export type CharacterQuintessencePurchaseType =
  | "attribute"
  | "fatePoints"
  | "experience";

export function getQuintessenceCost(
  purchaseType: CharacterQuintessencePurchaseType,
  quantity: number,
): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (purchaseType === "attribute") {
    return quantity * ATTRIBUTE_QUINTESSENCE_COST;
  }

  if (purchaseType === "fatePoints") {
    return quantity * FATE_POINT_QUINTESSENCE_COST;
  }

  return quantity;
}

export function getExperienceFromQuintessence(quantity: number): number {
  return Number.isInteger(quantity) && quantity > 0
    ? quantity * EXPERIENCE_PER_QUINTESSENCE
    : 0;
}
