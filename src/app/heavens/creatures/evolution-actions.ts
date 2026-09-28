"use server";
import { revalidatePath } from "next/cache";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { findEvolutionDestinations, readCreatureEvolutionAuthoring, removeCreatureEvolution, reorderCreatureEvolutions, saveCreatureEvolution } from "@/features/creatures/creature-evolution-service";
import type { EvolutionPathInput } from "@/features/creatures/creature-evolutions";

async function actor() {
  const { session, roles } = await requireGodOrAdminAccessContext();
  return { userId: session.user.id, roles };
}

export async function getCreatureEvolutions(sourceCreatureId: number) {
  return readCreatureEvolutionAuthoring(sourceCreatureId, await actor());
}

export async function searchEvolutionDestinations(sourceCreatureId: number, search: string) {
  return findEvolutionDestinations(sourceCreatureId, search, await actor());
}

export async function saveEvolutionPath(input: EvolutionPathInput) {
  const paths = await saveCreatureEvolution(input, await actor());
  revalidatePath("/heavens/creatures");
  return paths;
}

export async function removeEvolutionPath(input: { sourceCreatureId: number; id: number; expectedVersion: number }) {
  const paths = await removeCreatureEvolution(input, await actor());
  revalidatePath("/heavens/creatures");
  return paths;
}

export async function reorderEvolutionPaths(input: { sourceCreatureId: number; paths: Array<{ id: number; version: number }> }) {
  const paths = await reorderCreatureEvolutions(input, await actor());
  revalidatePath("/heavens/creatures");
  return paths;
}
