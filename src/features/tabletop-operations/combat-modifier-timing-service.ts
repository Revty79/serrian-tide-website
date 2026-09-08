import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { campaign } from "@/db/campaign-schema";
import { campaignSession, campaignSessionScene, campaignSessionEncounter, campaignSessionEncounterParticipant, campaignSessionEncounterInitiative } from "@/db/tabletop-operations-schema";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { resolveInitiativeCapacityInTransaction } from "./initiative-capacity-service";
import { changeNormalTotalInitiative } from "./initiative-runtime";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction } from "./runtime-integration-service";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";

type Modifier = { channel: string; targetKey: string; amount: number };
export async function readCombatParticipantModifiersInTransaction(tx: RuntimeIntegrationTransaction, participantId: number, campaignId: number): Promise<Modifier[]> {
  if (participantId > 0) return (await readActiveEffectsInTransaction(tx, participantId)).modifiers.filter(({ endedAt }) => endedAt === null);
  const [row] = await tx.select({ state: campaignSessionEncounterParticipant.localStateJson }).from(campaignSessionEncounterParticipant)
    .where(and(eq(campaignSessionEncounterParticipant.characterId, participantId), eq(campaignSessionEncounterParticipant.campaignId, campaignId))).limit(1);
  const local = row?.state as { modifiers?: Array<Modifier & { endedAt?: unknown; expiredAt?: unknown }> } | null;
  return (local?.modifiers ?? []).filter((entry) => !entry.endedAt && !entry.expiredAt && Number.isFinite(entry.amount));
}
export function modifierChangesCombatTiming(channel: string, targetKey: string) {
  return channel === "initiative" || channel === "movement" || channel === "attribute" && targetKey === "DEX";
}
type Capture = { context: OwnedEncounterRuntimeContext; participantId: number; movementMode: string; before: number; initiativeOnly: boolean };
async function timingValue(tx: RuntimeIntegrationTransaction, capture: Omit<Capture, "before">): Promise<number> {
  if (capture.initiativeOnly) return (await readCombatParticipantModifiersInTransaction(tx, capture.participantId, capture.context.campaignId))
    .filter(({ channel, targetKey }) => channel === "initiative" && targetKey === "self").reduce((sum, entry) => sum + entry.amount, 0);
  return (await resolveInitiativeCapacityInTransaction(tx, capture.participantId, capture.context.campaignId, capture.movementMode)).normalTotalInitiative;
}
export async function captureCombatModifierTimingInTransaction(tx: RuntimeIntegrationTransaction, participantId: number, modifiers: readonly Pick<Modifier, "channel" | "targetKey">[]): Promise<Capture[]> {
  const relevant = modifiers.filter(({ channel, targetKey }) => modifierChangesCombatTiming(channel, targetKey));
  if (!relevant.length) return [];
  const contexts = await tx.select({ encounterId: campaignSessionEncounter.id, sceneId: campaignSessionEncounter.sceneId,
    sessionId: campaignSessionEncounter.sessionId, campaignId: campaignSessionEncounter.campaignId,
    ownerUserId: campaign.createdByUserId, encounterStatus: campaignSessionEncounter.status, sceneStatus: campaignSessionScene.status, sessionStatus: campaignSession.status })
    .from(campaignSessionEncounter).innerJoin(campaignSessionEncounterParticipant, eq(campaignSessionEncounterParticipant.encounterId, campaignSessionEncounter.id))
    .innerJoin(campaignSessionEncounterInitiative, eq(campaignSessionEncounterInitiative.encounterId, campaignSessionEncounter.id))
    .innerJoin(campaign, eq(campaign.id, campaignSessionEncounter.campaignId)).innerJoin(campaignSessionScene, eq(campaignSessionScene.id, campaignSessionEncounter.sceneId))
    .innerJoin(campaignSession, eq(campaignSession.id, campaignSessionEncounter.sessionId))
    .where(and(eq(campaignSessionEncounterParticipant.characterId, participantId), eq(campaignSessionEncounter.status, "active"), eq(campaignSessionEncounterInitiative.status, "active")))
    .orderBy(asc(campaignSessionEncounter.id));
  const captures: Capture[] = [];
  for (const context of contexts) {
    await assertCombatWritableInTransaction(tx, context.encounterId);
    const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
    const participant = engine.participants.find(({ characterId }) => characterId === participantId);
    if (!participant) continue;
    const captured = { context, participantId, movementMode: participant.movementMode, initiativeOnly: relevant.every(({ channel }) => channel === "initiative") };
    captures.push({ ...captured, before: await timingValue(tx, captured) });
  }
  return captures;
}
export async function reconcileCombatModifierTimingInTransaction(tx: RuntimeIntegrationTransaction, captures: readonly Capture[]): Promise<void> {
  for (const captured of captures) {
    const difference = await timingValue(tx, captured) - captured.before;
    if (difference === 0) continue;
    const before = await loadInitiativeEngineInTransaction(tx, captured.context.encounterId);
    const participant = before.participants.find(({ characterId }) => characterId === captured.participantId)!;
    // Apply only the real modifier difference, preserving assigned starting
    // Initiative and any existing debt. Temporary recovery is never deferred.
    const after = changeNormalTotalInitiative(before, captured.participantId, participant.normalTotalInitiative + difference, "ordinary", captured.movementMode);
    await persistInitiativeEngineInTransaction(tx, captured.context, before, after);
  }
}
