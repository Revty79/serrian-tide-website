"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server-access";
import { readOwnedCreaturesForActor, renameOwnedCreatureForActor } from "@/features/creatures/owned-creature-service";
import { readCompanionDispositionForActor, changeCompanionDispositionForActor } from "@/features/creatures/companion-disposition-service";
import type { CompanionDispositionCommand } from "@/features/creatures/companion-disposition";

export async function readCompanionDisposition(ownerCharacterId: number, creatureCharacterId: number) {
  const session = await requireSession();
  return readCompanionDispositionForActor(ownerCharacterId, creatureCharacterId, session.user.id);
}
export async function changeCompanionDisposition(input: CompanionDispositionCommand) {
  const session = await requireSession();
  const result = await changeCompanionDispositionForActor(input, session.user.id);
  revalidatePath(`/realms/characters/${input.ownerCharacterId}`);
  revalidatePath(`/heavens/npcs/${input.creatureCharacterId}`);
  revalidatePath("/heavens/npcs");
  return result;
}

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
