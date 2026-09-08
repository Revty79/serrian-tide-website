import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { campaignSessionEncounterDeclarationCheckpoint as checkpoint, campaignSessionEncounterParticipant as participant } from "@/db/tabletop-operations-schema";
import type { ActiveManaView } from "@/features/active-state/active-mana";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Public resource reads must not disclose an unrevealed cast through its Mana cost.
 * The internal spending/validation service continues to use actual persisted Mana.
 */
export async function projectSealedCombatManaInTransaction(tx: Transaction, actual: ActiveManaView): Promise<ActiveManaView> {
  const [row] = await tx.select({ before: checkpoint.beforeStateJson }).from(checkpoint)
    .innerJoin(participant, eq(participant.encounterId, checkpoint.encounterId))
    .where(and(eq(participant.characterId, actual.characterId), isNull(checkpoint.revealedAt)))
    .orderBy(asc(checkpoint.id)).limit(1);
  const before = row?.before as { manaBefore?: Record<string, ActiveManaView> } | undefined;
  return before?.manaBefore?.[String(actual.characterId)] ?? actual;
}
