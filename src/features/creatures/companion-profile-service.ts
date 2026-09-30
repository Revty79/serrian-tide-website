import "server-only";
import { isDeepStrictEqual } from "node:util";
import { asc, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { readCompanionProfileHistoryInTransaction } from "./companion-profile-history";
import { companionProfile as profile, companionProfileRole as role, companionProfileEvent as event } from "@/db/companion-profile-schema";
import { authorizeOwnedCreatureInTransaction } from "./owned-creature-service";
import { assertManagementOutsideCombat } from "./companion-disposition-service";
import { normalizeCompanionProfileCommand, type CompanionProfileCommand } from "./companion-profile";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller must authorize the exact persistent Creature before exposing this projection. */
export async function readCompanionProfileInTransaction(tx: Transaction, characterId: number) {
  const [row] = await tx.select().from(profile).where(eq(profile.characterId, characterId));
  const roles = await tx.select({ role: role.role, otherLabel: role.otherLabel, maximumRiders: role.maximumRiders, mountNotes: role.mountNotes })
    .from(role).where(eq(role.characterId, characterId)).orderBy(asc(role.role));
  return { configured: !!row?.controlModel, controlModel: row?.controlModel ?? null, combatPreference: row?.combatPreference ?? null,
    relationshipNotes: row?.relationshipNotes ?? "", requiresOwnerReview: row?.requiresOwnerReview ?? false,
    revision: row?.revision ?? 0, roles, updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function readCompanionProfileForActor(ownerCharacterId: number, creatureCharacterId: number, userId: string) {
  return db.transaction(async tx => {
    const access = await authorizeOwnedCreatureInTransaction(tx, ownerCharacterId, creatureCharacterId, userId);
    const active = await tx.execute(sql`select 1 from campaign_session_encounter e join campaign_session_encounter_participant p on p.encounter_id=e.id
      where e.status='active' and p.character_id in (${ownerCharacterId},${creatureCharacterId}) limit 1`);
    return { ...await readCompanionProfileInTransaction(tx, creatureCharacterId),
      canEditNotes: access.canChange, canConfigure: access.canChange && access.canConfigureProfile && !active.rows.length,
      blockedReason: !access.canChange ? "Only the owning Player or Campaign G.O.D. can edit notes on an active companion."
        : access.canConfigureProfile && active.rows.length ? "Finish the owner and Creature's active encounters before changing behavior settings." : "",
      history: await readCompanionProfileHistoryInTransaction(tx, creatureCharacterId) };
  });
}

export async function changeCompanionProfileForActor(input: CompanionProfileCommand, userId: string) {
  const command = normalizeCompanionProfileCommand(input);
  return db.transaction(async tx => {
    const initial = await authorizeOwnedCreatureInTransaction(tx, command.ownerCharacterId, command.creatureCharacterId, userId, false);
    if (command.operation === "configure") {
      if (!initial.canConfigureProfile) throw new Error("Only the Campaign-owning G.O.D. may configure companion roles and intended behavior.");
      try { await tx.execute(sql`LOCK TABLE campaign_session_encounter, campaign_session_encounter_participant IN SHARE MODE NOWAIT`); }
      catch { throw new Error("Encounter state is changing. Retry companion configuration after it finishes."); }
      await assertManagementOutsideCombat(tx, command.ownerCharacterId, command.creatureCharacterId, "Companion behavior settings");
    }
    const access = await authorizeOwnedCreatureInTransaction(tx, command.ownerCharacterId, command.creatureCharacterId, userId);
    if (!access.canChange || (command.operation === "configure" && !access.canConfigureProfile)) throw new Error("Restore the Campaign, owner and Creature, and use the current owner's authorized companion controls.");
    const [receipt] = await tx.select().from(event).where(and(eq(event.characterId, command.creatureCharacterId), eq(event.requestKey, command.requestKey)));
    if (receipt) {
      if (receipt.actorUserId !== userId || !isDeepStrictEqual(receipt.command, command)) throw new Error("This retry identity belongs to another profile change.");
      return { revision: receipt.revision };
    }
    const before = await readCompanionProfileInTransaction(tx, command.creatureCharacterId);
    if (before.revision !== command.expectedRevision) throw new Error("Companion Profile changed. Refresh before saving again.");
    if (command.operation === "configure") {
      if (before.requiresOwnerReview && !command.confirmOwnerReview) throw new Error("Confirm that you reviewed this profile for the current owner.");
      if (before.roles.some(previous => (previous.role === "mount" || previous.role === "other") && !command.roles.some(next => next.role === previous.role)) && !command.acknowledgeRoleDataClear) {
        throw new Error("Confirm clearing the removed role's Mount fields or Other label.");
      }
    }
    const values = { characterId: command.creatureCharacterId, campaignId: access.campaignId,
      controlModel: command.operation === "configure" ? command.controlModel : before.controlModel,
      combatPreference: command.operation === "configure" ? command.combatPreference : before.combatPreference,
      relationshipNotes: command.relationshipNotes, requiresOwnerReview: command.operation === "configure" ? false : before.requiresOwnerReview,
      revision: before.revision + 1, updatedByUserId: userId, updatedAt: new Date() };
    await tx.insert(profile).values(values).onConflictDoUpdate({ target: profile.characterId, set: values });
    if (command.operation === "configure") {
      await tx.delete(role).where(eq(role.characterId, command.creatureCharacterId));
      if (command.roles.length) await tx.insert(role).values(command.roles.map(value => ({ ...value, characterId: command.creatureCharacterId })));
    }
    await tx.insert(event).values({ characterId: command.creatureCharacterId, campaignId: access.campaignId, actorUserId: userId,
      requestKey: command.requestKey, revision: values.revision, command, before: before.revision ? before : null,
      after: await readCompanionProfileInTransaction(tx, command.creatureCharacterId) });
    return { revision: values.revision };
  });
}
