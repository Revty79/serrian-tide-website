export const ORDINARY_TRIGGER_PULL_INITIATIVE_COST = 1 as const;
export const FIREARM_DELIVERY_CADENCES = ["per-trigger", "sustained-per-initiative"] as const;

export type FirearmDeliveryCadence = (typeof FIREARM_DELIVERY_CADENCES)[number];

export type FirearmTimingInput = {
  baseCyclingInitiativeCost: number | null;
  baseRecoilResetInitiativeCost: number | null;
  ammunitionCyclingInitiativeModifier: number;
  ammunitionRecoilResetInitiativeModifier: number;
};

export type FirearmTimingResult = {
  effectiveCyclingInitiativeCost: number;
  effectiveRecoilResetInitiativeCost: number;
  followUpPreparationInitiativeCost: number;
  totalThroughNextTriggerPullInitiativeCost: number;
};

export type FirearmFiringModeDraft = {
  id: number | null;
  name: string;
  sortOrder: number;
  baseCyclingInitiativeCost: number | null;
  baseRecoilResetInitiativeCost: number | null;
  deliveryCadence: FirearmDeliveryCadence | null;
  roundsPerCadence: number | null;
  mechanicsReviewRequired: boolean;
};

export type ResolvedFirearmFiringMode = FirearmFiringModeDraft & {
  timing: FirearmTimingResult | null;
};

function requireWholeNumber(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a whole number.`);
  return value;
}

function requireBaseCost(value: number | null, label: string): number {
  if (value === null) throw new Error(`${label} must be reviewed and authored before firearm timing can be calculated.`);
  const whole = requireWholeNumber(value, label);
  if (whole < 0) throw new Error(`${label} must be zero or greater.`);
  return whole;
}

export function calculateFirearmTiming(input: FirearmTimingInput): FirearmTimingResult {
  const baseCycling = requireBaseCost(input.baseCyclingInitiativeCost, "Base cycling Initiative Cost");
  const baseRecoilReset = requireBaseCost(input.baseRecoilResetInitiativeCost, "Base recoil-reset Initiative Cost");
  const cyclingModifier = requireWholeNumber(input.ammunitionCyclingInitiativeModifier, "Ammunition cycling Initiative modifier");
  const recoilModifier = requireWholeNumber(input.ammunitionRecoilResetInitiativeModifier, "Ammunition recoil-reset Initiative modifier");
  const effectiveCyclingInitiativeCost = Math.max(0, baseCycling + cyclingModifier);
  const effectiveRecoilResetInitiativeCost = Math.max(0, baseRecoilReset + recoilModifier);
  const followUpPreparationInitiativeCost = effectiveCyclingInitiativeCost + effectiveRecoilResetInitiativeCost;
  return {
    effectiveCyclingInitiativeCost,
    effectiveRecoilResetInitiativeCost,
    followUpPreparationInitiativeCost,
    totalThroughNextTriggerPullInitiativeCost: followUpPreparationInitiativeCost + ORDINARY_TRIGGER_PULL_INITIATIVE_COST,
  };
}

export function resolveFirearmFiringMode(
  mode: FirearmFiringModeDraft,
  ammunitionCyclingInitiativeModifier = 0,
  ammunitionRecoilResetInitiativeModifier = 0,
): ResolvedFirearmFiringMode {
  const timing = mode.baseCyclingInitiativeCost === null || mode.baseRecoilResetInitiativeCost === null
    ? null
    : calculateFirearmTiming({
        baseCyclingInitiativeCost: mode.baseCyclingInitiativeCost,
        baseRecoilResetInitiativeCost: mode.baseRecoilResetInitiativeCost,
        ammunitionCyclingInitiativeModifier,
        ammunitionRecoilResetInitiativeModifier,
      });
  return { ...mode, timing };
}

export function normalizeFiringModeName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

export function normalizeFirearmFiringModes(
  modes: readonly FirearmFiringModeDraft[],
  options: { allowUnreviewedNewModes?: boolean } = {},
): FirearmFiringModeDraft[] {
  const normalizedNames = new Set<string>();
  return modes.map((mode, sortOrder) => {
    const name = mode.name.trim();
    if (!name) throw new Error(`Firing Mode ${sortOrder + 1} Name is required.`);
    const normalizedName = normalizeFiringModeName(name);
    if (normalizedNames.has(normalizedName)) throw new Error(`Firing Mode names must be unique. Duplicate: ${name}.`);
    normalizedNames.add(normalizedName);
    if (mode.id !== null && (!Number.isSafeInteger(mode.id) || mode.id <= 0)) {
      throw new Error(`Firing Mode ${sortOrder + 1} has an invalid saved identity.`);
    }
    const cycling = mode.baseCyclingInitiativeCost;
    const recoil = mode.baseRecoilResetInitiativeCost;
    const cadence = mode.deliveryCadence;
    const rounds = mode.roundsPerCadence;
    if (cycling === null || recoil === null || cadence === null || rounds === null) {
      if (cycling !== null || recoil !== null || cadence !== null || rounds !== null) {
        throw new Error(`Firing Mode ${sortOrder + 1} must provide both base timing costs, a delivery cadence, and its round count.`);
      }
      if ((mode.id === null && !options.allowUnreviewedNewModes) || !mode.mechanicsReviewRequired) {
        throw new Error(`Firing Mode ${sortOrder + 1} must provide nonnegative cycling and recoil-reset costs.`);
      }
      return {
        id: mode.id,
        name,
        sortOrder,
        baseCyclingInitiativeCost: null,
        baseRecoilResetInitiativeCost: null,
        deliveryCadence: null,
        roundsPerCadence: null,
        mechanicsReviewRequired: true,
      };
    }
    requireBaseCost(cycling, `Firing Mode ${sortOrder + 1} Cycling Initiative Cost`);
    requireBaseCost(recoil, `Firing Mode ${sortOrder + 1} Recoil Reset Initiative Cost`);
    if (!FIREARM_DELIVERY_CADENCES.includes(cadence)) {
      throw new Error(`Firing Mode ${sortOrder + 1} Delivery Cadence must be Per Trigger or Sustained per Initiative.`);
    }
    requireWholeNumber(rounds, `Firing Mode ${sortOrder + 1} Rounds`);
    if (rounds <= 0) throw new Error(`Firing Mode ${sortOrder + 1} Rounds must be greater than zero.`);
    return {
      id: mode.id,
      name,
      sortOrder,
      baseCyclingInitiativeCost: cycling,
      baseRecoilResetInitiativeCost: recoil,
      deliveryCadence: cadence,
      roundsPerCadence: rounds,
      mechanicsReviewRequired: false,
    };
  });
}

export function copyFirearmFiringModes(
  modes: readonly FirearmFiringModeDraft[],
): FirearmFiringModeDraft[] {
  return modes.map((mode, sortOrder) => ({ ...mode, id: null, sortOrder }));
}
