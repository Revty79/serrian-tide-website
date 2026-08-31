export const ATTRIBUTE_QUINTESSENCE_COST = 5;
export const FATE_POINT_QUINTESSENCE_COST = 10;
export const EXPERIENCE_PER_QUINTESSENCE = 10;
export const HP_MULTIPLIER_QUINTESSENCE_COST = 25;
export const HP_MULTIPLIER_STEP = 0.25;
export const BASE_MOVEMENT_QUINTESSENCE_COST = 25;
export const BASE_MOVEMENT_STEP = 0.25;
export const BASE_MAGIC_QUINTESSENCE_COST = 25;
export const BASE_MAGIC_STEP = 0.25;

export type CharacterQuintessencePurchaseType =
  | "attribute"
  | "fatePoints"
  | "experience"
  | "hpMultiplier"
  | "baseMovement"
  | "baseMagic";

export type CharacterQuintessenceLedger = {
  quintessence: number;
  totalQuintessence: number;
  experience: number;
  totalExperience: number;
};

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

  if (purchaseType === "hpMultiplier") {
    return quantity * HP_MULTIPLIER_QUINTESSENCE_COST;
  }

  if (purchaseType === "baseMovement") {
    return quantity * BASE_MOVEMENT_QUINTESSENCE_COST;
  }

  if (purchaseType === "baseMagic") {
    return quantity * BASE_MAGIC_QUINTESSENCE_COST;
  }

  return quantity;
}

export function getHpMultiplierStepsAfterPurchase(
  currentSteps: number,
  quantity: number,
): number {
  if (!Number.isInteger(currentSteps) || currentSteps < 0) {
    throw new Error("Saved HP multiplier steps must be a whole number zero or greater.");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("HP multiplier increase must be a positive whole number.");
  }
  return currentSteps + quantity;
}

function getStepsAfterPurchase(
  currentSteps: number,
  quantity: number,
  savedLabel: string,
  purchaseLabel: string,
): number {
  if (!Number.isInteger(currentSteps) || currentSteps < 0) {
    throw new Error(`Saved ${savedLabel} steps must be a whole number zero or greater.`);
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`${purchaseLabel} increase must be a positive whole number.`);
  }
  return currentSteps + quantity;
}

export function getBaseMovementStepsAfterPurchase(
  currentSteps: number,
  quantity: number,
): number {
  return getStepsAfterPurchase(currentSteps, quantity, "Base Movement", "Base Movement");
}

export function getBaseMagicStepsAfterPurchase(
  currentSteps: number,
  quantity: number,
): number {
  return getStepsAfterPurchase(currentSteps, quantity, "Base Magic", "Base Magic");
}

export function getExperienceFromQuintessence(quantity: number): number {
  return Number.isInteger(quantity) && quantity > 0
    ? quantity * EXPERIENCE_PER_QUINTESSENCE
    : 0;
}

export function getMaximumQuintessenceAttributeIncrease(input: {
  quintessence: number;
  currentAttributeValue: number;
  racialMaximum: number | null;
}): number {
  const affordablePoints = Math.max(
    0,
    Math.floor(input.quintessence / ATTRIBUTE_QUINTESSENCE_COST),
  );
  if (input.racialMaximum === null) return affordablePoints;
  const pointsBelowRacialMaximum = Math.max(
    0,
    Math.floor(input.racialMaximum - input.currentAttributeValue + 0.000_001),
  );
  return Math.min(affordablePoints, pointsBelowRacialMaximum);
}

export function validateQuintessenceAttributeIncrease(input: {
  currentAttributeValue: number;
  quantity: number;
  racialMaximum: number | null;
}): number {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("Attribute increase must be a positive whole number.");
  }
  const finalValue = input.currentAttributeValue + input.quantity;
  if (
    input.racialMaximum !== null &&
    finalValue > input.racialMaximum + 0.000_001
  ) {
    throw new Error(
      `This Attribute cannot exceed its racial maximum of ${input.racialMaximum}.`,
    );
  }
  return finalValue;
}

export function getQuintessenceSpendingLedger(input: {
  purchaseType: CharacterQuintessencePurchaseType;
  quantity: number;
  quintessence: number;
  totalQuintessence: number;
  experience: number;
  totalExperience: number;
}): CharacterQuintessenceLedger {
  const cost = getQuintessenceCost(input.purchaseType, input.quantity);
  if (cost > input.quintessence) {
    throw new Error(
      `This purchase costs ${cost} Quintessence, but only ${input.quintessence} is available.`,
    );
  }
  return {
    quintessence: input.quintessence - cost,
    totalQuintessence: input.totalQuintessence + cost,
    experience:
      input.purchaseType === "experience"
        ? input.experience + getExperienceFromQuintessence(input.quantity)
        : input.experience,
    totalExperience: input.totalExperience,
  };
}
