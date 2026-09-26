import "server-only";
import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { race } from "@/db/race-schema";
import { readRaceFormsInTransaction } from "./race-form-service";
import { readRaceNaturalAttacksInTransaction } from "./race-natural-attack-service";
import { readRaceNaturalProtectionInTransaction } from "./race-natural-protection-service";
import type { CharacterRaceAggregate } from "@/features/characters/models";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Authorized exact-Race read. Never walks the Race family or initializes runtime state. */
export async function readRaceFormPreviewInTransaction(tx: Transaction, raceId: number): Promise<CharacterRaceAggregate["formPreview"]> {
  const forms = await readRaceFormsInTransaction(tx, raceId);
  if (!forms.length) return undefined;
  const [row] = await tx.select({ interactionRules: race.interactionRules }).from(race).where(eq(race.id, raceId));
  return { forms, naturalAttacks: await readRaceNaturalAttacksInTransaction(tx, raceId), naturalProtections: await readRaceNaturalProtectionInTransaction(tx, raceId), interactionRules: row?.interactionRules ?? null };
}
