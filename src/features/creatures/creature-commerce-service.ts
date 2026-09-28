import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { creature } from "@/db/creature-schema";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { shopOffering } from "@/db/shop-schema";
import { shopResaleCreature, shopTransactionCreature } from "@/db/tabletop-shop-visit-schema";
import { createOwnedCreatureInTransaction, setCreatureOwnerInTransaction } from "./creature-ownership-service";
import type { CreatureNpcConstructorTransaction as Transaction } from "./creature-npc-constructor-service";

export type CreatureFulfillment = "inventory-transfer" | "service-narrative" | "creature-transfer";
export function creatureFulfillment(authored: string, grantId: number | null): CreatureFulfillment {
  return authored === "service-narrative" ? "service-narrative" : grantId === null ? "inventory-transfer" : "creature-transfer";
}

/** Called only inside the authorized commerce transaction, after the Campaign lock. */
export async function readSaleCreature(tx: Transaction, campaignId: number, ownerId: number, id: number, grantId: number | null) {
  const [row] = await tx.select({ id: campaignCharacter.id, name: campaignCharacter.name, creatureId: campaignCreatureNpcProfile.creatureId })
    .from(campaignCharacter).innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .where(and(eq(campaignCharacter.id, id), eq(campaignCharacter.campaignId, campaignId), eq(campaignCharacter.ownerCharacterId, ownerId),
      eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature"), isNull(campaignCharacter.archivedAt)))
    .for("update", { of: campaignCharacter });
  if (!row || grantId === null || row.creatureId !== grantId) throw new Error("Choose an owned, active Creature and an Item explicitly granting its exact definition.");
  return row;
}

export async function readResaleCreature(tx: Transaction, campaignId: number, shopId: number, itemId: number, resaleId: number, grantId: number | null) {
  const [row] = await tx.select({ id: shopResaleCreature.id, characterId: campaignCharacter.id, name: campaignCharacter.name, creatureId: campaignCreatureNpcProfile.creatureId })
    .from(shopResaleCreature).innerJoin(campaignCharacter, eq(campaignCharacter.id, shopResaleCreature.creatureCharacterId))
    .innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .where(and(eq(shopResaleCreature.id, resaleId), eq(shopResaleCreature.campaignId, campaignId), eq(shopResaleCreature.shopId, shopId),
      eq(shopResaleCreature.itemId, itemId), eq(shopResaleCreature.status, "in-stock"), isNull(campaignCharacter.ownerCharacterId), isNull(campaignCharacter.archivedAt)))
    .for("update", { of: shopResaleCreature });
  if (!row || grantId === null || row.creatureId !== grantId) throw new Error("That exact Creature is no longer available from this listing. Refresh the Shop.");
  return row;
}

type Context = { campaignId: number; shopId: number; characterId: number; ownerUserId: string; soldItemHandling: string };
type CreatureLine = { itemId: number; grantedCreatureId: number | null; creatureCharacterId: number | null; resaleCreatureId: number | null; quantity: number };
export async function purchaseCreatures(tx: Transaction, context: Context, line: CreatureLine, transactionId: number): Promise<number[]> {
  if (!line.grantedCreatureId) throw new Error("Creature purchase requires an explicit grant definition.");
  if (line.resaleCreatureId) {
    const resale = await readResaleCreature(tx, context.campaignId, context.shopId, line.itemId, line.resaleCreatureId, line.grantedCreatureId);
    if (line.quantity !== 1 || line.creatureCharacterId !== resale.characterId) throw new Error("Exact Creature purchase identity changed.");
    await tx.update(shopResaleCreature).set({ status: "sold", soldTransactionId: transactionId, updatedAt: new Date() }).where(eq(shopResaleCreature.id, resale.id));
    await setCreatureOwnerInTransaction(tx, { campaignId: context.campaignId, characterId: resale.characterId, ownerCharacterId: context.characterId, expectedOwnerCharacterId: null });
    return [resale.characterId];
  }
  const ids: number[] = [];
  for (let index = 0; index < line.quantity; index++) ids.push(await createOwnedCreatureInTransaction(tx, {
    campaignId: context.campaignId, controllerUserId: context.ownerUserId, ownerCharacterId: context.characterId, creatureId: line.grantedCreatureId,
  }));
  return ids;
}

export async function sellCreature(tx: Transaction, context: Context, line: CreatureLine, transactionId: number, actorUserId: string) {
  if (!line.creatureCharacterId || line.quantity !== 1) throw new Error("Sell one exact Creature per selection.");
  const individual = await readSaleCreature(tx, context.campaignId, context.characterId, line.creatureCharacterId, line.grantedCreatureId);
  await setCreatureOwnerInTransaction(tx, { campaignId: context.campaignId, characterId: individual.id, ownerCharacterId: null, expectedOwnerCharacterId: context.characterId });
  if (context.soldItemHandling === "add-to-shop-stock") {
    const [existing] = await tx.select().from(shopOffering).where(and(eq(shopOffering.shopId, context.shopId), eq(shopOffering.itemId, line.itemId))).for("update");
    if (existing?.fulfillmentKind === "service-narrative") throw new Error("A service listing cannot hold a Creature for resale.");
    if (!existing) await tx.insert(shopOffering).values({ campaignId: context.campaignId, shopId: context.shopId, itemId: line.itemId, enabled: true, unlimitedStock: false, limitedQuantity: 0, fulfillmentKind: "inventory-transfer" });
    await tx.insert(shopResaleCreature).values({ campaignId: context.campaignId, shopId: context.shopId, itemId: line.itemId, creatureCharacterId: individual.id, sourceCharacterId: context.characterId, acquiredTransactionId: transactionId });
  } else {
    // This internal path runs only when an approved sale executes. It does not grant Players lifecycle access.
    const reason = `Removed from active play by completed Shop sale #${transactionId}.`;
    await tx.update(campaignCharacter).set({ archivedAt: new Date(), archivedByUserId: actorUserId, archiveReason: reason, updatedAt: new Date() }).where(eq(campaignCharacter.id, individual.id));
    await tx.insert(lifecycleAuditEvent).values({ action: "archive", entityKind: "creature-npc", targetId: String(individual.id), targetName: individual.name,
      campaignIdSnapshot: context.campaignId, ownerUserIdSnapshot: context.ownerUserId, actorUserId, reason, dependencySummaryJson: { shopTransactionId: transactionId } });
  }
  return individual.id;
}

export async function recordCreatureReceipt(tx: Transaction, campaignId: number, transactionLineId: number, ids: readonly number[]) {
  for (const id of ids) {
    const [row] = await tx.select({ name: campaignCharacter.name, creatureId: campaignCreatureNpcProfile.creatureId }).from(campaignCharacter)
      .innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id)).where(eq(campaignCharacter.id, id));
    if (!row) throw new Error("Creature receipt identity is missing.");
    await tx.insert(shopTransactionCreature).values({ campaignId, transactionLineId, creatureCharacterId: id, creatureId: row.creatureId, nameSnapshot: row.name });
  }
}

export async function assertActiveGrant(tx: Transaction, id: number) {
  const [row] = await tx.select({ id: creature.id }).from(creature).where(and(eq(creature.id, id), isNull(creature.archivedAt))).for("share");
  if (!row) throw new Error("The granted Creature definition is archived or unavailable.");
}
