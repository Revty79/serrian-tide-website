import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as participant, campaignSessionEncounterActionDeclaration as declaration } from "@/db/tabletop-operations-schema";
import { resolveEffectiveCreatureStatistics, type CreatureStatisticsSource } from "@/features/creatures/creature-size-rules";
import { readCombatParticipantModifiersInTransaction } from "./combat-modifier-timing-service";
import { resolveInitiativeCapacityInTransaction } from "./initiative-capacity-service";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, assertActionChoiceAuthority, type ActionDeclarationActor } from "./action-declaration-service";
import { parseLockedActionDeclarationSnapshot, type ActionDeclarationDraft } from "./action-declaration";
import { getMaximumMovementDistance, type InitiativeEngineState } from "./initiative-runtime";
import type { OwnedEncounterRuntimeContext, RuntimeIntegrationTransaction } from "./runtime-integration-service";
import { movementInjuryTiming, type InjuryTiming } from "./combat-injury-timing";
import { readTimingLimbsInTransaction } from "./combat-injury-timing-service";

type Tx = RuntimeIntegrationTransaction;
export type CombatMovementCommand = { participantId: number; movementMode: string; distance: number; requestKey: string; intent?: "move" | "flee" };
type Movement = { movementMode: string; baseMovement: number; distance: number; initiativeCost: number; injuryTiming: InjuryTiming };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function resolveCombatMovementInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext, participantId: number, mode: string, distance: number): Promise<Movement> {
  if (!mode.trim() || !Number.isFinite(distance) || distance <= 0) throw new Error("Movement requires an authored mode and a positive distance.");
  const [source] = await tx.select({ kind: participant.participantKind, snapshot: participant.creatureSnapshotJson, npcKind: campaignCharacter.npcKind,
    persistentSnapshot: campaignCreatureNpcProfile.currentSnapshotJson }).from(participant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, participant.characterId))
    .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, participant.characterId))
    .where(and(eq(participant.encounterId, context.encounterId), eq(participant.characterId, participantId)));
  if (!source) throw new Error("Movement requires the exact Encounter participant.");
  let baseMovement: number;
  let movementMode: string;
  if (source.kind === "creature" || source.npcKind === "creature") {
    const raw = source.kind === "creature" ? source.snapshot : JSON.parse(source.persistentSnapshot ?? "{}");
    const snapshot = object(raw);
    if (typeof object(snapshot.core).size !== "string") throw new Error("The exact Creature snapshot has no authored Size for movement.");
    const effective = resolveEffectiveCreatureStatistics({ ...snapshot, attributes: Array.isArray(snapshot.attributes) ? snapshot.attributes : [] } as unknown as CreatureStatisticsSource);
    const selected = effective.movement.find((entry) => entry.movementMode.toLowerCase() === mode.trim().toLowerCase());
    if (!selected || selected.effectiveValue === null) throw new Error("The exact Creature snapshot has no numeric value for this Movement mode.");
    movementMode = selected.movementMode;
    const modifiers = await readCombatParticipantModifiersInTransaction(tx, participantId, context.campaignId);
    baseMovement = selected.effectiveValue + modifiers.filter(({ channel, targetKey }) => channel === "movement" && targetKey === `movement:${movementMode}`).reduce((sum, entry) => sum + entry.amount, 0);
  } else {
    const capacity = await resolveInitiativeCapacityInTransaction(tx, participantId, context.campaignId, mode);
    baseMovement = capacity.baseMovement;
    movementMode = capacity.movementMode;
  }
  if (!Number.isFinite(baseMovement) || baseMovement <= 0) throw new Error("This participant currently has no positive movement in the selected mode.");
  const injuryTiming = movementInjuryTiming(distance / baseMovement, await readTimingLimbsInTransaction(tx, context.encounterId, participantId));
  const initiativeCost = injuryTiming.initiativeCost;
  if (!Number.isFinite(initiativeCost) || initiativeCost <= 0) throw new Error("The movement segment exceeds the supported timing range.");
  return { movementMode, baseMovement, distance, initiativeCost, injuryTiming };
}

export async function declareCombatMovementInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor, command: CombatMovementCommand) {
  return tx.transaction(async (movementTx) => {
    await assertCombatWritableInTransaction(movementTx, context.encounterId);
    await assertActionChoiceAuthority(movementTx, context, actor, command.participantId);
    if (!command.requestKey.trim() || command.requestKey.length > 200) throw new Error("Movement requires a stable request identity.");
    if (command.intent !== undefined && !["move", "flee"].includes(command.intent)) throw new Error("Choose ordinary movement or movement intended to flee.");
    const request = { ...command, movementMode: command.movementMode.trim() };
    const [prior] = await movementTx.select().from(declaration).where(and(eq(declaration.encounterId, context.encounterId),
      eq(declaration.actorCharacterId, command.participantId), sql`${declaration.draftJson}->'sourcePayload'->>'movementRequestKey' = ${command.requestKey}`));
    if (prior) {
      if (!isDeepStrictEqual(object(object(prior.draftJson).sourcePayload).movementRequest, request)) throw new Error("That movement request already identifies a different segment.");
      return { declarationId: prior.id, pendingActionId: prior.pendingActionId!, reused: true };
    }
    const movement = await resolveCombatMovementInTransaction(movementTx, context, command.participantId, command.movementMode, command.distance);
    const draft: ActionDeclarationDraft = { actorCharacterId: command.participantId, targetCharacterIds: [], label: `Move ${command.distance} feet (${movement.movementMode})${command.intent === "flee" ? " to flee" : ""}`,
      actionKind: "combat-movement", sourceKind: "no-roll", sourceRef: null, sourceInstanceId: null,
      sourcePayload: { movementRequest: request, movementRequestKey: command.requestKey }, weaponItemId: null, firingModeId: null, attackMode: "",
      initiativeCost: movement.initiativeCost, allowsMultiRound: true, heldIntervention: false, windowKind: "ordinary", aimDeclared: false,
      calledShot: { declared: false, label: "", assignedPenalty: null }, explicitModifiers: [], preparesForDeclarationId: null, godNotes: "Spatial suitability is judged at the table." };
    const declarationId = await createActionDeclarationDraftInTransaction(movementTx, context, actor, draft);
    await lockActionDeclarationInTransaction(movementTx, context, actor, declarationId);
    const pendingActionId = await commitActionDeclarationInTransaction(movementTx, context, actor, declarationId);
    return { declarationId, pendingActionId, reused: false };
  });
}

export async function recordCombatMovementProgressInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext, before: InitiativeEngineState, after: InitiativeEngineState) {
  for (const action of after.pendingActions) {
    const prior = before.pendingActions.find(({ id }) => id === action.id);
    if (!prior || action.actionKind !== "combat-movement" || action.initiativeSpent <= prior.initiativeSpent) continue;
    const [source] = await tx.select().from(declaration).where(eq(declaration.pendingActionId, action.id));
    if (!source) throw new Error("Movement progress requires its original authoritative declaration.");
    const locked = parseLockedActionDeclarationSnapshot(source.lockedSnapshotJson);
    const movement = object(locked.authoredSource?.authoredData.movement) as unknown as Movement;
    if (!Number.isFinite(movement.baseMovement)) throw new Error("This movement segment has no frozen authoritative speed.");
    const [row] = await tx.select().from(participant).where(and(eq(participant.encounterId, context.encounterId), eq(participant.characterId, action.actorCharacterId))).for("update");
    const local = structuredClone(object(row.localStateJson));
    const history = Array.isArray(local.movementHistory) ? local.movementHistory : [];
    const alreadyRecorded = history.filter((entry) => object(entry).declarationId === source.id).reduce((sum, entry) => sum + Number(object(entry).distance), 0);
    const multiplier = movement.injuryTiming?.multiplier ?? 1;
    const reached = Math.min(movement.distance, getMaximumMovementDistance(movement.baseMovement, action.initiativeSpent / multiplier));
    const delta = reached - alreadyRecorded;
    if (delta > 0) {
      history.push({ declarationId: source.id, pendingActionId: action.id, movementMode: movement.movementMode, distance: delta,
        cumulativeSegmentDistance: reached, initiativeSpent: action.initiativeSpent, round: after.runtime.roundNumber, timelineInitiative: after.runtime.timelineInitiative });
      local.movementHistory = history;
      await tx.update(participant).set({ localStateJson: local, updatedAt: new Date() }).where(eq(participant.participantId, row.participantId));
    }
  }
}
