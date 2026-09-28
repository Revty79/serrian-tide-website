"use server";
import { revalidatePath } from "next/cache";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { findEvolutionDestinations, readRaceEvolutionAuthoring, removeRaceEvolution, reorderRaceEvolutions, saveRaceEvolution } from "@/features/races/race-evolution-service";
import type { EvolutionPathInput } from "@/features/races/race-evolutions";
import { readEvolutionRequirementAuthoring, saveEvolutionRequirements } from "@/features/races/race-evolution-service";
import type { EvolutionRequirements } from "@/features/evolutions/evolution-requirements";
import { listRaceEvolutionPreviewIndividuals, previewRaceEvolutionForActor } from "@/features/races/evolution-eligibility-service";

async function actor() {
  const { session, roles } = await requireGodOrAdminAccessContext();
  return { userId: session.user.id, roles };
}

export async function getRaceEvolutions(sourceRaceId: number) {
  return readRaceEvolutionAuthoring(sourceRaceId, await actor());
}

export async function searchEvolutionDestinations(sourceRaceId: number, search: string) {
  return findEvolutionDestinations(sourceRaceId, search, await actor());
}

export async function saveEvolutionPath(input: EvolutionPathInput) {
  const paths = await saveRaceEvolution(input, await actor());
  revalidatePath("/heavens/races");
  return paths;
}

export async function removeEvolutionPath(input: { sourceRaceId: number; id: number; expectedVersion: number }) {
  const paths = await removeRaceEvolution(input, await actor());
  revalidatePath("/heavens/races");
  return paths;
}

export async function reorderEvolutionPaths(input: { sourceRaceId: number; paths: Array<{ id: number; version: number }> }) {
  const paths = await reorderRaceEvolutions(input, await actor());
  revalidatePath("/heavens/races");
  return paths;
}

export async function getEvolutionRequirements(sourceRaceId: number, pathId: number) {
  return readEvolutionRequirementAuthoring(sourceRaceId, pathId, await actor());
}
export async function saveEvolutionPathRequirements(input: { sourceRaceId: number; pathId: number; expectedVersion: number; requirements: EvolutionRequirements }) {
  const paths = await saveEvolutionRequirements(input, await actor());
  revalidatePath("/heavens/races");
  return paths;
}
export async function findEvolutionPreviewIndividuals(sourceRaceId: number, search: string) {
  return listRaceEvolutionPreviewIndividuals(sourceRaceId, search, await actor());
}
export async function previewEvolutionEligibility(characterId: number, pathId: number) {
  return previewRaceEvolutionForActor(characterId, pathId, await actor());
}
