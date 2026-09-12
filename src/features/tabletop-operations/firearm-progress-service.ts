import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { campaignSessionEncounterFirearmAttack as attack, campaignSessionEncounterPendingAction as pending } from "@/db/tabletop-operations-schema";
import type { RuntimeIntegrationTransaction as Tx } from "./runtime-integration-service";
import { completedFirearmPortions } from "./firearm-injury-timing";

export async function readMaturedSustainedFireInTransaction(tx: Tx, encounterId: number) {
  const rows = await tx.select({ id: attack.id, declarationId: attack.triggerDeclarationId, participantId: attack.actorParticipantId,
    status: attack.status, snapshot: attack.frozenSnapshotJson, resolved: attack.firingPortionsResolved, spent: pending.initiativeSpent })
    .from(attack).innerJoin(pending, eq(pending.id, attack.triggerPendingActionId))
    .where(and(eq(attack.encounterId, encounterId), inArray(pending.status, ["active", "completed"])));
  return rows.filter((row) => row.status !== "cancelled" && completedFirearmPortions(row.snapshot, row.spent) > row.resolved
    && (row.snapshot as { delivery?: { kind?: string } })?.delivery?.kind === "sustained");
}
