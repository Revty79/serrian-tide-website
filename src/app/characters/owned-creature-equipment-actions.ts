"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server-access";
import { changeCompanionEquipmentForActor, readCompanionEquipmentForActor, type CompanionEquipmentCommand } from "@/features/creatures/owned-creature-equipment-service";
export async function readCompanionEquipment(ownerCharacterId: number, creatureCharacterId: number) {
  const session = await requireSession();
  return readCompanionEquipmentForActor(ownerCharacterId, creatureCharacterId, session.user.id);
}
export async function changeCompanionEquipment(command: CompanionEquipmentCommand) {
  const session = await requireSession();
  const result = await changeCompanionEquipmentForActor(command, session.user.id);
  revalidatePath(`/realms/characters/${command.ownerCharacterId}`);
  revalidatePath(`/heavens/characters/${command.ownerCharacterId}`);
  revalidatePath(`/heavens/npcs/${command.creatureCharacterId}`);
  return result;
}
