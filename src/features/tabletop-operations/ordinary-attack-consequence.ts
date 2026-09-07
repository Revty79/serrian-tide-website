import { parseAuthoredBulletDamage } from "./firearm-attack";

export type OrdinaryAttackDamageResolution = Readonly<{
  authoredDamage: string | number | null;
  grossDamage: number | null;
  armor: number | null;
  soak: number | null;
  netDamage: number | null;
  supported: boolean;
  rulingReasons: readonly string[];
}>;

export function calculateOrdinaryAttackDamage(input: {
  authoredDamage: string | number | null;
  armor: number | null;
  soak: number | null;
  protectionSupported: boolean;
  protectionRulingReasons?: readonly string[];
}): OrdinaryAttackDamageResolution {
  const grossDamage = typeof input.authoredDamage === "number" && Number.isFinite(input.authoredDamage) && input.authoredDamage > 0
    ? input.authoredDamage
    : parseAuthoredBulletDamage(typeof input.authoredDamage === "string" ? input.authoredDamage : null);
  const rulingReasons = [...(input.protectionRulingReasons ?? [])];
  if (grossDamage === null) {
    rulingReasons.unshift("The frozen authored attack damage is not a direct positive numeric value; its damage Roll or interpretation requires a G.O.D. ruling.");
  }
  if (!input.protectionSupported || input.armor === null || input.soak === null) {
    if (!rulingReasons.length) rulingReasons.push("The target's armor or soak could not be resolved from current authoritative state.");
  }
  if ((input.armor !== null && input.armor < 0) || (input.soak !== null && input.soak < 0)) {
    rulingReasons.push("Negative armor or soak requires a G.O.D. ruling; it was not converted into bonus damage.");
  }
  const supported = grossDamage !== null
    && input.protectionSupported
    && input.armor !== null
    && input.soak !== null
    && input.armor >= 0
    && input.soak >= 0;
  const netDamage = supported && input.armor !== null && input.soak !== null && grossDamage !== null
    ? Math.max(0, grossDamage - input.armor - input.soak)
    : null;
  return {
    authoredDamage: input.authoredDamage,
    grossDamage,
    armor: input.armor,
    soak: input.soak,
    netDamage,
    supported,
    rulingReasons: [...new Set(rulingReasons)],
  };
}
