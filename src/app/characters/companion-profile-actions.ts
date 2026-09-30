"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server-access";
import { changeCompanionProfileForActor, readCompanionProfileForActor } from "@/features/creatures/companion-profile-service";
import type { CompanionProfileCommand } from "@/features/creatures/companion-profile";
import { readCompanionTravelHistoryForActor, readVesselCompanionForActor } from "@/features/creatures/companion-management-read-service";

export async function readCompanionTravelHistory(ownerCharacterId: number, creatureCharacterId: number) {
  const session = await requireSession();
  return readCompanionTravelHistoryForActor(ownerCharacterId, creatureCharacterId, session.user.id);
}
export async function readVesselCompanion(holderCharacterId: number, instanceId: number) {
  const session = await requireSession();
  return readVesselCompanionForActor(holderCharacterId, instanceId, session.user.id);
}

export async function readCompanionProfile(ownerCharacterId: number, creatureCharacterId: number) {
  const session = await requireSession();
  return readCompanionProfileForActor(ownerCharacterId, creatureCharacterId, session.user.id);
}
export async function changeCompanionProfile(input: CompanionProfileCommand) {
  const session = await requireSession();
  const result = await changeCompanionProfileForActor(input, session.user.id);
  revalidatePath(`/realms/characters/${input.ownerCharacterId}`);
  revalidatePath(`/heavens/npcs/${input.creatureCharacterId}`);
  revalidatePath("/heavens/npcs");
  return result;
}
