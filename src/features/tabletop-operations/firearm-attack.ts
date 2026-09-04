import type { PercentileResolution, PercentileTargetModifier } from "./percentile-resolution";

export const FIREARM_ATTACK_STATUSES = [
  "aiming",
  "trigger-ready",
  "committed",
  "fired-awaiting-timing",
  "consequence-planned",
  "requires-god-ruling",
  "cancelled",
] as const;

export type FirearmAttackStatus = (typeof FIREARM_ATTACK_STATUSES)[number];
export type FirearmDeliveryKind = "single" | "burst" | "sustained";

export type FirearmDeliveryPlan = Readonly<{
  kind: FirearmDeliveryKind;
  deliveryCadence: "per-trigger" | "sustained-per-initiative";
  roundsPerCadence: number;
  firingDurationInitiative: number;
  declaredRounds: number;
  requiresGodRuling: boolean;
  rulingReasons: readonly string[];
}>;

export type FirearmBulletAllocation = Readonly<{
  roundsDeclared: number;
  roundsFired: number;
  totalSuccesses: number;
  initialBulletHits: number;
  applicableDefenseReactionIds: readonly number[];
  defenseContributions: readonly FirearmDefenseContribution[];
  defenseSuccesses: number;
  bulletsCancelled: number;
  survivingBulletHits: number;
  overflowSuccesses: number;
  overflowDamage: number;
  criticalFailure: boolean;
  criticalSuccess: boolean;
  doubleOtt: boolean;
  requiresGodRuling: boolean;
  rulingReasons: readonly string[];
}>;

export type FirearmDefenseContribution = Readonly<{
  reactionId: number;
  defenderParticipantId: number;
  defenseRollId: number | null;
  defenseTotalSuccesses: number | null;
  applicable: boolean | null;
  bulletsBefore: number;
  bulletsCancelled: number;
  bulletsAfter: number;
  rulingReasons: readonly string[];
}>;

export type FirearmDefenseAllocationInput = Readonly<{
  reactionId: number;
  defenderParticipantId: number;
  defenseRollId: number | null;
  defenseTotalSuccesses: number | null;
  applicable: boolean | null;
  rulingReasons?: readonly string[];
}>;

export type FirearmBulletDamage = Readonly<{
  authoredBulletDamage: number | null;
  calledShotDexModifier: number;
  calledShotAdditionalSuccessDamage: number;
  grossDamage: number | null;
  armor: number | null;
  soak: number | null;
  netDamage: number | null;
  requiresGodRuling: boolean;
  rulingReasons: readonly string[];
}>;

function whole(value: number, label: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${label} must be a ${allowZero ? "nonnegative" : "positive"} whole number.`);
  }
  return value;
}

function nonnegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} must be a nonzero whole participant key.`);
  return value;
}

/** Derives delivery only from the selected authored mode and declared duration. */
export function planFirearmDelivery(input: {
  deliveryCadence: "per-trigger" | "sustained-per-initiative" | null;
  roundsPerCadence: number | null;
  firingDurationInitiative?: number | null;
  loadedRounds: number;
  targetCount: number;
}): FirearmDeliveryPlan {
  const loadedRounds = whole(input.loadedRounds, "Loaded rounds", true);
  const rulingReasons: string[] = [];
  if (input.deliveryCadence === null || input.roundsPerCadence === null) {
    throw new Error("The selected Firing Mode still requires authored delivery mechanics.");
  }
  const roundsPerCadence = whole(input.roundsPerCadence, "Authored rounds per cadence");
  if (input.targetCount !== 1) rulingReasons.push("Sustained, burst, and single-target firearm automation supports exactly one declared target.");
  const sustained = input.deliveryCadence === "sustained-per-initiative";
  const duration = sustained
    ? whole(input.firingDurationInitiative ?? 0, "Sustained firing duration")
    : 1;
  if (!sustained && input.firingDurationInitiative !== null && input.firingDurationInitiative !== undefined && input.firingDurationInitiative !== 1) {
    rulingReasons.push("A per-trigger mode cannot accept a browser-selected sustained duration.");
  }
  const authoredDurationRounds = roundsPerCadence * duration;
  if (!Number.isSafeInteger(authoredDurationRounds) || authoredDurationRounds <= 0) {
    throw new Error("The authored firearm delivery exceeds the supported whole-round range.");
  }
  if (!sustained && loadedRounds < authoredDurationRounds) {
    throw new Error(`The selected delivery requires ${authoredDurationRounds} rounds, but only ${loadedRounds} are loaded.`);
  }
  const declaredRounds = sustained ? Math.min(authoredDurationRounds, loadedRounds) : authoredDurationRounds;
  if (declaredRounds === 0) throw new Error("Sustained fire requires at least one loaded round.");
  return {
    kind: sustained ? "sustained" : roundsPerCadence === 1 ? "single" : "burst",
    deliveryCadence: input.deliveryCadence,
    roundsPerCadence,
    firingDurationInitiative: duration,
    declaredRounds,
    requiresGodRuling: rulingReasons.length > 0,
    rulingReasons,
  };
}

export function getAimTargetModifier(aimInitiative: number): PercentileTargetModifier | null {
  const amount = whole(aimInitiative, "Aim Initiative", true);
  return amount === 0 ? null : {
    kind: "bonus",
    label: `Aim (${amount} Initiative at -2 target each)`,
    magnitude: amount * 2,
  };
}

export function getCalledShotTargetModifier(input: {
  declared: boolean;
  penalty: number | null;
  reason: string;
}): PercentileTargetModifier | null {
  if (!input.declared) return null;
  if (input.penalty === null || !Number.isFinite(input.penalty) || input.penalty < 0) {
    throw new Error("A Called Shot requires a nonnegative G.O.D.-assigned penalty.");
  }
  if (!input.reason.trim()) throw new Error("A Called Shot penalty requires a G.O.D. reason.");
  return { kind: "penalty", label: "Called Shot", magnitude: input.penalty };
}

export function firearmDeclarationModifiers(input: {
  aimInitiative: number;
  calledShot: { declared: boolean; penalty: number | null; reason: string };
  other?: readonly Readonly<{ label: string; value: number }>[];
}): PercentileTargetModifier[] {
  const result: PercentileTargetModifier[] = [];
  const aim = getAimTargetModifier(input.aimInitiative);
  const called = getCalledShotTargetModifier(input.calledShot);
  if (aim) result.push(aim);
  if (called) result.push(called);
  for (const modifier of input.other ?? []) {
    const label = modifier.label.trim();
    if (!label || !Number.isFinite(modifier.value)) throw new Error("Every firearm modifier requires a label and finite value.");
    result.push({
      kind: modifier.value >= 0 ? "bonus" : "penalty",
      label,
      magnitude: Math.abs(modifier.value),
    });
  }
  return result;
}

export function aimIdentityChanged(
  original: Readonly<{ targetParticipantId: number; itemInstanceId: number; weaponProfileId: number; firingModeId: number; calledShotObjective: string }>,
  next: Readonly<{ targetParticipantId: number; itemInstanceId: number; weaponProfileId: number; firingModeId: number; calledShotObjective: string }>,
): boolean {
  return original.targetParticipantId !== next.targetParticipantId
    || original.itemInstanceId !== next.itemInstanceId
    || original.weaponProfileId !== next.weaponProfileId
    || original.firingModeId !== next.firingModeId
    || original.calledShotObjective.trim() !== next.calledShotObjective.trim();
}

export function parseAuthoredBulletDamage(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function allocateFirearmBullets(input: {
  delivery: FirearmDeliveryPlan;
  resolution: PercentileResolution;
  calledShot: boolean;
  defenses: readonly FirearmDefenseAllocationInput[];
}): FirearmBulletAllocation {
  const rounds = whole(input.delivery.declaredRounds, "Declared rounds");
  const initialBulletHits = input.resolution.succeeded
    ? Math.min(input.resolution.totalSuccesses, rounds)
    : 0;
  const sortedDefenses = [...input.defenses].sort((left, right) => left.reactionId - right.reactionId);
  if (new Set(sortedDefenses.map(({ reactionId }) => reactionId)).size !== sortedDefenses.length) {
    throw new Error("Each defensive Reaction may contribute to firearm allocation only once.");
  }
  let remainingBullets = initialBulletHits;
  let defenseSuccesses = 0;
  const defenseContributions: FirearmDefenseContribution[] = sortedDefenses.map((defense) => {
    const reactionId = whole(defense.reactionId, "Defense Reaction");
    const defenderParticipantId = participantKey(defense.defenderParticipantId, "Defender participant");
    const defenseRollId = defense.defenseRollId === null ? null : whole(defense.defenseRollId, "Defense Roll");
    const defenseTotalSuccesses = defense.defenseTotalSuccesses === null
      ? null
      : whole(defense.defenseTotalSuccesses, "Defense total successes", true);
    const rulingReasons = [...(defense.rulingReasons ?? [])];
    const bulletsBefore = remainingBullets;
    let bulletsCancelled = 0;
    if (defense.applicable === true && defenseTotalSuccesses !== null) {
      defenseSuccesses += defenseTotalSuccesses;
      bulletsCancelled = Math.min(bulletsBefore, defenseTotalSuccesses);
      remainingBullets = Math.max(0, bulletsBefore - bulletsCancelled);
    } else if (defense.applicable === true) {
      rulingReasons.push("The defense is marked applicable but has no objective Pass 1 success count; no bullet cancellation was guessed.");
    } else if (defense.applicable === null && rulingReasons.length === 0) {
      rulingReasons.push("Defense applicability requires a G.O.D. ruling; no bullet cancellation was guessed.");
    }
    return {
      reactionId,
      defenderParticipantId,
      defenseRollId,
      defenseTotalSuccesses,
      applicable: defense.applicable,
      bulletsBefore,
      bulletsCancelled,
      bulletsAfter: remainingBullets,
      rulingReasons: [...new Set(rulingReasons)],
    };
  });
  const applicableDefenseReactionIds = defenseContributions
    .filter(({ applicable, defenseTotalSuccesses }) => applicable === true && defenseTotalSuccesses !== null)
    .map(({ reactionId }) => reactionId);
  const bulletsCancelled = initialBulletHits - remainingBullets;
  const survivingBulletHits = remainingBullets;
  const overflowSuccesses = input.delivery.kind === "single" || !input.resolution.succeeded
    ? 0
    : Math.max(0, input.resolution.totalSuccesses - rounds);
  const rulingReasons = [...new Set([
    ...input.resolution.rulingReasons,
    ...defenseContributions.flatMap(({ rulingReasons: defenseRulings }) => defenseRulings),
    ...input.delivery.rulingReasons,
  ])];
  return {
    roundsDeclared: rounds,
    roundsFired: rounds,
    totalSuccesses: input.resolution.totalSuccesses,
    initialBulletHits,
    applicableDefenseReactionIds,
    defenseContributions,
    defenseSuccesses,
    bulletsCancelled,
    survivingBulletHits,
    overflowSuccesses,
    overflowDamage: input.calledShot && input.delivery.kind !== "single" && survivingBulletHits > 0 ? overflowSuccesses : 0,
    criticalFailure: input.resolution.criticalFailure,
    criticalSuccess: input.resolution.criticalSuccess,
    doubleOtt: input.resolution.doubleOtt,
    requiresGodRuling: rulingReasons.length > 0,
    rulingReasons,
  };
}

export function calculateFirearmBulletDamage(input: {
  authoredBulletDamage: number | null;
  calledShot: boolean;
  deliveryKind: FirearmDeliveryKind;
  dexDamageModifier: number;
  additionalSuccesses: number;
  armor: number | null;
  soak: number | null;
  protectionSupported: boolean;
  rulingReasons?: readonly string[];
}): FirearmBulletDamage {
  const reasons = [...(input.rulingReasons ?? [])];
  const base = input.authoredBulletDamage;
  if (base === null) reasons.push("Authored per-bullet damage is not a positive direct numeric value.");
  const dex = input.calledShot && input.deliveryKind === "single"
    ? input.dexDamageModifier
    : 0;
  const additional = input.calledShot && input.deliveryKind === "single"
    ? whole(input.additionalSuccesses, "Additional successes", true)
    : 0;
  if (!Number.isFinite(dex)) throw new Error("DEX damage modifier must be finite.");
  const armor = input.armor === null ? null : nonnegative(input.armor, "Armor");
  const soak = input.soak === null ? null : nonnegative(input.soak, "Soak");
  if (!input.protectionSupported || armor === null || soak === null) {
    reasons.push("Armor or soak cannot be resolved objectively from the frozen target state.");
  }
  const grossDamage = base === null ? null : Math.max(0, base + dex + additional);
  const netDamage = grossDamage === null || !input.protectionSupported || armor === null || soak === null
    ? null
    : Math.max(0, grossDamage - armor - soak);
  return {
    authoredBulletDamage: base,
    calledShotDexModifier: dex,
    calledShotAdditionalSuccessDamage: additional,
    grossDamage,
    armor,
    soak,
    netDamage,
    requiresGodRuling: reasons.length > 0,
    rulingReasons: [...new Set(reasons)],
  };
}

export function postShotReadinessFromAuthoredTiming(input: {
  effectiveCyclingInitiativeCost: number | null;
  effectiveRecoilResetInitiativeCost: number | null;
}): Readonly<{ requiresCycling: boolean; requiresRecoilRecovery: boolean }> {
  if (input.effectiveCyclingInitiativeCost === null || input.effectiveRecoilResetInitiativeCost === null) {
    throw new Error("Post-shot readiness requires authored effective cycling and recoil timing.");
  }
  return {
    requiresCycling: nonnegative(input.effectiveCyclingInitiativeCost, "Effective cycling Initiative Cost") > 0,
    requiresRecoilRecovery: nonnegative(input.effectiveRecoilResetInitiativeCost, "Effective recoil-reset Initiative Cost") > 0,
  };
}
