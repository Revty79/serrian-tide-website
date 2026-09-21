import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { race } from "@/db/race-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { canManageCampaignRecords, canReadActiveState } from "@/features/active-state/authorization";
import type { InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import type { ProtectionTarget } from "@/features/protection/protection-layers";
import { readProtectionLayersInTransaction } from "@/features/protection/protection-service";
import { requireSession } from "@/lib/server-access";
import type { IncomingEffectTarget } from "./models";
import type { OwnedEncounterRuntimeContext } from "@/features/tabletop-operations/runtime-integration-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
function snapshotRules(snapshot: unknown): InteractionRuleProfile | null {
  const value = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
  // Keep exact saved authoring. The pure resolver validates it, without fetching the master.
  return structuredClone(value?.core?.interactionRules ?? null);
}

/** Server-internal authorized read. authenticatedUserId MUST come from a trusted session,
 * never a client argument. Roles and target ownership are checked against the database.
 * The caller supplies a coherent transaction (repeatable read when freezing a context). */
export async function readIncomingEffectTargetInTransaction(tx: Transaction, authenticatedUserId: string, target: ProtectionTarget): Promise<IncomingEffectTarget> {
  const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, authenticatedUserId));
  const subject = { userId: authenticatedUserId, roles: roles.map(({ role }) => role) };
  let characterId: number;
  let ruleSource: IncomingEffectTarget["ruleSource"] = { kind: "none", id: "none", name: "No assigned Race" };
  let interactionRules: InteractionRuleProfile | null = null;
  if (target.kind === "encounter-participant") {
    // participantId is the runtime character_id key, NOT the table's serial participant_id.
    const [occurrence] = await tx.select({ participant: campaignSessionEncounterParticipant, owner: campaign.createdByUserId })
      .from(campaignSessionEncounterParticipant).innerJoin(campaign, eq(campaign.id, campaignSessionEncounterParticipant.campaignId))
      .where(and(eq(campaignSessionEncounterParticipant.campaignId, target.campaignId), eq(campaignSessionEncounterParticipant.encounterId, target.encounterId), eq(campaignSessionEncounterParticipant.characterId, target.participantId))).limit(1);
    if (!occurrence) throw new Error("Incoming-effect target does not belong to this Campaign/Encounter.");
    if (occurrence.participant.participantKind === "creature") {
      if (!canManageCampaignRecords(subject, occurrence.owner)) throw new Error("You do not have permission to view this Creature's incoming-effect context.");
      ruleSource = { kind: "creature-snapshot", id: `encounter:${target.encounterId}:participant:${occurrence.participant.participantId}`, name: occurrence.participant.displayLabel || "Encounter Creature" };
      interactionRules = snapshotRules(occurrence.participant.creatureSnapshotJson);
      return { protection: await readProtectionLayersInTransaction(tx, target), ruleSource, interactionRules };
    }
    characterId = occurrence.participant.characterId;
  } else characterId = target.characterId;
  const [entity] = await tx.select({ character: campaignCharacter, owner: campaign.createdByUserId, member: campaignPlayer.userId })
    .from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaignCharacter.campaignId), eq(campaignPlayer.userId, authenticatedUserId)))
    .where(eq(campaignCharacter.id, characterId)).limit(1);
  if (!entity || !canReadActiveState(subject, { playerUserId: entity.character.playerUserId, campaignOwnerUserId: entity.owner, isNpc: entity.character.isNpc, isCampaignMember: entity.member === authenticatedUserId })) throw new Error("You do not have permission to view this Character's incoming-effect context.");
  if (target.kind === "encounter-participant" && entity.character.campaignId !== target.campaignId) throw new Error("Character does not belong to this Campaign.");
  return readCharacterContext(tx, target, entity.character);
}

async function readCharacterContext(tx: Transaction, target: ProtectionTarget, character: { id: number; npcKind: string; name: string }): Promise<IncomingEffectTarget> {
  const characterId = character.id;
  let ruleSource: IncomingEffectTarget["ruleSource"] = { kind: "none", id: "none", name: "No assigned Race" };
  let interactionRules: InteractionRuleProfile | null = null;
  if (character.npcKind === "creature") {
    const [profile] = await tx.select({ snapshot: campaignCreatureNpcProfile.currentSnapshotJson }).from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, characterId)).limit(1);
    if (!profile) throw new Error("Creature NPC individual snapshot is missing.");
    ruleSource = { kind: "creature-snapshot", id: `creature-npc:${characterId}`, name: character.name };
    interactionRules = snapshotRules(profile.snapshot);
  } else {
    const [assigned] = await tx.select({ id: race.id, name: race.name, rules: race.interactionRules }).from(campaignCharacterProfile)
      .innerJoin(race, eq(race.id, campaignCharacterProfile.raceId)).where(eq(campaignCharacterProfile.characterId, characterId)).limit(1);
    if (assigned) {
      ruleSource = { kind: "race", id: `race:${assigned.id}`, name: assigned.name };
      interactionRules = structuredClone(assigned.rules);
    }
  }
  return { protection: await readProtectionLayersInTransaction(tx, target), ruleSource, interactionRules };
}

/** Trusted consequence-planning read INSIDE an already authorized combat transaction.
 * The acting Player need not have independent read access to their victim's private state. */
export async function readIncomingEffectEncounterTargetInTransaction(tx: Transaction, context: OwnedEncounterRuntimeContext, participantId: number, includeApplicationContext = true): Promise<IncomingEffectTarget> {
  const [occurrence] = await tx.select().from(campaignSessionEncounterParticipant).where(and(
    eq(campaignSessionEncounterParticipant.campaignId, context.campaignId), eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
    eq(campaignSessionEncounterParticipant.sceneId, context.sceneId), eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
    eq(campaignSessionEncounterParticipant.characterId, participantId),
  )).limit(1);
  if (!occurrence) throw new Error("Incoming effect target is outside the authorized Campaign/Session/Scene/Encounter.");
  const target: ProtectionTarget = { kind: "encounter-participant", campaignId: context.campaignId, encounterId: context.encounterId, participantId };
  if (occurrence.participantKind === "creature") return {
    applicationLocations: (() => {
      const snapshot = occurrence.creatureSnapshotJson as { hitLocations?: Array<{ hitLocationNumber: number; locationName: string; hpPoolCanonicalId: string | null }> };
      return snapshot?.hitLocations?.map((location) => ({ number: location.hitLocationNumber, name: location.locationName, poolKey: location.hpPoolCanonicalId })) ?? [];
    })(),
    protection: await readProtectionLayersInTransaction(tx, target),
    ruleSource: { kind: "creature-snapshot", id: `encounter:${context.encounterId}:participant:${occurrence.participantId}`, name: occurrence.displayLabel || "Encounter Creature" },
    interactionRules: snapshotRules(occurrence.creatureSnapshotJson),
  };
  const [character] = await tx.select().from(campaignCharacter).where(and(eq(campaignCharacter.id, participantId), eq(campaignCharacter.campaignId, context.campaignId))).limit(1);
  if (!character) throw new Error("Incoming effect Character is outside the authorized Campaign.");
  if (!includeApplicationContext) return readCharacterContext(tx, target, character);
  const health = await readActiveHealthInTransaction(tx, participantId, character.npcKind);
  return { ...await readCharacterContext(tx, target, character),
    applicationLocations: health.anatomy.hitLocations.map((location) => ({ number: location.result, name: location.name, poolKey: location.poolKey })) };
}

/** Caller has already authorized the source, target and campaign in its runtime transaction. */
export async function readIncomingEffectRuntimeTargetInTransaction(tx: Transaction, campaignId: number, characterId: number, includeApplicationContext = true): Promise<IncomingEffectTarget> {
  const [character] = await tx.select().from(campaignCharacter).where(and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.campaignId, campaignId))).limit(1);
  if (!character) throw new Error("Incoming effect target is outside the authorized Campaign.");
  if (!includeApplicationContext) return readCharacterContext(tx, { kind: "character", characterId }, character);
  const health = await readActiveHealthInTransaction(tx, characterId, character.npcKind);
  return { ...await readCharacterContext(tx, { kind: "character", characterId }, character),
    applicationLocations: health.anatomy.hitLocations.map((location) => ({ number: location.result, name: location.name, poolKey: location.poolKey })) };
}

/** Live read only. Historical calculations should reuse the frozen input, not call this. */
export async function getIncomingEffectTarget(target: ProtectionTarget): Promise<IncomingEffectTarget> {
  const session = await requireSession();
  return db.transaction((tx) => readIncomingEffectTargetInTransaction(tx, session.user.id, target), { isolationLevel: "repeatable read", accessMode: "read only" });
}
