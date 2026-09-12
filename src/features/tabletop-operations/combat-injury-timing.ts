export type TimingLimb = { key: string; name: string; disabled: boolean };
export type InjuryTiming = { baseCost: number; multiplier: number; initiativeCost: number; explanation: string | null };

function timing(baseCost: number, multiplier = 1, explanation: string | null = null): InjuryTiming {
  return { baseCost, multiplier, initiativeCost: baseCost * multiplier, explanation };
}

export function weaponInjuryTiming(baseCost: number, handedness: string, limbs: readonly TimingLimb[], chosenHands?: unknown): InjuryTiming {
  const arms = limbs.filter(({ name }) => /\b(?:arms?|hands?)\b/i.test(name));
  if (!arms.some(({ disabled }) => disabled)) return timing(baseCost);
  const authored = handedness.trim().toLowerCase().replace(/[\s-]+/g, "");
  const requiredHands = authored === "twohanded" || authored === "2h" ? 2
    : authored === "onehanded" || authored === "1h" ? 1
    : authored === "versatile" && (chosenHands === 1 || chosenHands === 2) ? chosenHands : null;
  if (requiredHands === null) throw new Error(authored === "versatile"
    ? "Choose one-handed or two-handed use for this versatile weapon so its injury cost can be checked."
    : "An arm or hand is incapacitated. Set this weapon's Handedness in the Item editor before its Initiative cost can be checked.");
  if (arms.length !== 2) throw new Error("This arm or hand anatomy needs a specific G.O.D. timing ruling before this weapon action can start.");
  const functioning = arms.filter(({ disabled }) => !disabled);
  if (!functioning.length) throw new Error("Both arms or hands are incapacitated. Choose an action that does not require them.");
  if (requiredHands === 2) return timing(baseCost, 2, "Only one hand is functioning: this two-handed action costs double Initiative.");
  return timing(baseCost, 1, `Use the functioning ${functioning[0].name.toLowerCase()}; this one-handed action keeps its normal Initiative cost.`);
}

export function movementInjuryTiming(baseCost: number, limbs: readonly TimingLimb[]): InjuryTiming {
  const legs = limbs.filter(({ name }) => /\b(?:legs?|forelegs?|hindlegs?)\b/i.test(name));
  return legs.length === 2 && legs.filter(({ disabled }) => disabled).length === 1
    ? timing(baseCost, 2, "One of two legs is incapacitated: movement costs double Initiative for the same distance.")
    : timing(baseCost);
}
