import { EQUIPMENT_STATES, type EquipmentState } from "./equipment-state";

export type ItemChargeState = {
  instanceId: number;
  itemId: number;
  itemName: string;
  maximumCharges: number | null;
  currentCharges: number;
  chargesPerUse: number | null;
  equipmentState: EquipmentState;
  rechargeNotes: string;
  isAboveCurrentMaximum: boolean;
  definitionStatus: "charged" | "definition-mismatch";
};

export type CharacterItemChargeStateView = {
  characterId: number;
  instances: ItemChargeState[];
};

function wholeNumber(value: unknown, label: string, allowZero: boolean): number {
  if (!Number.isSafeInteger(value) || (allowZero ? (value as number) < 0 : (value as number) <= 0)) {
    throw new Error(`${label} must be a ${allowZero ? "non-negative" : "positive"} whole number.`);
  }
  return value as number;
}

export function validateChargeAmount(value: unknown, label = "Charge amount"): number {
  return wholeNumber(value, label, false);
}

export function validateCurrentChargesForMaximum(value: unknown, maximumCharges: number): number {
  const current = wholeNumber(value, "Current Charges", true);
  const maximum = wholeNumber(maximumCharges, "Maximum Charges", false);
  if (current > maximum) throw new Error("Current Charges cannot exceed the current Item template Maximum Charges.");
  return current;
}

export function spendItemCharges(currentCharges: number, amount: number): number {
  const current = wholeNumber(currentCharges, "Current Charges", true);
  const spend = validateChargeAmount(amount, "Charges Per Use");
  if (current < spend) throw new Error("The selected Item copy does not have enough Charges.");
  return current - spend;
}

export function restoreItemCharges(currentCharges: number, maximumCharges: number, amount: number): number {
  const current = wholeNumber(currentCharges, "Current Charges", true);
  const maximum = wholeNumber(maximumCharges, "Maximum Charges", false);
  const restore = validateChargeAmount(amount, "Charge restoration");
  if (current >= maximum) return current;
  return Math.min(maximum, current + restore);
}

export function restoreItemChargesFull(maximumCharges: number): number {
  return wholeNumber(maximumCharges, "Maximum Charges", false);
}

export function setItemCurrentCharges(maximumCharges: number, currentCharges: number): number {
  return validateCurrentChargesForMaximum(currentCharges, maximumCharges);
}

export function createItemChargeState(input: Omit<ItemChargeState, "isAboveCurrentMaximum">): ItemChargeState {
  wholeNumber(input.instanceId, "Item Instance ID", false);
  wholeNumber(input.itemId, "Item ID", false);
  const currentCharges = wholeNumber(input.currentCharges, "Current Charges", true);
  if (!input.itemName.trim()) throw new Error("Charged Item name is required.");
  if (!EQUIPMENT_STATES.includes(input.equipmentState)) throw new Error("Charged Item Equipment State is invalid.");
  if (input.definitionStatus === "charged") {
    wholeNumber(input.maximumCharges, "Maximum Charges", false);
    wholeNumber(input.chargesPerUse, "Charges Per Use", false);
  } else if (input.maximumCharges !== null || input.chargesPerUse !== null) {
    throw new Error("A non-charged Item definition cannot expose active Charge limits.");
  }
  return {
    ...input,
    itemName: input.itemName.trim(),
    currentCharges,
    rechargeNotes: input.rechargeNotes.trim(),
    isAboveCurrentMaximum: input.maximumCharges !== null && currentCharges > input.maximumCharges,
  };
}
