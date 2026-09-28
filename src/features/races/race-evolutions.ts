/** Definition authoring DTOs. Never part of an individual Race snapshot. */
import type { EvolutionRequirementMode } from "@/features/evolutions/evolution-requirements";
export type EvolutionDestination = {
  id: number;
  name: string;
  parentRaceId: number | null;
  parentRaceName: string | null;
  archived: boolean;
};

export type RaceEvolutionPath = {
  id: number;
  sourceRaceId: number;
  destinationRaceId: number;
  name: string;
  description: string;
  notes: string;
  sortOrder: number;
  version: number;
  requirementMode: EvolutionRequirementMode;
  destination: EvolutionDestination;
};

export type EvolutionPathInput = {
  sourceRaceId: number;
  id?: number;
  expectedVersion?: number;
  destinationRaceId: number;
  name: string;
  description: string;
  notes: string;
};

export function requireEvolutionId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must identify a saved record.`);
  return value;
}

export function normalizeEvolutionPath(input: EvolutionPathInput) {
  const sourceRaceId = requireEvolutionId(input.sourceRaceId, "Source Race");
  const destinationRaceId = requireEvolutionId(input.destinationRaceId, "Destination Race");
  if (sourceRaceId === destinationRaceId) throw new Error("A Race cannot evolve directly into itself.");
  if (input.id !== undefined) {
    requireEvolutionId(input.id, "Evolution path");
    requireEvolutionId(input.expectedVersion!, "Evolution version");
  }
  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("Evolution name is required.");
  if (typeof input.description !== "string" || typeof input.notes !== "string") throw new Error("Evolution description and notes must be text.");
  return { sourceRaceId, destinationRaceId, name: input.name.trim(), description: input.description.trim(), notes: input.notes.trim() };
}

export function evolutionDestinationLabel(target: EvolutionDestination): string {
  return `${target.name} (#${target.id})${target.parentRaceId ? ` — Variant of ${target.parentRaceName ?? `Race #${target.parentRaceId}`}` : ""}${target.archived ? " — Archived" : ""}`;
}
