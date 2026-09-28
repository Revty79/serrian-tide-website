export * from "@/features/evolutions/evolution-requirements";
import { evaluateEvolutionGroups, type EvolutionRequirements, type EvolutionEvaluation } from "@/features/evolutions/evolution-requirements";
import { creatureFormAccessContext } from "@/features/forms/form-access-context";
import type { CreatureDraft } from "./models";
export type EvolutionEligibility = EvolutionEvaluation & { owner: "creature"; pathId: number; pathVersion: number; sourceCreatureId: number; destinationCreatureId: number };
export type EvolutionFacts = {
  sourceCreatureId: number; snapshot: CreatureDraft; age: number | null; currentExperience: number | null; totalExperience: number | null;
  ownerPresent: boolean; creatureItemIds: ReadonlySet<number> | null; ownerItemIds: ReadonlySet<number> | null; conditionNames: readonly string[];
};
export function evaluateEvolutionRequirements(path: { id: number; version: number; sourceCreatureId: number; destinationCreatureId: number; destinationArchived: boolean; sourceArchived?: boolean; individualArchived?: boolean }, input: EvolutionRequirements, facts: EvolutionFacts): EvolutionEligibility {
  if (path.sourceCreatureId !== facts.sourceCreatureId) throw new Error("Evolution path does not belong to this individual's current Creature definition.");
  const base = { owner: "creature" as const, pathId: path.id, pathVersion: path.version, sourceCreatureId: path.sourceCreatureId, destinationCreatureId: path.destinationCreatureId };
  try {
    const snapshot = facts.snapshot;
    if (snapshot.id !== facts.sourceCreatureId || !Array.isArray(snapshot.skillLinks) || !Array.isArray(snapshot.abilities)
      || snapshot.skillLinks.some(row => !Number.isSafeInteger(row.skillId) || row.skillId <= 0)
      || snapshot.abilities.some(row => typeof row.canonicalId !== "string" || !row.canonicalId.trim())) throw new Error("The current individual snapshot needs correction.");
    return { ...base, ...evaluateEvolutionGroups(input, { ...facts, owner: "creature", unavailable: path.destinationArchived || path.sourceArchived || path.individualArchived,
      context: creatureFormAccessContext(snapshot), forms: snapshot.forms?.filter(form => form.creatureId === facts.sourceCreatureId), individualItemIds: facts.creatureItemIds }) };
  } catch(error) { return { ...base, status: "not-eligible", explanation: `Eligibility needs correction: ${error instanceof Error ? error.message : "Invalid snapshot."}`, groups: [] }; }
}
