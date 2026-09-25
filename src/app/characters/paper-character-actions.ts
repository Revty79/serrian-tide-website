"use server";

import { getCharacter } from "./actions";
import { db } from "@/db";
import { requireSession } from "@/lib/server-access";
import { readPaperCharacterRuntime } from "@/features/characters/paper-character-service";
import { buildPaperCharacter } from "@/features/characters/paper-character";

/** Uses the same saved-character authorization as the two existing sheet views. */
export async function getPaperCharacterSheet(characterId: number, godMode = false) {
  if (!Number.isSafeInteger(characterId) || characterId <= 0) throw new Error("Choose a saved Character to print.");
  const aggregate = await getCharacter(characterId, godMode);
  const session = await requireSession();
  const runtime = await db.transaction((tx) => readPaperCharacterRuntime(tx, aggregate, session.user.id), {
    isolationLevel: "repeatable read", accessMode: "read only",
  });
  return buildPaperCharacter(aggregate, runtime, new Date().toISOString());
}
