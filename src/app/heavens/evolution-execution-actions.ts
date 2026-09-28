"use server";
import { revalidatePath } from "next/cache";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { executePersistentEvolution, previewPersistentEvolution, readEvolutionHistory, readNextEvolutionPaths } from "@/features/evolutions/evolution-execution-service";
import type { EvolutionExecutionInput } from "@/features/evolutions/evolution-execution";
import type { EvolutionOwner } from "@/features/evolutions/evolution-requirements";
async function actor() {
  const { session, roles } = await requireGodOrAdminAccessContext();
  return { userId: session.user.id, roles };
}
export async function previewEvolutionExecution(kind: EvolutionOwner, characterId: number, pathId: number) {
  return previewPersistentEvolution(kind, characterId, pathId, await actor());
}
export async function executeEvolution(input: EvolutionExecutionInput) {
  const result = await executePersistentEvolution(input, await actor());
  revalidatePath("/characters"); revalidatePath("/heavens/npcs"); revalidatePath("/heavens/races"); revalidatePath("/heavens/creatures");
  return result;
}
export async function getIndividualEvolutionHistory(characterId: number) {
  return readEvolutionHistory(characterId, await actor());
}
export async function getNextEvolutionPaths(kind: EvolutionOwner, characterId: number) {
  return readNextEvolutionPaths(kind, characterId, await actor());
}
