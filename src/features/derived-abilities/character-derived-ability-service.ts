import "server-only";

import { and, asc, eq, inArray, isNull, like } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import {
  campaign,
  campaignAllowedSystem,
  campaignPlayer,
} from "@/db/campaign-schema";
import {
  campaignAllowedDerivedAbility,
  characterDerivedAbility,
  characterDerivedAbilityRecharge,
  characterDerivedAbilityUse,
  derivedAbility,
  derivedAbilityCost,
  derivedAbilityEffect,
  derivedAbilityRequirement,
  derivedAbilityTrigger,
  derivedAbilityUseCondition,
  derivedAbilityUseLimit,
} from "@/db/derived-ability-schema";
import {
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
  campaignCharacterAttribute,
  campaignCharacterSkillAllocation,
} from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import {
  endModifierInTransaction,
  resolveConditionInTransaction,
} from "@/features/active-state/active-effects-service";
import { formatRuntimeDuration } from "@/features/active-state/active-effects";
import {
  readActiveHealthInTransaction,
  type ActiveHealthTransaction,
} from "@/features/active-state/active-health-service";
import {
  readActiveManaInTransaction,
  spendActiveManaInTransaction,
} from "@/features/active-state/active-mana-service";
import {
  canManageCampaignRecords,
  canMutateActiveHealth,
  canOperateCampaignState,
} from "@/features/active-state/authorization";
import { persistPlannedMechanicalEffectInTransaction } from "@/features/active-state/mechanical-effect-service";
import { getEffectiveCampaignSystems } from "@/features/campaigns/campaign-systems";
import type { CharacterMagicSystem } from "@/features/characters/character-rules";
import { isCharacterMagicSystem } from "@/features/active-state/active-mana";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import {
  spendImmediateInitiativeInTransaction,
  type OwnedEncounterRuntimeContext,
} from "@/features/tabletop-operations/runtime-integration-service";
import { requireSession } from "@/lib/server-access";

import { assembleDerivedAbilityCatalog } from "./derived-ability-catalog";
import { decodeDerivedAbilityEffectRows } from "./derived-ability-effects";
import { resolveCharacterDerivedAbilities } from "./character-derived-ability-resolver";
import {
  planDerivedAbilityUse,
  type DerivedAbilityEventContext,
  type DerivedAbilityRechargeLedgerEntry,
  type DerivedAbilityUseLedgerEntry,
  type DerivedAbilityUsePlan,
} from "./derived-ability-use";
import type {
  CharacterDerivedAbilityAcquisitionMethod,
  CharacterDerivedAbilityOwnership,
  DerivedAbilityCostType,
  DerivedAbilityDefinition,
  DerivedAbilityRefreshScope,
  DerivedAbilityRequirementOperator,
  DerivedAbilityRequirementType,
  DerivedAbilityUseConditionType,
} from "./models";
import type { MechanicalEffectApplication } from "@/features/mechanical-effects";

export type CharacterDerivedAbilityTransaction = ActiveHealthTransaction;

type AccessEntity = {
  characterId: number;
  campaignId: number;
  name: string;
  playerUserId: string;
  campaignOwnerUserId: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
  isCampaignMember: boolean;
  characterArchivedAt: Date | null;
  campaignArchivedAt: Date | null;
};

export type LoadedCharacterDerivedAbilities = {
  entity: AccessEntity;
  catalog: DerivedAbilityDefinition[];
  ownerships: CharacterDerivedAbilityOwnership[];
  resolution: ReturnType<typeof resolveCharacterDerivedAbilities>;
};

type RuntimeContext = OwnedEncounterRuntimeContext & {
  roundNumber: number;
  currentInitiative: number;
};

export type DerivedAbilityUseEffectSelection = {
  targetCharacterId?: number | null;
  poolKey?: string | null;
  hitLocationNumber?: number | null;
};

export type CharacterDerivedAbilityUseRequest = {
  characterId: number;
  derivedAbilityId: number;
  eventKey?: string | null;
  effectSelections?: Record<string, DerivedAbilityUseEffectSelection>;
  manualConfirmed?: boolean;
  useNotes?: string;
};

export type CharacterDerivedAbilityUsePreparation = {
  plan: DerivedAbilityUsePlan;
  targetOptions: Array<{
    characterId: number;
    name: string;
    isNpc: boolean;
    npcKind: "race" | "creature";
  }>;
  canChooseTarget: boolean;
};

export type CharacterDerivedAbilityUseResult = {
  useId: number;
  plan: DerivedAbilityUsePlan;
};

export type DerivedAbilityPassiveReconciliationResult = {
  created: string[];
  ended: string[];
  resolved: string[];
  manualSteps: string[];
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must reference a saved record.`);
  }
  return value;
}

function cleanEventKey(value: string | null | undefined): string | null {
  const key = value?.trim() ?? "";
  return key || null;
}

function mapOwnership(row: typeof characterDerivedAbility.$inferSelect): CharacterDerivedAbilityOwnership {
  return {
    ...row,
    acquisitionMethod: row.acquisitionMethod as CharacterDerivedAbilityAcquisitionMethod,
    acquiredAt: row.acquiredAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

async function loadAccessEntity(
  tx: CharacterDerivedAbilityTransaction,
  characterId: number,
  userId: string,
  lock: boolean,
): Promise<AccessEntity> {
  const query = tx.select({
    characterId: campaignCharacter.id,
    campaignId: campaignCharacter.campaignId,
    name: campaignCharacter.name,
    playerUserId: campaignCharacter.playerUserId,
    campaignOwnerUserId: campaign.createdByUserId,
    isNpc: campaignCharacter.isNpc,
    npcKind: campaignCharacter.npcKind,
    memberUserId: campaignPlayer.userId,
    characterArchivedAt: campaignCharacter.archivedAt,
    campaignArchivedAt: campaign.archivedAt,
  }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, userId),
    ))
    .where(eq(campaignCharacter.id, positiveId(characterId, "Character")))
    .limit(1);
  const rows = lock
    ? await query.for("update", { of: campaignCharacter })
    : await query;
  const row = rows[0];
  if (!row) throw new Error("Character not found.");
  return {
    characterId: row.characterId,
    campaignId: row.campaignId,
    name: row.name,
    playerUserId: row.playerUserId,
    campaignOwnerUserId: row.campaignOwnerUserId,
    isNpc: row.isNpc,
    npcKind: row.npcKind === "creature" ? "creature" : "race",
    isCampaignMember: row.memberUserId === userId,
    characterArchivedAt: row.characterArchivedAt,
    campaignArchivedAt: row.campaignArchivedAt,
  };
}

function assertCharacterControl(
  entity: AccessEntity,
  userId: string,
  roles: readonly string[],
): void {
  if (entity.characterArchivedAt || entity.campaignArchivedAt) {
    throw new Error("Archived Characters and Campaigns cannot mutate Derived Abilities.");
  }
  if (!canMutateActiveHealth({ userId, roles }, entity)) {
    throw new Error("You do not have permission to control this Character's Derived Abilities.");
  }
}

function assertCharacterRecordControl(
  entity: AccessEntity,
  userId: string,
  roles: readonly string[],
): void {
  if (entity.characterArchivedAt || entity.campaignArchivedAt) {
    throw new Error("Archived Characters and Campaigns cannot mutate Derived Abilities.");
  }
  if (!roles.includes("admin") && !canMutateActiveHealth({ userId, roles }, entity)) {
    throw new Error("You do not have permission to manage this Character's Derived Ability records.");
  }
}

function assertCampaignRecordManager(
  entity: AccessEntity,
  userId: string,
  roles: readonly string[],
): void {
  if (entity.characterArchivedAt || entity.campaignArchivedAt) {
    throw new Error("Archived Characters and Campaigns cannot mutate Derived Abilities.");
  }
  const canManage = canManageCampaignRecords(
    { userId, roles },
    entity.campaignOwnerUserId,
  );
  if (!canManage) {
    throw new Error("Only the owning G.O.D. or an administrator may manage awarded or manually confirmed Derived Ability records.");
  }
}

function assertCampaignRuntimeManager(
  entity: AccessEntity,
  userId: string,
  roles: readonly string[],
): void {
  if (entity.characterArchivedAt || entity.campaignArchivedAt) {
    throw new Error("Archived Characters and Campaigns cannot mutate Derived Abilities.");
  }
  if (!canOperateCampaignState({ userId, roles }, entity.campaignOwnerUserId)) {
    throw new Error("Only the Campaign-owning G.O.D. may recharge Derived Abilities.");
  }
}

export async function loadCharacterDerivedAbilitiesInTransaction(
  tx: CharacterDerivedAbilityTransaction,
  characterId: number,
  userId: string,
  lock: boolean,
): Promise<LoadedCharacterDerivedAbilities> {
  const entity = await loadAccessEntity(tx, characterId, userId, lock);
  // One PostgreSQL transaction uses one client. Keep these fixed-size catalog
  // reads sequential so pg never receives overlapping queries on that client.
  const definitions = await tx.select({
    id: derivedAbility.id,
    name: derivedAbility.name,
    description: derivedAbility.description,
    mechanicalEffect: derivedAbility.mechanicalEffect,
    acquisitionType: derivedAbility.acquisitionType,
    activationType: derivedAbility.activationType,
    sourceSystem: derivedAbility.sourceSystem,
    sourceExternalId: derivedAbility.sourceExternalId,
    archivedAt: derivedAbility.archivedAt,
  }).from(derivedAbility).orderBy(asc(derivedAbility.name), asc(derivedAbility.id));
  const triggers = await tx.select().from(derivedAbilityTrigger).orderBy(
    asc(derivedAbilityTrigger.derivedAbilityId),
    asc(derivedAbilityTrigger.sortOrder),
    asc(derivedAbilityTrigger.id),
  );
  const requirements = await tx.select().from(derivedAbilityRequirement).orderBy(
    asc(derivedAbilityRequirement.derivedAbilityId),
    asc(derivedAbilityRequirement.requirementScope),
    asc(derivedAbilityRequirement.groupNumber),
    asc(derivedAbilityRequirement.sortOrder),
    asc(derivedAbilityRequirement.id),
  );
  const useConditions = await tx.select().from(derivedAbilityUseCondition).orderBy(
    asc(derivedAbilityUseCondition.derivedAbilityId),
    asc(derivedAbilityUseCondition.sortOrder),
    asc(derivedAbilityUseCondition.id),
  );
  const costs = await tx.select().from(derivedAbilityCost).orderBy(
    asc(derivedAbilityCost.derivedAbilityId),
    asc(derivedAbilityCost.sortOrder),
    asc(derivedAbilityCost.id),
  );
  const limits = await tx.select().from(derivedAbilityUseLimit).orderBy(
    asc(derivedAbilityUseLimit.derivedAbilityId),
    asc(derivedAbilityUseLimit.sortOrder),
    asc(derivedAbilityUseLimit.id),
  );
  const effectRows = await tx.select().from(derivedAbilityEffect).orderBy(
    asc(derivedAbilityEffect.derivedAbilityId),
    asc(derivedAbilityEffect.sortOrder),
    asc(derivedAbilityEffect.id),
  );
  const ownershipRows = await tx.select().from(characterDerivedAbility)
    .where(eq(characterDerivedAbility.characterId, characterId))
    .orderBy(asc(characterDerivedAbility.acquiredAt), asc(characterDerivedAbility.id));
  const attributes = await tx.select({
    key: campaignCharacterAttribute.attributeKey,
    value: campaignCharacterAttribute.value,
  }).from(campaignCharacterAttribute)
    .where(eq(campaignCharacterAttribute.characterId, characterId));
  const allocations = await tx.select({
    skillId: campaignCharacterSkillAllocation.skillId,
    points: campaignCharacterSkillAllocation.points,
  }).from(campaignCharacterSkillAllocation)
    .where(eq(campaignCharacterSkillAllocation.characterId, characterId));
  const allowedSystemRows = await tx.select({ system: campaignAllowedSystem.system })
    .from(campaignAllowedSystem)
    .where(eq(campaignAllowedSystem.campaignId, entity.campaignId))
    .orderBy(asc(campaignAllowedSystem.sortOrder));
  const legacyRows = await tx.select({ id: campaignAllowedDerivedAbility.derivedAbilityId })
    .from(campaignAllowedDerivedAbility)
    .where(eq(campaignAllowedDerivedAbility.campaignId, entity.campaignId))
    .limit(1);
  const campaignRows = await tx.select({
    compatibilityResolved: campaign.legacyDerivedAbilityCompatibilityResolved,
  }).from(campaign)
    .where(eq(campaign.id, entity.campaignId))
    .limit(1);
  const catalog = assembleDerivedAbilityCatalog({
    definitions: definitions.map(({ archivedAt, ...definition }) => ({
      ...definition,
      archived: archivedAt !== null,
    })),
    triggers,
    requirements: requirements.map((requirement) => ({
      ...requirement,
      requirementType: requirement.requirementType as DerivedAbilityRequirementType,
      operator: requirement.operator as DerivedAbilityRequirementOperator | null,
    })),
    useConditions: useConditions.map((condition) => ({
      ...condition,
      conditionType: condition.conditionType as DerivedAbilityUseConditionType,
      operator: condition.operator as DerivedAbilityRequirementOperator | null,
    })),
    costs: costs.map((cost) => ({
      ...cost,
      costType: cost.costType as DerivedAbilityCostType,
    })),
    useLimits: limits.map((limit) => ({
      ...limit,
      refreshScope: limit.refreshScope as DerivedAbilityRefreshScope,
    })),
    effects: decodeDerivedAbilityEffectRows(effectRows),
  });
  const ownerships = ownershipRows.map(mapOwnership);
  const skillPoints = new Map<number, number>();
  for (const allocation of allocations) {
    skillPoints.set(
      allocation.skillId,
      Math.max(skillPoints.get(allocation.skillId) ?? 0, allocation.points),
    );
  }
  const allowedSystems = getEffectiveCampaignSystems(
    allowedSystemRows.map(({ system }) => system),
    {
      hasLegacyDerivedAbilityConfiguration: legacyRows.length > 0,
      legacyDerivedAbilityCompatibilityResolved:
        campaignRows[0]?.compatibilityResolved ?? false,
    },
  );
  return {
    entity,
    catalog,
    ownerships,
    resolution: resolveCharacterDerivedAbilities({
      catalog,
      ownerships,
      attributes: Object.fromEntries(attributes.map(({ key, value }) => [key, value])),
      skillPoints,
      allowedSystems,
    }),
  };
}

async function loadRoles(
  tx: CharacterDerivedAbilityTransaction,
  userId: string,
): Promise<string[]> {
  const rows = await tx.select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.userId, userId));
  return rows.map(({ role }) => role);
}

async function acquireInTransaction(input: {
  characterId: number;
  derivedAbilityId: number;
  expectedMethod: CharacterDerivedAbilityAcquisitionMethod;
  notes?: string;
  manualConfirmed?: boolean;
  godOnly: boolean;
}): Promise<CharacterDerivedAbilityOwnership> {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const roles = await loadRoles(tx, session.user.id);
    const state = await loadCharacterDerivedAbilitiesInTransaction(
      tx,
      input.characterId,
      session.user.id,
      true,
    );
    if (input.godOnly) assertCampaignRecordManager(state.entity, session.user.id, roles);
    else assertCharacterRecordControl(state.entity, session.user.id, roles);
    const abilityId = positiveId(input.derivedAbilityId, "Derived Ability");
    const ability = state.catalog.find(({ id }) => id === abilityId);
    const status = state.resolution.statuses.find(({ abilityId: id }) => id === abilityId);
    if (!ability || !status) throw new Error("Derived Ability not found.");
    if (ability.archived) throw new Error("Archived Derived Abilities cannot be acquired.");
    if (ability.acquisitionType !== input.expectedMethod) {
      throw new Error(`Only ${input.expectedMethod} Derived Abilities may use this acquisition action.`);
    }
    if (status.ownershipId !== null) {
      throw new Error("The Character already has active ownership of this Derived Ability.");
    }
    if (status.acquisitionResult === "unsatisfied") {
      throw new Error("The Character does not satisfy this Derived Ability's Acquisition Requirements.");
    }
    if (status.acquisitionResult === "manual" && !input.manualConfirmed) {
      throw new Error("G.O.D. confirmation is required for Manual Acquisition Requirements.");
    }
    if (status.acquisitionResult === "manual") {
      assertCampaignRecordManager(state.entity, session.user.id, roles);
    }
    const [created] = await tx.insert(characterDerivedAbility).values({
      characterId: state.entity.characterId,
      derivedAbilityId: ability.id,
      acquisitionMethod: input.expectedMethod,
      acquiredByUserId: session.user.id,
      acquisitionNotes: input.notes?.trim() ?? "",
    }).returning();
    if (!created) throw new Error("Derived Ability ownership was not persisted.");
    await reconcileCharacterDerivedAbilityPassivesInTransaction(
      tx,
      state.entity.characterId,
      session.user.id,
    );
    return mapOwnership(created);
  });
}

export function learnCharacterDerivedAbility(input: {
  characterId: number;
  derivedAbilityId: number;
  notes?: string;
  manualConfirmed?: boolean;
}): Promise<CharacterDerivedAbilityOwnership> {
  // No acquisition resource is paid here. Canon has not defined an XP price.
  return acquireInTransaction({ ...input, expectedMethod: "learned", godOnly: false });
}

export function grantCharacterDerivedAbility(input: {
  characterId: number;
  derivedAbilityId: number;
  notes?: string;
  manualConfirmed?: boolean;
}): Promise<CharacterDerivedAbilityOwnership> {
  return acquireInTransaction({ ...input, expectedMethod: "awarded", godOnly: true });
}

export async function revokeCharacterDerivedAbility(input: {
  characterId: number;
  derivedAbilityId: number;
  notes?: string;
}): Promise<CharacterDerivedAbilityOwnership> {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const roles = await loadRoles(tx, session.user.id);
    const state = await loadCharacterDerivedAbilitiesInTransaction(
      tx,
      input.characterId,
      session.user.id,
      true,
    );
    assertCampaignRecordManager(state.entity, session.user.id, roles);
    const abilityId = positiveId(input.derivedAbilityId, "Derived Ability");
    const [updated] = await tx.update(characterDerivedAbility).set({
      revokedAt: new Date(),
      revokedByUserId: session.user.id,
      revocationNotes: input.notes?.trim() ?? "",
    }).where(and(
      eq(characterDerivedAbility.characterId, state.entity.characterId),
      eq(characterDerivedAbility.derivedAbilityId, abilityId),
      isNull(characterDerivedAbility.revokedAt),
    )).returning();
    if (!updated) throw new Error("Active Derived Ability ownership was not found.");
    await reconcileCharacterDerivedAbilityPassivesInTransaction(
      tx,
      state.entity.characterId,
      session.user.id,
    );
    return mapOwnership(updated);
  });
}

async function loadRuntimeContext(
  tx: CharacterDerivedAbilityTransaction,
  entity: AccessEntity,
  lock: boolean,
): Promise<RuntimeContext | null> {
  const query = tx.select({
    encounterId: campaignSessionEncounter.id,
    sceneId: campaignSessionScene.id,
    sessionId: campaignSession.id,
    campaignId: campaign.id,
    encounterStatus: campaignSessionEncounter.status,
    sceneStatus: campaignSessionScene.status,
    sessionStatus: campaignSession.status,
    ownerUserId: campaign.createdByUserId,
    roundNumber: campaignSessionEncounterInitiative.roundNumber,
    currentInitiative: campaignSessionEncounterInitiativeParticipant.currentInitiative,
  }).from(campaignSessionEncounterInitiativeParticipant)
    .innerJoin(campaignSessionEncounterInitiative, and(
      eq(campaignSessionEncounterInitiative.encounterId, campaignSessionEncounterInitiativeParticipant.encounterId),
      eq(campaignSessionEncounterInitiative.status, "active"),
    ))
    .innerJoin(campaignSessionEncounter, and(
      eq(campaignSessionEncounter.id, campaignSessionEncounterInitiativeParticipant.encounterId),
      eq(campaignSessionEncounter.status, "active"),
    ))
    .innerJoin(campaignSessionScene, and(
      eq(campaignSessionScene.id, campaignSessionEncounterInitiativeParticipant.sceneId),
      eq(campaignSessionScene.status, "active"),
    ))
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionEncounterInitiativeParticipant.sessionId),
      eq(campaignSession.status, "active"),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionEncounterInitiativeParticipant.campaignId))
    .where(and(
      eq(campaignSessionEncounterInitiativeParticipant.characterId, entity.characterId),
      eq(campaignSessionEncounterInitiativeParticipant.campaignId, entity.campaignId),
    )).orderBy(asc(campaignSessionEncounterInitiativeParticipant.encounterId)).limit(2);
  const rows = lock
    ? await query.for("update", { of: campaignSessionEncounterInitiativeParticipant })
    : await query;
  if (rows.length > 1) {
    throw new Error("The active Initiative context is ambiguous for this Character.");
  }
  return rows[0] ?? null;
}

function validateUseRequest(input: CharacterDerivedAbilityUseRequest): CharacterDerivedAbilityUseRequest {
  positiveId(input.characterId, "Character");
  positiveId(input.derivedAbilityId, "Derived Ability");
  if (input.effectSelections !== undefined && (
    typeof input.effectSelections !== "object"
    || input.effectSelections === null
    || Array.isArray(input.effectSelections)
  )) throw new Error("Derived Ability effect selections are invalid.");
  return input;
}

async function loadUsePlanInTransaction(
  tx: CharacterDerivedAbilityTransaction,
  request: CharacterDerivedAbilityUseRequest,
  userId: string,
  lock: boolean,
): Promise<{
  preparation: CharacterDerivedAbilityUsePreparation;
  state: LoadedCharacterDerivedAbilities;
  runtime: RuntimeContext | null;
}> {
  const roles = await loadRoles(tx, userId);
  const state = await loadCharacterDerivedAbilitiesInTransaction(
    tx,
    request.characterId,
    userId,
    lock,
  );
  assertCharacterControl(state.entity, userId, roles);
  const ability = state.catalog.find(({ id }) => id === request.derivedAbilityId);
  const resolvedStatus = state.resolution.statuses.find(({ abilityId }) => abilityId === request.derivedAbilityId);
  if (!ability || !resolvedStatus) throw new Error("Derived Ability not found.");
  const runtime = await loadRuntimeContext(tx, state.entity, lock);
  const mana = await readActiveManaInTransaction(tx, state.entity.characterId);
  const useRows = await tx.select().from(characterDerivedAbilityUse).where(and(
    eq(characterDerivedAbilityUse.characterId, state.entity.characterId),
    eq(characterDerivedAbilityUse.derivedAbilityId, ability.id),
  )).orderBy(asc(characterDerivedAbilityUse.usedAt), asc(characterDerivedAbilityUse.id));
  const rechargeRows = await tx.select().from(characterDerivedAbilityRecharge).where(and(
    eq(characterDerivedAbilityRecharge.characterId, state.entity.characterId),
    eq(characterDerivedAbilityRecharge.derivedAbilityId, ability.id),
  )).orderBy(asc(characterDerivedAbilityRecharge.rechargedAt), asc(characterDerivedAbilityRecharge.id));
  const applications = new Map<number, MechanicalEffectApplication>();
  for (const [key, selection] of Object.entries(request.effectSelections ?? {})) {
    const sortOrder = Number(key);
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
      throw new Error("Derived Ability effect selection order is invalid.");
    }
    applications.set(sortOrder, selection);
  }
  const targetIds = [...new Set([...applications.values()].flatMap((application) =>
    application.targetCharacterId == null ? [] : [application.targetCharacterId],
  ))];
  const canChooseTarget = canOperateCampaignState(
    { userId, roles },
    state.entity.campaignOwnerUserId,
  );
  if (!canChooseTarget && targetIds.some((id) => id !== state.entity.characterId)) {
    throw new Error("A Player may only target their own Character from this Character sheet.");
  }
  const targetRows = targetIds.length
    ? await tx.select({
        id: campaignCharacter.id,
        name: campaignCharacter.name,
        isNpc: campaignCharacter.isNpc,
        npcKind: campaignCharacter.npcKind,
      }).from(campaignCharacter).where(and(
        eq(campaignCharacter.campaignId, state.entity.campaignId),
        inArray(campaignCharacter.id, targetIds),
        isNull(campaignCharacter.archivedAt),
      )).orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id))
    : [];
  if (targetRows.length !== targetIds.length) {
    throw new Error("Every Derived Ability target must be in the source Character's Campaign.");
  }
  const healthByCharacterId = new Map<number, Awaited<ReturnType<typeof readActiveHealthInTransaction>>>();
  for (const target of targetRows) {
    const health = await readActiveHealthInTransaction(
      tx,
      target.id,
      target.npcKind === "creature" ? "creature" : "race",
    );
    healthByCharacterId.set(target.id, health);
  }
  const eventContext: DerivedAbilityEventContext = {
    eventKey: cleanEventKey(request.eventKey),
    sessionId: runtime?.sessionId ?? null,
    sceneId: runtime?.sceneId ?? null,
    encounterId: runtime?.encounterId ?? null,
    roundNumber: runtime?.roundNumber ?? null,
    currentInitiative: runtime?.currentInitiative ?? null,
    manaPools: new Map(mana.pools.map((pool) => [pool.system, { current: pool.currentMana }])),
  };
  const uses: DerivedAbilityUseLedgerEntry[] = useRows.map((row) => ({
    ...row,
    usedAt: row.usedAt.toISOString(),
  }));
  const recharges: DerivedAbilityRechargeLedgerEntry[] = rechargeRows.map((row) => ({
    id: row.id,
    characterId: row.characterId,
    derivedAbilityId: row.derivedAbilityId,
    refreshScope: row.refreshScope as "manual" | "event",
    refreshKey: row.refreshKey,
    rechargedAt: row.rechargedAt.toISOString(),
  }));
  const ownership = resolvedStatus.ownershipId === null
    ? null
    : state.ownerships.find(({ id }) => id === resolvedStatus.ownershipId) ?? null;
  const plan = planDerivedAbilityUse({
    characterId: state.entity.characterId,
    ability,
    resolvedStatus,
    eventContext,
    uses,
    recharges,
    ownershipAcquiredAt: ownership?.acquiredAt ?? null,
    effectApplications: applications,
    healthByCharacterId: new Map([...healthByCharacterId].map(([id, health]) => [id, {
      anatomy: health.anatomy,
      state: health.state,
    }])),
    manualConfirmed: request.manualConfirmed ?? false,
  });
  const targetOptions = canChooseTarget
    ? await tx.select({
        characterId: campaignCharacter.id,
        name: campaignCharacter.name,
        isNpc: campaignCharacter.isNpc,
        npcKind: campaignCharacter.npcKind,
      }).from(campaignCharacter)
        .where(and(
          eq(campaignCharacter.campaignId, state.entity.campaignId),
          isNull(campaignCharacter.archivedAt),
        ))
        .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id))
    : [{
        characterId: state.entity.characterId,
        name: state.entity.name,
        isNpc: state.entity.isNpc,
        npcKind: state.entity.npcKind,
      }];
  return {
    preparation: {
      plan,
      canChooseTarget,
      targetOptions: targetOptions.map((target) => ({
        ...target,
        npcKind: target.npcKind === "creature" ? "creature" as const : "race" as const,
      })),
    },
    state,
    runtime,
  };
}

export async function prepareCharacterDerivedAbilityUse(
  input: CharacterDerivedAbilityUseRequest,
): Promise<CharacterDerivedAbilityUsePreparation> {
  const request = validateUseRequest(input);
  const session = await requireSession();
  return db.transaction(async (tx) => (
    await loadUsePlanInTransaction(tx, request, session.user.id, false)
  ).preparation);
}

export async function executeCharacterDerivedAbilityUse(
  input: CharacterDerivedAbilityUseRequest,
): Promise<CharacterDerivedAbilityUseResult> {
  const request = validateUseRequest(input);
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const loaded = await loadUsePlanInTransaction(tx, request, session.user.id, true);
    const { plan } = loaded.preparation;
    if (plan.status !== "ready") {
      throw new Error(`Derived Ability use is not ready (${plan.status}).`);
    }
    const initiativeCost = plan.costs
      .filter(({ status, cost }) => status === "automatic" && cost.costType === "initiative")
      .reduce((total, { cost }) => total + cost.amount, 0);
    if (initiativeCost > 0) {
      if (!loaded.runtime) throw new Error("The active Initiative context was lost before payment.");
      await spendImmediateInitiativeInTransaction(
        tx,
        loaded.runtime,
        request.characterId,
        initiativeCost,
      );
    }
    for (const costPlan of plan.costs) {
      if (costPlan.status !== "automatic" || costPlan.cost.costType !== "mana") continue;
      const system = costPlan.cost.resourceKey;
      if (!isCharacterMagicSystem(system)) {
        throw new Error("The planned Mana cost lost its canonical Active Mana pool.");
      }
      await spendActiveManaInTransaction(tx, {
        characterId: request.characterId,
        system: system as CharacterMagicSystem,
        amount: costPlan.cost.amount,
      });
    }
    const ownershipId = loaded.state.resolution.statuses.find(
      ({ abilityId }) => abilityId === request.derivedAbilityId,
    )?.ownershipId ?? null;
    const [use] = await tx.insert(characterDerivedAbilityUse).values({
      characterId: request.characterId,
      derivedAbilityId: request.derivedAbilityId,
      ownershipId,
      actorUserId: session.user.id,
      sessionId: loaded.runtime?.sessionId ?? null,
      sceneId: loaded.runtime?.sceneId ?? null,
      encounterId: loaded.runtime?.encounterId ?? null,
      roundNumber: loaded.runtime?.roundNumber ?? null,
      eventKey: cleanEventKey(request.eventKey),
      effectSummary: plan.effects.map(({ plan: effect }) => effect.summary).join(" | "),
      manualSteps: plan.manualSteps.join(" | "),
      useNotes: request.useNotes?.trim() ?? "",
    }).returning({ id: characterDerivedAbilityUse.id });
    if (!use) throw new Error("Derived Ability use history was not persisted.");
    for (const effect of plan.effects) {
      if (effect.plan.status === "manual") continue;
      if (effect.plan.status !== "ready") {
        throw new Error("A Derived Ability Mechanical Effect lost its ready state.");
      }
      const targetCharacterId = request.effectSelections?.[String(effect.sortOrder)]?.targetCharacterId;
      if (!targetCharacterId) throw new Error("A Derived Ability effect lost its target Character.");
      const target = loaded.preparation.targetOptions.find(({ characterId }) => characterId === targetCharacterId)
        ?? (targetCharacterId === request.characterId
          ? { characterId: request.characterId, npcKind: loaded.state.entity.npcKind }
          : null);
      if (!target) throw new Error("A Derived Ability effect target is no longer authorized.");
      const health = await readActiveHealthInTransaction(tx, targetCharacterId, target.npcKind);
      await persistPlannedMechanicalEffectInTransaction(tx, {
        plan: effect.plan,
        targetCharacterId,
        sourceEffectKey: `use:${use.id}:${effect.sortOrder}`,
        targetAnatomy: health.anatomy,
      });
    }
    if (loaded.runtime) {
      await publishTabletopInvalidationInTransaction(tx, {
        campaignId: loaded.runtime.campaignId,
        sessionId: loaded.runtime.sessionId,
        sceneId: loaded.runtime.sceneId,
        encounterId: loaded.runtime.encounterId,
        characterIds: [],
        category: "character-state",
      });
    }
    return { useId: use.id, plan };
  });
}

export async function rechargeCharacterDerivedAbility(input: {
  characterId: number;
  derivedAbilityId: number;
  refreshScope: "manual" | "event";
  refreshKey?: string | null;
  notes?: string;
}): Promise<{ id: number }> {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const roles = await loadRoles(tx, session.user.id);
    const state = await loadCharacterDerivedAbilitiesInTransaction(
      tx,
      input.characterId,
      session.user.id,
      true,
    );
    assertCampaignRuntimeManager(state.entity, session.user.id, roles);
    const ability = state.catalog.find(({ id }) => id === input.derivedAbilityId);
    if (!ability) throw new Error("Derived Ability not found.");
    const key = cleanEventKey(input.refreshKey);
    const matching = ability.useLimits.some((limit) =>
      limit.refreshScope === input.refreshScope
      && (input.refreshScope === "manual" || limit.refreshKey === key),
    );
    if (!matching) throw new Error("That Derived Ability has no matching recharge limit.");
    if (input.refreshScope === "event" && !key) {
      throw new Error("Event recharge requires the exact authored event key.");
    }
    const runtime = await loadRuntimeContext(tx, state.entity, false);
    const [created] = await tx.insert(characterDerivedAbilityRecharge).values({
      characterId: input.characterId,
      derivedAbilityId: input.derivedAbilityId,
      actorUserId: session.user.id,
      refreshScope: input.refreshScope,
      refreshKey: input.refreshScope === "event" ? key : null,
      sessionId: runtime?.sessionId ?? null,
      sceneId: runtime?.sceneId ?? null,
      encounterId: runtime?.encounterId ?? null,
      roundNumber: runtime?.roundNumber ?? null,
      notes: input.notes?.trim() ?? "",
    }).returning({ id: characterDerivedAbilityRecharge.id });
    if (!created) throw new Error("Derived Ability recharge history was not persisted.");
    return created;
  });
}

export async function reportDerivedAbilityRechargeEvent(input: {
  characterId: number;
  derivedAbilityId: number;
  eventKey: string;
  notes?: string;
}): Promise<{ id: number }> {
  return rechargeCharacterDerivedAbility({
    ...input,
    refreshScope: "event",
    refreshKey: input.eventKey,
  });
}

function passiveKey(sortOrder: number): string {
  return `passive:${sortOrder}`;
}

function persistentPassive(effect: DerivedAbilityDefinition["effects"][number]): boolean {
  return (effect.kind === "condition.apply" || effect.kind === "modifier.apply")
    && effect.duration.kind === "until-removed";
}

export async function reconcileCharacterDerivedAbilityPassivesInTransaction(
  tx: CharacterDerivedAbilityTransaction,
  characterId: number,
  actingUserId = "",
): Promise<DerivedAbilityPassiveReconciliationResult> {
  await tx.select({ id: campaignCharacter.id }).from(campaignCharacter)
    .where(eq(campaignCharacter.id, positiveId(characterId, "Character")))
    .limit(1).for("update");
  const state = await loadCharacterDerivedAbilitiesInTransaction(
    tx,
    characterId,
    actingUserId,
    false,
  );
  const activeIds = new Set(state.resolution.statuses
    .filter(({ available }) => available)
    .map(({ abilityId }) => abilityId));
  const desired = state.catalog.flatMap((ability) =>
    ability.activationType === "passive" && activeIds.has(ability.id)
      ? ability.effects.map((effect, sortOrder) => ({ ability, effect, sortOrder }))
      : [],
  );
  const conditions = await tx.select().from(campaignCharacterActiveCondition).where(and(
    eq(campaignCharacterActiveCondition.characterId, characterId),
    eq(campaignCharacterActiveCondition.sourceKind, "derived-ability"),
    like(campaignCharacterActiveCondition.sourceEffectKey, "passive:%"),
    isNull(campaignCharacterActiveCondition.resolvedAt),
  )).orderBy(asc(campaignCharacterActiveCondition.createdAt), asc(campaignCharacterActiveCondition.id));
  const modifiers = await tx.select().from(campaignCharacterActiveModifier).where(and(
    eq(campaignCharacterActiveModifier.characterId, characterId),
    eq(campaignCharacterActiveModifier.sourceKind, "derived-ability"),
    like(campaignCharacterActiveModifier.sourceEffectKey, "passive:%"),
    isNull(campaignCharacterActiveModifier.endedAt),
  )).orderBy(asc(campaignCharacterActiveModifier.createdAt), asc(campaignCharacterActiveModifier.id));
  const desiredByKey = new Map(desired.filter(({ effect }) => persistentPassive(effect)).map((entry) => [
    `${entry.ability.id}:${passiveKey(entry.sortOrder)}`,
    entry,
  ]));
  const kept = new Set<string>();
  const result: DerivedAbilityPassiveReconciliationResult = {
    created: [],
    ended: [],
    resolved: [],
    manualSteps: desired.filter(({ effect }) => !persistentPassive(effect)).map(({ ability, effect }) =>
      `${ability.name}: ${effect.kind === "manual" ? effect.description : "Passive health/duration effect requires table interpretation."}`,
    ),
  };
  for (const condition of conditions) {
    const key = `${condition.sourceId}:${condition.sourceEffectKey}`;
    const target = desiredByKey.get(key);
    const duration = target?.effect.kind === "condition.apply"
      ? formatRuntimeDuration(target.effect.duration)
      : null;
    if (
      target?.effect.kind === "condition.apply"
      && duration
      && condition.name === target.effect.name
      && condition.description === target.effect.description
      && condition.durationKind === duration.kind
      && condition.durationValue === duration.value
      && condition.durationLabel === duration.label
      && !kept.has(key)
    ) {
      kept.add(key);
    } else {
      await resolveConditionInTransaction(tx, characterId, condition.id, "Passive Derived Ability is no longer available.");
      result.resolved.push(key);
    }
  }
  for (const modifier of modifiers) {
    const key = `${modifier.sourceId}:${modifier.sourceEffectKey}`;
    const target = desiredByKey.get(key);
    const duration = target?.effect.kind === "modifier.apply"
      ? formatRuntimeDuration(target.effect.duration)
      : null;
    if (
      target?.effect.kind === "modifier.apply"
      && duration
      && modifier.label === target.effect.label
      && modifier.modifierChannel === target.effect.channel
      && modifier.targetKey === target.effect.targetKey
      && modifier.amount === target.effect.amount
      && modifier.durationKind === duration.kind
      && modifier.durationValue === duration.value
      && modifier.durationLabel === duration.label
      && !kept.has(key)
    ) {
      kept.add(key);
    } else {
      await endModifierInTransaction(tx, characterId, modifier.id, "Passive Derived Ability is no longer available.");
      result.ended.push(key);
    }
  }
  for (const [key, entry] of desiredByKey) {
    if (kept.has(key)) continue;
    const plan = planDerivedAbilityUse({
      characterId,
      ability: { ...entry.ability, activationType: "activated", useConditions: [], costs: [], useLimits: [], effects: [entry.effect] },
      resolvedStatus: {
        abilityId: entry.ability.id,
        status: "owned-available",
        ownershipId: null,
        acquisitionMethod: null,
        acquisitionResult: "satisfied",
        liveResult: "satisfied",
        possessed: true,
        available: true,
      },
      effectApplications: new Map([[0, { targetCharacterId: characterId }]]),
      manualConfirmed: true,
    }).effects[0]?.plan;
    if (!plan || plan.status !== "ready") continue;
    await persistPlannedMechanicalEffectInTransaction(tx, {
      plan,
      targetCharacterId: characterId,
      sourceEffectKey: passiveKey(entry.sortOrder),
    });
    result.created.push(key);
  }
  return result;
}

export async function synchronizeCharacterDerivedAbilityPassives(
  characterId: number,
): Promise<DerivedAbilityPassiveReconciliationResult> {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const roles = await loadRoles(tx, session.user.id);
    const entity = await loadAccessEntity(
      tx,
      characterId,
      session.user.id,
      true,
    );
    assertCharacterControl(entity, session.user.id, roles);
    return reconcileCharacterDerivedAbilityPassivesInTransaction(
      tx,
      characterId,
      session.user.id,
    );
  });
}
