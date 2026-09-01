import "server-only";

import { asc, eq } from "drizzle-orm";

import { item, itemRuntimeProfile } from "@/db/item-schema";
import { campaignCharacterItem } from "@/db/realm-schema";

import {
  DEFAULT_ITEM_RUNTIME_PROFILE,
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
} from "./item-runtime";
import {
  readCharacterItemChargeStateInTransaction,
  type ItemChargeTransaction,
} from "./item-charge-service";
import type { ItemChargeState } from "./item-charge";

export type OperationalItemStack = {
  itemId: number;
  itemName: string;
  catalogScope: "equipment" | "inventory";
  category: string;
  quantity: number;
  runtime: ItemRuntimeProfile;
};

export type CharacterOperationalItemStateView = {
  characterId: number;
  stacks: OperationalItemStack[];
  chargedInstances: ItemChargeState[];
};

function positiveId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Operational Item Character must reference a saved record.");
  return value;
}

function runtimeProfileFromRow(row: {
  useMode: string | null;
  quantityPerUse: number | null;
  maximumCharges: number | null;
  chargesPerUse: number | null;
  rechargeNotes: string | null;
  activationLabel: string | null;
  useNotes: string | null;
}): ItemRuntimeProfile {
  if (row.useMode === null) return { ...DEFAULT_ITEM_RUNTIME_PROFILE };
  const validation = validateItemRuntimeProfile(row);
  if (!validation.valid) throw new Error(validation.issues.map(({ message }) => message).join(" "));
  return validation.profile;
}

/** Read-only composition for inventory resources used by tabletop workspaces. */
export async function readCharacterOperationalItemsInTransaction(
  tx: ItemChargeTransaction,
  characterId: number,
): Promise<CharacterOperationalItemStateView> {
  positiveId(characterId);
  const rows = await tx.select({
    itemId: campaignCharacterItem.itemId,
    itemName: item.name,
    catalogScope: item.catalogScope,
    category: item.category,
    quantity: campaignCharacterItem.quantity,
    useMode: itemRuntimeProfile.useMode,
    quantityPerUse: itemRuntimeProfile.quantityPerUse,
    maximumCharges: itemRuntimeProfile.maximumCharges,
    chargesPerUse: itemRuntimeProfile.chargesPerUse,
    rechargeNotes: itemRuntimeProfile.rechargeNotes,
    activationLabel: itemRuntimeProfile.activationLabel,
    useNotes: itemRuntimeProfile.useNotes,
  }).from(campaignCharacterItem)
    .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
    .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
    .where(eq(campaignCharacterItem.characterId, characterId))
    .orderBy(asc(item.name), asc(item.id));

  const stacks = rows.flatMap((row): OperationalItemStack[] => {
    const runtime = runtimeProfileFromRow(row);
    if (row.catalogScope !== "inventory" && runtime.useMode === "none") return [];
    return [{
      itemId: row.itemId,
      itemName: row.itemName,
      catalogScope: row.catalogScope as OperationalItemStack["catalogScope"],
      category: row.category,
      quantity: row.quantity,
      runtime,
    }];
  });
  const chargeState = await readCharacterItemChargeStateInTransaction(tx, characterId);
  return {
    characterId,
    stacks,
    chargedInstances: chargeState.instances.filter(({ definitionStatus }) => definitionStatus === "charged"),
  };
}
