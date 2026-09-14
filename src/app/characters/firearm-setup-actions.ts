"use server";
import { db } from "@/db";
import { requireSession } from "@/lib/server-access";
import { prepareCharacterFirearm, readCharacterFirearmSetup } from "@/features/items/firearm-setup-service";
import { publishCharacterStateInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
export async function readFirearmSetup(characterId: number) {
  const session = await requireSession();
  return db.transaction((tx) => readCharacterFirearmSetup(tx, characterId, session.user.id));
}
export async function prepareFirearmSetup(command: Parameters<typeof prepareCharacterFirearm>[2]) {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    await prepareCharacterFirearm(tx, session.user.id, command);
    await publishCharacterStateInvalidationInTransaction(tx, command.characterId);
    return readCharacterFirearmSetup(tx, command.characterId, session.user.id);
  });
}
