"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server-access";
import { readOwnedCreaturesForActor, renameOwnedCreatureForActor } from "@/features/creatures/owned-creature-service";

export async function readOwnedCreatures(ownerCharacterId: number) {
  const session = await requireSession();
  return readOwnedCreaturesForActor(ownerCharacterId, session.user.id);
}
export async function renameOwnedCreature(input: { ownerCharacterId: number; creatureCharacterId: number; name: string }) {
  const session = await requireSession();
  await renameOwnedCreatureForActor(input, session.user.id);
  revalidatePath("/characters", "layout");
  revalidatePath("/heavens/npcs");
}
