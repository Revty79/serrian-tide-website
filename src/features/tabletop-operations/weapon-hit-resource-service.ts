import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { campaignCharacterItemInstance } from "@/db/realm-schema";
import { itemPowerResource } from "@/db/item-schema";
import type { FrozenActionSourceSnapshot } from "./action-effect-bridge";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Optional riders share the exact copy's pool in authored order. No Charges are
 * spent here; the instance lock is held through the eventual atomic application. */
export async function unavailableWeaponHitPowers(tx: Transaction, identity: { characterId: number; itemId: number; instanceId: number | null },
  costs: readonly { powerId: number; amount: number | null }[]) {
  if (!costs.length) return new Map<number, string>();
  const [row] = identity.instanceId === null ? [] : await tx.select({ charges: campaignCharacterItemInstance.currentCharges })
    .from(campaignCharacterItemInstance).innerJoin(itemPowerResource, eq(itemPowerResource.itemId, campaignCharacterItemInstance.itemId))
    .where(and(eq(campaignCharacterItemInstance.id, identity.instanceId), eq(campaignCharacterItemInstance.characterId, identity.characterId),
      eq(campaignCharacterItemInstance.itemId, identity.itemId), isNull(campaignCharacterItemInstance.retiredAt)))
    .limit(1).for("update", { of: campaignCharacterItemInstance });
  let remaining = row?.charges ?? 0;
  const skipped = new Map<number, string>();
  for (const cost of costs) {
    if (!row || cost.amount === null || !Number.isSafeInteger(cost.amount) || cost.amount <= 0 || cost.amount > remaining) {
      skipped.set(cost.powerId, "Optional Weapon-Hit Power skipped: its exact Item instance cannot pay the authored Charges. The base attack still resolves.");
    } else remaining -= cost.amount;
  }
  return skipped;
}

export async function availableWeaponHitSource(tx: Transaction, source: FrozenActionSourceSnapshot) {
  const costs = source.resourceCosts.flatMap((cost) => {
    const match = /^item-power:(\d+):charges$/.exec(cost.key);
    return match ? [{ powerId: Number(match[1]), amount: cost.amount }] : [];
  });
  const skipped = await unavailableWeaponHitPowers(tx, { characterId: source.ownerParticipantId,
    itemId: Number(source.authoredData.itemPowerItemId), instanceId: source.sourceInstanceId }, costs);
  const retained = (key: string) => !skipped.has(Number(/^item-power:(\d+):/.exec(key)?.[1]));
  return { skipped, source: { ...source, effects: source.effects.filter(({ key }) => retained(key)),
    resourceCosts: source.resourceCosts.filter(({ key }) => retained(key)) } };
}
