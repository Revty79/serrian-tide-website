import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { raceEvolutionEvent } from "@/db/evolution-event-schema";

/** Caller authorizes the sheet and supplies its saved race_id, never a new selection. */
export async function isRetainedHistoricalRace(characterId: number, savedRaceId: number): Promise<boolean> {
  const [last] = await db.select({ operation: raceEvolutionEvent.operation, destinationId: raceEvolutionEvent.destinationRaceId })
    .from(raceEvolutionEvent).where(eq(raceEvolutionEvent.characterId, characterId)).orderBy(desc(raceEvolutionEvent.id)).limit(1);
  return last?.operation === "return" && last.destinationId === savedRaceId;
}
