import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { creature } from "@/db/creature-schema";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import type { CreatureNpcConstructorTransaction as Transaction } from "./creature-npc-constructor-service";

async function authorizeOwner(tx: Transaction, ownerCharacterId: number, userId: string, lock = true) {
  if (!Number.isSafeInteger(ownerCharacterId) || ownerCharacterId <= 0) throw new Error("Choose a saved owning Character.");
  const [candidate] = await tx.select({ campaignId: campaignCharacter.campaignId }).from(campaignCharacter).where(eq(campaignCharacter.id, ownerCharacterId));
  if (!candidate) throw new Error("Character not found.");
  const campaignQuery = tx.select().from(campaign).where(eq(campaign.id, candidate.campaignId));
  const [root] = await (lock ? campaignQuery.for("update") : campaignQuery);
  if (!root) throw new Error("Campaign not found.");
  const ownerQuery = tx.select().from(campaignCharacter).where(and(eq(campaignCharacter.id, ownerCharacterId), eq(campaignCharacter.campaignId, root.id)));
  const [owner] = await (lock ? ownerQuery.for("update") : ownerQuery);
  if (!owner || (owner.isNpc && owner.npcKind !== "race")) throw new Error("Choose a Player Character or Race NPC owner.");
  const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId)).for("share");
  const canManage = roles.some(row => row.role === "admin" || (row.role === "god" && root.createdByUserId === userId));
  const [member] = await tx.select({ id: campaignPlayer.userId }).from(campaignPlayer).where(and(eq(campaignPlayer.campaignId, root.id), eq(campaignPlayer.userId, userId))).for("share");
  const owningPlayer = !owner.isNpc && owner.playerUserId === userId && !!member && roles.some(row => row.role === "player");
  if (!canManage && !owningPlayer) throw new Error("You may view only your Character's owned Creatures.");
  const canOperate = owningPlayer || roles.some(row => row.role === "god" && root.createdByUserId === userId);
  return { campaignId: root.id, canManage, canOperate, canRename: !root.archivedAt && !owner.archivedAt };
}

export async function readOwnedCreaturesForActor(ownerCharacterId: number, userId: string) {
  return db.transaction(async tx => {
    const access = await authorizeOwner(tx, ownerCharacterId, userId);
    const rows = await tx.select({ characterId: campaignCharacter.id, name: campaignCharacter.name, archivedAt: campaignCharacter.archivedAt,
      creatureId: creature.id, definitionName: creature.canonicalName, canonicalId: creature.canonicalId })
      .from(campaignCharacter).innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
      .innerJoin(creature, eq(creature.id, campaignCreatureNpcProfile.creatureId))
      .where(and(eq(campaignCharacter.ownerCharacterId, ownerCharacterId), eq(campaignCharacter.campaignId, access.campaignId), eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature")))
      .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
    const individuals = [];
    for (const row of rows) {
      const { view } = await readActiveHealthInTransaction(tx, row.characterId, "creature");
      const effects = await readActiveEffectsInTransaction(tx, row.characterId);
      // Deliberate Player-safe projection. No private NPC notes, sources, or editable snapshots.
      individuals.push({ ...row, archivedAt: row.archivedAt?.toISOString() ?? null,
        health: { current: view.total.remainingHp, maximum: view.total.maximumHp, damage: view.total.damage, injuries: view.unresolvedInjuryCount },
        conditions: effects.conditions.map(condition => ({ name: condition.name, description: condition.description })),
        canRename: access.canRename && !row.archivedAt,
      });
    }
    return { campaignId: access.campaignId, canManage: access.canManage && access.canRename, individuals };
  });
}

export async function renameOwnedCreatureForActor(input: { ownerCharacterId: number; creatureCharacterId: number; name: string }, userId: string) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) throw new Error("Use an individual name between 1 and 120 characters.");
  if (!Number.isSafeInteger(input.creatureCharacterId) || input.creatureCharacterId <= 0) throw new Error("Choose an individual Creature.");
  await db.transaction(async tx => {
    const access = await authorizeOwner(tx, input.ownerCharacterId, userId);
    if (!access.canRename) throw new Error("Restore the Campaign and owning Character before naming a Creature.");
    const [individual] = await tx.select().from(campaignCharacter).where(and(eq(campaignCharacter.id, input.creatureCharacterId), eq(campaignCharacter.campaignId, access.campaignId),
      eq(campaignCharacter.ownerCharacterId, input.ownerCharacterId), eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature"))).for("update");
    if (!individual || individual.archivedAt) throw new Error("This active Creature is no longer owned by that Character.");
    await tx.update(campaignCharacter).set({ name, updatedAt: new Date() }).where(eq(campaignCharacter.id, individual.id));
  });
}

/** Internal narrow scope, never an authorization grant to general NPC/active-state APIs. */
export async function authorizeOwnedCreatureInTransaction(tx: Transaction, ownerCharacterId: number, creatureCharacterId: number, userId: string, lock = true) {
  const access = await authorizeOwner(tx, ownerCharacterId, userId, lock);
  const query = tx.select({ archivedAt: campaignCharacter.archivedAt }).from(campaignCharacter)
    .innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .where(and(eq(campaignCharacter.id, creatureCharacterId), eq(campaignCharacter.campaignId, access.campaignId), eq(campaignCharacter.ownerCharacterId, ownerCharacterId),
      eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature")));
  const [individual] = await (lock ? query.for("update", { of: campaignCharacter }) : query);
  if (!individual) throw new Error("This Creature is no longer owned by that Character.");
  return { ...access, canChange: access.canOperate && access.canRename && !individual.archivedAt };
}
