import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { db } from "@/db";
import { campaignPlayer } from "@/db/campaign-schema";
import { weaponProfile } from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterSpellDocument,
} from "@/db/realm-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import {
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionEncounterReactionEvent,
  campaignSessionEncounterResponderOpportunity,
  campaignSessionRoll,
  defenseSkillPathMapping,
} from "@/db/tabletop-operations-schema";
import { loadCharacterDerivedAbilitiesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import { lockActiveItemRootInTransaction } from "@/features/items/active-item-root-service";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import {
  loadCharacterSkillLineageInputInTransaction,
  resolveCharacterWeaponGovernanceInTransaction,
} from "@/features/items/character-weapon-governance-service";
import {
  resolveCharacterSkillLineageSelection,
  type CharacterWeaponGoverningSelection,
} from "@/features/items/character-weapon-governance";
import { validateCanonicalSkillPath } from "@/features/items/weapon-skill-governance";

import { parseLockedActionDeclarationSnapshot } from "./action-declaration";
import {
  cancelActionDeclarationInTransaction,
  continueActionDeclarationAfterRulingInTransaction,
  extendActionDeclarationCostInTransaction,
  refreshActionDeclarationRollingReadinessInTransaction,
  recordActionDeclarationAuditEventInTransaction,
  type ActionDeclarationActor,
} from "./action-declaration-service";
import {
  buildDefenseInterventionSnapshot,
  getDefenseInitiativeCommitment,
  parseDefenseInterventionSnapshot,
  reconcileDefenseCost,
  resolveDefenseGroup,
  resolveDodgeGovernance,
  resolveTackle,
  rollGoverningRequestFromLockedActionSource,
  type DefenseInterventionSnapshot,
  type DefenseInterventionType,
  type DefenseSourceKind,
  type DefenseSourceSnapshot,
  type DefenseGroupOutcome,
  type IndividualDefenseOutcome,
  type OriginalActionDisposition,
} from "./defense-intervention";
import { applyDirectInitiativeDelta } from "./initiative-runtime";
import type { PercentileTargetModifier } from "./percentile-resolution";
import type { RollGoverningSourceRequest } from "./roll-mechanical-snapshot";
import type { RollMethod, RollVisibility } from "./roll-runtime";
import {
  readEffectiveRollSnapshotInTransaction,
  recordRollInTransaction,
  type AuthorizedRollActor,
  type RollLedgerEntry,
} from "./roll-runtime-service";
import {
  loadInitiativeEngineInTransaction,
  persistInitiativeEngineInTransaction,
  type OwnedEncounterRuntimeContext,
  type RuntimeIntegrationTransaction,
} from "./runtime-integration-service";
import { lockPlayerCombatContextInTransaction } from "./player-combat-ruling-service";

export type DefenseInterventionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DefenseDeclarationInput = Readonly<{
  opportunityId: number;
  reactionType: DefenseInterventionType;
  protectedTargetCharacterId: number;
  targetCharacterId?: number | null;
  opposesReactionId?: number | null;
  sourceKind?: DefenseSourceKind;
  itemId?: number | null;
  instanceId?: number | null;
  derivedAbilityId?: number | null;
  sourceRef?: string | null;
  manualLabel?: string | null;
  governingSelection?: CharacterWeaponGoverningSelection | null;
  manualTarget?: number | null;
  conditionalDodgeMappingIds?: readonly number[];
  godOverrideReason?: string;
  initiativeCost?: number | null;
  rollRequired?: boolean;
  explicitModifiers?: readonly PercentileTargetModifier[];
  intendedMechanicalPurpose?: string;
  godApprovalReason?: string;
}>;

export type DefenseReactionView = Readonly<{
  id: number;
  declarationId: number;
  opportunityId: number;
  pendingActionId: number;
  responderCharacterId: number;
  responderName: string;
  protectedTargetCharacterId: number;
  protectedTargetName: string;
  reactionType: DefenseInterventionType;
  status: "declared" | "resolved" | "cancelled" | "needs-ruling";
  committedInitiativeCost: number;
  defenderFinalCost: number | null;
  attackerAdditionalCost: number | null;
  rollRequired: boolean;
  rollId: number | null;
  outcome: string;
  declaration: DefenseInterventionSnapshot;
  objectiveComparison: unknown;
  resolution: unknown;
  originalActionDisposition: string | null;
  rulingReason: string;
  createdAt: string;
  events: readonly Readonly<{
    id: number;
    eventKind: string;
    reason: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId: string | null;
    createdAt: string;
  }>[];
}>;

export type DefenseInterventionWorkspaceView = Readonly<{
  context: { campaignId: number; sessionId: number; sceneId: number; encounterId: number };
  reactions: readonly DefenseReactionView[];
  dodgeMappings: readonly Readonly<{
    id: number;
    endpointSkillId: number;
    endpointSkillName: string;
    pathLabel: string;
    conditional: boolean;
    circumstanceLabel: string;
    reviewState: string;
  }>[];
  dodgeSkillOptions: readonly Readonly<{
    id: number;
    name: string;
    pathLabel: string;
    valid: boolean;
    problems: readonly string[];
  }>[];
  participants: readonly Readonly<{
    characterId: number;
    name: string;
    currentInitiative: number;
    weapons: readonly Readonly<{
      ownershipKey: string;
      itemId: number;
      instanceId: number | null;
      name: string;
      initiativeCost: number | null;
    }>[];
    reactionAbilities: readonly Readonly<{ id: number; name: string; initiativeCost: number | null }>[];
    governingChoices: readonly Readonly<{
      key: string;
      selection: CharacterWeaponGoverningSelection;
      label: string;
      originalTarget: number;
    }>[];
    spells: readonly Readonly<{ id: number; name: string; tradition: string }>[];
  }>[];
}>;

type LoadedResponseContext = Readonly<{
  opportunity: typeof campaignSessionEncounterResponderOpportunity.$inferSelect;
  declaration: typeof campaignSessionEncounterActionDeclaration.$inferSelect;
  pendingAction: typeof campaignSessionEncounterPendingAction.$inferSelect;
  lockedAction: ReturnType<typeof parseLockedActionDeclarationSnapshot>;
}>;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function optionalPositiveId(value: number | null | undefined, label: string): number | null {
  return value === null || value === undefined ? null : positiveId(value, label);
}

function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function optionalParticipantKey(value: number | null | undefined, label: string): number | null {
  return value === null || value === undefined ? null : participantKey(value, label);
}

function boundedText(value: string | null | undefined, label: string, maximum: number, required = false): string {
  if (value !== undefined && value !== null && typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value?.trim() ?? "";
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function rollActor(context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor): AuthorizedRollActor {
  return {
    userId: actor.userId,
    campaignId: context.campaignId,
    readAs: actor.authority,
    canRecordGodOnly: actor.authority === "god-owner",
    characterId: actor.authority === "player" ? actor.characterId : null,
  };
}

async function assertActorAuthority(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  responderCharacterId: number,
): Promise<void> {
  if (actor.authority === "god-owner") {
    if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may govern responses.");
    return;
  }
  if (actor.characterId !== responderCharacterId) {
    throw new Error("A Player may declare a response only for their own authorized Character.");
  }
  const [owned] = await tx.select({ id: campaignCharacter.id }).from(campaignCharacter)
    .innerJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, actor.userId),
    ))
    .where(and(
      eq(campaignCharacter.id, responderCharacterId),
      eq(campaignCharacter.campaignId, context.campaignId),
      eq(campaignCharacter.playerUserId, actor.userId),
      eq(campaignCharacter.isNpc, false),
    )).limit(1);
  if (!owned) throw new Error("A Player may declare a response only for their own assigned non-NPC Character.");
}

async function loadResponseContext(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  opportunityId: number,
): Promise<LoadedResponseContext> {
  const [opportunity] = await tx.select().from(campaignSessionEncounterResponderOpportunity).where(and(
    eq(campaignSessionEncounterResponderOpportunity.id, positiveId(opportunityId, "Responder opportunity")),
    eq(campaignSessionEncounterResponderOpportunity.encounterId, context.encounterId),
    eq(campaignSessionEncounterResponderOpportunity.sceneId, context.sceneId),
    eq(campaignSessionEncounterResponderOpportunity.sessionId, context.sessionId),
    eq(campaignSessionEncounterResponderOpportunity.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!opportunity || opportunity.status !== "pending" || opportunity.reactionId !== null) {
    throw new Error("Only an exact pending responder opportunity may receive a declaration.");
  }
  const [declaration] = await tx.select().from(campaignSessionEncounterActionDeclaration).where(and(
    eq(campaignSessionEncounterActionDeclaration.id, opportunity.declarationId),
    eq(campaignSessionEncounterActionDeclaration.pendingActionId, opportunity.pendingActionId),
    eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!declaration || declaration.status !== "committed") {
    throw new Error("Response declarations require the exact open Pass 6 declaration window.");
  }
  const [pendingAction] = await tx.select().from(campaignSessionEncounterPendingAction).where(and(
    eq(campaignSessionEncounterPendingAction.id, opportunity.pendingActionId),
    eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!pendingAction || !["active", "completed"].includes(pendingAction.status)) {
    throw new Error("The related pending action cannot accept a response.");
  }
  if (opportunity.windowSequence === 1) {
    const existingRolls = await tx.select({ id: campaignSessionRoll.id }).from(campaignSessionRoll)
      .leftJoin(campaignSessionEncounterReaction, eq(campaignSessionRoll.reactionId, campaignSessionEncounterReaction.id))
      .where(and(
        eq(campaignSessionRoll.encounterId, context.encounterId),
        eq(campaignSessionEncounterReaction.pendingActionId, opportunity.pendingActionId),
      )).limit(1);
    const actionRoll = await tx.select({ id: campaignSessionRoll.id }).from(campaignSessionRoll).where(
      eq(campaignSessionRoll.pendingActionId, opportunity.pendingActionId),
    ).limit(1);
    if (existingRolls[0] || actionRoll[0]) throw new Error("All initial responses must be declared before the first related Roll.");
  }
  return { opportunity, declaration, pendingAction, lockedAction: parseLockedActionDeclarationSnapshot(declaration.lockedSnapshotJson) };
}

async function loadDodgeMappings(tx: DefenseInterventionTransaction) {
  const rows = await tx.select().from(defenseSkillPathMapping)
    .where(eq(defenseSkillPathMapping.defenseType, "dodge"))
    .orderBy(asc(defenseSkillPathMapping.sortOrder), asc(defenseSkillPathMapping.id));
  const skills = await tx.select({
    id: skill.id,
    name: skill.name,
    classification: skill.classification,
    tier: skill.tier,
    primaryAttribute: skill.primaryAttribute,
    secondaryAttribute: skill.secondaryAttribute,
  }).from(skill).orderBy(asc(skill.id));
  const relationships = await tx.select({
    id: skillRelationship.id,
    skillId: skillRelationship.skillId,
    relatedSkillId: skillRelationship.relatedSkillId,
    relationshipType: skillRelationship.relationshipType,
    sortOrder: skillRelationship.sortOrder,
  }).from(skillRelationship).orderBy(asc(skillRelationship.id));
  return rows.map((row) => ({
    id: row.id,
    endpointSkillId: row.endpointSkillId,
    reviewState: row.reviewState === "approved" ? "approved" as const : "review-required" as const,
    conditional: row.conditional,
    circumstanceLabel: row.circumstanceLabel,
    sortOrder: row.sortOrder,
    path: validateCanonicalSkillPath(row.endpointSkillId, skills, relationships),
  }));
}

export async function saveDodgeSkillPathMappingInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  input: {
    id?: number | null;
    endpointSkillId: number;
    conditional: boolean;
    circumstanceLabel?: string;
    reviewState: "review-required" | "approved";
    notes?: string;
  },
): Promise<number> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may author Dodge paths.");
  const endpointSkillId = positiveId(input.endpointSkillId, "Dodge endpoint Skill");
  const id = optionalPositiveId(input.id, "Dodge path mapping");
  const mappings = await loadDodgeMappings(tx);
  const storedMapping = id === null ? null : mappings.find((mapping) => mapping.id === id) ?? null;
  if (id !== null && !storedMapping) throw new Error("That Dodge path mapping no longer exists.");
  const path = storedMapping?.endpointSkillId === endpointSkillId ? storedMapping.path : null;
  let validation = path;
  if (!validation) {
    const skills = await tx.select({ id: skill.id, name: skill.name, classification: skill.classification, tier: skill.tier, primaryAttribute: skill.primaryAttribute, secondaryAttribute: skill.secondaryAttribute }).from(skill).where(isNull(skill.archivedAt));
    const relationships = await tx.select({ id: skillRelationship.id, skillId: skillRelationship.skillId, relatedSkillId: skillRelationship.relatedSkillId, relationshipType: skillRelationship.relationshipType, sortOrder: skillRelationship.sortOrder }).from(skillRelationship);
    validation = validateCanonicalSkillPath(endpointSkillId, skills, relationships);
  }
  if (input.reviewState === "approved" && !validation.valid) {
    throw new Error(`An invalid Dodge Skill path cannot be approved: ${validation.problems.map(({ message }) => message).join(" ")}`);
  }
  const circumstanceLabel = input.conditional
    ? boundedText(input.circumstanceLabel, "Conditional Dodge circumstance", 500, true)
    : "";
  const notes = boundedText(input.notes, "Dodge mapping notes", 1000);
  const now = new Date();
  if (id !== null) {
    const [updated] = await tx.update(defenseSkillPathMapping).set({
      endpointSkillId,
      conditional: input.conditional,
      circumstanceLabel,
      reviewState: input.reviewState,
      notes,
      updatedByUserId: actor.userId,
      updatedAt: now,
    }).where(and(eq(defenseSkillPathMapping.id, id), eq(defenseSkillPathMapping.defenseType, "dodge"))).returning({ id: defenseSkillPathMapping.id });
    if (!updated) throw new Error("That Dodge path mapping no longer exists.");
    return updated.id;
  }
  const ordered = await tx.select({ sortOrder: defenseSkillPathMapping.sortOrder }).from(defenseSkillPathMapping)
    .where(eq(defenseSkillPathMapping.defenseType, "dodge"));
  const [created] = await tx.insert(defenseSkillPathMapping).values({
    defenseType: "dodge",
    endpointSkillId,
    conditional: input.conditional,
    circumstanceLabel,
    reviewState: input.reviewState,
    notes,
    sortOrder: Math.max(-1, ...ordered.map(({ sortOrder }) => sortOrder)) + 1,
    updatedByUserId: actor.userId,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: defenseSkillPathMapping.id });
  if (!created) throw new Error("The Dodge Skill path mapping was not saved.");
  return created.id;
}

export async function removeDodgeSkillPathMappingInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  mappingId: number,
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may remove Dodge paths.");
  const removed = await tx.delete(defenseSkillPathMapping).where(and(
    eq(defenseSkillPathMapping.id, positiveId(mappingId, "Dodge path mapping")),
    eq(defenseSkillPathMapping.defenseType, "dodge"),
  )).returning({ id: defenseSkillPathMapping.id });
  if (!removed[0]) throw new Error("That Dodge path mapping no longer exists.");
}

async function exactSelectedSource(
  tx: DefenseInterventionTransaction,
  characterId: number,
  selection: CharacterWeaponGoverningSelection,
): Promise<DefenseSourceSnapshot> {
  const resolved = resolveCharacterSkillLineageSelection(
    await loadCharacterSkillLineageInputInTransaction(tx, characterId),
    selection,
  );
  if (!resolved) throw new Error("The selected governing source is not an exact owned Character Skill lineage or Attribute.");
  if (resolved.source.kind === "manual") throw new Error("Exact Character lineage selection cannot resolve to a manual source.");
  return {
    kind: resolved.source.kind,
    label: resolved.source.kind === "skill"
      ? resolved.source.skillName
      : `${resolved.source.attributeKey} straight Attribute`,
    itemId: null,
    instanceId: null,
    skillAllocationId: resolved.source.kind === "skill" ? resolved.source.allocationId : null,
    attributeKey: resolved.source.kind === "attribute" ? resolved.source.attributeKey : null,
    derivedAbilityId: null,
    sourceRef: null,
    governingSource: resolved.rollGoverningSource,
    governingSnapshot: resolved.rollGoverningSourceSnapshot,
  };
}

async function buildSourceAndCost(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  loaded: LoadedResponseContext,
  input: DefenseDeclarationInput,
): Promise<{ source: DefenseSourceSnapshot; initiativeCost: number; rollRequired: boolean; godReason: string }> {
  const isGod = actor.authority === "god-owner" && actor.userId === context.ownerUserId;
  const godReason = boundedText(input.godApprovalReason ?? input.godOverrideReason, "G.O.D. approval reason", 2000);
  if (input.reactionType === "no-reaction") {
    return {
      source: { kind: "none", label: "No Defense", itemId: null, instanceId: null, skillAllocationId: null, attributeKey: null, derivedAbilityId: null, sourceRef: null, governingSource: null, governingSnapshot: null },
      initiativeCost: 0,
      rollRequired: false,
      godReason,
    };
  }
  if (input.reactionType === "dodge") {
    if (loaded.opportunity.responderCharacterId < 0) {
      const [occurrence] = await tx.select({
        displayLabel: campaignSessionEncounterParticipant.displayLabel,
        snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
      }).from(campaignSessionEncounterParticipant).where(and(
        eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
        eq(campaignSessionEncounterParticipant.characterId, loaded.opportunity.responderCharacterId),
        eq(campaignSessionEncounterParticipant.participantKind, "creature"),
      )).limit(1);
      const defenses = occurrence?.snapshot && typeof occurrence.snapshot === "object" && !Array.isArray(occurrence.snapshot)
        ? (occurrence.snapshot as { defenses?: unknown }).defenses
        : null;
      const authored = Array.isArray(defenses) ? defenses.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const row = candidate as { defenseType?: unknown; value?: unknown; against?: unknown; notes?: unknown; seedIdentity?: unknown };
        if (typeof row.defenseType !== "string" || row.defenseType.trim().toLocaleLowerCase() !== "dodge") return [];
        const value = typeof row.value === "number" ? row.value : typeof row.value === "string" && /^-?(?:\d+\.?\d*|\.\d+)$/.test(row.value.trim()) ? Number(row.value) : Number.NaN;
        return Number.isFinite(value) ? [{ ...row, value }] : [];
      }).sort((left, right) => left.value - right.value) : [];
      if (!occurrence || !authored[0]) {
        throw new Error("CREATURE_GOD_RULING_REQUIRED: this encounter Creature has no exact numeric authored Dodge defense; no Character Skill, inventory, or weapon source was invented.");
      }
      const selected = authored[0];
      const label = `${occurrence.displayLabel} authored ${String(selected.defenseType)}`;
      const governing = { kind: "manual" as const, label, originalTarget: selected.value };
      return {
        source: {
          kind: "creature-defense",
          label,
          itemId: null,
          instanceId: null,
          skillAllocationId: null,
          attributeKey: null,
          derivedAbilityId: null,
          sourceRef: typeof selected.seedIdentity === "string" ? selected.seedIdentity : "creature-defense:dodge",
          governingSource: governing,
          governingSnapshot: governing,
          authoredContext: { selected, alternatives: authored },
        },
        initiativeCost: 1,
        rollRequired: true,
        godReason: "",
      };
    }
    const lineage = await loadCharacterSkillLineageInputInTransaction(tx, loaded.opportunity.responderCharacterId);
    const mappings = await loadDodgeMappings(tx);
    const override = input.governingSelection && isGod
      ? { selection: input.governingSelection, reason: boundedText(input.godOverrideReason, "Dodge override reason", 2000, true) }
      : null;
    if (input.governingSelection && !isGod) throw new Error("Only the Campaign-owning G.O.D. may override Dodge governance.");
    if ((input.conditionalDodgeMappingIds?.length ?? 0) > 0 && !isGod) {
      throw new Error("Conditional Dodge paths require explicit G.O.D. circumstance approval.");
    }
    if ((input.conditionalDodgeMappingIds?.length ?? 0) > 0 && !godReason) {
      throw new Error("Conditional Dodge paths require a nonblank G.O.D. circumstance approval reason.");
    }
    const governance = resolveDodgeGovernance({
      lineage,
      mappings,
      approvedConditionalMappingIds: input.conditionalDodgeMappingIds,
      godOverride: override,
    });
    if (governance.status !== "resolved") throw new Error(governance.explanation);
    return {
      source: {
        kind: governance.selected.source.kind,
        label: governance.selected.source.kind === "skill"
          ? governance.selected.source.skillName
          : governance.selected.source.kind === "attribute"
            ? `${governance.selected.source.attributeKey} straight Attribute`
            : governance.selected.source.label,
        itemId: null,
        instanceId: null,
        skillAllocationId: governance.selected.source.kind === "skill" ? governance.selected.source.allocationId : null,
        attributeKey: governance.selected.source.kind === "attribute" ? governance.selected.source.attributeKey : null,
        derivedAbilityId: null,
        sourceRef: `dodge-mappings:${governance.tiedMappingIds.join(",")}`,
        governingSource: governance.selected.rollGoverningSource,
        governingSnapshot: governance.selected.rollGoverningSourceSnapshot,
      },
      initiativeCost: 1,
      rollRequired: true,
      godReason: override?.reason ?? (input.conditionalDodgeMappingIds?.length ? godReason : ""),
    };
  }
  if (input.reactionType === "parry" || input.reactionType === "block") {
    const equipment = await readCharacterEquipmentStateInTransaction(tx, loaded.opportunity.responderCharacterId);
    const itemId = optionalPositiveId(input.itemId, "Defending Item");
    const instanceId = optionalPositiveId(input.instanceId, "Defending Item instance");
    const weapon = equipment.wieldedWeapons.find((candidate) => candidate.itemId === itemId && candidate.instanceId === instanceId);
    if (!weapon) throw new Error("Parry or Block requires an exact currently wielded owned Item.");
    const governed = await resolveCharacterWeaponGovernanceInTransaction(tx, { userId: actor.userId }, {
      campaignId: context.campaignId,
      characterId: loaded.opportunity.responderCharacterId,
      itemId: weapon.itemId,
      firingModeId: null,
      oneActionOverride: isGod && input.governingSelection
        ? { ...input.governingSelection, reason: boundedText(input.godOverrideReason, "Defensive governance ruling", 2000, true) }
        : null,
    });
    if (!["resolved-normal", "resolved-persistent-override", "resolved-one-action-override"].includes(governed.status)) {
      throw new Error(governed.explanation);
    }
    const resolved = governed as Extract<typeof governed, { status: "resolved-normal" | "resolved-persistent-override" | "resolved-one-action-override" }>;
    const assignedCost = input.initiativeCost ?? null;
    if (weapon.initiativeCost === null && (!isGod || assignedCost === null || !godReason)) {
      throw new Error("The defending Item has no authored Initiative Cost; a G.O.D.-assigned cost and reason are required.");
    }
    if (weapon.initiativeCost !== null && assignedCost !== null && assignedCost !== weapon.initiativeCost) {
      throw new Error("An authored defending Item Initiative Cost cannot be replaced by a browser-supplied value.");
    }
    return {
      source: {
        kind: "weapon",
        label: weapon.itemName,
        itemId: weapon.itemId,
        instanceId: weapon.instanceId,
        skillAllocationId: resolved.source.kind === "skill" ? resolved.source.allocationId : null,
        attributeKey: resolved.source.kind === "attribute" ? resolved.source.attributeKey : null,
        derivedAbilityId: null,
        sourceRef: weapon.ownershipKey,
        governingSource: resolved.rollGoverningSource,
        governingSnapshot: resolved.rollGoverningSourceSnapshot,
      },
      initiativeCost: getDefenseInitiativeCommitment(input.reactionType, weapon.initiativeCost ?? assignedCost),
      rollRequired: true,
      godReason: weapon.initiativeCost === null ? godReason : "",
    };
  }

  if (!isGod) throw new Error("Tackle and general Intervention require Campaign-owning G.O.D. approval.");
  if (!godReason) throw new Error("Tackle or general Intervention requires a G.O.D. approval reason.");
  const sourceKind = input.sourceKind ?? "manual";
  const rollRequired = input.rollRequired !== false;
  let authoritativeInterventionCost = input.initiativeCost ?? null;
  let source: DefenseSourceSnapshot;
  if (sourceKind === "manual") {
    if (rollRequired && (typeof input.manualTarget !== "number" || !Number.isFinite(input.manualTarget))) {
      throw new Error("A rolling manual Intervention requires an explicit G.O.D. target.");
    }
    const manualLabel = boundedText(input.manualLabel ?? input.sourceRef, "Manual governing source", 200, rollRequired);
    const governingSource: RollGoverningSourceRequest | null = rollRequired
      ? { kind: "manual", label: manualLabel, originalTarget: input.manualTarget! }
      : null;
    source = { kind: "manual", label: manualLabel || "G.O.D. ruling", itemId: null, instanceId: null, skillAllocationId: null, attributeKey: null, derivedAbilityId: null, sourceRef: input.sourceRef?.trim() || null, governingSource, governingSnapshot: governingSource };
  } else if (sourceKind === "derived-ability") {
    const abilityId = positiveId(input.derivedAbilityId ?? 0, "Derived Ability");
    const state = await loadCharacterDerivedAbilitiesInTransaction(tx, loaded.opportunity.responderCharacterId, actor.userId, false);
    const ability = state.catalog.find(({ id }) => id === abilityId);
    const status = state.resolution.statuses.find(({ abilityId: id }) => id === abilityId);
    if (!ability || !status?.possessed || !status.available) throw new Error("That Derived Ability is not possessed and available to this Character.");
    if (ability.activationType !== "reaction" && !godReason) throw new Error("A non-reaction Derived Ability requires explicit G.O.D. approval.");
    const authoredInitiativeCost = ability.costs
      .filter(({ costType }) => costType === "initiative")
      .reduce((sum, { amount }) => sum + amount, 0);
    if (authoredInitiativeCost > 0) {
      if (authoritativeInterventionCost !== null && authoritativeInterventionCost !== authoredInitiativeCost) {
        throw new Error("An authored Derived Ability Initiative Cost cannot be replaced by a browser-supplied value.");
      }
      authoritativeInterventionCost = authoredInitiativeCost;
    } else if (authoritativeInterventionCost === null) {
      throw new Error("This Derived Ability has no authored Initiative Cost; an explicit G.O.D.-assigned cost is required.");
    }
    const selected = rollRequired
      ? input.governingSelection
        ? await exactSelectedSource(tx, loaded.opportunity.responderCharacterId, input.governingSelection)
        : typeof input.manualTarget === "number" && Number.isFinite(input.manualTarget)
          ? {
              kind: "manual" as const,
              label: boundedText(input.manualLabel, "Derived Ability G.O.D. resolution label", 200, true),
              itemId: null,
              instanceId: null,
              skillAllocationId: null,
              attributeKey: null,
              derivedAbilityId: ability.id,
              sourceRef: null,
              governingSource: { kind: "manual" as const, label: input.manualLabel!.trim(), originalTarget: input.manualTarget },
              governingSnapshot: { kind: "manual" as const, label: input.manualLabel!.trim(), originalTarget: input.manualTarget },
            }
          : (() => { throw new Error("A rolling Derived Ability response requires an explicit no-roll, exact Skill, weapon, Attribute, or G.O.D.-ruling resolution mode."); })()
      : null;
    source = {
      ...(selected ?? { kind: "derived-ability" as const, label: ability.name, itemId: null, instanceId: null, skillAllocationId: null, attributeKey: null, sourceRef: null, governingSource: null, governingSnapshot: null }),
      kind: "derived-ability",
      label: ability.name,
      derivedAbilityId: ability.id,
      sourceRef: `derived-ability:${ability.id};resolution:${rollRequired ? selected!.kind : "no-roll"}`,
      authoredContext: {
        activationType: ability.activationType,
        sourceSystem: ability.sourceSystem,
        sourceExternalId: ability.sourceExternalId,
        costs: ability.costs,
        useConditions: ability.useConditions,
      },
    };
  } else {
    const manualSelection = rollRequired && !input.governingSelection && typeof input.manualTarget === "number" && Number.isFinite(input.manualTarget)
      ? {
          kind: "manual" as const,
          label: boundedText(input.manualLabel, "G.O.D. resolution label", 200, true),
          itemId: null,
          instanceId: null,
          skillAllocationId: null,
          attributeKey: null,
          derivedAbilityId: null,
          sourceRef: input.sourceRef?.trim() ?? null,
          governingSource: { kind: "manual" as const, label: input.manualLabel!.trim(), originalTarget: input.manualTarget },
          governingSnapshot: { kind: "manual" as const, label: input.manualLabel!.trim(), originalTarget: input.manualTarget },
        }
      : null;
    if (!input.governingSelection && !manualSelection && rollRequired) throw new Error("A rolling Intervention requires an exact Skill, Attribute, or G.O.D.-ruling resolution mode.");
    const selected = rollRequired
      ? input.governingSelection
        ? await exactSelectedSource(tx, loaded.opportunity.responderCharacterId, input.governingSelection)
        : manualSelection!
      : { kind: sourceKind, label: boundedText(input.sourceRef, "Intervention source", 200, true), itemId: null, instanceId: null, skillAllocationId: null, attributeKey: null, derivedAbilityId: null, sourceRef: input.sourceRef?.trim() ?? null, governingSource: null, governingSnapshot: null } as DefenseSourceSnapshot;
    if (sourceKind === "item" || sourceKind === "weapon") {
      const equipment = await readCharacterEquipmentStateInTransaction(tx, loaded.opportunity.responderCharacterId);
      const itemId = positiveId(input.itemId ?? 0, "Intervention Item");
      const instanceId = optionalPositiveId(input.instanceId, "Intervention Item instance");
      const owned = equipment.instances.some((entry) => entry.itemId === itemId && entry.instanceId === instanceId && entry.state !== "inactive")
        || equipment.stacks.some((entry) => entry.itemId === itemId && entry.wieldedQuantity + entry.wornQuantity + entry.equippedQuantity > 0);
      if (!owned) throw new Error("The Intervention Item is not an exact active owned Item.");
      source = { ...selected, kind: sourceKind, itemId, instanceId, sourceRef: input.sourceRef?.trim() ?? `item:${itemId}` };
    } else if (sourceKind === "spell") {
      const spellId = positiveId(Number(input.sourceRef?.replace(/^spell:/, "")), "Intervention Spell");
      const [spellDocument] = await tx.select({
        id: campaignCharacterSpellDocument.id,
        documentId: campaignCharacterSpellDocument.documentId,
        name: campaignCharacterSpellDocument.name,
        tradition: campaignCharacterSpellDocument.tradition,
        documentJson: campaignCharacterSpellDocument.documentJson,
        inSpellbook: campaignCharacterSpellDocument.inSpellbook,
      }).from(campaignCharacterSpellDocument).where(and(
        eq(campaignCharacterSpellDocument.id, spellId),
        eq(campaignCharacterSpellDocument.characterId, loaded.opportunity.responderCharacterId),
      )).limit(1);
      if (!spellDocument) throw new Error("The Intervention Spell is not an exact saved Spell for this Character.");
      source = { ...selected, kind: "spell", label: spellDocument.name || spellDocument.documentId, sourceRef: `spell:${spellDocument.id}`, authoredContext: spellDocument };
    } else {
      source = { ...selected, kind: sourceKind, sourceRef: input.sourceRef?.trim() ?? selected.sourceRef };
    }
  }
  return {
    source,
    initiativeCost: getDefenseInitiativeCommitment(input.reactionType, input.reactionType === "tackle" ? 3 : authoritativeInterventionCost),
    rollRequired,
    godReason,
  };
}

async function commitResponseInitiative(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  characterId: number,
  amount: number,
): Promise<void> {
  if (amount === 0) return;
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const participant = before.participants.find((entry) => entry.characterId === characterId);
  if (!participant || !["active", "holding"].includes(participant.participationStatus) || participant.currentInitiative < amount) {
    throw new Error("The responding Character does not have enough available Initiative for this response.");
  }
  const after = applyDirectInitiativeDelta(before, characterId, -amount);
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
}

async function insertReactionEvent(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  reactionId: number,
  fromStatus: "declared" | "resolved" | "cancelled" | "needs-ruling" | null,
  toStatus: "declared" | "resolved" | "cancelled" | "needs-ruling",
  eventKind: string,
  actorUserId: string | null,
  reason = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(campaignSessionEncounterReactionEvent).values({
    reactionId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    fromStatus,
    toStatus,
    eventKind,
    reason,
    metadata,
    actorUserId,
  });
}

export async function declareDefenseInterventionInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  input: DefenseDeclarationInput,
): Promise<number> {
  const loaded = await loadResponseContext(tx, context, input.opportunityId);
  await assertActorAuthority(tx, context, actor, loaded.opportunity.responderCharacterId);
  const protectedTargetCharacterId = participantKey(input.protectedTargetCharacterId, "Protected target Participant");
  if (!loaded.lockedAction.targetCharacterIds.includes(protectedTargetCharacterId)) {
    throw new Error("The protected target must be an exact target of the locked original action.");
  }
  const targetCharacterId = optionalParticipantKey(input.targetCharacterId, "Response target Participant")
    ?? (input.reactionType === "tackle" ? protectedTargetCharacterId : loaded.lockedAction.actorCharacterId);
  const participantIds = await tx.select({ id: campaignSessionEncounterInitiativeParticipant.characterId })
    .from(campaignSessionEncounterInitiativeParticipant)
    .where(and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, context.encounterId),
      inArray(campaignSessionEncounterInitiativeParticipant.characterId, [protectedTargetCharacterId, targetCharacterId]),
    ));
  if (new Set(participantIds.map(({ id }) => id)).size !== new Set([protectedTargetCharacterId, targetCharacterId]).size) {
    throw new Error("Response targets must be exact Initiative participants in this Encounter.");
  }
  const isAllyDefense = loaded.opportunity.responderCharacterId !== protectedTargetCharacterId
    && ["dodge", "parry", "block"].includes(input.reactionType);
  if (isAllyDefense && (actor.authority !== "god-owner" || !boundedText(input.godApprovalReason, "Ally positioning approval", 2000))) {
    throw new Error("Ally defense requires Campaign-owning G.O.D. positioning approval and a reason.");
  }
  const opposesReactionId = optionalPositiveId(input.opposesReactionId, "Opposed Reaction");
  if (opposesReactionId !== null) {
    const [tackle] = await tx.select().from(campaignSessionEncounterReaction).where(and(
      eq(campaignSessionEncounterReaction.id, opposesReactionId),
      eq(campaignSessionEncounterReaction.pendingActionId, loaded.pendingAction.id),
      eq(campaignSessionEncounterReaction.reactionType, "tackle"),
      eq(campaignSessionEncounterReaction.targetCharacterId, loaded.opportunity.responderCharacterId),
    )).limit(1);
    if (!tackle) throw new Error("The response does not oppose an exact declared Tackle against this Character.");
  }
  const prepared = await buildSourceAndCost(tx, context, actor, loaded, input);
  if (prepared.source.itemId !== null) {
    await lockActiveItemRootInTransaction(tx, prepared.source.itemId);
  }
  const intendedMechanicalPurpose = boundedText(
    input.intendedMechanicalPurpose,
    "Intended mechanical purpose",
    1000,
    input.reactionType === "intervention",
  );
  const now = new Date();
  const snapshot = buildDefenseInterventionSnapshot({
    actionDeclarationId: loaded.declaration.id,
    pendingActionId: loaded.pendingAction.id,
    responderOpportunityId: loaded.opportunity.id,
    responderCharacterId: loaded.opportunity.responderCharacterId,
    protectedTargetCharacterId,
    targetCharacterId,
    opposesReactionId,
    reactionType: input.reactionType,
    source: prepared.source,
    rollRequired: prepared.rollRequired,
    initiativeCost: prepared.initiativeCost,
    explicitModifiers: input.explicitModifiers ?? [],
    intendedMechanicalPurpose,
    godApprovalReason: prepared.godReason,
    declaredByUserId: actor.userId,
    declaredAt: now.toISOString(),
  });
  await commitResponseInitiative(tx, context, loaded.opportunity.responderCharacterId, snapshot.initiativeCost);
  const noDefense = input.reactionType === "no-reaction";
  const [created] = await tx.insert(campaignSessionEncounterReaction).values({
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    pendingActionId: loaded.pendingAction.id,
    reactorCharacterId: loaded.opportunity.responderCharacterId,
    protectedTargetCharacterId,
    targetCharacterId,
    opposesReactionId,
    reactionType: input.reactionType,
    defendingItemId: prepared.source.itemId,
    defendingInstanceId: prepared.source.instanceId,
    committedInitiativeCost: snapshot.initiativeCost,
    status: noDefense ? "resolved" : "declared",
    outcome: noDefense ? "no-defense" : "",
    defenderFinalCost: noDefense ? 0 : null,
    attackerAdditionalCost: noDefense ? 0 : null,
    declarationSnapshotJson: snapshot,
    rollRequired: snapshot.rollRequired,
    godApprovalReason: snapshot.godApprovalReason,
    declaredByUserId: actor.userId,
    godApprovedByUserId: snapshot.godApprovalReason ? context.ownerUserId : null,
    reconciliationAppliedAt: noDefense ? now : null,
    resolvedAt: noDefense ? now : null,
  }).returning({ id: campaignSessionEncounterReaction.id });
  if (!created) throw new Error("The defense/intervention declaration was not persisted.");
  await tx.update(campaignSessionEncounterResponderOpportunity).set({
    reactionId: created.id,
    status: "response-declared",
    responseLabel: input.reactionType === "no-reaction" ? "No Defense" : `${input.reactionType}: ${prepared.source.label}`,
    reconciledByUserId: actor.userId,
    reconciledAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterResponderOpportunity.id, loaded.opportunity.id));
  await insertReactionEvent(tx, context, created.id, null, noDefense ? "resolved" : "declared", noDefense ? "no-defense-declared" : "response-declared", actor.userId, snapshot.godApprovalReason, {
    opportunityId: loaded.opportunity.id,
    committedInitiativeCost: snapshot.initiativeCost,
  });
  await recordActionDeclarationAuditEventInTransaction(tx, context, loaded.declaration.id, "committed", "response-declared", actor.userId, snapshot.godApprovalReason, {
    reactionId: created.id,
    reactionType: input.reactionType,
    responderCharacterId: loaded.opportunity.responderCharacterId,
    protectedTargetCharacterId,
    committedInitiativeCost: snapshot.initiativeCost,
  });
  await refreshActionDeclarationRollingReadinessInTransaction(tx, context, loaded.declaration.id, actor.userId);
  return created.id;
}

async function lockedActionForRoll(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  declarationId: number,
) {
  const [row] = await tx.select().from(campaignSessionEncounterActionDeclaration).where(and(
    eq(campaignSessionEncounterActionDeclaration.id, positiveId(declarationId, "Action declaration")),
    eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
    eq(campaignSessionEncounterActionDeclaration.sceneId, context.sceneId),
    eq(campaignSessionEncounterActionDeclaration.sessionId, context.sessionId),
    eq(campaignSessionEncounterActionDeclaration.campaignId, context.campaignId),
  )).limit(1);
  if (!row || row.pendingActionId === null) throw new Error("The exact committed action declaration was not found.");
  return { row, snapshot: parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson) };
}

export async function recordDeclaredAttackRollInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
  input: { method: RollMethod; enteredTotal?: number | null; visibility?: RollVisibility; manualTarget?: number | null; manualLabel?: string; notes?: string },
): Promise<RollLedgerEntry> {
  const { row, snapshot } = await lockedActionForRoll(tx, context, declarationId);
  if (actor.authority !== "god-owner" && actor.characterId !== snapshot.actorCharacterId) throw new Error("A Player may roll only their own declared action.");
  if (actor.authority === "god-owner" && actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may record this Roll.");
  const governingSource = rollGoverningRequestFromLockedActionSource(snapshot.governing?.source, snapshot.actorCharacterId)
    ?? (actor.authority === "god-owner" && typeof input.manualTarget === "number"
      ? { kind: "manual" as const, label: boundedText(input.manualLabel, "Manual attack target label", 200, true), originalTarget: input.manualTarget }
      : null);
  if (!governingSource) throw new Error("The action has no exact locked governing source; an explicit G.O.D. manual target is required.");
  return recordRollInTransaction(tx, rollActor(context, actor), {
    sessionId: context.sessionId,
    sceneId: context.sceneId,
    encounterId: context.encounterId,
    rollerCharacterId: snapshot.actorCharacterId,
    targetCharacterId: snapshot.targetCharacterIds[0] ?? null,
    pendingActionId: row.pendingActionId,
    method: input.method,
    enteredTotal: input.enteredTotal,
    visibility: input.visibility ?? "table",
    purposeKind: "attack",
    label: `${snapshot.label} - attack`,
    notes: input.notes,
    mechanical: {
      governingSource,
      modifiers: snapshot.explicitModifiers.map(({ label, value }) => ({
        label,
        kind: value >= 0 ? "bonus" as const : "penalty" as const,
        magnitude: Math.abs(value),
      })),
    },
  });
}

export async function recordDeclaredResponseRollInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  reactionId: number,
  input: { method: RollMethod; enteredTotal?: number | null; visibility?: RollVisibility; notes?: string },
): Promise<RollLedgerEntry> {
  const [row] = await tx.select().from(campaignSessionEncounterReaction).where(and(
    eq(campaignSessionEncounterReaction.id, positiveId(reactionId, "Response declaration")),
    eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
    eq(campaignSessionEncounterReaction.sceneId, context.sceneId),
    eq(campaignSessionEncounterReaction.sessionId, context.sessionId),
    eq(campaignSessionEncounterReaction.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!row || row.declarationSnapshotJson === null) throw new Error("The exact Pass 7 response declaration was not found.");
  await assertActorAuthority(tx, context, actor, row.reactorCharacterId);
  const snapshot = parseDefenseInterventionSnapshot(row.declarationSnapshotJson);
  if (!snapshot.rollRequired || snapshot.source.governingSource === null) throw new Error("This response has no Roll slot.");
  const roll = await recordRollInTransaction(tx, rollActor(context, actor), {
    sessionId: context.sessionId,
    sceneId: context.sceneId,
    encounterId: context.encounterId,
    rollerCharacterId: row.reactorCharacterId,
    targetCharacterId: snapshot.targetCharacterId,
    reactionId: row.id,
    method: input.method,
    enteredTotal: input.enteredTotal,
    visibility: input.visibility ?? "table",
    purposeKind: snapshot.source.kind === "derived-ability" ? "ability" : "defense",
    label: `${snapshot.reactionType}: ${snapshot.source.label}`,
    notes: input.notes,
    mechanical: { governingSource: snapshot.source.governingSource, modifiers: snapshot.explicitModifiers },
  });
  await insertReactionEvent(tx, context, row.id, row.status, row.status, "response-roll-recorded", actor.userId, "", { rollId: roll.id, method: roll.method });
  return roll;
}

async function effectiveRolls(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  pendingActionId: number,
  reactionIds: readonly number[],
) {
  const rows = await tx.select({
    id: campaignSessionRoll.id,
    pendingActionId: campaignSessionRoll.pendingActionId,
    reactionId: campaignSessionRoll.reactionId,
  }).from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, context.encounterId));
  const relevant = rows.filter((row) => row.pendingActionId === pendingActionId || (row.reactionId !== null && reactionIds.includes(row.reactionId)));
  const snapshots = new Map<number, Awaited<ReturnType<typeof readEffectiveRollSnapshotInTransaction>>>();
  for (const row of relevant) snapshots.set(row.id, await readEffectiveRollSnapshotInTransaction(tx, rollActor(context, actor), row.id));
  return snapshots;
}

async function applyRefunds(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  refunds: readonly { characterId: number; amount: number }[],
): Promise<void> {
  const actual = refunds.filter(({ amount }) => amount > 0);
  if (!actual.length) return;
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  let after = before;
  for (const refund of actual) after = applyDirectInitiativeDelta(after, refund.characterId, refund.amount);
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
}

async function applyTackleAttackerCost(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  tackleReactionId: number,
  amount: number,
  actorUserId: string,
): Promise<void> {
  if (amount <= 0) return;
  const [tackle] = await tx.select({
    id: campaignSessionEncounterReaction.id,
    reactorCharacterId: campaignSessionEncounterReaction.reactorCharacterId,
    status: campaignSessionEncounterReaction.status,
  }).from(campaignSessionEncounterReaction).where(and(
    eq(campaignSessionEncounterReaction.id, tackleReactionId),
    eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
    eq(campaignSessionEncounterReaction.reactionType, "tackle"),
  )).limit(1).for("update");
  if (!tackle || tackle.status === "cancelled") throw new Error("The opposed Tackle is no longer available for cost reconciliation.");
  const before = await loadInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context.encounterId);
  const after = applyDirectInitiativeDelta(before, tackle.reactorCharacterId, -amount);
  await persistInitiativeEngineInTransaction(tx as RuntimeIntegrationTransaction, context, before, after);
  await tx.update(campaignSessionEncounterReaction).set({
    attackerAdditionalCost: sql`coalesce(${campaignSessionEncounterReaction.attackerAdditionalCost}, 0) + ${amount}`,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterReaction.id, tackle.id));
  await insertReactionEvent(tx, context, tackle.id, tackle.status, tackle.status, "opposed-defense-cost-added", actorUserId, "Successful Parry/Block against Tackle added its full Item cost to the tackler.", { amount });
}

export async function resolveDeclaredDefensesInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
): Promise<DefenseGroupOutcome> {
  const { row: declaration, snapshot: actionSnapshot } = await lockedActionForRoll(tx, context, declarationId);
  await assertActorAuthority(tx, context, actor, declaration.actorCharacterId);
  if (declaration.defenseResolutionJson !== null) throw new Error("Defense reconciliation has already been applied to this declaration.");
  if (!declaration.pendingActionId) throw new Error("The action declaration has no pending action.");
  const opportunities = await tx.select().from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, declaration.id)).for("update");
  if (opportunities.some(({ status }) => status === "pending")) throw new Error("Every responder opportunity must be reconciled before opposition resolves.");
  const reactionIds = opportunities.flatMap(({ reactionId }) => reactionId === null ? [] : [reactionId]);
  const reactions = reactionIds.length
    ? await tx.select().from(campaignSessionEncounterReaction).where(inArray(campaignSessionEncounterReaction.id, reactionIds)).orderBy(asc(campaignSessionEncounterReaction.id)).for("update")
    : [];
  if (reactions.some(({ declarationSnapshotJson }) => declarationSnapshotJson === null)) throw new Error("A legacy Reaction cannot be silently used as a Pass 7 defense declaration.");
  const rolls = await effectiveRolls(tx, context, actor, declaration.pendingActionId, reactionIds);
  const attackRoll = [...rolls.values()].find(({ pendingActionId }) => pendingActionId === declaration.pendingActionId);
  if (!attackRoll || attackRoll.status !== "recorded" || !attackRoll.mechanicalSnapshot) throw new Error("The immutable attack Roll is missing or voided.");
  const rollByReaction = new Map([...rolls.values()].flatMap((roll) => roll.reactionId === null ? [] : [[roll.reactionId, roll] as const]));
  for (const reaction of reactions) {
    const snapshot = parseDefenseInterventionSnapshot(reaction.declarationSnapshotJson);
    if (reaction.status === "declared" && snapshot.rollRequired) {
      const roll = rollByReaction.get(reaction.id);
      if (!roll || roll.status !== "recorded" || !roll.mechanicalSnapshot) throw new Error(`Response #${reaction.id} is unresolved because its immutable Roll is missing or voided.`);
    }
  }
  const ordinary = reactions.filter(({ opposesReactionId, reactionType }) => opposesReactionId === null && ["dodge", "parry", "block", "no-reaction"].includes(reactionType));
  const result = resolveDefenseGroup({
    attack: attackRoll.mechanicalSnapshot.resolution,
    defenses: ordinary.map((reaction) => ({
      reactionId: reaction.id,
      reactionType: reaction.reactionType as DefenseInterventionType,
      committedInitiativeCost: reaction.committedInitiativeCost,
      cancelled: reaction.status === "cancelled",
      roll: rollByReaction.get(reaction.id)?.mechanicalSnapshot?.resolution ?? null,
    })),
  });
  const tackleOutcomes: Record<number, unknown> = {};
  let awaitsGod = result.status === "awaiting-god-ruling";
  let targetRemovedFromPath = false;
  for (const tackle of reactions.filter(({ opposesReactionId, reactionType }) => opposesReactionId === null && reactionType === "tackle")) {
    const tackleRoll = rollByReaction.get(tackle.id)?.mechanicalSnapshot?.resolution;
    if (!tackleRoll) throw new Error(`Tackle #${tackle.id} is missing its immutable Roll.`);
    const answer = reactions.find(({ opposesReactionId }) => opposesReactionId === tackle.id);
    if (!answer) throw new Error(`Tackle #${tackle.id} requires the target's declared No Defense or opposed response.`);
    const answerRoll = answer.reactionType === "no-reaction" ? "no-defense" as const : rollByReaction.get(answer.id)?.mechanicalSnapshot?.resolution;
    if (!answerRoll) throw new Error(`Tackle response #${answer.id} is missing its immutable Roll.`);
    const [profile] = actionSnapshot.weapon === null ? [] : await tx.select({ ammunitionItemId: weaponProfile.ammunitionItemId })
      .from(weaponProfile).where(eq(weaponProfile.id, actionSnapshot.weapon.weaponProfileId)).limit(1);
    const tackleResult = resolveTackle({ tackleRoll, targetResponse: answerRoll, dangerKind: profile?.ammunitionItemId ? "firearm" : "other" });
    let answerCosts = { defenderFinalCost: 0, defenderRefund: 0, attackerAdditionalCost: 0 };
    if (answer.reactionType !== "no-reaction" && answer.status === "declared") {
      if (tackleResult.status === "awaiting-god-ruling") {
        const now = new Date();
        await tx.update(campaignSessionEncounterReaction).set({
          status: "needs-ruling",
          outcome: "tackle-defense-critical-collision",
          objectiveComparisonJson: tackleResult.comparison,
          resolvedAt: now,
          updatedAt: now,
        }).where(eq(campaignSessionEncounterReaction.id, answer.id));
        await insertReactionEvent(tx, context, answer.id, "declared", "needs-ruling", "tackle-defense-critical-collision", actor.userId, "The opposed Tackle comparison requires a G.O.D. ruling.", { comparison: tackleResult.comparison });
      } else {
        const defenseSucceeded = tackleRoll.succeeded && tackleResult.comparison?.objectiveOutcome === "defense-wins";
        answerCosts = reconcileDefenseCost({
          reactionType: answer.reactionType as DefenseInterventionType,
          committedInitiativeCost: answer.committedInitiativeCost,
          defenseSucceeded,
        });
        await applyRefunds(tx, context, [{ characterId: answer.reactorCharacterId, amount: answerCosts.defenderRefund }]);
        await applyTackleAttackerCost(tx, context, tackle.id, answerCosts.attackerAdditionalCost, actor.userId);
        const now = new Date();
        const answerOutcome = defenseSucceeded ? "defense-stopped-tackle" : "defense-failed-against-tackle";
        await tx.update(campaignSessionEncounterReaction).set({
          status: "resolved",
          outcome: answerOutcome,
          defenderFinalCost: answerCosts.defenderFinalCost,
          attackerAdditionalCost: answerCosts.attackerAdditionalCost,
          objectiveComparisonJson: tackleResult.comparison,
          resolutionSnapshotJson: { status: answerOutcome, comparison: tackleResult.comparison, costs: answerCosts },
          originalActionDisposition: tackleResult.targetRemovedFromPath ? "target-removed" : "continue",
          reconciliationAppliedAt: now,
          resolvedAt: now,
          updatedAt: now,
        }).where(eq(campaignSessionEncounterReaction.id, answer.id));
        await insertReactionEvent(tx, context, answer.id, "declared", "resolved", "tackle-defense-resolution", actor.userId, "", { status: answerOutcome, comparison: tackleResult.comparison, costs: answerCosts });
      }
    }
    tackleOutcomes[tackle.id] = { ...tackleResult, responseReactionId: answer.id, responseCosts: answerCosts };
    targetRemovedFromPath ||= tackleResult.targetRemovedFromPath;
    if (tackleResult.status === "awaiting-god-ruling" || tackleResult.originalActionRequiresGodDisposition) awaitsGod = true;
  }
  if (reactions.some(({ opposesReactionId, reactionType, status }) => opposesReactionId === null && reactionType === "intervention" && status !== "cancelled")) awaitsGod = true;
  if (result.status === "unresolved") return result;
  const now = new Date();
  if (result.status === "awaiting-god-ruling") {
    const rulingReactionIds = new Set(result.outcomes
      .filter(({ status }) => status === "god-ruling-required")
      .map(({ reactionId }) => reactionId));
    if (attackRoll.mechanicalSnapshot.resolution.requiresGodRuling && rulingReactionIds.size === 0) {
      const firstUncancelled = result.outcomes.find(({ status }) => status !== "cancelled");
      if (firstUncancelled) rulingReactionIds.add(firstUncancelled.reactionId);
    }
    for (const outcome of result.outcomes.filter(({ reactionId }) => rulingReactionIds.has(reactionId))) {
      await tx.update(campaignSessionEncounterReaction).set({
        status: "needs-ruling",
        objectiveComparisonJson: outcome.comparison,
        outcome: "critical-collision-awaiting-god-ruling",
        resolvedAt: now,
        updatedAt: now,
      }).where(eq(campaignSessionEncounterReaction.id, outcome.reactionId));
      await insertReactionEvent(tx, context, outcome.reactionId, "declared", "needs-ruling", "critical-collision", actor.userId, "Objective comparison requires a G.O.D. ruling.", { comparison: outcome.comparison });
    }
  }
  const appliedOutcomes = result.status === "resolved" ? result.outcomes : [];
  await applyRefunds(tx, context, appliedOutcomes.map((outcome) => ({
    characterId: reactions.find(({ id }) => id === outcome.reactionId)!.reactorCharacterId,
    amount: outcome.defenderRefund,
  })));
  for (const outcome of appliedOutcomes) {
    const reaction = reactions.find(({ id }) => id === outcome.reactionId)!;
    if (reaction.status === "cancelled" || reaction.reconciliationAppliedAt !== null) continue;
    await tx.update(campaignSessionEncounterReaction).set({
      status: "resolved",
      outcome: outcome.status,
      defenderFinalCost: outcome.defenderFinalCost,
      attackerAdditionalCost: outcome.attackerAdditionalCost,
      objectiveComparisonJson: outcome.comparison,
      resolutionSnapshotJson: outcome,
      originalActionDisposition: result.attackStopped ? "stopped" : "continue",
      reconciliationAppliedAt: now,
      resolvedAt: now,
      updatedAt: now,
    }).where(eq(campaignSessionEncounterReaction.id, outcome.reactionId));
    await insertReactionEvent(tx, context, outcome.reactionId, reaction.status, "resolved", "objective-resolution", actor.userId, "", { outcome });
  }
  for (const reaction of reactions.filter(({ reactionType, status }) => ["tackle", "intervention"].includes(reactionType) && status === "declared")) {
    const resolution = reaction.reactionType === "tackle" ? tackleOutcomes[reaction.id] : { status: "intervention-resolved-awaiting-god-treatment" };
    const tackleAttackerCost = reaction.reactionType === "tackle"
      ? (resolution as { responseCosts?: { attackerAdditionalCost?: number } }).responseCosts?.attackerAdditionalCost ?? 0
      : 0;
    await tx.update(campaignSessionEncounterReaction).set({
      status: awaitsGod ? "needs-ruling" : "resolved",
      outcome: reaction.reactionType === "tackle" ? (resolution as { status: string }).status : "intervention-awaits-god",
      defenderFinalCost: reaction.committedInitiativeCost,
      attackerAdditionalCost: tackleAttackerCost,
      resolutionSnapshotJson: resolution,
      originalActionDisposition: awaitsGod ? "awaiting-god-ruling" : targetRemovedFromPath ? "target-removed" : "continue",
      reconciliationAppliedAt: now,
      resolvedAt: now,
      updatedAt: now,
    }).where(eq(campaignSessionEncounterReaction.id, reaction.id));
    await insertReactionEvent(tx, context, reaction.id, "declared", awaitsGod ? "needs-ruling" : "resolved", "intervention-objective-resolution", actor.userId, "", { resolution });
  }
  if (result.status === "resolved" && result.attackerAdditionalCost > 0) {
    await extendActionDeclarationCostInTransaction(tx, context, declaration.id, result.attackerAdditionalCost, actor.userId, "Successful Parry/Block full Item cost added to the attacker action.");
  }
  const aggregate = {
    schemaVersion: 1,
    attackRollId: attackRoll.id,
    responseRollIds: [...rollByReaction.values()].map(({ id }) => id),
    objective: result,
    tackleOutcomes,
    originalActionDisposition: awaitsGod ? "awaiting-god-ruling" : targetRemovedFromPath ? "target-removed" : result.attackStopped ? "stopped" : "continue",
    resolvedAt: now.toISOString(),
    resolvedByUserId: actor.userId,
    nonautomation: "No damage, Health, armor, Conditions, ammunition, movement, or narrative consequence was applied.",
  };
  await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: awaitsGod ? "awaiting-god-ruling" : declaration.status,
    defenseResolutionJson: aggregate,
    defenseResolvedByUserId: actor.userId,
    defenseResolvedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterActionDeclaration.id, declaration.id));
  await recordActionDeclarationAuditEventInTransaction(tx, context, declaration.id, awaitsGod ? "awaiting-god-ruling" : declaration.status, "defense-resolution-recorded", actor.userId, "", aggregate);
  return { ...result, status: awaitsGod ? "awaiting-god-ruling" : result.status };
}

function deferredObjectiveOutcomes(value: unknown): readonly IndividualDefenseOutcome[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const objective = (value as { objective?: unknown }).objective;
  if (!objective || typeof objective !== "object" || Array.isArray(objective)) return [];
  const outcomes = (objective as { outcomes?: unknown }).outcomes;
  return Array.isArray(outcomes) ? outcomes as IndividualDefenseOutcome[] : [];
}

async function applyDeferredObjectiveOutcomesInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  declarationId: number,
  pendingActionId: number,
  disposition: Exclude<OriginalActionDisposition, "stopped" | "target-removed" | "awaiting-god-ruling">,
): Promise<void> {
  const [declaration] = await tx.select({
    defenseResolutionJson: campaignSessionEncounterActionDeclaration.defenseResolutionJson,
  }).from(campaignSessionEncounterActionDeclaration)
    .where(eq(campaignSessionEncounterActionDeclaration.id, declarationId))
    .limit(1)
    .for("update");
  const outcomes = deferredObjectiveOutcomes(declaration?.defenseResolutionJson);
  if (!outcomes.length) return;
  const rows = await tx.select().from(campaignSessionEncounterReaction).where(and(
    eq(campaignSessionEncounterReaction.pendingActionId, pendingActionId),
    eq(campaignSessionEncounterReaction.status, "declared"),
  )).orderBy(asc(campaignSessionEncounterReaction.id)).for("update");
  const deferred = rows.flatMap((reaction) => {
    if (reaction.reconciliationAppliedAt !== null) return [];
    const outcome = outcomes.find(({ reactionId }) => reactionId === reaction.id);
    if (!outcome || outcome.status === "god-ruling-required" || outcome.status === "missing-roll") return [];
    return [{ reaction, outcome }];
  });
  if (!deferred.length) return;
  await applyRefunds(tx, context, deferred.map(({ reaction, outcome }) => ({
    characterId: reaction.reactorCharacterId,
    amount: outcome.defenderRefund,
  })));
  const now = new Date();
  for (const { reaction, outcome } of deferred) {
    await tx.update(campaignSessionEncounterReaction).set({
      status: "resolved",
      outcome: outcome.status,
      defenderFinalCost: outcome.defenderFinalCost,
      attackerAdditionalCost: outcome.attackerAdditionalCost,
      objectiveComparisonJson: outcome.comparison,
      resolutionSnapshotJson: outcome,
      originalActionDisposition: disposition,
      reconciliationAppliedAt: now,
      resolvedAt: now,
      updatedAt: now,
    }).where(eq(campaignSessionEncounterReaction.id, reaction.id));
    await insertReactionEvent(tx, context, reaction.id, "declared", "resolved", "deferred-objective-resolution", actor.userId, "", { outcome });
  }
  const attackerAdditionalCost = deferred.reduce((sum, { outcome }) => sum + outcome.attackerAdditionalCost, 0);
  if (attackerAdditionalCost > 0) {
    await extendActionDeclarationCostInTransaction(
      tx,
      context,
      declarationId,
      attackerAdditionalCost,
      actor.userId,
      "Deferred successful Parry/Block reconciliation added the full defending Item cost.",
    );
  }
}

export async function ruleOnDefenseInterventionInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  reactionId: number,
  input: {
    disposition: Exclude<OriginalActionDisposition, "stopped" | "target-removed" | "awaiting-god-ruling">;
    reason: string;
    modifiedOutcome?: string;
    defenseSucceeded?: boolean;
  },
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may adjudicate an Intervention.");
  const reason = boundedText(input.reason, "G.O.D. ruling reason", 2000, true);
  const [reaction] = await tx.select().from(campaignSessionEncounterReaction).where(and(
    eq(campaignSessionEncounterReaction.id, positiveId(reactionId, "Response declaration")),
    eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!reaction || reaction.declarationSnapshotJson === null || reaction.status !== "needs-ruling") {
    throw new Error("Only an exact response awaiting ruling may be adjudicated.");
  }
  const snapshot = parseDefenseInterventionSnapshot(reaction.declarationSnapshotJson);
  const isCriticalDefense = ["dodge", "parry", "block"].includes(reaction.reactionType);
  if (isCriticalDefense && typeof input.defenseSucceeded !== "boolean") {
    throw new Error("A critical defense collision ruling must explicitly authorize whether that defense succeeded.");
  }
  const costs = isCriticalDefense
    ? reconcileDefenseCost({
        reactionType: reaction.reactionType as DefenseInterventionType,
        committedInitiativeCost: reaction.committedInitiativeCost,
        defenseSucceeded: input.defenseSucceeded!,
      })
    : { defenderFinalCost: reaction.committedInitiativeCost, defenderRefund: 0, attackerAdditionalCost: 0 };
    if (reaction.reconciliationAppliedAt === null) {
      await applyRefunds(tx, context, [{ characterId: reaction.reactorCharacterId, amount: costs.defenderRefund }]);
      if (costs.attackerAdditionalCost > 0) {
        if (snapshot.opposesReactionId !== null) {
          await applyTackleAttackerCost(tx, context, snapshot.opposesReactionId, costs.attackerAdditionalCost, actor.userId);
        } else {
          await extendActionDeclarationCostInTransaction(
            tx,
            context,
            snapshot.actionDeclarationId,
            costs.attackerAdditionalCost,
            actor.userId,
            "G.O.D.-authorized successful critical Parry/Block added the full defending Item cost.",
          );
        }
      }
  }
  const now = new Date();
  await tx.update(campaignSessionEncounterReaction).set({
    status: "resolved",
    rulingReason: reason,
    ruledByUserId: actor.userId,
    ruledAt: now,
    originalActionDisposition: input.disposition,
    outcome: isCriticalDefense
      ? input.defenseSucceeded ? "god-ruled-defense-stopped-attack" : "god-ruled-defense-failed"
      : reaction.outcome,
    defenderFinalCost: costs.defenderFinalCost,
    attackerAdditionalCost: costs.attackerAdditionalCost,
    reconciliationAppliedAt: now,
    resolutionSnapshotJson: {
      ...(reaction.resolutionSnapshotJson as Record<string, unknown> | null ?? {}),
      finalAuthorizedRuling: {
        disposition: input.disposition,
        reason,
        modifiedOutcome: boundedText(input.modifiedOutcome, "Modified outcome", 2000),
        defenseSucceeded: input.defenseSucceeded ?? null,
      },
    },
    resolvedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterReaction.id, reaction.id));
  await insertReactionEvent(tx, context, reaction.id, "needs-ruling", "resolved", "god-ruling", actor.userId, reason, {
    disposition: input.disposition,
    modifiedOutcome: input.modifiedOutcome ?? "",
    defenseSucceeded: input.defenseSucceeded ?? null,
    costs,
  });
  if (input.disposition === "cancel") {
    await cancelActionDeclarationInTransaction(tx, context, actor, snapshot.actionDeclarationId, reason);
  } else {
    const remainingRulings = await tx.select({ id: campaignSessionEncounterReaction.id })
      .from(campaignSessionEncounterReaction)
      .where(and(
        eq(campaignSessionEncounterReaction.pendingActionId, snapshot.pendingActionId),
        eq(campaignSessionEncounterReaction.status, "needs-ruling"),
      )).limit(1);
    if (remainingRulings[0]) return;
    await applyDeferredObjectiveOutcomesInTransaction(
      tx,
      context,
      actor,
      snapshot.actionDeclarationId,
      snapshot.pendingActionId,
      input.disposition,
    );
    const [current] = await tx.select({ status: campaignSessionEncounterActionDeclaration.status })
      .from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, snapshot.actionDeclarationId)).limit(1);
    if (current?.status === "committed" || current?.status === "rolling-ready" || current?.status === "rolling") return;
    await continueActionDeclarationAfterRulingInTransaction(tx, context, actor, snapshot.actionDeclarationId, `${input.disposition}: ${reason}`);
  }
}

export async function cancelDeclaredResponseInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: Extract<ActionDeclarationActor, { authority: "god-owner" }>,
  reactionId: number,
  reasonInput: string,
  refundByExplicitRuling = false,
): Promise<void> {
  if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may cancel a locked response.");
  const reason = boundedText(reasonInput, "Cancellation reason", 2000, true);
  const [reaction] = await tx.select().from(campaignSessionEncounterReaction).where(and(
    eq(campaignSessionEncounterReaction.id, positiveId(reactionId, "Response declaration")),
    eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!reaction || reaction.declarationSnapshotJson === null || reaction.status !== "declared") throw new Error("Only a declared Pass 7 response may be cancelled.");
  if (refundByExplicitRuling) await applyRefunds(tx, context, [{ characterId: reaction.reactorCharacterId, amount: reaction.committedInitiativeCost }]);
  const now = new Date();
  await tx.update(campaignSessionEncounterReaction).set({
    status: "cancelled",
    outcome: "cancelled",
    defenderFinalCost: refundByExplicitRuling ? 0 : reaction.committedInitiativeCost,
    attackerAdditionalCost: 0,
    rulingReason: reason,
    ruledByUserId: actor.userId,
    ruledAt: now,
    reconciliationAppliedAt: now,
    resolvedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterReaction.id, reaction.id));
  await insertReactionEvent(tx, context, reaction.id, "declared", "cancelled", "response-cancelled", actor.userId, reason, { refundByExplicitRuling });
}

export async function readDefenseInterventionWorkspaceInTransaction(
  tx: DefenseInterventionTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
): Promise<DefenseInterventionWorkspaceView> {
  if (actor.authority === "god-owner") {
    if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may read the governance workspace.");
  } else {
    await lockPlayerCombatContextInTransaction(tx, context.encounterId, actor.characterId, actor.userId);
  }
  const participants = await tx.select({
    characterId: campaignSessionEncounterInitiativeParticipant.characterId,
    currentInitiative: campaignSessionEncounterInitiativeParticipant.currentInitiative,
    participantKind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    name: campaignCharacter.name,
  }).from(campaignSessionEncounterInitiativeParticipant)
    .innerJoin(campaignSessionEncounterParticipant, and(
      eq(campaignSessionEncounterParticipant.encounterId, campaignSessionEncounterInitiativeParticipant.encounterId),
      eq(campaignSessionEncounterParticipant.characterId, campaignSessionEncounterInitiativeParticipant.characterId),
    ))
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterInitiativeParticipant.characterId))
    .where(and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, context.encounterId),
      actor.authority === "player"
        ? eq(campaignSessionEncounterInitiativeParticipant.characterId, actor.characterId)
        : undefined,
    ))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
  const participantViews = [] as DefenseInterventionWorkspaceView["participants"][number][];
  for (const participant of participants) {
    if (participant.participantKind === "creature") {
      participantViews.push({
        characterId: participant.characterId,
        name: participant.displayLabel,
        currentInitiative: participant.currentInitiative,
        weapons: [],
        reactionAbilities: [],
        governingChoices: [],
        spells: [],
      });
      continue;
    }
    const equipment = await readCharacterEquipmentStateInTransaction(tx, participant.characterId);
    const abilities = await loadCharacterDerivedAbilitiesInTransaction(tx, participant.characterId, actor.userId, false);
    const lineage = await loadCharacterSkillLineageInputInTransaction(tx, participant.characterId);
    const governingSelections: CharacterWeaponGoverningSelection[] = [
      ...lineage.allocations.map(({ id }) => ({ kind: "skill" as const, allocationId: id })),
      ...(["STR", "DEX", "CON", "INT", "WIS", "CHR"] as const).map((attributeKey) => ({ kind: "attribute" as const, attributeKey })),
    ];
    const governingChoices = governingSelections.flatMap((selection) => {
      const resolved = resolveCharacterSkillLineageSelection(lineage, selection);
      if (!resolved || resolved.source.kind === "manual") return [];
      return [{
        key: resolved.source.kind === "skill" ? `skill:${resolved.source.allocationId}` : `attribute:${resolved.source.attributeKey}`,
        selection,
        label: resolved.source.kind === "skill" ? resolved.source.skillName : `${resolved.source.attributeKey} straight Attribute`,
        originalTarget: resolved.source.originalTarget,
      }];
    });
    const spells = await tx.select({ id: campaignCharacterSpellDocument.id, name: campaignCharacterSpellDocument.name, tradition: campaignCharacterSpellDocument.tradition })
      .from(campaignCharacterSpellDocument)
      .where(eq(campaignCharacterSpellDocument.characterId, participant.characterId))
      .orderBy(asc(campaignCharacterSpellDocument.name), asc(campaignCharacterSpellDocument.id));
    participantViews.push({
      characterId: participant.characterId,
      name: participant.name ?? `Character #${participant.characterId}`,
      currentInitiative: participant.currentInitiative,
      weapons: equipment.wieldedWeapons.map((weapon) => ({ ownershipKey: weapon.ownershipKey, itemId: weapon.itemId, instanceId: weapon.instanceId, name: weapon.itemName, initiativeCost: weapon.initiativeCost })),
      reactionAbilities: abilities.catalog.flatMap((ability) => {
        const status = abilities.resolution.statuses.find(({ abilityId }) => abilityId === ability.id);
        if (ability.activationType !== "reaction" || !status?.possessed || !status.available) return [];
        const initiativeCosts = ability.costs.filter(({ costType }) => costType === "initiative").map(({ amount }) => amount);
        return [{ id: ability.id, name: ability.name, initiativeCost: initiativeCosts.length ? initiativeCosts.reduce((sum, amount) => sum + amount, 0) : null }];
      }),
      governingChoices,
      spells,
    });
  }
  const mappings = await loadDodgeMappings(tx);
  const allSkills = await tx.select({
    id: skill.id,
    name: skill.name,
    classification: skill.classification,
    tier: skill.tier,
    primaryAttribute: skill.primaryAttribute,
    secondaryAttribute: skill.secondaryAttribute,
  }).from(skill).where(isNull(skill.archivedAt)).orderBy(asc(skill.name), asc(skill.id));
  const allRelationships = await tx.select({
    id: skillRelationship.id,
    skillId: skillRelationship.skillId,
    relatedSkillId: skillRelationship.relatedSkillId,
    relationshipType: skillRelationship.relationshipType,
    sortOrder: skillRelationship.sortOrder,
  }).from(skillRelationship).orderBy(asc(skillRelationship.id));
  const reactions = await tx.select({
    row: campaignSessionEncounterReaction,
    opportunityId: campaignSessionEncounterResponderOpportunity.id,
    declarationId: campaignSessionEncounterResponderOpportunity.declarationId,
    responderParticipantKind: campaignSessionEncounterParticipant.participantKind,
    responderDisplayLabel: campaignSessionEncounterParticipant.displayLabel,
    responderName: campaignCharacter.name,
  }).from(campaignSessionEncounterReaction)
    .innerJoin(campaignSessionEncounterResponderOpportunity, eq(campaignSessionEncounterResponderOpportunity.reactionId, campaignSessionEncounterReaction.id))
    .innerJoin(campaignSessionEncounterParticipant, and(
      eq(campaignSessionEncounterParticipant.encounterId, campaignSessionEncounterReaction.encounterId),
      eq(campaignSessionEncounterParticipant.characterId, campaignSessionEncounterReaction.reactorCharacterId),
    ))
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterReaction.reactorCharacterId))
    .where(and(
      eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
      eq(campaignSessionEncounterReaction.campaignId, context.campaignId),
      actor.authority === "player"
        ? eq(campaignSessionEncounterReaction.reactorCharacterId, actor.characterId)
        : undefined,
    )).orderBy(asc(campaignSessionEncounterReaction.id));
  const targetIds = [...new Set(reactions.flatMap(({ row }) => row.protectedTargetCharacterId === null ? [] : [row.protectedTargetCharacterId]))];
  const targets = targetIds.length ? await tx.select({
    id: campaignSessionEncounterParticipant.characterId,
    participantKind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    name: campaignCharacter.name,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      inArray(campaignSessionEncounterParticipant.characterId, targetIds),
    )) : [];
  const targetNames = new Map(targets.map((entry) => [entry.id, entry.participantKind === "creature" ? entry.displayLabel : entry.name ?? `Character #${entry.id}`]));
  const reactionViews: DefenseReactionView[] = [];
  for (const entry of reactions) {
    if (entry.row.declarationSnapshotJson === null || entry.row.protectedTargetCharacterId === null || entry.row.rollRequired === null) continue;
    const [roll] = await tx.select({ id: campaignSessionRoll.id }).from(campaignSessionRoll).where(eq(campaignSessionRoll.reactionId, entry.row.id)).orderBy(asc(campaignSessionRoll.id)).limit(1);
    const events = await tx.select().from(campaignSessionEncounterReactionEvent).where(eq(campaignSessionEncounterReactionEvent.reactionId, entry.row.id)).orderBy(asc(campaignSessionEncounterReactionEvent.id));
    reactionViews.push({
      id: entry.row.id,
      declarationId: entry.declarationId,
      opportunityId: entry.opportunityId,
      pendingActionId: entry.row.pendingActionId,
      responderCharacterId: entry.row.reactorCharacterId,
      responderName: entry.responderParticipantKind === "creature" ? entry.responderDisplayLabel : entry.responderName ?? `Character #${entry.row.reactorCharacterId}`,
      protectedTargetCharacterId: entry.row.protectedTargetCharacterId,
      protectedTargetName: targetNames.get(entry.row.protectedTargetCharacterId) ?? `Character #${entry.row.protectedTargetCharacterId}`,
      reactionType: entry.row.reactionType as DefenseInterventionType,
      status: entry.row.status,
      committedInitiativeCost: entry.row.committedInitiativeCost,
      defenderFinalCost: entry.row.defenderFinalCost,
      attackerAdditionalCost: entry.row.attackerAdditionalCost,
      rollRequired: entry.row.rollRequired,
      rollId: roll?.id ?? null,
      outcome: entry.row.outcome,
      declaration: parseDefenseInterventionSnapshot(entry.row.declarationSnapshotJson),
      objectiveComparison: entry.row.objectiveComparisonJson,
      resolution: entry.row.resolutionSnapshotJson,
      originalActionDisposition: entry.row.originalActionDisposition,
      rulingReason: entry.row.rulingReason,
      createdAt: entry.row.createdAt.toISOString(),
      events: events.map((event) => ({
        ...event,
        actorUserId: actor.authority === "god-owner" ? event.actorUserId : null,
        createdAt: event.createdAt.toISOString(),
      })),
    });
  }
  return {
    context: { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId },
    reactions: reactionViews,
    dodgeMappings: mappings.map((mapping) => ({
      id: mapping.id,
      endpointSkillId: mapping.endpointSkillId,
      endpointSkillName: mapping.path.rootToEndpoint.at(-1)?.name ?? `Skill #${mapping.endpointSkillId}`,
      pathLabel: mapping.path.rootToEndpoint.map(({ name }) => name).join(" -> "),
      conditional: mapping.conditional,
      circumstanceLabel: mapping.circumstanceLabel,
      reviewState: mapping.reviewState,
    })),
    dodgeSkillOptions: allSkills.map((candidate) => {
      const path = validateCanonicalSkillPath(candidate.id, allSkills, allRelationships);
      return {
        id: candidate.id,
        name: candidate.name,
        pathLabel: path.rootToEndpoint.map(({ name }) => name).join(" -> "),
        valid: path.valid,
        problems: path.problems.map(({ message }) => message),
      };
    }),
    participants: participantViews,
  };
}
