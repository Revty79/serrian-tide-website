import { combatObject as object } from "./combat-condition-state";

// Stable imported source identities, verified against the supplied catalog.
// Names/descriptions on a personal formula never authorize resurrection.
export const RECOVERY_SPELL_SOURCES = {
  wellspring: "skill-28b72a29a435d069e1f7d2c444065a44bb3cb2c7be800f553fab9fc88df113c9",
  cycle: "skill-061f2434f971f446faa1faa0de29cf8016bd8f6966cfd50580dd4c625d53cd80",
} as const;
export function combatRecoverySpellAuthority(authored: Record<string, unknown>) {
  const casting = object(authored.casting);
  const level = String(casting.activeProgressiveTier ?? object(casting.caster).practitionerLevel);
  const rank = ["Apprentice", "Novice", "Master", "High Master", "Grand Master"].indexOf(level);
  if (authored.catalogSourceId === RECOVERY_SPELL_SOURCES.wellspring) return {
    name: "Vital Wellspring", level, reviveHp: rank === 4 ? 1 : null,
    maximumRevivedTargets: 1, temporary: false, conditionRemoval: rank >= 1,
    explanation: "Only Grand Master revives one fallen ally at 1 HP. Poison/disease cleansing starts at Novice. Imported progression has no structured changes: exact recovery requires a source-linked G.O.D. ruling.",
  };
  if (authored.catalogSourceId === RECOVERY_SPELL_SOURCES.cycle) return {
    name: "Cycle of Rebirth", level, reviveHp: rank >= 3 ? 5 : null,
    maximumRevivedTargets: null, temporary: true, conditionRemoval: false,
    explanation: "High Master: temporary revival at 5 HP. Imported lingering duration and end-of-spell stabilization save lack executable mechanics; G.O.D. must rule on this exact cast's duration and stabilization.",
  };
  return null;
}
