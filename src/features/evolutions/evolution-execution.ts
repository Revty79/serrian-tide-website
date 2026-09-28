import type { RaceEvolutionTransition, RaceEvolutionIndividualMechanics } from "@/features/races/race-evolution-transition";
import type { ActiveHealthView } from "@/features/active-state/models";
import type { EvolutionEvaluation, EvolutionOwner, EvolutionRequirements } from "./evolution-requirements";

export type EvolutionExecutionInput = {
  kind: EvolutionOwner; characterId: number; pathId: number; expectedVersion: number;
  idempotencyKey: string; reviewToken: string; confirmedRequirementKeys: string[];
  confirmHealthConsequences: boolean; confirmReplaceOverrides: boolean;
};
export type EvolutionDefinitionSummary = { attributes?: string[]; abilities?: string[]; hpMultiplierSteps?: number; baseMovementSteps?: number; baseMagicSteps?: number; size: string; baseMagic: number | null; movement: string[]; attacks: string[]; protections: string[]; skills: string[]; forms: string[]; interactionRules: string[] };
export type EvolutionExecutionPreview = {
  kind: EvolutionOwner; characterId: number; individualName: string; campaignId: number;
  sourceId: number; sourceName: string; destinationId: number; destinationName: string;
  pathId: number; pathName: string; pathVersion: number; reviewToken: string;
  definitionChanges?: { before: EvolutionDefinitionSummary; after: EvolutionDefinitionSummary };
  evaluation: EvolutionEvaluation; requirements: EvolutionRequirements;
  beforeHealth: ActiveHealthView; afterHealth: ActiveHealthView;
  raceTransition?: { authored: RaceEvolutionTransition; before: RaceEvolutionIndividualMechanics; after: RaceEvolutionIndividualMechanics };
  hasIndividualOverrides: boolean; warnings: string[]; blockers: string[];
};
export type EvolutionEventEvidence = Omit<EvolutionExecutionPreview, "reviewToken"> & {
  actorName: string; confirmedRequirementKeys: string[];
  confirmedEvaluation: EvolutionEvaluation; confirmHealthConsequences: boolean; confirmReplaceOverrides: boolean;
};
export type EvolutionHistoryEntry = {
  kind: EvolutionOwner; id: number; characterId: number; executedAt: string; executedByUserId: string;
  evidence: EvolutionEventEvidence;
  snapshots?: { sourceBaseline: string; sourceCurrent: string; destinationBaseline: string; destinationCurrent: string; hpAdjustment: number };
};
export type EvolutionExecutionResult = { event: EvolutionHistoryEntry; replayed: boolean };

/** Canonical object keys prevent JSON serialization order from creating false snapshot edits. */
export function stableEvolutionJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

export function evolutionHealthWarnings(before: ActiveHealthView, after: ActiveHealthView): string[] {
  const warnings: string[] = [];
  if (after.total.maximumHp === null) warnings.push("Destination maximum HP cannot be resolved. Review the destination mechanics before proceeding.");
  if (after.total.maximumHp !== null && before.total.maximumHp !== null && after.total.maximumHp < before.total.maximumHp)
    warnings.push(`Total maximum HP decreases from ${before.total.maximumHp} to ${after.total.maximumHp}. Stored damage remains ${after.totalDamage}.`);
  if (after.total.remainingHp !== null && after.total.remainingHp <= 0)
    warnings.push(`The destination has no remaining total HP with the existing damage (${after.totalDamage}). No healing, death or revival is recorded by Evolution.`);
  for (const track of after.tracks) {
    if (track.orphaned) warnings.push(`${track.name}: ${track.damage} historical damage remains on an orphaned pool (${track.key}).`);
    else if (track.damage > 0 && track.remainingHp === 0) warnings.push(`${track.name}: no remaining pool HP with the existing damage (${track.damage}).`);
  }
  return warnings;
}
