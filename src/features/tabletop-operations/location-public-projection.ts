import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { shop, shopStaffAssignment } from "@/db/shop-schema";
import {
  campaignSessionSceneShop,
  campaignSessionSceneTown,
  campaignSessionSceneTownNpc,
  campaignSessionSceneTownPlace,
  campaignSessionSceneTownShop,
} from "@/db/tabletop-location-schema";
import { town, townPlace } from "@/db/town-schema";

export type PublicSceneLocationDirectory = Readonly<{
  towns: readonly {
    id: number;
    name: string;
    category: string;
    overview: string;
    shops: readonly {
      id: number;
      name: string;
      category: string;
      description: string;
      storefrontState: "open" | "closed";
      staff: readonly {
        npcCharacterId: number;
        name: string;
        roleLabel: string;
        responsibilityLabel: string;
        isPrimaryContact: boolean;
      }[];
    }[];
    places: readonly {
      id: number;
      name: string;
      category: string;
      description: string;
    }[];
    npcs: readonly {
      id: number;
      name: string;
      roleLabel: string;
      relationshipLabel: string;
    }[];
  }[];
  shops: readonly {
    id: number;
    name: string;
    category: string;
    description: string;
    storefrontState: "open" | "closed";
  }[];
}>;

export type PublicLocationProjectionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readPublicSceneLocationDirectoryInTransaction(
  tx: PublicLocationProjectionTransaction,
  input: { sceneId: number; sessionId: number; campaignId: number },
): Promise<PublicSceneLocationDirectory> {
  const hierarchy = and(
    eq(campaignSessionSceneTown.sceneId, input.sceneId),
    eq(campaignSessionSceneTown.sessionId, input.sessionId),
    eq(campaignSessionSceneTown.campaignId, input.campaignId),
    eq(campaignSessionSceneTown.revealed, true),
  );
  const townRows = await tx.select({
    id: town.id,
    name: town.name,
    category: town.category,
    overview: town.overview,
    sortOrder: campaignSessionSceneTown.sortOrder,
  }).from(campaignSessionSceneTown)
    .innerJoin(town, and(
      eq(town.id, campaignSessionSceneTown.townId),
      eq(town.campaignId, campaignSessionSceneTown.campaignId),
    ))
    .where(hierarchy)
    .orderBy(asc(campaignSessionSceneTown.sortOrder), asc(town.name), asc(town.id));
  const revealedTownIds = townRows.map(({ id }) => id);
  const townShops = revealedTownIds.length ? await tx.select({
    townId: campaignSessionSceneTownShop.townId,
    id: shop.id,
    name: shop.name,
    category: shop.category,
    description: shop.description,
    storefrontState: shop.storefrontState,
    sortOrder: campaignSessionSceneTownShop.sortOrder,
  }).from(campaignSessionSceneTownShop)
    .innerJoin(shop, and(
      eq(shop.id, campaignSessionSceneTownShop.shopId),
      eq(shop.campaignId, campaignSessionSceneTownShop.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneTownShop.sceneId, input.sceneId),
      eq(campaignSessionSceneTownShop.sessionId, input.sessionId),
      eq(campaignSessionSceneTownShop.campaignId, input.campaignId),
      inArray(campaignSessionSceneTownShop.townId, revealedTownIds),
      eq(campaignSessionSceneTownShop.included, true),
      eq(campaignSessionSceneTownShop.revealed, true),
    )).orderBy(asc(campaignSessionSceneTownShop.sortOrder), asc(shop.name), asc(shop.id)) : [];
  const townPlaces = revealedTownIds.length ? await tx.select({
    townId: campaignSessionSceneTownPlace.townId,
    id: townPlace.id,
    name: townPlace.name,
    category: townPlace.category,
    description: townPlace.description,
    sortOrder: campaignSessionSceneTownPlace.sortOrder,
  }).from(campaignSessionSceneTownPlace)
    .innerJoin(townPlace, and(
      eq(townPlace.id, campaignSessionSceneTownPlace.placeId),
      eq(townPlace.townId, campaignSessionSceneTownPlace.townId),
      eq(townPlace.campaignId, campaignSessionSceneTownPlace.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneTownPlace.sceneId, input.sceneId),
      eq(campaignSessionSceneTownPlace.sessionId, input.sessionId),
      eq(campaignSessionSceneTownPlace.campaignId, input.campaignId),
      inArray(campaignSessionSceneTownPlace.townId, revealedTownIds),
      eq(campaignSessionSceneTownPlace.included, true),
      eq(campaignSessionSceneTownPlace.revealed, true),
    )).orderBy(asc(campaignSessionSceneTownPlace.sortOrder), asc(townPlace.name), asc(townPlace.id)) : [];
  const townNpcs = revealedTownIds.length ? await tx.select({
    townId: campaignSessionSceneTownNpc.townId,
    id: campaignCharacter.id,
    name: campaignCharacter.name,
    roleLabel: campaignCharacter.npcRoleLabel,
    sortOrder: campaignSessionSceneTownNpc.sortOrder,
  }).from(campaignSessionSceneTownNpc)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionSceneTownNpc.npcCharacterId),
      eq(campaignCharacter.campaignId, campaignSessionSceneTownNpc.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneTownNpc.sceneId, input.sceneId),
      eq(campaignSessionSceneTownNpc.sessionId, input.sessionId),
      eq(campaignSessionSceneTownNpc.campaignId, input.campaignId),
      inArray(campaignSessionSceneTownNpc.townId, revealedTownIds),
      eq(campaignSessionSceneTownNpc.included, true),
      eq(campaignSessionSceneTownNpc.revealed, true),
    )).orderBy(asc(campaignSessionSceneTownNpc.sortOrder), asc(campaignCharacter.name), asc(campaignCharacter.id)) : [];
  const revealedNpcIds = new Set(townNpcs.map(({ id }) => id));
  const revealedShopIds = townShops.map(({ id }) => id);
  const staffRows = revealedShopIds.length ? await tx.select({
    shopId: shopStaffAssignment.shopId,
    npcCharacterId: campaignCharacter.id,
    name: campaignCharacter.name,
    roleLabel: campaignCharacter.npcRoleLabel,
    responsibilityLabel: shopStaffAssignment.responsibilityLabel,
    isPrimaryContact: shopStaffAssignment.isPrimaryContact,
    sortOrder: shopStaffAssignment.sortOrder,
  }).from(shopStaffAssignment)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, shopStaffAssignment.npcCharacterId),
      eq(campaignCharacter.campaignId, shopStaffAssignment.campaignId),
    ))
    .where(and(
      eq(shopStaffAssignment.campaignId, input.campaignId),
      inArray(shopStaffAssignment.shopId, revealedShopIds),
    ))
    .orderBy(asc(shopStaffAssignment.sortOrder), asc(campaignCharacter.name), asc(campaignCharacter.id)) : [];
  const independentlyPlaced = await tx.select({
    id: shop.id,
    name: shop.name,
    category: shop.category,
    description: shop.description,
    storefrontState: shop.storefrontState,
    sortOrder: campaignSessionSceneShop.sortOrder,
  }).from(campaignSessionSceneShop)
    .innerJoin(shop, and(
      eq(shop.id, campaignSessionSceneShop.shopId),
      eq(shop.campaignId, campaignSessionSceneShop.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneShop.sceneId, input.sceneId),
      eq(campaignSessionSceneShop.sessionId, input.sessionId),
      eq(campaignSessionSceneShop.campaignId, input.campaignId),
      eq(campaignSessionSceneShop.revealed, true),
    )).orderBy(asc(campaignSessionSceneShop.sortOrder), asc(shop.name), asc(shop.id));

  return {
    towns: townRows.map((townRow) => ({
      id: townRow.id,
      name: townRow.name,
      category: townRow.category,
      overview: townRow.overview,
      shops: townShops.filter(({ townId }) => townId === townRow.id).map((shopRow) => ({
        id: shopRow.id,
        name: shopRow.name,
        category: shopRow.category,
        description: shopRow.description,
        storefrontState: shopRow.storefrontState as "open" | "closed",
        staff: staffRows.filter(({ shopId, npcCharacterId }) => (
          shopId === shopRow.id && revealedNpcIds.has(npcCharacterId)
        )).map(({ npcCharacterId, name, roleLabel, responsibilityLabel, isPrimaryContact }) => ({
          npcCharacterId,
          name,
          roleLabel,
          responsibilityLabel,
          isPrimaryContact,
        })),
      })),
      places: townPlaces.filter(({ townId }) => townId === townRow.id).map(({ id, name, category, description }) => ({ id, name, category, description })),
      npcs: townNpcs.filter(({ townId }) => townId === townRow.id).map(({ id, name, roleLabel }) => ({
        id,
        name,
        roleLabel,
        relationshipLabel: "",
      })),
    })),
    shops: independentlyPlaced.map(({ id, name, category, description, storefrontState }) => ({
      id,
      name,
      category,
      description,
      storefrontState: storefrontState as "open" | "closed",
    })),
  };
}
