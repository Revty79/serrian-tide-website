/** Definition authoring DTOs. Never part of an individual Creature snapshot. */
export type EvolutionDestination = {
  id: number;
  canonicalId: string;
  canonicalName: string;
  parentCreatureId: number | null;
  parentCreatureName: string | null;
  archived: boolean;
};

export type CreatureEvolutionPath = {
  id: number;
  sourceCreatureId: number;
  destinationCreatureId: number;
  name: string;
  description: string;
  notes: string;
  sortOrder: number;
  version: number;
  destination: EvolutionDestination;
};

export type EvolutionPathInput = {
  sourceCreatureId: number;
  id?: number;
  expectedVersion?: number;
  destinationCreatureId: number;
  name: string;
  description: string;
  notes: string;
};

export function requireEvolutionId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must identify a saved record.`);
  return value;
}

export function normalizeEvolutionPath(input: EvolutionPathInput) {
  const sourceCreatureId = requireEvolutionId(input.sourceCreatureId, "Source Creature");
  const destinationCreatureId = requireEvolutionId(input.destinationCreatureId, "Destination Creature");
  if (sourceCreatureId === destinationCreatureId) throw new Error("A Creature cannot evolve directly into itself.");
  if (input.id !== undefined) {
    requireEvolutionId(input.id, "Evolution path");
    requireEvolutionId(input.expectedVersion!, "Evolution version");
  }
  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("Evolution name is required.");
  if (typeof input.description !== "string" || typeof input.notes !== "string") throw new Error("Evolution description and notes must be text.");
  return { sourceCreatureId, destinationCreatureId, name: input.name.trim(), description: input.description.trim(), notes: input.notes.trim() };
}

export function evolutionDestinationLabel(target: EvolutionDestination): string {
  return `${target.canonicalName} (#${target.id}; ${target.canonicalId})${target.parentCreatureId ? ` — Variant of ${target.parentCreatureName ?? `Creature #${target.parentCreatureId}`}` : ""}${target.archived ? " — Archived" : ""}`;
}
