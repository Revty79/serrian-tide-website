"use server";
import { revalidatePath } from "next/cache";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { executePersistentEvolution, previewPersistentEvolution, readEvolutionHistory, readNextEvolutionPaths, readIndividualEvolutionState, previewPersistentEvolutionReturn, executePersistentEvolutionReturn, hasPersistentEvolutionReceipt } from "@/features/evolutions/evolution-execution-service";
import type { EvolutionExecutionInput, EvolutionReturnInput } from "@/features/evolutions/evolution-execution";
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
  revalidateIndividual(input.characterId);
  return result;
}
export async function getIndividualEvolutionHistory(characterId: number) {
  return readEvolutionHistory(characterId, await actor());
}
export async function getNextEvolutionPaths(kind: EvolutionOwner, characterId: number) {
  return readNextEvolutionPaths(kind, characterId, await actor());
}
function revalidateIndividual(id: number) {
  revalidatePath(`/heavens/characters/${id}`); revalidatePath(`/heavens/npcs/${id}`);
  revalidatePath("/realms/characters/[characterId]", "page");
}
export async function getIndividualEvolutionState(characterId: number) {
  return readIndividualEvolutionState(characterId, await actor());
}
export async function previewEvolutionReturn(kind: EvolutionOwner, characterId: number) {
  return previewPersistentEvolutionReturn(kind, characterId, await actor());
}
export async function commitIndividualEvolution(operation: "evolution" | "return", input: EvolutionExecutionInput | EvolutionReturnInput) {
  const currentActor = await actor();
  try {
    if (operation !== "evolution" && operation !== "return") throw new Error("Choose Evolution or Return.");
    const result = operation === "return"
      ? await executePersistentEvolutionReturn(input as EvolutionReturnInput, currentActor)
      : await executePersistentEvolution(input as EvolutionExecutionInput, currentActor);
    revalidateIndividual(input.characterId); revalidatePath("/heavens/npcs");
    return { ok: true as const, result };
  } catch (reason) {
    const retrySameRequest = await hasPersistentEvolutionReceipt(input.characterId, input.idempotencyKey, currentActor).catch(() => true);
    return { ok: false as const, error: reason instanceof Error ? reason.message : "The transition could not be confirmed.", retrySameRequest };
  }
}
