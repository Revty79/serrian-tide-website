export const CREATURE_CR_IMPACT_POINTS = {
  None: 0,
  Minor: 1,
  Moderate: 3,
  Major: 6,
  Extreme: 10,
} as const;

export type CreatureCrImpact = keyof typeof CREATURE_CR_IMPACT_POINTS;

export type ChallengeRatingReferenceLike = {
  challengeRating: number;
  attackTargetGuidance: string;
  damageGuidance: string;
  initiativeGuidance: string;
  soakGuidance: string;
  killXp: number | null;
};

export type ChallengeRatingCreatureLike = {
  core: { challengeRatingAdjustment: number };
  attacks: Array<{ attackPercentage: number | null; damage: string | null }>;
  movement: Array<{ initiative: number | null }>;
  hitLocations: Array<{ naturalArmor: number | null; soak: number | null }>;
  abilities: Array<{ crImpact: CreatureCrImpact }>;
  defenses: Array<{ crImpact: CreatureCrImpact }>;
};

export type ChallengeRatingBreakdown = {
  accuracyRating: number | null;
  damageRating: number | null;
  offenseRating: number;
  defenseRating: number;
  initiativeRating: number | null;
  mobilityBonus: number;
  specialImpact: number;
  calculatedRating: number;
  adjustment: number;
  finalRating: number;
  killXp: number;
};

const clampRating = (value: number) => Math.min(50, Math.max(1, Math.round(value)));

function numericRange(value: string): [number, number] | null {
  const matches = value.match(/-?\d+(?:\.\d+)?/g);
  if (!matches?.length) return null;
  const values = matches.map(Number).filter(Number.isFinite);
  if (!values.length) return null;
  return [Math.min(...values), Math.max(...values)];
}

function ratingForValue(
  value: number | null,
  references: ChallengeRatingReferenceLike[],
  guidance: (reference: ChallengeRatingReferenceLike) => string,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const candidates = references.flatMap((reference) => {
    const range = numericRange(guidance(reference));
    if (!range) return [];
    const [minimum, maximum] = range;
    const distance = value < minimum ? minimum - value : value > maximum ? value - maximum : 0;
    const midpointDistance = Math.abs(value - ((minimum + maximum) / 2));
    return [{ rating: reference.challengeRating, distance, midpointDistance }];
  });
  candidates.sort((left, right) =>
    left.distance - right.distance ||
    left.midpointDistance - right.midpointDistance ||
    left.rating - right.rating,
  );
  return candidates[0]?.rating ?? null;
}

function damageValue(value: string | null): number | null {
  if (!value?.trim()) return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function average(values: Array<number | null>): number {
  const defined = values.filter((value): value is number => value !== null);
  return defined.length
    ? clampRating(defined.reduce((sum, value) => sum + value, 0) / defined.length)
    : 1;
}

export function calculateCreatureChallengeRating(
  creature: ChallengeRatingCreatureLike,
  references: ChallengeRatingReferenceLike[],
): ChallengeRatingBreakdown {
  const attackPercentages = creature.attacks
    .map((attack) => attack.attackPercentage)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const damageValues = creature.attacks
    .map((attack) => damageValue(attack.damage))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const initiatives = creature.movement
    .map((movement) => movement.initiative)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const protectionValues = creature.hitLocations
    .map((location) => Math.max(location.naturalArmor ?? 0, location.soak ?? 0))
    .filter(Number.isFinite);

  const bestAttackPercentage = attackPercentages.length ? Math.min(...attackPercentages) : null;
  const highestDamage = damageValues.length ? Math.max(...damageValues) : null;
  const highestInitiative = initiatives.length ? Math.max(...initiatives) : null;
  const highestProtection = protectionValues.length ? Math.max(...protectionValues) : 0;

  const accuracyRating = ratingForValue(bestAttackPercentage, references, (row) => row.attackTargetGuidance);
  const damageRating = ratingForValue(highestDamage, references, (row) => row.damageGuidance);
  const offenseRating = average([accuracyRating, damageRating]);
  const defenseRating = ratingForValue(highestProtection, references, (row) => row.soakGuidance) ?? 1;
  const initiativeRating = ratingForValue(highestInitiative, references, (row) => row.initiativeGuidance);
  const mechanicalBaseline = Math.max(1, offenseRating, defenseRating);
  const mobilityBonus = initiativeRating && initiativeRating > mechanicalBaseline
    ? Math.min(3, Math.ceil((initiativeRating - mechanicalBaseline) * 0.1))
    : 0;
  const specialImpact = Math.min(
    20,
    [
      ...creature.abilities.map((ability) => CREATURE_CR_IMPACT_POINTS[ability.crImpact]),
      ...creature.defenses.map((defense) => CREATURE_CR_IMPACT_POINTS[defense.crImpact]),
    ].reduce<number>((sum, value) => sum + value, 0),
  );
  const calculatedRating = clampRating(mechanicalBaseline + mobilityBonus + specialImpact);
  const adjustment = Math.min(49, Math.max(-49, Math.trunc(creature.core.challengeRatingAdjustment)));
  const finalRating = clampRating(calculatedRating + adjustment);
  const killXp = references.find((reference) => reference.challengeRating === finalRating)?.killXp ?? 1;

  return {
    accuracyRating,
    damageRating,
    offenseRating,
    defenseRating,
    initiativeRating,
    mobilityBonus,
    specialImpact,
    calculatedRating,
    adjustment,
    finalRating,
    killXp,
  };
}
