import "server-only";
import { and, eq, or } from "drizzle-orm";
import { ownedCreatureDisposition } from "@/db/companion-schema";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { shopResaleCreature } from "@/db/tabletop-shop-visit-schema";
import { assertNpcCanBeChanged } from "@/features/npcs/npc-workflow";
import {
  buildCreatureNpcSnapshot, createCreatureNpcInTransaction, readCreatureNpcTemplateInTransaction,
  type CreatureNpcConstructorTransaction,
} from "./creature-npc-constructor-service";

/** Internal primitives: callers must authorize and lock the Campaign before changing ownership. */
export async function validateCreatureOwnerInTransaction(
  tx: CreatureNpcConstructorTransaction, campaignId: number, ownerCharacterId: number | null,
): Promise<void> {
  if (ownerCharacterId === null) return;
  if (!Number.isSafeInteger(ownerCharacterId) || ownerCharacterId <= 0) throw new Error("Owning Character must identify a saved record.");
  const [owner] = await tx.select({ archivedAt: campaignCharacter.archivedAt }).from(campaignCharacter).where(and(
    eq(campaignCharacter.id, ownerCharacterId), eq(campaignCharacter.campaignId, campaignId),
    or(eq(campaignCharacter.isNpc, false), eq(campaignCharacter.npcKind, "race")),
  )).limit(1).for("update");
  if (!owner) throw new Error("Choose a Player Character or Race NPC in this Campaign as the owner.");
  if (owner.archivedAt) throw new Error("Restore the owning Character before assigning a Creature to it.");
}

export async function setCreatureOwnerInTransaction(tx: CreatureNpcConstructorTransaction, input: {
  campaignId: number; characterId: number; ownerCharacterId: number | null; expectedOwnerCharacterId?: number | null;
}): Promise<void> {
  const [npc] = await tx.select({ archivedAt: campaignCharacter.archivedAt, ownerCharacterId: campaignCharacter.ownerCharacterId })
    .from(campaignCharacter).where(and(
      eq(campaignCharacter.id, input.characterId), eq(campaignCharacter.campaignId, input.campaignId),
      eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature"),
    )).limit(1).for("update");
  if (!npc) throw new Error("Individual Creature NPC not found in this Campaign.");
  if (npc.ownerCharacterId !== input.ownerCharacterId) {
    const [travel] = await tx.select().from(ownedCreatureDisposition).where(eq(ownedCreatureDisposition.characterId, input.characterId));
    if (travel?.vesselInstanceId) throw new Error("Unbind this Creature in Animals & Companions and change its travel disposition before transferring, selling, or removing ownership. Its Vessel will not move automatically.");
  }
  assertNpcCanBeChanged({ archivedAt: npc.archivedAt, operation: "save" });
  if (input.expectedOwnerCharacterId !== undefined && npc.ownerCharacterId !== input.expectedOwnerCharacterId) {
    throw new Error("This Creature's owner changed. Refresh before continuing.");
  }
  const [profile] = await tx.select({ id: campaignCreatureNpcProfile.characterId }).from(campaignCreatureNpcProfile)
    .where(eq(campaignCreatureNpcProfile.characterId, input.characterId));
  if (!profile) throw new Error("The individual Creature profile is missing.");
  const [custody] = await tx.select({ id: shopResaleCreature.id }).from(shopResaleCreature).where(and(
    eq(shopResaleCreature.creatureCharacterId, input.characterId), eq(shopResaleCreature.status, "in-stock"),
  )).limit(1);
  if (custody) throw new Error("This Creature is held as exact Shop resale stock. Acquire it through the Shop.");
  await validateCreatureOwnerInTransaction(tx, input.campaignId, input.ownerCharacterId);
  await tx.update(campaignCharacter).set({ ownerCharacterId: input.ownerCharacterId, updatedAt: new Date() })
    .where(eq(campaignCharacter.id, input.characterId));
}

export async function createOwnedCreatureInTransaction(tx: CreatureNpcConstructorTransaction, input: {
  campaignId: number; controllerUserId: string; ownerCharacterId: number; creatureId: number;
}): Promise<number> {
  await validateCreatureOwnerInTransaction(tx, input.campaignId, input.ownerCharacterId);
  const template = await readCreatureNpcTemplateInTransaction(tx, input.creatureId, { activeOnly: true });
  if (!template) throw new Error("The granted Creature definition is archived or unavailable.");
  const id = await createCreatureNpcInTransaction(tx, {
    campaignId: input.campaignId, controllerUserId: input.controllerUserId, creatureId: input.creatureId,
    name: template.core.canonicalName, roleLabel: "Companion", snapshot: buildCreatureNpcSnapshot(template),
  });
  await setCreatureOwnerInTransaction(tx, { campaignId: input.campaignId, characterId: id, ownerCharacterId: input.ownerCharacterId, expectedOwnerCharacterId: null });
  return id;
}
