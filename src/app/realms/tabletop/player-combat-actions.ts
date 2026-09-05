"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaignSessionEncounterActionDeclaration } from "@/db/tabletop-operations-schema";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { resolveCharacterWeaponGovernanceInTransaction } from "@/features/items/character-weapon-governance-service";
import {
  commitActionDeclarationInTransaction,
  createActionDeclarationDraftInTransaction,
  lockActionDeclarationInTransaction,
} from "@/features/tabletop-operations/action-declaration-service";
import { parseActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import {
  declareDefenseInterventionInTransaction,
  recordDeclaredAttackRollInTransaction,
  recordDeclaredResponseRollInTransaction,
  resolveDeclaredDefensesInTransaction,
} from "@/features/tabletop-operations/defense-intervention-service";
import {
  commitFirearmAttackTriggerInTransaction,
  declareFirearmAttackInTransaction,
  fireFirearmAttackInTransaction,
} from "@/features/tabletop-operations/firearm-attack-service";
import type { FirearmPartialLoadDisposition, FirearmPreparationOperation } from "@/features/tabletop-operations/firearm-readiness";
import { startFirearmPreparationInTransaction } from "@/features/tabletop-operations/firearm-readiness-service";
import {
  addPlayerCombatClarificationInTransaction,
  cancelPlayerCombatRulingRequestInTransaction,
  createPlayerCombatRulingRequestInTransaction,
  lockPlayerCombatContextInTransaction,
  readPlayerCombatRulingRequestsInTransaction,
} from "@/features/tabletop-operations/player-combat-ruling-service";
import type { CampaignSessionPlayerRulingRequestType } from "@/db/tabletop-operations-schema";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import {
  holdParticipantInitiativeInTransaction,
  passParticipantInitiativeInTransaction,
} from "@/features/tabletop-operations/runtime-integration-service";
import type { RollMethod } from "@/features/tabletop-operations/roll-runtime";
import { requirePlayer } from "@/lib/server-access";

type PlayerActor = { authority: "player"; userId: string; characterId: number };

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function participantId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(`${label} is invalid.`);
  return normalized;
}

function key(value: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9]{32}$/.test(normalized)) throw new Error("The submission identity is invalid.");
  return normalized;
}

function automationBlocker(requestType: CampaignSessionPlayerRulingRequestType, sourceKind: string): string {
  if (requestType === "called-shot") return "Called Shot penalty and approval are G.O.D.-authoritative.";
  if (requestType === "ally-defense") return "Ally-defense eligibility and timing require independent Player authority or a G.O.D. ruling.";
  if (requestType === "tackle") return "Tackle eligibility, timing, and consequences require a G.O.D. ruling.";
  if (requestType === "intervention") return "Intervention eligibility, timing, and consequences require a G.O.D. ruling.";
  if (requestType === "firearm-preparation") return "Firearm preparation has unresolved authored or runtime mechanics that require a G.O.D. ruling.";
  if (sourceKind === "spell") return "The canonical Spell model does not author a safe combat Roll resolution mode.";
  if (sourceKind === "item") return "Combat Item timing or resolution requires an authoritative declaration and G.O.D. review.";
  if (sourceKind === "derived-ability") return "Combat activation or resolution requires an authoritative declaration and G.O.D. review.";
  return "Exceptional eligibility or manual mechanics cannot be resolved automatically.";
}

async function withPlayerCombat<T>(
  characterIdInput: number,
  encounterIdInput: number,
  category: "initiative" | "action" | "reaction" | "roll",
  work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], context: Awaited<ReturnType<typeof lockPlayerCombatContextInTransaction>>, actor: PlayerActor) => Promise<T>,
): Promise<T> {
  const access = await requirePlayer();
  const characterId = positiveId(characterIdInput, "Player Character");
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const result = await db.transaction(async (tx) => {
    const context = await lockPlayerCombatContextInTransaction(tx, encounterId, characterId, access.user.id);
    const actor: PlayerActor = { authority: "player", userId: access.user.id, characterId };
    const value = await work(tx, context, actor);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      characterIds: [],
      category,
    });
    return value;
  });
  revalidatePath("/realms/tabletop");
  revalidatePath("/heavens/tabletop");
  return result;
}

export async function setPlayerInitiativeDisposition(
  characterId: number,
  encounterId: number,
  disposition: "hold" | "pass",
): Promise<void> {
  return withPlayerCombat(characterId, encounterId, "initiative", async (tx, context, actor) => {
    if (disposition === "hold") await holdParticipantInitiativeInTransaction(tx, context, actor.characterId);
    else await passParticipantInitiativeInTransaction(tx, context, actor.characterId);
  });
}

export async function submitPlayerCombatRulingRequest(
  characterId: number,
  encounterId: number,
  input: {
    requestType: CampaignSessionPlayerRulingRequestType;
    targetParticipantId?: number | null;
    sourceKind: string;
    sourceRef?: string;
    sourceInstanceId?: number | null;
    intent: string;
    requestedTiming?: string;
    objective?: string;
    locationNumber?: number | null;
    idempotencyKey: string;
  },
): Promise<number> {
  return withPlayerCombat(characterId, encounterId, "action", async (tx, context, actor) => {
    const created = await createPlayerCombatRulingRequestInTransaction(tx, context, actor, {
      requestType: input.requestType,
      targetParticipantId: input.targetParticipantId == null ? null : participantId(input.targetParticipantId, "Target"),
      sourceKind: text(input.sourceKind, "Source kind", 80),
      sourceRef: input.sourceRef?.trim() ?? "",
      sourceInstanceId: input.sourceInstanceId == null ? null : positiveId(input.sourceInstanceId, "Source instance"),
      intent: text(input.intent, "Player intent", 2000),
      requestedTiming: input.requestedTiming?.trim() ?? "",
      blockedReason: automationBlocker(input.requestType, input.sourceKind.trim()),
      frozenRequest: {
        objective: input.objective?.trim() ?? input.intent.trim(),
        locationNumber: input.locationNumber == null ? null : input.locationNumber,
        sourceKind: input.sourceKind.trim(),
        sourceRef: input.sourceRef?.trim() ?? "",
        sourceInstanceId: input.sourceInstanceId ?? null,
        targetParticipantId: input.targetParticipantId ?? null,
      },
      idempotencyKey: key(input.idempotencyKey),
    });
    return created.requestId;
  });
}

export async function clarifyPlayerCombatRulingRequest(characterId: number, encounterId: number, requestId: number, clarification: string): Promise<void> {
  return withPlayerCombat(characterId, encounterId, "action", (tx, context, actor) => (
    addPlayerCombatClarificationInTransaction(tx, context, actor, positiveId(requestId, "Ruling request"), clarification)
  ));
}

export async function cancelPlayerCombatRulingRequest(characterId: number, encounterId: number, requestId: number, reason: string): Promise<void> {
  return withPlayerCombat(characterId, encounterId, "action", (tx, context, actor) => (
    cancelPlayerCombatRulingRequestInTransaction(tx, context, actor, positiveId(requestId, "Ruling request"), reason)
  ));
}

export async function startPlayerFirearmPreparation(
  characterId: number,
  encounterId: number,
  input: {
    itemInstanceId: number;
    operation: FirearmPreparationOperation;
    requestedRounds?: number | null;
    replaceCurrentLoad?: boolean;
    partialLoadDisposition?: FirearmPartialLoadDisposition;
    discardReason?: string;
    targetFiringModeId?: number | null;
    idempotencyKey: string;
  },
): Promise<void> {
  return withPlayerCombat(characterId, encounterId, "action", async (tx, context, actor) => {
    await startFirearmPreparationInTransaction(tx, context, actor, {
      characterId: actor.characterId,
      itemInstanceId: positiveId(input.itemInstanceId, "Firearm instance"),
      operation: input.operation,
      requestedRounds: input.requestedRounds,
      replaceCurrentLoad: input.replaceCurrentLoad,
      partialLoadDisposition: input.partialLoadDisposition,
      godReason: input.partialLoadDisposition === "discard"
        ? text(input.discardReason ?? "", "Ammunition discard reason", 2000)
        : undefined,
      targetFiringModeId: input.targetFiringModeId,
      idempotencyKey: key(input.idempotencyKey),
    });
  });
}

export async function declarePlayerWeaponAttack(
  characterId: number,
  encounterId: number,
  input: { targetParticipantId: number; itemId: number; instanceId: number | null; idempotencyKey: string },
): Promise<number> {
  return withPlayerCombat(characterId, encounterId, "action", async (tx, context, actor) => {
    const submissionId = key(input.idempotencyKey);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`serrian-tide:player-action:${context.campaignId}:${actor.userId}:${submissionId}`}))`);
    const existing = await tx.select({ id: campaignSessionEncounterActionDeclaration.id, draft: campaignSessionEncounterActionDeclaration.draftJson })
      .from(campaignSessionEncounterActionDeclaration)
      .where(and(
        eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
        eq(campaignSessionEncounterActionDeclaration.actorCharacterId, actor.characterId),
        eq(campaignSessionEncounterActionDeclaration.createdByUserId, actor.userId),
      ));
    const target = participantId(input.targetParticipantId, "Target participant");
    const reused = existing.find(({ draft }) => parseActionDeclarationDraft(draft).sourcePayload?.submissionId === submissionId);
    if (reused) {
      const draft = parseActionDeclarationDraft(reused.draft);
      if (draft.targetCharacterIds.length !== 1
        || draft.targetCharacterIds[0] !== target
        || draft.weaponItemId !== input.itemId
        || draft.sourceInstanceId !== input.instanceId) {
        throw new Error("That submission identity was already used for a different exact weapon action.");
      }
      return reused.id;
    }
    const equipment = await readCharacterEquipmentStateInTransaction(tx, actor.characterId);
    const weapon = equipment.wieldedWeapons.find(({ itemId, instanceId }) => itemId === input.itemId && instanceId === input.instanceId);
    if (!weapon) throw new Error("That exact owned weapon is no longer wielded.");
    if (weapon.firingModes.some(({ id }) => id !== null)) throw new Error("Use the firearm attack workflow for an exact firearm instance.");
    if (weapon.initiativeCost === null) throw new Error("This weapon has no authored Initiative Cost; submit a G.O.D. ruling request.");
    const governance = await resolveCharacterWeaponGovernanceInTransaction(tx, { userId: actor.userId }, {
      campaignId: context.campaignId,
      characterId: actor.characterId,
      itemId: weapon.itemId,
      firingModeId: null,
    });
    if (
      governance.status !== "resolved-normal"
      && governance.status !== "resolved-persistent-override"
      && governance.status !== "resolved-one-action-override"
    ) {
      throw new Error(`${governance.explanation} Submit a G.O.D. ruling request before spending Initiative.`);
    }
    const declarationId = await createActionDeclarationDraftInTransaction(tx, context, actor, {
      actorCharacterId: actor.characterId,
      targetCharacterIds: [target],
      label: `${weapon.itemName} attack`,
      actionKind: "weapon-attack",
      sourceKind: "weapon",
      sourceRef: weapon.ownershipKey,
      sourceInstanceId: weapon.instanceId,
      sourcePayload: { submissionId },
      weaponItemId: weapon.itemId,
      firingModeId: null,
      attackMode: "Melee / authored weapon attack",
      initiativeCost: weapon.initiativeCost,
      allowsMultiRound: false,
      heldIntervention: false,
      windowKind: "melee-overlap",
      aimDeclared: false,
      calledShot: { declared: false, label: "", assignedPenalty: null },
      explicitModifiers: [],
      preparesForDeclarationId: null,
      godNotes: "",
    });
    await lockActionDeclarationInTransaction(tx, context, actor, declarationId);
    await commitActionDeclarationInTransaction(tx, context, actor, declarationId);
    return declarationId;
  });
}

export async function declarePlayerDefense(
  characterId: number,
  encounterId: number,
  input: { opportunityId: number; reactionType: "no-reaction" | "dodge" | "parry" | "block"; protectedTargetParticipantId: number; itemId?: number | null; instanceId?: number | null },
): Promise<number> {
  return withPlayerCombat(characterId, encounterId, "reaction", (tx, context, actor) => (
    declareDefenseInterventionInTransaction(tx, context, actor, {
      opportunityId: positiveId(input.opportunityId, "Responder opportunity"),
      reactionType: input.reactionType,
      protectedTargetCharacterId: participantId(input.protectedTargetParticipantId, "Protected target"),
      itemId: input.itemId,
      instanceId: input.instanceId,
    })
  ));
}

export async function rollPlayerDeclaredResponse(characterId: number, encounterId: number, reactionId: number, input: { method: RollMethod; enteredTotal?: number | null }): Promise<number> {
  return withPlayerCombat(characterId, encounterId, "roll", async (tx, context, actor) => {
    const roll = await recordDeclaredResponseRollInTransaction(tx, context, actor, positiveId(reactionId, "Response"), input);
    return roll.id;
  });
}

export async function rollPlayerDeclaredAttack(characterId: number, encounterId: number, declarationId: number, input: { method: RollMethod; enteredTotal?: number | null }): Promise<number> {
  return withPlayerCombat(characterId, encounterId, "roll", async (tx, context, actor) => {
    const roll = await recordDeclaredAttackRollInTransaction(tx, context, actor, positiveId(declarationId, "Declaration"), input);
    await resolveDeclaredDefensesInTransaction(tx, context, actor, declarationId);
    return roll.id;
  });
}

export async function declarePlayerFirearmAttack(
  characterId: number,
  encounterId: number,
  input: { targetParticipantId: number; itemInstanceId: number; firingModeId: number; aimInitiative: number; firingDurationInitiative?: number | null; calledShotRequestId?: number | null; idempotencyKey: string },
): Promise<number> {
  return withPlayerCombat(characterId, encounterId, "action", async (tx, context, actor) => {
    const targetParticipantId = participantId(input.targetParticipantId, "Target participant");
    const itemInstanceId = positiveId(input.itemInstanceId, "Firearm instance");
    const requestId = input.calledShotRequestId == null ? null : positiveId(input.calledShotRequestId, "Called Shot request");
    const request = requestId === null ? null : (await readPlayerCombatRulingRequestsInTransaction(tx, context.encounterId, actor.characterId, actor.userId)).find(({ id }) => id === requestId) ?? null;
    if (requestId !== null && (!request || request.requestType !== "called-shot" || request.status !== "approved")) {
      throw new Error("The selected Called Shot request is not approved for this Player and Encounter.");
    }
    if (request && (request.sourceInstanceId !== itemInstanceId || request.targetParticipantId !== targetParticipantId)) {
      throw new Error("The approved Called Shot request does not match this exact firearm and target.");
    }
    const rulingPenalty = request && typeof request.ruling.penalty === "number" ? request.ruling.penalty : null;
    const rulingReason = request && typeof request.ruling.reason === "string" ? request.ruling.reason : "";
    if (request && (rulingPenalty === null || !rulingReason.trim())) throw new Error("The approved Called Shot ruling lacks an authoritative penalty or reason.");
    const location = request && Number.isSafeInteger(request.frozenRequest.locationNumber) ? Number(request.frozenRequest.locationNumber) : null;
    const objective = request && typeof request.frozenRequest.objective === "string" ? request.frozenRequest.objective : "";
    const declared = await declareFirearmAttackInTransaction(tx, context, actor, {
      actorParticipantId: actor.characterId,
      targetParticipantId,
      itemInstanceId,
      firingModeId: positiveId(input.firingModeId, "Firing Mode"),
      aimInitiative: input.aimInitiative,
      firingDurationInitiative: input.firingDurationInitiative,
      calledShot: { declared: request !== null, objective, locationNumber: location, penalty: rulingPenalty, reason: rulingReason },
      playerRulingRequestId: requestId,
      idempotencyKey: key(input.idempotencyKey),
    });
    return declared.attackId;
  });
}

export async function commitPlayerFirearmTrigger(characterId: number, encounterId: number, attackId: number): Promise<number> {
  return withPlayerCombat(characterId, encounterId, "action", (tx, context, actor) => (
    commitFirearmAttackTriggerInTransaction(tx, context, actor, positiveId(attackId, "Firearm attack"))
  ));
}

export async function firePlayerFirearmAttack(characterId: number, encounterId: number, attackId: number, input: { method: RollMethod; enteredTotal?: number | null }): Promise<number> {
  return withPlayerCombat(characterId, encounterId, "roll", async (tx, context, actor) => {
    const result = await fireFirearmAttackInTransaction(tx, context, actor, positiveId(attackId, "Firearm attack"), input);
    return result.rollId;
  });
}
