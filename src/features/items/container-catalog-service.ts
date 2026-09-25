import "server-only";
import { eq, isNull, and } from "drizzle-orm";
import type { db } from "@/db";
import { containerProfile } from "@/db/container-schema";
import { item } from "@/db/item-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Internal catalog operation; call only after authorizing Item editing. No Player endpoint in Pass 1. */
export async function setContainerProfileInTransaction(tx: Transaction, itemId: number, enabled: boolean) {
  if (!Number.isSafeInteger(itemId) || itemId <= 0 || typeof enabled !== "boolean") throw new Error("Choose a saved Item and whether it is a container.");
  const [model] = await tx.select({ id: item.id }).from(item).where(and(eq(item.id, itemId), isNull(item.archivedAt))).for("update");
  if (!model) throw new Error("Restore or save this Item before changing its container profile.");
  const [existing] = await tx.select().from(containerProfile).where(eq(containerProfile.itemId, itemId));
  if (enabled === !!existing) return;
  if (enabled) {
    const [stack] = await tx.select({ itemId: campaignCharacterItem.itemId }).from(campaignCharacterItem).where(eq(campaignCharacterItem.itemId, itemId)).limit(1);
    if (stack) throw new Error("Existing stack ownership cannot be converted automatically. Resolve it before defining this Item as a container.");
    await tx.insert(containerProfile).values({ itemId });
  } else {
    const [copy] = await tx.select({ id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.itemId, itemId)).limit(1);
    if (copy) throw new Error("Keep the container profile while owned copy records exist.");
    await tx.delete(containerProfile).where(eq(containerProfile.itemId, itemId));
  }
}
