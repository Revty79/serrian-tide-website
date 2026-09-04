import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { db } from "@/db";
import { campaignPlayer } from "@/db/campaign-schema";
import { item, weaponFiringMode, weaponProfile } from "@/db/item-schema";
import { campaignCharacter, campaignCharacterItemInstance } from "@/db/realm-schema";
import {
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterActionDeclarationEvent,
  campaignSessionEncounterEffect,
  campaignSessionEncounterEffectPlan,
  campaignSessionEncounterEffectPlanEvent,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterResponderOpportunity,
} from "@/db/tabletop-operations-schema";
import {
  readCharacterEquipmentStateInTransaction,
} from "@/features/items/equipment-state-service";
import {
  resolveCharacterWeaponGovernanceInTransaction,
} from "@/features/items/character-weapon-governance-service";

import {
  assertActionCanRoll,
  assertActionDeclarationTransition,
  buildLockedActionDeclarationSnapshot,
  calculateHasTheRun,
  deriveActionWindow,
  deriveResponderCandidates,
  normalizeActionDeclarationDraft,
  parseActionDeclarationDraft,
  parseLockedActionDeclarationSnapshot,
  responderOpportunitiesAreReconciled,
  type ActionDeclarationDraft,
  type ActionDeclarationStatus,
  type HasTheRunResult,
  type LockedActionDeclarationSnapshot,
  type ResponderOpportunityStatus,
} from "./action-declaration";
import {
  abandonPendingInitiativeAction,
  adjustPendingInitiativeActionRemainingCost,
  completePendingInitiativeActionManually,
  endPendingInitiativeAction,
  extendPendingInitiativeActionCost,
  interruptPendingInitiativeAction,
  restartPendingInitiativeAction,
  resumePendingInitiativeAction,
  startInitiativeAction,
} from "./initiative-runtime";
import {
  loadInitiativeEngineInTransaction,
  persistInitiativeEngineInTransaction,
  type OwnedEncounterRuntimeContext,
  type RuntimeIntegrationTransaction,
} from "./runtime-integration-service";
import { resolveLockedActionSourceInTransaction } from "./action-source-resolver-service";

export type ActionDeclarationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ActionDeclarationActor = Readonly<
  | { authority: "god-owner"; userId: string }
  | { authority: "player"; userId: string; characterId: number }
>;

export type ActionDeclarationOpportunityView = Readonly<{
  id: number;
  responderCharacterId: number;
  responderName: string;
  source: "initiative" | "god-exception";
  status: ResponderOpportunityStatus;
  windowSequence: number;
  reachedAtInitiative: number;
  reason: string;
  requiresGodConfirmation: boolean;
  responseLabel: string;
  rulingReason: string;
  reactionId: number | null;
  reconciledAt: string | null;
}>;

export type ActionDeclarationEventView = Readonly<{
  id: number;
  fromStatus: ActionDeclarationStatus | null;
  toStatus: ActionDeclarationStatus;
  eventKind: string;
  reason: string;
  actorUserId: string | null;
  createdAt: string;
}>;

export type ActionDeclarationView = Readonly<{
  id: number;
  actorCharacterId: number;
  actorName: string;
  pendingActionId: number | null;
  supersedesDeclarationId: number | null;
  status: ActionDeclarationStatus;
  versionNumber: number;
  draft: ActionDeclarationDraft;
  lockedSnapshot: LockedActionDeclarationSnapshot | null;
  timing: null | Readonly<{
    status: "active" | "interrupted" | "completed" | "abandoned" | "ended";
    startInitiative: number;
    initiativeSpent: number;
    additionalInitiativeCost: number;
    remainingInitiativeCost: number;
    expectedCompletionInitiative: number;
    startedRound: number;
    completedRound: number | null;
  }>;
  window: ReturnType<typeof deriveActionWindow> | null;
  opportunities: readonly ActionDeclarationOpportunityView[];
  events: readonly ActionDeclarationEventView[];
  rulingReason: string;
  rulingNotes: string;
  createdAt: string;
  lockedAt: string | null;
  committedAt: string | null;
  endedAt: string | null;
}>;

export type ActionDeclarationWorkspaceView = Readonly<{
  context: Readonly<{
    campaignId: number;
    sessionId: number;
    sceneId: number;
    encounterId: number;
  }>;
  runtime: Readonly<{
    roundNumber: number;
    stepNumber: number;
    timelineInitiative: number;
  }>;
  participants: readonly Readonly<{
    characterId: number;
    name: string;
    currentInitiative: number;
    participationStatus: "active" | "holding" | "passed" | "suspended";
    hasActiveAction: boolean;
    weapons: readonly Readonly<{
      ownershipKey: string;
      itemId: number;
      instanceId: number | null;
      name: string;
      initiativeCost: number | null;
      firingModes: readonly Readonly<{ id: number; name: string }>[];
    }>[];
  }>[];
  declarations: readonly ActionDeclarationView[];
  run: readonly HasTheRunResult[];
}>;

type LockedDeclarationRow = typeof campaignSessionEncounterActionDeclaration.$inferSelect;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}


function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function boundedReason(value: string, label: string, required = true): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const reason = value.trim();
  if (required && !reason) throw new Error(`${label} is required.`);
  if (reason.length > 2000) throw new Error(`${label} must be 2000 characters or fewer.`);
  return reason;
}

function assertContextLive(context: OwnedEncounterRuntimeContext): void {
  if (context.sessionStatus !== "active" || context.sceneStatus !== "active" || context.encounterStatus !== "active") {
    throw new Error("Action declarations require an active Session, Scene, and Encounter.");
  }
}

async function assertActorAuthority(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  actorCharacterId: number,
): Promise<void> {
  if (actor.authority === "god-owner") {
    if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may govern this declaration.");
    return;
  }
  if (actor.characterId !== actorCharacterId) throw new Error("A Player may declare an action only for their own authorized Character.");
  const [owned] = await tx.select({ characterId: campaignCharacter.id })
    .from(campaignCharacter)
    .innerJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, actor.userId),
    ))
    .where(and(
      eq(campaignCharacter.id, actorCharacterId),
      eq(campaignCharacter.campaignId, context.campaignId),
      eq(campaignCharacter.playerUserId, actor.userId),
      eq(campaignCharacter.isNpc, false),
    ))
    .limit(1);
  if (!owned) throw new Error("A Player may declare an action only for their own authorized Character.");
}

async function assertParticipants(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  characterIds: readonly number[],
): Promise<void> {
  const expected = [...new Set(characterIds.map((id) => participantKey(id, "Encounter Participant")))];
  const rows = expected.length ? await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      inArray(campaignSessionEncounterParticipant.characterId, expected),
    )) : [];
  const found = new Set(rows.map(({ characterId }) => characterId));
  if (found.size !== expected.length) throw new Error("Every declaration Character must be an exact Encounter Participant.");
}

async function lockDeclaration(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  declarationId: number,
): Promise<LockedDeclarationRow> {
  const [row] = await tx.select().from(campaignSessionEncounterActionDeclaration).where(and(
    eq(campaignSessionEncounterActionDeclaration.id, positiveId(declarationId, "Action declaration")),
    eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
    eq(campaignSessionEncounterActionDeclaration.sceneId, context.sceneId),
    eq(campaignSessionEncounterActionDeclaration.sessionId, context.sessionId),
    eq(campaignSessionEncounterActionDeclaration.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!row) throw new Error("That action declaration does not belong to the exact Encounter context.");
  return row;
}

async function recordEvent(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  declarationId: number,
  fromStatus: ActionDeclarationStatus | null,
  toStatus: ActionDeclarationStatus,
  eventKind: string,
  actorUserId: string | null,
  reason = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(campaignSessionEncounterActionDeclarationEvent).values({
    declarationId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    fromStatus,
    toStatus,
    eventKind,
    actorUserId,
    reason: reason.trim(),
    metadata,
  });
}

function snapshotDraft(snapshot: LockedActionDeclarationSnapshot): ActionDeclarationDraft {
  return {
    actorCharacterId: snapshot.actorCharacterId,
    targetCharacterIds: snapshot.targetCharacterIds,
    label: snapshot.label,
    actionKind: snapshot.actionKind,
    sourceKind: snapshot.source.kind,
    sourceRef: snapshot.source.ref,
    sourceInstanceId: snapshot.source.instanceId,
    sourcePayload: snapshot.source.payload ?? {},
    weaponItemId: snapshot.weapon?.itemId ?? null,
    firingModeId: snapshot.weapon?.firingModeId ?? null,
    attackMode: snapshot.weapon?.attackMode ?? "",
    initiativeCost: snapshot.initiativeCost,
    allowsMultiRound: snapshot.allowsMultiRound,
    heldIntervention: snapshot.heldIntervention,
    windowKind: snapshot.windowKind,
    aimDeclared: snapshot.aimDeclared,
    calledShot: snapshot.calledShot,
    explicitModifiers: snapshot.explicitModifiers,
    preparesForDeclarationId: snapshot.preparesForDeclarationId,
    godNotes: snapshot.godNotes,
  };
}

async function buildAuthoritativeSnapshot(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  row: LockedDeclarationRow,
  draftInput: ActionDeclarationDraft,
  actor: ActionDeclarationActor,
  now: Date,
): Promise<LockedActionDeclarationSnapshot> {
  let draft = normalizeActionDeclarationDraft(draftInput);
  assertContextLive(context);
  await assertParticipants(tx, context, [draft.actorCharacterId, ...draft.targetCharacterIds]);
  if (draft.preparesForDeclarationId !== null) {
    const [preparedDeclaration] = await tx.select({
      actorCharacterId: campaignSessionEncounterActionDeclaration.actorCharacterId,
      status: campaignSessionEncounterActionDeclaration.status,
    }).from(campaignSessionEncounterActionDeclaration).where(and(
      eq(campaignSessionEncounterActionDeclaration.id, draft.preparesForDeclarationId),
      eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
      eq(campaignSessionEncounterActionDeclaration.sceneId, context.sceneId),
      eq(campaignSessionEncounterActionDeclaration.sessionId, context.sessionId),
      eq(campaignSessionEncounterActionDeclaration.campaignId, context.campaignId),
    )).limit(1);
    if (!preparedDeclaration || preparedDeclaration.actorCharacterId !== draft.actorCharacterId) {
      throw new Error("Preparation must reference an exact declaration for the same actor and Encounter context.");
    }
    if (preparedDeclaration.status === "resolved" || preparedDeclaration.status === "cancelled" || preparedDeclaration.status === "abandoned") {
      throw new Error("Preparation cannot reference an ended declaration.");
    }
  }
  const engine = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  let weapon: LockedActionDeclarationSnapshot["weapon"] = null;
  let governing: LockedActionDeclarationSnapshot["governing"] = null;
  let authoritativeSourceRef = draft.sourceRef;
  let weaponDisplayName = "Firearm";
  let weaponSourceItemId: number | null = null;
  const firearmPreparation = draft.sourceKind === "weapon"
    && draft.windowKind === "preparation"
    && draft.actionKind.startsWith("firearm-preparation:")
    && draft.sourceInstanceId !== null;
  if (draft.sourceKind === "generic" && draft.actorCharacterId < 0) {
    governing = {
      status: "needs-god-ruling",
      source: null,
      rollOverTarget: null,
      explanation: "This encounter Creature action has no selected exact authored source. The G.O.D. must supply an explicit ruling; no Character Skill, inventory, or weapon governance was inferred.",
    };
  }
  if (draft.sourceKind === "weapon") {
    const equipment = firearmPreparation ? null : await readCharacterEquipmentStateInTransaction(tx, draft.actorCharacterId);
    const equipped = equipment?.wieldedWeapons.find((entry) => (
      entry.itemId === draft.weaponItemId && entry.instanceId === draft.sourceInstanceId
    )) ?? null;
    const [ownedPreparationSource] = firearmPreparation ? await tx.select({
      itemId: campaignCharacterItemInstance.itemId,
      instanceId: campaignCharacterItemInstance.id,
      equipmentState: campaignCharacterItemInstance.equipmentState,
    }).from(campaignCharacterItemInstance).where(and(
      eq(campaignCharacterItemInstance.id, draft.sourceInstanceId!),
      eq(campaignCharacterItemInstance.characterId, draft.actorCharacterId),
      eq(campaignCharacterItemInstance.itemId, draft.weaponItemId!),
    )).limit(1) : [];
    if (!equipped && !ownedPreparationSource) throw new Error(
      firearmPreparation
        ? "The firearm preparation source is not an exact owned Item instance for the acting Character."
        : "The declared Weapon is no longer authoritatively wielded by the acting Character.",
    );
    const sourceItemId = equipped?.itemId ?? ownedPreparationSource!.itemId;
    const [profile] = await tx.select({
      id: weaponProfile.id,
      itemName: item.name,
    }).from(weaponProfile)
      .innerJoin(item, eq(item.id, weaponProfile.itemId))
      .where(eq(weaponProfile.itemId, sourceItemId))
      .limit(1);
    if (!profile) throw new Error("The declared Weapon Profile no longer exists.");
    weaponDisplayName = profile.itemName;
    weaponSourceItemId = sourceItemId;
    const mode = draft.firingModeId === null
      ? null
      : firearmPreparation
        ? (await tx.select({ id: weaponFiringMode.id, name: weaponFiringMode.name })
            .from(weaponFiringMode)
            .where(and(eq(weaponFiringMode.id, draft.firingModeId), eq(weaponFiringMode.weaponProfileId, profile.id)))
            .limit(1))[0] ?? null
        : equipped!.firingModes.find(({ id }) => id === draft.firingModeId) ?? null;
    if (draft.firingModeId !== null && !mode) throw new Error("The declared Firing Mode no longer belongs to that Weapon.");
    const requestedWeaponGovernanceOverride = draft.sourcePayload?.weaponGovernanceOverride;
    if (requestedWeaponGovernanceOverride !== undefined && actor.authority !== "god-owner") {
      throw new Error("Only the Campaign-owning G.O.D. may supply a one-action Weapon governance ruling.");
    }
    const resolution = firearmPreparation ? null : await resolveCharacterWeaponGovernanceInTransaction(tx, { userId: actor.userId }, {
      campaignId: context.campaignId,
      characterId: draft.actorCharacterId,
      itemId: equipped!.itemId,
      firingModeId: draft.firingModeId,
      oneActionOverride: requestedWeaponGovernanceOverride === undefined
        ? null
        : requestedWeaponGovernanceOverride as Parameters<typeof resolveCharacterWeaponGovernanceInTransaction>[2]["oneActionOverride"],
    });
    authoritativeSourceRef = firearmPreparation ? `instance:${ownedPreparationSource!.instanceId}` : equipped!.ownershipKey;
    if (!firearmPreparation && draft.windowKind !== "firearm-trigger" && equipped!.initiativeCost !== null) {
      draft = { ...draft, initiativeCost: equipped!.initiativeCost };
    }
    weapon = {
      itemId: sourceItemId,
      weaponProfileId: profile.id,
      firingModeId: draft.firingModeId,
      attackMode: mode?.name ?? draft.attackMode,
    };
    governing = resolution === null ? null : resolution.status === "resolved-normal"
      || resolution.status === "resolved-persistent-override"
      || resolution.status === "resolved-one-action-override"
      ? {
          status: "resolved",
          source: resolution.source,
          rollOverTarget: resolution.originalTarget,
          explanation: resolution.explanation,
        }
      : {
          status: "needs-god-ruling",
          source: null,
          rollOverTarget: null,
          explanation: resolution.explanation,
        };
  }
  const resolvedSource = firearmPreparation ? {
    authoritativeInitiativeCost: null,
    governing: null,
    snapshot: {
      schemaVersion: 1 as const,
      kind: "weapon" as const,
      identity: `firearm-instance:${draft.sourceInstanceId};profile:${weapon!.weaponProfileId};mode:${draft.firingModeId ?? "none"}`,
      sourceId: weapon!.weaponProfileId,
      sourceInstanceId: draft.sourceInstanceId,
      ownerParticipantId: draft.actorCharacterId,
      displayName: `${weaponDisplayName} — ${draft.label}`,
      authoringHref: weaponSourceItemId === null ? null : "/heavens/equipment",
      liveRevision: now.toISOString(),
      resolutionMode: "automatic-no-roll" as const,
      governingSource: null,
      governingSnapshot: null,
      authoredData: structuredClone(draft.sourcePayload ?? {}),
      resourceCosts: [],
      effects: [],
      warnings: ["This declaration changes firearm readiness state only after authoritative Initiative completion."],
    },
  } : await resolveLockedActionSourceInTransaction(tx, context, actor, row.id, draft, {
    weapon,
    governing,
  });
  governing = resolvedSource.governing;
  if (resolvedSource.authoritativeInitiativeCost !== null && draft.windowKind !== "firearm-trigger") {
    draft = { ...draft, initiativeCost: resolvedSource.authoritativeInitiativeCost };
  }
  return buildLockedActionDeclarationSnapshot({
    draft,
    context: {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      roundNumber: engine.runtime.roundNumber,
      stepNumber: engine.runtime.stepNumber,
    },
    weapon,
    governing,
    authoredSource: resolvedSource.snapshot,
    authoritativeSourceRef,
    authorUserId: row.createdByUserId,
    lockedByUserId: actor.userId,
    authoredAt: row.createdAt,
    lockedAt: now,
  });
}

export async function createActionDeclarationDraftInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  input: ActionDeclarationDraft,
  supersedesDeclarationId: number | null = null,
): Promise<number> {
  assertContextLive(context);
  const draft = normalizeActionDeclarationDraft(input);
  await assertActorAuthority(tx, context, actor, draft.actorCharacterId);
  await assertParticipants(tx, context, [draft.actorCharacterId, ...draft.targetCharacterIds]);
  let versionNumber = 1;
  if (supersedesDeclarationId !== null) {
    const prior = await lockDeclaration(tx, context, supersedesDeclarationId);
    if (prior.actorCharacterId !== draft.actorCharacterId || prior.status !== "cancelled") {
      throw new Error("A replacement draft must follow a cancelled declaration for the same actor.");
    }
    versionNumber = prior.versionNumber + 1;
  }
  const [created] = await tx.insert(campaignSessionEncounterActionDeclaration).values({
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    actorCharacterId: draft.actorCharacterId,
    supersedesDeclarationId,
    versionNumber,
    draftJson: draft,
    createdByUserId: actor.userId,
  }).returning({ id: campaignSessionEncounterActionDeclaration.id });
  if (!created) throw new Error("The action declaration draft could not be saved.");
  if (supersedesDeclarationId !== null) {
    const [priorPlan] = await tx.select().from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.declarationId, supersedesDeclarationId))
      .limit(1)
      .for("update");
    if (priorPlan && priorPlan.status === "cancelled") {
      await tx.update(campaignSessionEncounterEffectPlan).set({ status: "superseded", updatedAt: new Date() })
        .where(eq(campaignSessionEncounterEffectPlan.id, priorPlan.id));
      await tx.insert(campaignSessionEncounterEffectPlanEvent).values({
        planId: priorPlan.id,
        encounterId: context.encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        fromStatus: "cancelled",
        toStatus: "superseded",
        eventKind: "replacement-declaration-created",
        reason: "The cancelled declaration received an explicit replacement draft.",
        metadata: { replacementDeclarationId: created.id },
        actorUserId: actor.userId,
      });
    }
  }
  await recordEvent(tx, context, created.id, null, "draft", "draft-created", actor.userId);
  return created.id;
}

export async function editActionDeclarationDraftInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
  input: ActionDeclarationDraft,
): Promise<void> {
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.status !== "draft") throw new Error("Only a draft declaration may be edited. Create an explicit revision for locked mechanics.");
  const draft = normalizeActionDeclarationDraft(input);
  if (draft.actorCharacterId !== row.actorCharacterId) throw new Error("A declaration revision cannot silently replace its acting Character.");
  await assertActorAuthority(tx, context, actor, row.actorCharacterId);
  await assertParticipants(tx, context, [draft.actorCharacterId, ...draft.targetCharacterIds]);
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    draftJson: draft,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, "draft", "draft", "draft-edited", actor.userId);
}

export async function lockActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
): Promise<void> {
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.status !== "draft") throw new Error("Only a draft declaration may be locked.");
  await assertActorAuthority(tx, context, actor, row.actorCharacterId);
  assertActionDeclarationTransition("draft", "locked");
  const now = new Date();
  const snapshot = await buildAuthoritativeSnapshot(tx, context, row, parseActionDeclarationDraft(row.draftJson), actor, now);
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: "locked",
    lockedSnapshotJson: snapshot,
    lockedByUserId: actor.userId,
    lockedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, "draft", "locked", "declaration-locked", actor.userId);
}

export async function reviseLockedActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
): Promise<number> {
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.status !== "locked") throw new Error("Only an uncommitted locked declaration may be replaced by a draft revision.");
  await assertActorAuthority(tx, context, actor, row.actorCharacterId);
  const snapshot = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
  const now = new Date();
  assertActionDeclarationTransition("locked", "cancelled");
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: "cancelled",
    rulingReason: "Replaced by an explicit draft revision.",
    endedByUserId: actor.userId,
    endedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, "locked", "cancelled", "declaration-replaced", actor.userId, "Replaced by an explicit draft revision.");
  return createActionDeclarationDraftInTransaction(tx, context, actor, snapshotDraft(snapshot), row.id);
}

async function insertObjectiveOpportunities(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  declarationId: number,
  pendingActionId: number,
  snapshot: LockedActionDeclarationSnapshot,
  startInitiative: number,
  participants: Awaited<ReturnType<typeof loadInitiativeEngineInTransaction>>["participants"],
  windowSequence = 1,
  excludedResponderIds: ReadonlySet<number> = new Set(),
): Promise<number> {
  const window = deriveActionWindow(startInitiative, snapshot);
  const candidates = deriveResponderCandidates(window, snapshot.actorCharacterId, participants)
    .filter(({ included, characterId }) => included && !excludedResponderIds.has(characterId));
  if (candidates.length) {
    await tx.insert(campaignSessionEncounterResponderOpportunity).values(candidates.map((candidate) => ({
      declarationId,
      pendingActionId,
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      responderCharacterId: candidate.characterId,
      source: "initiative" as const,
      windowSequence,
      reachedAtInitiative: candidate.initiativePosition,
      reason: candidate.reason,
      requiresGodConfirmation: candidate.requiresGodConfirmation,
    })));
  }
  return candidates.length;
}

export async function commitActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
): Promise<number> {
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.status !== "locked") throw new Error("Initiative commitment requires a locked declaration.");
  await assertActorAuthority(tx, context, actor, row.actorCharacterId);
  assertContextLive(context);
  assertActionDeclarationTransition("locked", "committed");
  const snapshot = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
  await assertParticipants(tx, context, [snapshot.actorCharacterId, ...snapshot.targetCharacterIds]);
  if (snapshot.source.kind === "weapon") {
    const firearmPreparation = snapshot.windowKind === "preparation"
      && snapshot.actionKind.startsWith("firearm-preparation:")
      && snapshot.source.instanceId !== null;
    if (firearmPreparation) {
      const [owned] = await tx.select({ id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance).where(and(
        eq(campaignCharacterItemInstance.id, snapshot.source.instanceId!),
        eq(campaignCharacterItemInstance.characterId, snapshot.actorCharacterId),
        eq(campaignCharacterItemInstance.itemId, snapshot.weapon!.itemId),
      )).limit(1);
      if (!owned) throw new Error("The locked firearm preparation source is no longer an exact owned Item instance.");
    } else {
      const equipment = await readCharacterEquipmentStateInTransaction(tx, snapshot.actorCharacterId);
      if (!equipment.wieldedWeapons.some((weapon) => (
        weapon.itemId === snapshot.weapon?.itemId && weapon.instanceId === snapshot.source.instanceId
      ))) throw new Error("The locked Weapon is no longer wielded; commitment was rejected without rewriting the snapshot.");
    }
  }
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const sequence = await tx.execute(sql<{ id: number }>`
    select nextval(pg_get_serial_sequence('campaign_session_encounter_pending_action', 'id'))::integer as id
  `);
  const pendingActionId = positiveId(Number((sequence.rows[0] as { id?: number } | undefined)?.id), "Pending Action");
  const after = startInitiativeAction(before, {
    id: pendingActionId,
    actorCharacterId: snapshot.actorCharacterId,
    label: snapshot.label,
    actionKind: snapshot.actionKind,
    initiativeCost: snapshot.initiativeCost,
    allowsMultiRound: snapshot.allowsMultiRound,
    heldIntervention: snapshot.heldIntervention,
  });
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
  const committedAction = after.pendingActions.find(({ id }) => id === pendingActionId)!;
  const now = new Date();
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    pendingActionId,
    status: "committed",
    committedByUserId: actor.userId,
    committedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, "locked", "committed", "initiative-committed", actor.userId, "", {
    pendingActionId,
    startInitiative: committedAction.startInitiative,
    expectedCompletionInitiative: committedAction.expectedCompletionInitiative,
    originalInitiativeCost: committedAction.originalInitiativeCost,
  });
  const opportunityCount = await insertObjectiveOpportunities(
    tx,
    context,
    row.id,
    pendingActionId,
    snapshot,
    committedAction.startInitiative,
    after.participants,
  );
  if (opportunityCount === 0) {
    const nextStatus: ActionDeclarationStatus = snapshot.governing?.status === "needs-god-ruling"
      ? "awaiting-god-ruling"
      : "rolling-ready";
    await tx.update(campaignSessionEncounterActionDeclaration).set({ status: nextStatus, updatedAt: now })
      .where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
    await recordEvent(
      tx,
      context,
      row.id,
      "committed",
      nextStatus,
      nextStatus === "awaiting-god-ruling" ? "governance-ruling-required" : "window-reconciled",
      actor.userId,
    );
  }
  return pendingActionId;
}

async function reconcileRollingReadiness(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  row: LockedDeclarationRow,
  actorUserId: string,
): Promise<void> {
  if (row.status !== "committed") return;
  const opportunities = await tx.select({ status: campaignSessionEncounterResponderOpportunity.status })
    .from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id));
  if (!responderOpportunitiesAreReconciled(opportunities)) return;
  const snapshot = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
  const nextStatus: ActionDeclarationStatus = snapshot.governing?.status === "needs-god-ruling"
    ? "awaiting-god-ruling"
    : "rolling-ready";
  assertActionDeclarationTransition("committed", nextStatus);
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: nextStatus,
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSessionEncounterActionDeclaration.id, row.id),
    eq(campaignSessionEncounterActionDeclaration.status, "committed"),
  ));
  await recordEvent(tx, context, row.id, "committed", nextStatus, "window-reconciled", actorUserId);
}

export async function refreshActionDeclarationRollingReadinessInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  declarationId: number,
  actorUserId: string,
): Promise<void> {
  await reconcileRollingReadiness(tx, context, await lockDeclaration(tx, context, declarationId), actorUserId);
}

export async function recordActionDeclarationAuditEventInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  declarationId: number,
  status: ActionDeclarationStatus,
  eventKind: string,
  actorUserId: string,
  reason = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await recordEvent(tx, context, declarationId, status, status, eventKind, actorUserId, reason, metadata);
}

export async function extendActionDeclarationCostInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  declarationId: number,
  additionalCost: number,
  actorUserId: string,
  reason: string,
): Promise<{ opportunityCount: number; previousCompletion: number; expectedCompletion: number }> {
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.pendingActionId === null || !["committed", "rolling-ready", "rolling", "awaiting-god-ruling"].includes(row.status)) {
    throw new Error("Only an active committed declaration may receive a defense cost extension.");
  }
  const snapshot = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const prior = before.pendingActions.find(({ id }) => id === row.pendingActionId);
  if (!prior) throw new Error("The declaration's pending action no longer exists.");
  const previousCompletion = prior.expectedCompletionInitiative;
  const after = extendPendingInitiativeActionCost(before, prior.id, additionalCost);
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
  const changed = after.pendingActions.find(({ id }) => id === prior.id)!;
  const existing = await tx.select({
    responderCharacterId: campaignSessionEncounterResponderOpportunity.responderCharacterId,
    windowSequence: campaignSessionEncounterResponderOpportunity.windowSequence,
  }).from(campaignSessionEncounterResponderOpportunity).where(
    eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
  );
  const windowSequence = Math.max(0, ...existing.map(({ windowSequence }) => windowSequence)) + 1;
  const opportunityCount = await insertObjectiveOpportunities(
    tx,
    context,
    row.id,
    prior.id,
    { ...snapshot, initiativeCost: additionalCost },
    previousCompletion,
    after.participants,
    windowSequence,
    new Set(existing.map(({ responderCharacterId }) => responderCharacterId)),
  );
  const nextStatus = opportunityCount > 0 ? "committed" as const : row.status;
  if (nextStatus !== row.status) {
    await tx.update(campaignSessionEncounterActionDeclaration).set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  }
  await recordEvent(tx, context, row.id, row.status, nextStatus, "defense-cost-extension", actorUserId, reason, {
    additionalCost,
    previousCompletionInitiative: previousCompletion,
    expectedCompletionInitiative: changed.expectedCompletionInitiative,
    opportunityCount,
    windowSequence,
  });
  return { opportunityCount, previousCompletion, expectedCompletion: changed.expectedCompletionInitiative };
}

export async function reconcileResponderOpportunityInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  opportunityId: number,
  input:
    | { status: "declined"; reason?: string }
    | { status: "ineligible"; reason: string }
    | { status: "response-declared"; responseLabel: string },
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may reconcile responder eligibility.");
  const [opportunity] = await tx.select().from(campaignSessionEncounterResponderOpportunity).where(and(
    eq(campaignSessionEncounterResponderOpportunity.id, positiveId(opportunityId, "Responder opportunity")),
    eq(campaignSessionEncounterResponderOpportunity.encounterId, context.encounterId),
    eq(campaignSessionEncounterResponderOpportunity.sceneId, context.sceneId),
    eq(campaignSessionEncounterResponderOpportunity.sessionId, context.sessionId),
    eq(campaignSessionEncounterResponderOpportunity.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!opportunity || opportunity.status !== "pending") throw new Error("Only a pending responder opportunity may be reconciled.");
  const row = await lockDeclaration(tx, context, opportunity.declarationId);
  if (row.status !== "committed") throw new Error("Responder opportunities can be reconciled only while the declaration window is open.");
  const now = new Date();
  const rulingReason = input.status === "ineligible"
    ? boundedReason(input.reason, "Ineligibility ruling reason")
    : opportunity.source === "god-exception"
      ? opportunity.rulingReason
    : input.status === "declined"
      ? boundedReason(input.reason ?? "", "Decline note", false)
      : "";
  const responseLabel = input.status === "response-declared"
    ? boundedReason(input.responseLabel, "Response declaration")
    : "";
  await tx.update(campaignSessionEncounterResponderOpportunity).set({
    status: input.status,
    rulingReason,
    responseLabel,
    reconciledByUserId: actor.userId,
    reconciledAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterResponderOpportunity.id, opportunity.id));
  await recordEvent(tx, context, row.id, row.status, row.status, `responder-${input.status}`, actor.userId, rulingReason || responseLabel, {
    opportunityId: opportunity.id,
    responderCharacterId: opportunity.responderCharacterId,
  });
  await reconcileRollingReadiness(tx, context, row, actor.userId);
  const { reconcileFirearmPreparationAfterResponderInTransaction } = await import("./firearm-readiness-service");
  await reconcileFirearmPreparationAfterResponderInTransaction(tx as RuntimeIntegrationTransaction, row.id, actor.userId);
}

export async function addExceptionalResponderOpportunityInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  responderCharacterId: number,
  reasonInput: string,
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may add an exceptional responder.");
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.status !== "committed") throw new Error("Exceptional responders may be added only while the declaration window is open.");
  const reason = boundedReason(reasonInput, "Exceptional responder reason");
  const responderId = participantKey(responderCharacterId, "Responder Participant");
  if (responderId === row.actorCharacterId) throw new Error("The acting Character cannot respond to their own action.");
  await assertParticipants(tx, context, [responderId]);
  const [pending] = row.pendingActionId === null ? [] : await tx.select({
    expectedCompletionInitiative: campaignSessionEncounterPendingAction.expectedCompletionInitiative,
  }).from(campaignSessionEncounterPendingAction).where(and(
    eq(campaignSessionEncounterPendingAction.id, row.pendingActionId),
    eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
  )).limit(1);
  if (!pending || row.pendingActionId === null) throw new Error("The committed pending action no longer exists.");
  const [created] = await tx.insert(campaignSessionEncounterResponderOpportunity).values({
    declarationId: row.id,
    pendingActionId: row.pendingActionId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    responderCharacterId: responderId,
    source: "god-exception",
    windowSequence: Math.max(1, ...(await tx.select({
      windowSequence: campaignSessionEncounterResponderOpportunity.windowSequence,
    }).from(campaignSessionEncounterResponderOpportunity).where(
      eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
    )).map(({ windowSequence }) => windowSequence)),
    reachedAtInitiative: pending.expectedCompletionInitiative,
    reason: `G.O.D. exceptional responder: ${reason}`,
    requiresGodConfirmation: false,
    rulingReason: reason,
    createdByUserId: actor.userId,
  }).returning({ id: campaignSessionEncounterResponderOpportunity.id });
  if (!created) throw new Error("The exceptional responder opportunity could not be saved.");
  await recordEvent(tx, context, row.id, row.status, row.status, "exceptional-responder-added", actor.userId, reason, {
    opportunityId: created.id,
    responderCharacterId: responderId,
  });
}

async function transitionCommittedDeclaration(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  nextStatus: Extract<ActionDeclarationStatus, "awaiting-god-ruling" | "rolling-ready" | "resolved" | "interrupted" | "cancelled" | "abandoned">,
  reasonInput: string,
  notesInput = "",
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may adjudicate this declaration.");
  const row = await lockDeclaration(tx, context, declarationId);
  assertActionDeclarationTransition(row.status, nextStatus);
  const reasonRequired = nextStatus === "awaiting-god-ruling"
    || row.status === "awaiting-god-ruling"
    || nextStatus === "interrupted";
  const reason = boundedReason(reasonInput, "G.O.D. ruling reason", reasonRequired);
  const notes = boundedReason(notesInput, "G.O.D. ruling notes", false);
  const now = new Date();
  if (nextStatus === "cancelled" || nextStatus === "abandoned") {
    const [existingEffectPlan] = await tx.select({ status: campaignSessionEncounterEffectPlan.status })
      .from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.declarationId, row.id))
      .limit(1)
      .for("update");
    if (existingEffectPlan?.status === "partially-applied") {
      throw new Error("A partially applied Action Effect Plan must be explicitly completed before its declaration can end.");
    }
  }
  if (nextStatus === "resolved") {
    if (row.pendingActionId === null) throw new Error("A declaration cannot resolve before Initiative commitment.");
    const [pending] = await tx.select({
      status: campaignSessionEncounterPendingAction.status,
      remaining: campaignSessionEncounterPendingAction.remainingInitiativeCost,
    }).from(campaignSessionEncounterPendingAction).where(and(
      eq(campaignSessionEncounterPendingAction.id, row.pendingActionId),
      eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
    )).limit(1).for("update");
    if (!pending || pending.status !== "completed" || pending.remaining !== 0) {
      throw new Error("Resolution requires the committed action to reach Initiative completion.");
    }
    const [effectPlan] = await tx.select({ status: campaignSessionEncounterEffectPlan.status })
      .from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.declarationId, row.id))
      .limit(1);
    if (effectPlan && effectPlan.status !== "applied" && effectPlan.status !== "declined") {
      throw new Error("The Action Effect Plan must be applied or declined before this declaration resolves.");
    }
  }
  if (row.pendingActionId !== null && (nextStatus === "interrupted" || nextStatus === "cancelled" || nextStatus === "abandoned")) {
    const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
    const pending = before.pendingActions.find(({ id }) => id === row.pendingActionId);
    if (!pending) throw new Error("The committed pending action no longer exists.");
    if (pending.status === "completed" && nextStatus === "interrupted") {
      throw new Error("A completed Initiative action cannot be interrupted.");
    }
    if (pending.status !== "completed") {
      const after = nextStatus === "interrupted"
        ? interruptPendingInitiativeAction(before, pending.id)
        : nextStatus === "abandoned"
          ? abandonPendingInitiativeAction(before, pending.id)
          : endPendingInitiativeAction(before, pending.id);
      await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
    }
    await tx.update(campaignSessionEncounterResponderOpportunity).set({
      status: "cancelled",
      rulingReason: reason || `Source declaration ${nextStatus}.`,
      reconciledByUserId: actor.userId,
      reconciledAt: now,
      updatedAt: now,
    }).where(and(
      eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
      eq(campaignSessionEncounterResponderOpportunity.status, "pending"),
    ));
  }
  const terminal = nextStatus === "resolved" || nextStatus === "cancelled" || nextStatus === "abandoned";
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: nextStatus,
    rulingReason: reason,
    rulingNotes: notes,
    endedByUserId: terminal ? actor.userId : null,
    endedAt: terminal ? now : null,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  if (nextStatus === "cancelled" || nextStatus === "abandoned") {
    const [plan] = await tx.select().from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.declarationId, row.id))
      .limit(1)
      .for("update");
    if (plan && !["applied", "declined", "cancelled", "superseded"].includes(plan.status)) {
      await tx.update(campaignSessionEncounterEffect).set({
        status: "declined",
        amendmentReason: reason || `Originating declaration ${nextStatus}.`,
        amendedByUserId: actor.userId,
        updatedAt: now,
      }).where(and(
        eq(campaignSessionEncounterEffect.planId, plan.id),
        inArray(campaignSessionEncounterEffect.status, ["calculated", "requires-god-ruling", "approved", "application-failed"]),
      ));
      await tx.update(campaignSessionEncounterEffectPlan).set({
        status: "cancelled",
        appliedByUserId: null,
        appliedAt: null,
        updatedAt: now,
      }).where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
      await tx.insert(campaignSessionEncounterEffectPlanEvent).values({
        planId: plan.id,
        encounterId: context.encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        fromStatus: plan.status,
        toStatus: "cancelled",
        eventKind: "originating-declaration-ended",
        reason: reason || `Originating declaration ${nextStatus}.`,
        metadata: { declarationStatus: nextStatus },
        actorUserId: actor.userId,
      });
    }
  }
  await recordEvent(tx, context, row.id, row.status, nextStatus, `declaration-${nextStatus}`, actor.userId, reason, notes ? { notes } : {});
}

export async function markActionDeclarationAwaitingRulingInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  reason: string,
  notes = "",
): Promise<void> {
  return transitionCommittedDeclaration(tx, context, actor, declarationId, "awaiting-god-ruling", reason, notes);
}

export async function continueActionDeclarationAfterRulingInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  reason: string,
): Promise<void> {
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.status !== "awaiting-god-ruling") throw new Error("Only a declaration awaiting a G.O.D. ruling may continue.");
  const opportunities = await tx.select({ status: campaignSessionEncounterResponderOpportunity.status })
    .from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id));
  if (!responderOpportunitiesAreReconciled(opportunities)) throw new Error("Responder opportunities must be reconciled before the action can continue to rolling-ready.");
  return transitionCommittedDeclaration(tx, context, actor, declarationId, "rolling-ready", reason);
}

export async function interruptActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  reason: string,
): Promise<void> {
  return transitionCommittedDeclaration(tx, context, actor, declarationId, "interrupted", reason);
}

export async function cancelActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
  reason = "",
): Promise<void> {
  const row = await lockDeclaration(tx, context, declarationId);
  await assertActorAuthority(tx, context, actor, row.actorCharacterId);
  if (actor.authority === "player" && row.pendingActionId !== null) {
    throw new Error("A committed action requires a G.O.D. cancellation ruling.");
  }
  if (actor.authority === "god-owner" && row.pendingActionId !== null) {
    return transitionCommittedDeclaration(tx, context, actor, declarationId, "cancelled", reason);
  }
  assertActionDeclarationTransition(row.status, "cancelled");
  const now = new Date();
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: "cancelled",
    rulingReason: boundedReason(reason, "Cancellation reason", false),
    endedByUserId: actor.userId,
    endedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, row.status, "cancelled", "declaration-cancelled", actor.userId, reason);
}

export async function abandonActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  reason: string,
): Promise<void> {
  return transitionCommittedDeclaration(tx, context, actor, declarationId, "abandoned", reason);
}

export async function resolveActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  reason = "",
): Promise<void> {
  return transitionCommittedDeclaration(tx, context, actor, declarationId, "resolved", reason);
}

export async function resumeInterruptedActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  reasonInput: string,
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may resume an interrupted declaration.");
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.status !== "interrupted" || row.pendingActionId === null) throw new Error("Only a committed interrupted action may resume.");
  const reason = boundedReason(reasonInput, "Resume ruling reason");
  const snapshot = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const after = resumePendingInitiativeAction(before, row.pendingActionId);
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
  await tx.update(campaignSessionEncounterResponderOpportunity).set({
    status: "cancelled",
    rulingReason: "Prior action window closed before resume.",
    reconciledByUserId: actor.userId,
    reconciledAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
    eq(campaignSessionEncounterResponderOpportunity.status, "pending"),
  ));
  const resumed = after.pendingActions.find(({ id }) => id === row.pendingActionId)!;
  const existingWindows = await tx.select({
    windowSequence: campaignSessionEncounterResponderOpportunity.windowSequence,
  }).from(campaignSessionEncounterResponderOpportunity).where(
    eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
  );
  const nextWindowSequence = Math.max(0, ...existingWindows.map(({ windowSequence }) => windowSequence)) + 1;
  const count = await insertObjectiveOpportunities(
    tx,
    context,
    row.id,
    row.pendingActionId,
    snapshot,
    resumed.startInitiative,
    after.participants,
    nextWindowSequence,
  );
  const nextStatus: ActionDeclarationStatus = count === 0 ? "rolling-ready" : "committed";
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: nextStatus,
    rulingReason: reason,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, "interrupted", nextStatus, "declaration-resumed", actor.userId, reason, {
    remainingInitiativeCost: resumed.remainingInitiativeCost,
    expectedCompletionInitiative: resumed.expectedCompletionInitiative,
  });
}

export async function restartInterruptedActionDeclarationInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  reasonInput: string,
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may restart an interrupted declaration.");
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.status !== "interrupted" || row.pendingActionId === null) throw new Error("Only a committed interrupted action may restart.");
  const reason = boundedReason(reasonInput, "Restart ruling reason");
  const snapshot = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const prior = before.pendingActions.find(({ id }) => id === row.pendingActionId);
  if (!prior) throw new Error("The committed pending action no longer exists.");
  const after = restartPendingInitiativeAction(before, row.pendingActionId);
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
  await tx.update(campaignSessionEncounterResponderOpportunity).set({
    status: "cancelled",
    rulingReason: "Prior action window closed before restart.",
    reconciledByUserId: actor.userId,
    reconciledAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
    eq(campaignSessionEncounterResponderOpportunity.status, "pending"),
  ));
  const restarted = after.pendingActions.find(({ id }) => id === row.pendingActionId)!;
  const existingWindows = await tx.select({
    windowSequence: campaignSessionEncounterResponderOpportunity.windowSequence,
  }).from(campaignSessionEncounterResponderOpportunity).where(
    eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
  );
  const nextWindowSequence = Math.max(0, ...existingWindows.map(({ windowSequence }) => windowSequence)) + 1;
  const count = await insertObjectiveOpportunities(
    tx,
    context,
    row.id,
    row.pendingActionId,
    snapshot,
    restarted.startInitiative,
    after.participants,
    nextWindowSequence,
  );
  const nextStatus: ActionDeclarationStatus = count === 0 ? "rolling-ready" : "committed";
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: nextStatus,
    rulingReason: reason,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, "interrupted", nextStatus, "declaration-restarted", actor.userId, reason, {
    previouslySpentInitiative: prior.initiativeSpent,
    remainingInitiativeCost: restarted.remainingInitiativeCost,
    expectedCompletionInitiative: restarted.expectedCompletionInitiative,
  });
}

export async function correctActionDeclarationRemainingCostInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  remainingInitiativeCost: number,
  reasonInput: string,
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may correct declaration timing.");
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.pendingActionId === null || row.status === "resolved" || row.status === "cancelled" || row.status === "abandoned") {
    throw new Error("Only an open committed declaration may receive a timing correction.");
  }
  const reason = boundedReason(reasonInput, "Timing correction reason");
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const prior = before.pendingActions.find(({ id }) => id === row.pendingActionId);
  if (!prior) throw new Error("The committed pending action no longer exists.");
  const after = adjustPendingInitiativeActionRemainingCost(before, row.pendingActionId, remainingInitiativeCost);
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
  const corrected = after.pendingActions.find(({ id }) => id === row.pendingActionId)!;
  const now = new Date();
  await tx.update(campaignSessionEncounterResponderOpportunity).set({
    status: "cancelled",
    rulingReason: `Window replaced by timing correction: ${reason}`,
    reconciledByUserId: actor.userId,
    reconciledAt: now,
    updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
    eq(campaignSessionEncounterResponderOpportunity.status, "pending"),
  ));
  let nextStatus = row.status;
  let windowSequence: number | null = null;
  let opportunityCount = 0;
  if (corrected.status === "active" && row.status !== "awaiting-god-ruling") {
    const snapshot = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
    const actorState = after.participants.find(({ characterId }) => characterId === corrected.actorCharacterId)!;
    const existingWindows = await tx.select({
      windowSequence: campaignSessionEncounterResponderOpportunity.windowSequence,
    }).from(campaignSessionEncounterResponderOpportunity).where(
      eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
    );
    windowSequence = Math.max(0, ...existingWindows.map((entry) => entry.windowSequence)) + 1;
    opportunityCount = await insertObjectiveOpportunities(
      tx,
      context,
      row.id,
      row.pendingActionId,
      { ...snapshot, initiativeCost: corrected.remainingInitiativeCost },
      actorState.currentInitiative,
      after.participants,
      windowSequence,
    );
    if (opportunityCount > 0) nextStatus = "committed";
    else if (row.status === "committed") {
      nextStatus = snapshot.governing?.status === "needs-god-ruling" ? "awaiting-god-ruling" : "rolling-ready";
    }
  }
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: nextStatus,
    rulingReason: reason,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, row.status, nextStatus, "initiative-progress-corrected", actor.userId, reason, {
    previousRemainingInitiativeCost: prior.remainingInitiativeCost,
    remainingInitiativeCost: corrected.remainingInitiativeCost,
    expectedCompletionInitiative: corrected.expectedCompletionInitiative,
    windowSequence,
    opportunityCount,
  });
}

export async function completeActionDeclarationTimingInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  reasonInput: string,
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may complete action timing by ruling.");
  const row = await lockDeclaration(tx, context, declarationId);
  if (row.pendingActionId === null || row.status === "resolved" || row.status === "cancelled" || row.status === "abandoned") {
    throw new Error("Only an open committed declaration may receive a timing-completion ruling.");
  }
  const reason = boundedReason(reasonInput, "Timing completion reason");
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const prior = before.pendingActions.find(({ id }) => id === row.pendingActionId);
  if (!prior) throw new Error("The committed pending action no longer exists.");
  const after = completePendingInitiativeActionManually(before, row.pendingActionId);
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    rulingReason: reason,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, context, row.id, row.status, row.status, "initiative-timing-completed-by-ruling", actor.userId, reason, {
    previouslySpentInitiative: prior.initiativeSpent,
    previouslyRemainingInitiativeCost: prior.remainingInitiativeCost,
  });
}

export async function recordActionTimingCompletionsInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  completedPendingActionIds: readonly number[],
  actorUserId: string,
): Promise<void> {
  if (!completedPendingActionIds.length) return;
  const rows = await tx.select().from(campaignSessionEncounterActionDeclaration).where(and(
    eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
    inArray(campaignSessionEncounterActionDeclaration.pendingActionId, completedPendingActionIds),
  ));
  for (const row of rows) {
    await recordEvent(tx, context, row.id, row.status, row.status, "initiative-timing-completed", actorUserId);
  }
}

export async function assertActionRollAllowedInTransaction(
  tx: ActionDeclarationTransaction,
  pendingActionId: number,
): Promise<{ declarationId: number; status: ActionDeclarationStatus } | null> {
  const [row] = await tx.select({
    id: campaignSessionEncounterActionDeclaration.id,
    status: campaignSessionEncounterActionDeclaration.status,
  }).from(campaignSessionEncounterActionDeclaration)
    .where(eq(campaignSessionEncounterActionDeclaration.pendingActionId, positiveId(pendingActionId, "Pending Action")))
    .limit(1)
    .for("update");
  if (!row) return null;
  const opportunities = await tx.select({ status: campaignSessionEncounterResponderOpportunity.status })
    .from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id));
  assertActionCanRoll(row.status, opportunities);
  return { declarationId: row.id, status: row.status };
}

export async function assertResponseRollAllowedInTransaction(
  tx: ActionDeclarationTransaction,
  declarationId: number,
): Promise<{ declarationId: number; status: ActionDeclarationStatus }> {
  const [row] = await tx.select({
    id: campaignSessionEncounterActionDeclaration.id,
    status: campaignSessionEncounterActionDeclaration.status,
  }).from(campaignSessionEncounterActionDeclaration)
    .where(eq(campaignSessionEncounterActionDeclaration.id, positiveId(declarationId, "Action declaration")))
    .limit(1)
    .for("update");
  if (!row || !["rolling-ready", "rolling", "awaiting-god-ruling"].includes(row.status)) {
    throw new Error("A response Roll requires a fully reconciled locked action window.");
  }
  const opportunities = await tx.select({ status: campaignSessionEncounterResponderOpportunity.status })
    .from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id));
  if (!responderOpportunitiesAreReconciled(opportunities)) {
    throw new Error("Every responder opportunity must be reconciled before any related Roll.");
  }
  return { declarationId: row.id, status: row.status };
}

export async function recordActionRollStateInTransaction(
  tx: ActionDeclarationTransaction,
  pendingActionId: number,
  actorUserId: string,
  rollId: number,
  needsGodRuling: boolean,
): Promise<void> {
  const [row] = await tx.select().from(campaignSessionEncounterActionDeclaration)
    .where(eq(campaignSessionEncounterActionDeclaration.pendingActionId, positiveId(pendingActionId, "Pending Action")))
    .limit(1)
    .for("update");
  if (!row) return;
  const opportunities = await tx.select({ status: campaignSessionEncounterResponderOpportunity.status })
    .from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id));
  assertActionCanRoll(row.status, opportunities);
  const nextStatus: ActionDeclarationStatus = needsGodRuling ? "awaiting-god-ruling" : "rolling";
  assertActionDeclarationTransition(row.status, nextStatus);
  const reason = needsGodRuling ? "A critical Roll requires an explicit G.O.D. ruling." : "";
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: nextStatus,
    rulingReason: reason,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
  await recordEvent(tx, {
    encounterId: row.encounterId,
    sceneId: row.sceneId,
    sessionId: row.sessionId,
    campaignId: row.campaignId,
    encounterStatus: "active",
    sceneStatus: "active",
    sessionStatus: "active",
    ownerUserId: "",
  }, row.id, row.status, nextStatus, "roll-recorded", actorUserId, reason, { rollId });
}

export async function recordLongActionRoundContinuationsInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  beforeRound: number,
  afterRound: number,
  after: Awaited<ReturnType<typeof loadInitiativeEngineInTransaction>>,
  actorUserId: string,
): Promise<void> {
  if (afterRound <= beforeRound) return;
  const activePendingActions = after.pendingActions.filter(({ status, allowsMultiRound }) => status === "active" && allowsMultiRound);
  if (!activePendingActions.length) return;
  const activePendingActionIds = activePendingActions.map(({ id }) => id);
  const rows = await tx.select().from(campaignSessionEncounterActionDeclaration).where(and(
    eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
    inArray(campaignSessionEncounterActionDeclaration.pendingActionId, activePendingActionIds),
  ));
  for (const row of rows) {
    const snapshot = parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
    if (!snapshot.allowsMultiRound) continue;
    await recordEvent(tx, context, row.id, row.status, row.status, "long-action-continued", actorUserId, "", {
      fromRound: beforeRound,
      toRound: afterRound,
    });
    if (row.status === "awaiting-god-ruling" || row.status === "interrupted") continue;
    const action = activePendingActions.find(({ id }) => id === row.pendingActionId);
    const actor = action && after.participants.find(({ characterId }) => characterId === action.actorCharacterId);
    if (!action || !actor || action.remainingInitiativeCost <= 0) continue;
    const existingWindows = await tx.select({
      windowSequence: campaignSessionEncounterResponderOpportunity.windowSequence,
    }).from(campaignSessionEncounterResponderOpportunity).where(
      eq(campaignSessionEncounterResponderOpportunity.declarationId, row.id),
    );
    const nextWindowSequence = Math.max(0, ...existingWindows.map(({ windowSequence }) => windowSequence)) + 1;
    const opportunityCount = await insertObjectiveOpportunities(
      tx,
      context,
      row.id,
      action.id,
      { ...snapshot, initiativeCost: action.remainingInitiativeCost },
      actor.currentInitiative,
      after.participants,
      nextWindowSequence,
    );
    if (opportunityCount > 0 && (row.status === "rolling-ready" || row.status === "rolling")) {
      assertActionDeclarationTransition(row.status, "committed");
      await tx.update(campaignSessionEncounterActionDeclaration).set({
        status: "committed",
        updatedAt: new Date(),
      }).where(eq(campaignSessionEncounterActionDeclaration.id, row.id));
      await recordEvent(tx, context, row.id, row.status, "committed", "continuation-window-opened", actorUserId, "", {
        windowSequence: nextWindowSequence,
        opportunityCount,
        startInitiative: actor.currentInitiative,
        expectedCompletionInitiative: action.expectedCompletionInitiative,
        remainingInitiativeCost: action.remainingInitiativeCost,
      });
    }
  }
}

export async function readActionDeclarationWorkspaceInTransaction(
  tx: ActionDeclarationTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
): Promise<ActionDeclarationWorkspaceView> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may review all declarations.");
  const engine = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const identities = await tx.select({
    characterId: campaignSessionEncounterParticipant.characterId,
    participantKind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    name: campaignCharacter.name,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId),
      eq(campaignCharacter.campaignId, campaignSessionEncounterParticipant.campaignId),
    ))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
    ));
  const names = new Map(identities.map((entry) => [
    entry.characterId,
    entry.participantKind === "creature" ? entry.displayLabel : entry.name ?? `Character #${entry.characterId}`,
  ]));
  const declarationRows = await tx.select().from(campaignSessionEncounterActionDeclaration)
    .where(eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId))
    .orderBy(asc(campaignSessionEncounterActionDeclaration.id));
  const opportunityRows = await tx.select().from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.encounterId, context.encounterId))
    .orderBy(asc(campaignSessionEncounterResponderOpportunity.id));
  const eventRows = await tx.select().from(campaignSessionEncounterActionDeclarationEvent)
    .where(eq(campaignSessionEncounterActionDeclarationEvent.encounterId, context.encounterId))
    .orderBy(asc(campaignSessionEncounterActionDeclarationEvent.id));
  const pendingById = new Map(engine.pendingActions.map((entry) => [entry.id, entry]));
  const declarations = declarationRows.map((row): ActionDeclarationView => {
    const draft = parseActionDeclarationDraft(row.draftJson);
    const lockedSnapshot = row.lockedSnapshotJson === null ? null : parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson);
    const pending = row.pendingActionId === null ? null : pendingById.get(row.pendingActionId) ?? null;
    return {
      id: row.id,
      actorCharacterId: row.actorCharacterId,
      actorName: names.get(row.actorCharacterId) ?? `Character #${row.actorCharacterId}`,
      pendingActionId: row.pendingActionId,
      supersedesDeclarationId: row.supersedesDeclarationId,
      status: row.status,
      versionNumber: row.versionNumber,
      draft,
      lockedSnapshot,
      timing: pending ? {
        status: pending.status,
        startInitiative: pending.startInitiative,
        initiativeSpent: pending.initiativeSpent,
        additionalInitiativeCost: pending.additionalInitiativeCost ?? 0,
        remainingInitiativeCost: pending.remainingInitiativeCost,
        expectedCompletionInitiative: pending.expectedCompletionInitiative,
        startedRound: pending.startedRound,
        completedRound: pending.completedRound,
      } : null,
      window: pending && lockedSnapshot && pending.remainingInitiativeCost > 0
        ? deriveActionWindow(
            pending.expectedCompletionInitiative + pending.remainingInitiativeCost,
            { ...lockedSnapshot, initiativeCost: pending.remainingInitiativeCost },
          )
        : null,
      opportunities: opportunityRows.filter(({ declarationId }) => declarationId === row.id).map((opportunity) => ({
        id: opportunity.id,
        responderCharacterId: opportunity.responderCharacterId,
        responderName: names.get(opportunity.responderCharacterId) ?? `Character #${opportunity.responderCharacterId}`,
        source: opportunity.source,
        status: opportunity.status,
        windowSequence: opportunity.windowSequence,
        reachedAtInitiative: opportunity.reachedAtInitiative,
        reason: opportunity.reason,
        requiresGodConfirmation: opportunity.requiresGodConfirmation,
        responseLabel: opportunity.responseLabel,
        rulingReason: opportunity.rulingReason,
        reactionId: opportunity.reactionId,
        reconciledAt: opportunity.reconciledAt?.toISOString() ?? null,
      })),
      events: eventRows.filter(({ declarationId }) => declarationId === row.id).map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        eventKind: event.eventKind,
        reason: event.reason,
        actorUserId: event.actorUserId,
        createdAt: event.createdAt.toISOString(),
      })),
      rulingReason: row.rulingReason,
      rulingNotes: row.rulingNotes,
      createdAt: row.createdAt.toISOString(),
      lockedAt: row.lockedAt?.toISOString() ?? null,
      committedAt: row.committedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
    };
  });
  const activeIds = new Set(engine.pendingActions.filter(({ status }) => status === "active").map(({ actorCharacterId }) => actorCharacterId));
  const weaponsByCharacter = new Map<number, ActionDeclarationWorkspaceView["participants"][number]["weapons"]>();
  for (const participant of engine.participants) {
    if (participant.characterId < 0) {
      weaponsByCharacter.set(participant.characterId, []);
      continue;
    }
    try {
      const equipment = await readCharacterEquipmentStateInTransaction(tx, participant.characterId);
      weaponsByCharacter.set(participant.characterId, equipment.wieldedWeapons.map((weapon) => ({
        ownershipKey: weapon.ownershipKey,
        itemId: weapon.itemId,
        instanceId: weapon.instanceId,
        name: weapon.itemName,
        initiativeCost: weapon.initiativeCost,
        firingModes: weapon.firingModes.flatMap((mode) => mode.id === null ? [] : [{ id: mode.id, name: mode.name }]),
      })));
    } catch {
      weaponsByCharacter.set(participant.characterId, []);
    }
  }
  return {
    context: {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
    },
    runtime: {
      roundNumber: engine.runtime.roundNumber,
      stepNumber: engine.runtime.stepNumber,
      timelineInitiative: engine.runtime.timelineInitiative,
    },
    participants: engine.participants.map((participant) => ({
      characterId: participant.characterId,
      name: names.get(participant.characterId) ?? `Character #${participant.characterId}`,
      currentInitiative: participant.currentInitiative,
      participationStatus: participant.participationStatus,
      hasActiveAction: activeIds.has(participant.characterId),
      weapons: weaponsByCharacter.get(participant.characterId) ?? [],
    })),
    declarations,
    run: engine.participants.map((participant) => {
      const currentDeclaration = [...declarations].reverse().find((declaration) => (
        declaration.actorCharacterId === participant.characterId
        && !["resolved", "cancelled", "abandoned"].includes(declaration.status)
      ));
      return calculateHasTheRun({
        actorCharacterId: participant.characterId,
        participants: engine.participants,
        pendingActions: engine.pendingActions,
        explicitlyIneligibleCharacterIds: currentDeclaration?.opportunities
          .filter(({ status }) => status === "ineligible")
          .map(({ responderCharacterId }) => responderCharacterId),
        exceptionalCharacterIds: currentDeclaration?.opportunities
          .filter(({ source }) => source === "god-exception")
          .map(({ responderCharacterId }) => responderCharacterId),
      });
    }),
  };
}
