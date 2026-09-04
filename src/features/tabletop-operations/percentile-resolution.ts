export const PERCENTILE_ROLL_LABEL = "Percentile / d100";
export const PERCENTILE_NUMERIC_BOUND = 1_000_000;

export type PercentileTargetModifier = Readonly<
  | {
    kind: "bonus";
    label: string;
    magnitude: number;
  }
  | {
    kind: "penalty";
    label: string;
    magnitude: number;
  }
>;

export type PercentileRulingReason =
  | "critical-failure"
  | "double-ott-critical-success"
  | "double-ott-impossible-target-collision";

export type PercentileResolutionInput = Readonly<{
  resultTotal: number;
  originalTarget: number;
  modifiers?: readonly PercentileTargetModifier[];
}>;

export type PercentileResolution = Readonly<{
  resultTotal: number;
  originalTarget: number;
  modifiers: readonly PercentileTargetModifier[];
  totalBonuses: number;
  totalPenalties: number;
  finalTarget: number;
  outcome: "success" | "failure";
  succeeded: boolean;
  mathematicalSuccess: boolean;
  basicSuccess: boolean;
  additionalSuccesses: number;
  totalSuccesses: number;
  automaticSuccess: boolean;
  impossibleTarget: boolean;
  criticalFailure: boolean;
  criticalSuccess: boolean;
  doubleOtt: boolean;
  requiresGodRuling: boolean;
  rulingReasons: readonly PercentileRulingReason[];
}>;

export type PerSuccessQuantity = Readonly<{
  authoredAmountPerSuccess: number;
  successCountApplied: number;
  appliedQuantity: number;
  requiresGodRuling: boolean;
  rulingReasons: readonly PercentileRulingReason[];
}>;

export type OpposedObjectiveOutcome =
  | "attack-wins"
  | "defense-wins"
  | "neither-side-produced-successful-attack";

export type OpposedPercentileOutcome = OpposedObjectiveOutcome | "god-ruling-required";

export type OpposedPercentileRulingReason =
  | "attacker-critical-failure"
  | "attacker-double-ott-critical-success"
  | "attacker-double-ott-impossible-target-collision"
  | "defender-critical-failure"
  | "defender-double-ott-critical-success"
  | "defender-double-ott-impossible-target-collision"
  | "opposed-critical-collision";

export type OpposedPercentileComparison = Readonly<{
  outcome: OpposedPercentileOutcome;
  objectiveOutcome: OpposedObjectiveOutcome;
  winner: "attack" | "defense" | null;
  attackTotalSuccesses: number;
  defenseTotalSuccesses: number;
  attackerCriticalFailure: boolean;
  attackerCriticalSuccess: boolean;
  attackerDoubleOtt: boolean;
  defenderCriticalFailure: boolean;
  defenderCriticalSuccess: boolean;
  defenderDoubleOtt: boolean;
  attackerDoubleOttTieExceptionUsed: boolean;
  requiresGodRuling: boolean;
  rulingReasons: readonly OpposedPercentileRulingReason[];
}>;

function validateBoundedFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  if (Math.abs(value) > PERCENTILE_NUMERIC_BOUND) {
    throw new Error(`${label} must be between -${PERCENTILE_NUMERIC_BOUND} and ${PERCENTILE_NUMERIC_BOUND}.`);
  }
  return value;
}

export function validateRollResult(resultTotal: number): number {
  if (!Number.isInteger(resultTotal)) throw new Error("An entered percentile result must be a whole number.");
  if (resultTotal < 1 || resultTotal > 100) {
    throw new Error(`${PERCENTILE_ROLL_LABEL} results must be between 1 and 100.`);
  }
  return resultTotal;
}

function normalizeModifiers(
  suppliedModifiers: readonly PercentileTargetModifier[] | undefined,
): PercentileTargetModifier[] {
  if (suppliedModifiers === undefined) return [];
  if (!Array.isArray(suppliedModifiers)) throw new Error("Percentile target modifiers must be an array.");

  return suppliedModifiers.map((modifier, index) => {
    if (modifier === null || typeof modifier !== "object") {
      throw new Error(`Percentile target modifier ${index + 1} is invalid.`);
    }
    if (modifier.kind !== "bonus" && modifier.kind !== "penalty") {
      throw new Error(`Percentile target modifier ${index + 1} must be a bonus or penalty.`);
    }
    if (typeof modifier.label !== "string" || !modifier.label.trim()) {
      throw new Error(`Percentile target modifier ${index + 1} requires a label.`);
    }
    const magnitude = validateBoundedFinite(
      modifier.magnitude,
      `Percentile target modifier ${index + 1} magnitude`,
    );
    if (magnitude < 0) {
      throw new Error(`Percentile target modifier ${index + 1} magnitude must not be negative.`);
    }
    return { kind: modifier.kind, label: modifier.label, magnitude };
  });
}

export function resolvePercentileCheck(input: PercentileResolutionInput): PercentileResolution {
  const resultTotal = validateRollResult(input.resultTotal);
  const originalTarget = validateBoundedFinite(input.originalTarget, "Original percentile target");
  const modifiers = normalizeModifiers(input.modifiers);
  const totalBonuses = modifiers.reduce(
    (total, modifier) => total + (modifier.kind === "bonus" ? modifier.magnitude : 0),
    0,
  );
  const totalPenalties = modifiers.reduce(
    (total, modifier) => total + (modifier.kind === "penalty" ? modifier.magnitude : 0),
    0,
  );
  const finalTarget = originalTarget - totalBonuses + totalPenalties;
  if (!Number.isFinite(finalTarget)) throw new Error("Final percentile target must be finite.");

  const automaticSuccess = finalTarget <= 0;
  const impossibleTarget = finalTarget > 100;
  const mathematicalSuccess = !impossibleTarget && resultTotal >= finalTarget;

  // Successes count from the authored final target, including a zero or negative
  // target. Clamping here would discard valid complete ten-point margins.
  const basicSuccess = mathematicalSuccess;
  const additionalSuccesses = mathematicalSuccess
    ? Math.floor((resultTotal - finalTarget) / 10)
    : 0;
  const totalSuccesses = basicSuccess ? 1 + additionalSuccesses : 0;
  const criticalFailure = resultTotal === 1;
  const criticalSuccess = resultTotal === 100;
  const doubleOtt = criticalSuccess;

  // Roll 01 reverses the final outcome but leaves the underlying success math
  // visible, which is especially important for automatic-success targets.
  const succeeded = !criticalFailure && mathematicalSuccess;
  const rulingReasons: PercentileRulingReason[] = [];
  if (criticalFailure) rulingReasons.push("critical-failure");
  if (criticalSuccess) rulingReasons.push("double-ott-critical-success");
  // Double ott cannot manufacture an ordinary success against an impossible
  // target; reconciling those two states belongs to the G.O.D.
  if (criticalSuccess && impossibleTarget) {
    rulingReasons.push("double-ott-impossible-target-collision");
  }

  return {
    resultTotal,
    originalTarget,
    modifiers,
    totalBonuses,
    totalPenalties,
    finalTarget,
    outcome: succeeded ? "success" : "failure",
    succeeded,
    mathematicalSuccess,
    basicSuccess,
    additionalSuccesses,
    totalSuccesses,
    automaticSuccess,
    impossibleTarget,
    criticalFailure,
    criticalSuccess,
    doubleOtt,
    requiresGodRuling: rulingReasons.length > 0,
    rulingReasons,
  };
}

export function calculatePerSuccessQuantity(
  resolution: PercentileResolution,
  authoredAmountPerSuccess: number,
): PerSuccessQuantity {
  if (!Number.isFinite(authoredAmountPerSuccess)) {
    throw new Error("Authored amount per success must be finite.");
  }
  const successCountApplied = resolution.succeeded ? resolution.totalSuccesses : 0;
  const appliedQuantity = successCountApplied === 0
    ? 0
    : authoredAmountPerSuccess * successCountApplied;
  if (!Number.isFinite(appliedQuantity)) {
    throw new Error("Calculated per-success quantity must be finite.");
  }
  return {
    authoredAmountPerSuccess,
    successCountApplied,
    appliedQuantity,
    requiresGodRuling: resolution.requiresGodRuling,
    rulingReasons: [...resolution.rulingReasons],
  };
}

function hasCriticalResult(resolution: PercentileResolution): boolean {
  return resolution.criticalFailure || resolution.criticalSuccess;
}

function hasImpossibleDoubleOttCollision(resolution: PercentileResolution): boolean {
  return resolution.criticalSuccess && resolution.impossibleTarget;
}

function comparisonRulingReasons(
  attack: PercentileResolution,
  defense: PercentileResolution,
  opposedCriticalCollision: boolean,
): OpposedPercentileRulingReason[] {
  const reasons: OpposedPercentileRulingReason[] = [];
  if (attack.criticalFailure) reasons.push("attacker-critical-failure");
  if (attack.criticalSuccess) reasons.push("attacker-double-ott-critical-success");
  if (hasImpossibleDoubleOttCollision(attack)) {
    reasons.push("attacker-double-ott-impossible-target-collision");
  }
  if (defense.criticalFailure) reasons.push("defender-critical-failure");
  if (defense.criticalSuccess) reasons.push("defender-double-ott-critical-success");
  if (hasImpossibleDoubleOttCollision(defense)) {
    reasons.push("defender-double-ott-impossible-target-collision");
  }
  if (opposedCriticalCollision) reasons.push("opposed-critical-collision");
  return reasons;
}

export function compareAttackAndDefense(
  attack: PercentileResolution,
  defense: PercentileResolution,
): OpposedPercentileComparison {
  const matchingSuccessfulLevels = attack.succeeded
    && defense.succeeded
    && attack.totalSuccesses === defense.totalSuccesses;
  // This is the only approved automatic critical tie exception. Two critical
  // results are left as a collision instead of gaining an invented tie-breaker.
  const attackerDoubleOttTieExceptionUsed = matchingSuccessfulLevels
    && attack.doubleOtt
    && !hasCriticalResult(defense);

  let objectiveOutcome: OpposedObjectiveOutcome;
  if (!attack.succeeded) {
    objectiveOutcome = "neither-side-produced-successful-attack";
  } else if (!defense.succeeded) {
    objectiveOutcome = "attack-wins";
  } else if (attack.totalSuccesses > defense.totalSuccesses || attackerDoubleOttTieExceptionUsed) {
    objectiveOutcome = "attack-wins";
  } else {
    objectiveOutcome = "defense-wins";
  }

  const opposedCriticalCollision = hasImpossibleDoubleOttCollision(attack)
    || hasImpossibleDoubleOttCollision(defense)
    || hasCriticalResult(attack) && hasCriticalResult(defense);
  const rulingReasons = comparisonRulingReasons(attack, defense, opposedCriticalCollision);
  const outcome: OpposedPercentileOutcome = opposedCriticalCollision
    ? "god-ruling-required"
    : objectiveOutcome;
  const winner = outcome === "attack-wins"
    ? "attack"
    : outcome === "defense-wins"
      ? "defense"
      : null;

  return {
    outcome,
    objectiveOutcome,
    winner,
    attackTotalSuccesses: attack.totalSuccesses,
    defenseTotalSuccesses: defense.totalSuccesses,
    attackerCriticalFailure: attack.criticalFailure,
    attackerCriticalSuccess: attack.criticalSuccess,
    attackerDoubleOtt: attack.doubleOtt,
    defenderCriticalFailure: defense.criticalFailure,
    defenderCriticalSuccess: defense.criticalSuccess,
    defenderDoubleOtt: defense.doubleOtt,
    attackerDoubleOttTieExceptionUsed,
    requiresGodRuling: rulingReasons.length > 0,
    rulingReasons,
  };
}
