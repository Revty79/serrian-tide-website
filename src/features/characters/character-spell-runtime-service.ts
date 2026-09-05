import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterSkillAllocation,
  campaignCharacterSpellDocument,
} from "@/db/realm-schema";
import { skill, skillExtension } from "@/db/skill-schema";
import {
  lockActiveHealthInTransaction,
  readActiveHealthInTransaction,
  type ActiveHealthTransaction,
} from "@/features/active-state/active-health-service";
import {
  persistPlannedMechanicalEffectInTransaction,
  type PersistedMechanicalEffectObserver,
} from "@/features/active-state/mechanical-effect-service";
import {
  readActiveManaInTransaction,
  spendActiveManaInTransaction,
} from "@/features/active-state/active-mana-service";
import { requireActiveManaPool } from "@/features/active-state/active-mana";
import { RAW_CASTING_CIRCUMSTANCE_BY_ID } from "@/features/spell-construction/data/rawCastingRules";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import type {
  SpellCastingSystem,
  SpellDocument,
} from "@/features/spell-construction/models/spell";
import { requireSession } from "@/lib/server-access";

import { getCastingSystemForAllocation } from "./character-spell-casting";
import {
  canInitiateSpellCast,
  canTargetSpellCast,
  executeSpellCastInTransaction,
  planSpellCast,
  type LoadedSpellCastSource,
  type SpellCastAccessEntity,
  type SpellCastAccessSubject,
  type SpellCastExecutionResult,
  type SpellCastPlan,
  type SpellCastRequest,
  type SpellCastSourceRequest,
  type SpellCastTargetContext,
} from "./character-spell-runtime";
import type {
  CharacterSkillAllocation,
  CharacterSkillReference,
} from "./models";

export type SpellCastTargetOption = {
  characterId: number;
  name: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
};

export type SpellCastPreparation = {
  plan: SpellCastPlan;
  targetOptions: SpellCastTargetOption[];
};

type RuntimeAccessEntity = SpellCastAccessEntity & {
  name: string;
};

type SpellTree = {
  skillAllocations: CharacterSkillAllocation[];
  skillCatalog: CharacterSkillReference[];
};

type LoadedRuntimePlan = {
  plan: SpellCastPlan;
  targets: SpellCastTargetContext[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePositiveInteger(value: number, message: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(message);
  return value;
}

function validateSource(source: SpellCastSourceRequest): SpellCastSourceRequest {
  if (!isRecord(source) || typeof source.kind !== "string") {
    throw new Error("Spell casting source is invalid.");
  }
  if (source.kind === "catalog") {
    requirePositiveInteger(source.allocationId, "Known Catalog casting requires a saved Skill allocation.");
    return source;
  }
  if (source.kind === "personal") {
    requirePositiveInteger(source.savedSpellId, "Known personal casting requires a saved Spell.");
    return source;
  }
  if (source.kind === "raw-saved") {
    requirePositiveInteger(source.savedSpellId, "Raw casting requires a saved Spell identity.");
    if (!RAW_CASTING_CIRCUMSTANCE_BY_ID.has(source.circumstance)) {
      throw new Error("Raw casting circumstance is invalid.");
    }
    return source;
  }
  if (source.kind === "raw-formula") {
    if (!RAW_CASTING_CIRCUMSTANCE_BY_ID.has(source.circumstance)) {
      throw new Error("Raw casting circumstance is invalid.");
    }
    return source;
  }
  throw new Error("Spell casting source kind is unsupported.");
}

function validateRequest(input: SpellCastRequest): SpellCastRequest {
  requirePositiveInteger(input.casterCharacterId, "Spell casting requires a saved caster Character.");
  validateSource(input.source);
  if (!isRecord(input.selections)) throw new Error("Spell runtime selections are invalid.");
  if (!isRecord(input.selections.targetGroups) || !isRecord(input.selections.applications)) {
    throw new Error("Spell runtime selections are invalid.");
  }
  for (const [groupId, characterIds] of Object.entries(input.selections.targetGroups)) {
    if (!groupId.trim() || !Array.isArray(characterIds)) {
      throw new Error("Spell target-group selections are invalid.");
    }
    characterIds.forEach((characterId) => {
      requirePositiveInteger(characterId, "Spell target Character identity is invalid.");
    });
  }
  for (const [applicationKey, selection] of Object.entries(input.selections.applications)) {
    if (!applicationKey.trim() || !isRecord(selection)) {
      throw new Error("Spell effect application selection is invalid.");
    }
    if (
      selection.poolKey !== undefined &&
      selection.poolKey !== null &&
      typeof selection.poolKey !== "string"
    ) {
      throw new Error("Spell HP Pool selection is invalid.");
    }
    if (
      selection.hitLocationNumber !== undefined &&
      selection.hitLocationNumber !== null &&
      !Number.isInteger(selection.hitLocationNumber)
    ) {
      throw new Error("Spell hit-location selection is invalid.");
    }
  }
  return input;
}

async function loadAccessEntity(
  tx: ActiveHealthTransaction,
  characterId: number,
  userId: string,
  lock: boolean,
): Promise<RuntimeAccessEntity> {
  const query = tx
    .select({
      characterId: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      name: campaignCharacter.name,
      playerUserId: campaignCharacter.playerUserId,
      campaignOwnerUserId: campaign.createdByUserId,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      membershipUserId: campaignPlayer.userId,
    })
    .from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(
      campaignPlayer,
      and(
        eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
        eq(campaignPlayer.userId, userId),
      ),
    )
    .where(and(
      eq(campaignCharacter.id, characterId),
      isNull(campaignCharacter.archivedAt),
      isNull(campaign.archivedAt),
    ))
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
    isCampaignMember: row.membershipUserId === userId,
  };
}

async function loadSpellTree(
  tx: ActiveHealthTransaction,
  characterId: number,
): Promise<SpellTree> {
  const rows = await tx
    .select({
      id: campaignCharacterSkillAllocation.id,
      characterId: campaignCharacterSkillAllocation.characterId,
      skillId: campaignCharacterSkillAllocation.skillId,
      skillName: skill.name,
      skillClassification: skill.classification,
      skillTier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      secondaryAttribute: skill.secondaryAttribute,
      definition: skill.definition,
      parentAllocationId: campaignCharacterSkillAllocation.parentAllocationId,
      points: campaignCharacterSkillAllocation.points,
      createdAt: campaignCharacterSkillAllocation.createdAt,
      updatedAt: campaignCharacterSkillAllocation.updatedAt,
    })
    .from(campaignCharacterSkillAllocation)
    .innerJoin(skill, eq(skill.id, campaignCharacterSkillAllocation.skillId))
    .where(and(
      eq(campaignCharacterSkillAllocation.characterId, characterId),
      isNull(skill.archivedAt),
    ))
    .orderBy(asc(campaignCharacterSkillAllocation.id));
  const catalog = new Map<number, CharacterSkillReference>();
  const allocations: CharacterSkillAllocation[] = rows.map((row) => {
    catalog.set(row.skillId, {
      id: row.skillId,
      name: row.skillName,
      classification: row.skillClassification,
      tier: row.skillTier,
      primaryAttribute: row.primaryAttribute,
      secondaryAttribute: row.secondaryAttribute,
      definition: row.definition,
      spellLevel: null,
      manaCost: null,
      spellDocumentJson: null,
    });
    return {
      id: row.id,
      characterId: row.characterId,
      skillId: row.skillId,
      skillName: row.skillName,
      skillClassification: row.skillClassification,
      skillTier: row.skillTier,
      primaryAttribute: row.primaryAttribute,
      parentAllocationId: row.parentAllocationId,
      points: row.points,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
  return { skillAllocations: allocations, skillCatalog: [...catalog.values()] };
}

async function loadSavedSpell(
  tx: ActiveHealthTransaction,
  characterId: number,
  savedSpellId: number,
  lock: boolean,
) {
  const query = tx
    .select({
      id: campaignCharacterSpellDocument.id,
      documentId: campaignCharacterSpellDocument.documentId,
      name: campaignCharacterSpellDocument.name,
      documentJson: campaignCharacterSpellDocument.documentJson,
      inSpellbook: campaignCharacterSpellDocument.inSpellbook,
    })
    .from(campaignCharacterSpellDocument)
    .where(and(
      eq(campaignCharacterSpellDocument.id, savedSpellId),
      eq(campaignCharacterSpellDocument.characterId, characterId),
    ))
    .limit(1);
  const rows = lock ? await query.for("update") : await query;
  const row = rows[0];
  if (!row) throw new Error("Saved Spell not found for this caster.");
  return row;
}

async function loadCastSource(
  tx: ActiveHealthTransaction,
  characterId: number,
  source: SpellCastSourceRequest,
  tree: SpellTree,
  lock: boolean,
): Promise<LoadedSpellCastSource> {
  if (source.kind === "catalog") {
    const allocation = tree.skillAllocations.find(({ id }) => id === source.allocationId);
    if (!allocation || allocation.points <= 0) {
      throw new Error("The caster does not own that exact Catalog Spell allocation.");
    }
    const [extension] = await tx
      .select({ dataJson: skillExtension.dataJson })
      .from(skillExtension)
      .where(and(
        eq(skillExtension.skillId, allocation.skillId),
        eq(skillExtension.extensionType, "spell-construction"),
      ))
      .limit(1);
    if (!extension) throw new Error("The selected Catalog Spell has no master Spell document.");
    const spell = parseSpellDocument(extension.dataJson);
    return {
      kind: source.kind,
      identity: `catalog:${source.allocationId}`,
      label: "Known Catalog Spell",
      spell,
      circumstance: "have-spell",
    };
  }

  if (source.kind === "personal" || source.kind === "raw-saved") {
    const row = await loadSavedSpell(
      tx,
      characterId,
      source.savedSpellId,
      lock,
    );
    if (source.kind === "personal" && !row.inSpellbook) {
      throw new Error("A personal Spell must currently be in this Character's Spellbook to cast as Known.");
    }
    if (source.kind === "raw-saved" && row.inSpellbook) {
      throw new Error("A Spellbook Spell must use the Known Spell casting path.");
    }
    return {
      kind: source.kind,
      identity: `${source.kind}:${row.id}`,
      label: source.kind === "personal" ? "Personal Spellbook Spell" : "Saved Raw Formula",
      spell: parseSpellDocument(row.documentJson),
      circumstance: source.kind === "personal" ? "have-spell" : source.circumstance,
    };
  }

  const spell = parseSpellDocument(source.document);
  const [knownRow] = await tx
    .select({ id: campaignCharacterSpellDocument.id })
    .from(campaignCharacterSpellDocument)
    .where(and(
      eq(campaignCharacterSpellDocument.characterId, characterId),
      eq(campaignCharacterSpellDocument.documentId, spell.id),
      eq(campaignCharacterSpellDocument.inSpellbook, true),
    ))
    .limit(1);
  if (knownRow) {
    throw new Error("This formula is already in the Character's Spellbook and must use the Known Spell path.");
  }
  return {
    kind: source.kind,
    identity: `raw-formula:${spell.id}`,
    label: "Current Raw Formula",
    spell,
    circumstance: source.circumstance,
  };
}

function allowedSystemsFor(spell: SpellDocument): SpellCastingSystem[] {
  return spell.tradition === "Psionics"
    ? ["Psyonics"]
    : spell.tradition === "Bardic Resonance"
      ? ["Bardic Resonance"]
      : ["Spellcraft", "Talismanism", "Faith"];
}

function resolveCastingSystem(
  source: LoadedSpellCastSource,
  tree: SpellTree,
  availableSystems: readonly SpellCastingSystem[],
): SpellCastingSystem | null {
  const allowed = allowedSystemsFor(source.spell);
  if (source.kind === "catalog") {
    const allocationId = Number(source.identity.split(":")[1]);
    const exact = getCastingSystemForAllocation(tree, allocationId);
    return exact && allowed.includes(exact) && availableSystems.includes(exact)
      ? exact
      : null;
  }
  if (
    source.spell.castingSystem &&
    allowed.includes(source.spell.castingSystem) &&
    availableSystems.includes(source.spell.castingSystem)
  ) {
    return source.spell.castingSystem;
  }
  if (source.spell.frameworkSkillId) {
    const frameworkSystems = new Set(
      tree.skillAllocations
        .filter(({ skillId, points }) => (
          skillId === source.spell.frameworkSkillId && points > 0
        ))
        .map(({ id }) => getCastingSystemForAllocation(tree, id))
        .filter((system): system is SpellCastingSystem => (
          system !== null && allowed.includes(system) && availableSystems.includes(system)
        )),
    );
    if (frameworkSystems.size === 1) return [...frameworkSystems][0]!;
  }
  const compatible = availableSystems.filter((system) => allowed.includes(system));
  return compatible.length === 1 ? compatible[0]! : null;
}

async function loadSelectedTargets(
  tx: ActiveHealthTransaction,
  subject: SpellCastAccessSubject,
  caster: RuntimeAccessEntity,
  targetIds: readonly number[],
  lock: boolean,
): Promise<SpellCastTargetContext[]> {
  const targets: SpellCastTargetContext[] = [];
  // Lock in canonical identity order to reduce deadlock risk. The planner still
  // applies each effect in the user's target-group selection order.
  for (const targetId of [...new Set(targetIds)].sort((left, right) => left - right)) {
    const entity = targetId === caster.characterId
      ? caster
      : await loadAccessEntity(tx, targetId, subject.userId, lock);
    if (!canTargetSpellCast(subject, caster, entity)) {
      throw new Error("You do not have permission to target one or more selected Characters.");
    }
    const health = lock
      ? await lockActiveHealthInTransaction(tx, entity.characterId, entity.npcKind)
      : await readActiveHealthInTransaction(tx, entity.characterId, entity.npcKind);
    targets.push({
      characterId: entity.characterId,
      campaignId: entity.campaignId,
      name: entity.name,
      isNpc: entity.isNpc,
      npcKind: entity.npcKind,
      anatomy: health.anatomy,
      state: health.state,
    });
  }
  return targets;
}

async function loadAuthoritativePlan(
  tx: ActiveHealthTransaction,
  request: SpellCastRequest,
  subject: SpellCastAccessSubject,
  lock: boolean,
): Promise<LoadedRuntimePlan> {
  const casterEntity = await loadAccessEntity(
    tx,
    request.casterCharacterId,
    subject.userId,
    lock,
  );
  if (!canInitiateSpellCast(subject, casterEntity)) {
    throw new Error("You do not have permission to cast as this Character.");
  }
  const tree = await loadSpellTree(tx, casterEntity.characterId);
  const source = await loadCastSource(
    tx,
    casterEntity.characterId,
    request.source,
    tree,
    lock,
  );
  const activeMana = await readActiveManaInTransaction(tx, casterEntity.characterId);
  const system = resolveCastingSystem(
    source,
    tree,
    activeMana.pools.map(({ system: poolSystem }) => poolSystem),
  );
  if (!system) {
    throw new Error("The caster cannot resolve one authoritative magic system for this Spell.");
  }
  const mana = requireActiveManaPool(activeMana, system);
  if (!mana.spellAccessLevel) {
    throw new Error("The caster has no usable Practitioner Level for this magic system.");
  }
  const caster = {
    characterId: casterEntity.characterId,
    campaignId: casterEntity.campaignId,
    name: casterEntity.name,
    system,
    practitionerLevel: mana.spellAccessLevel,
    mana,
  };
  const preliminary = planSpellCast({
    source,
    caster,
    selections: request.selections,
    targets: [],
  });
  const targetIds = preliminary.targetGroups.flatMap(
    ({ selectedTargetIds }) => selectedTargetIds,
  );
  const targets = await loadSelectedTargets(
    tx,
    subject,
    casterEntity,
    targetIds,
    lock,
  );
  return {
    targets,
    plan: planSpellCast({
      source,
      caster,
      selections: request.selections,
      targets,
    }),
  };
}

async function listTargetOptions(
  tx: ActiveHealthTransaction,
  subject: SpellCastAccessSubject,
  caster: RuntimeAccessEntity,
): Promise<SpellCastTargetOption[]> {
  const godMode = subject.roles.includes("god")
    && subject.userId === caster.campaignOwnerUserId;
  const rows = await tx
    .select({
      characterId: campaignCharacter.id,
      name: campaignCharacter.name,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
    })
    .from(campaignCharacter)
    .where(and(
      eq(campaignCharacter.campaignId, caster.campaignId),
      isNull(campaignCharacter.archivedAt),
      ...(godMode ? [] : [eq(campaignCharacter.isNpc, false)]),
    ))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
  return rows.map((row) => ({
    characterId: row.characterId,
    name: row.name,
    isNpc: row.isNpc,
    npcKind: row.npcKind === "creature" ? "creature" : "race",
  }));
}

async function loadSubject(
  tx: ActiveHealthTransaction,
  userId: string,
): Promise<SpellCastAccessSubject> {
  const roles = await tx
    .select({ role: userRole.role })
    .from(userRole)
    .where(eq(userRole.userId, userId));
  return { userId, roles: roles.map(({ role }) => role) };
}

export async function prepareCharacterSpellCast(
  input: SpellCastRequest,
): Promise<SpellCastPreparation> {
  const request = validateRequest(input);
  const session = await requireSession();
  return db.transaction((tx) => prepareCharacterSpellCastInTransaction(
    tx,
    request,
    session.user.id,
  ));
}

/** Caller-owned transaction boundary used by Tabletop Operations orchestration. */
export async function prepareCharacterSpellCastInTransaction(
  tx: ActiveHealthTransaction,
  input: SpellCastRequest,
  actingUserId: string,
): Promise<SpellCastPreparation> {
  const request = validateRequest(input);
  const subject = await loadSubject(tx, actingUserId);
  const caster = await loadAccessEntity(
    tx,
    request.casterCharacterId,
    subject.userId,
    false,
  );
  if (!canInitiateSpellCast(subject, caster)) {
    throw new Error("You do not have permission to cast as this Character.");
  }
  const loaded = await loadAuthoritativePlan(tx, request, subject, false);
  const targetOptions = await listTargetOptions(tx, subject, caster);
  return { plan: loaded.plan, targetOptions };
}

/** Executes one authoritative cast inside a transaction owned by the caller. */
export async function executeCharacterSpellCastInCallerTransaction(
  tx: ActiveHealthTransaction,
  input: SpellCastRequest,
  actingUserId: string,
  confirmed: boolean,
  onPersistedEffect?: PersistedMechanicalEffectObserver,
): Promise<SpellCastExecutionResult> {
  const request = validateRequest(input);
  const subject = await loadSubject(tx, actingUserId);
  let loaded: LoadedRuntimePlan | null = null;
  return executeSpellCastInTransaction(
    async (execute) => execute({
      loadAndPlan: async () => {
        loaded = await loadAuthoritativePlan(tx, request, subject, true);
        return loaded.plan;
      },
      spendMana: (plan) => spendActiveManaInTransaction(tx, {
        characterId: plan.caster.characterId,
        system: plan.caster.system,
        amount: plan.finalManaCost,
      }),
      applyAutomaticEffect: async (application) => {
        const target = loaded?.targets.find(
          ({ characterId }) => characterId === application.targetCharacterId,
        );
        if (!target) {
          throw new Error("The planned Spell effect lost its authoritative target state.");
        }
        const persisted = await persistPlannedMechanicalEffectInTransaction(tx, {
          plan: application.plan,
          targetCharacterId: application.targetCharacterId,
          sourceEffectKey: application.spellEffectId,
          targetAnatomy: target.anatomy,
        });
        if (persisted && onPersistedEffect) await onPersistedEffect(persisted);
      },
    }),
    confirmed,
  );
}

export async function executeCharacterSpellCast(
  input: SpellCastRequest,
  confirmed: boolean,
): Promise<SpellCastExecutionResult> {
  const request = validateRequest(input);
  const session = await requireSession();
  return db.transaction((tx) => executeCharacterSpellCastInCallerTransaction(
    tx,
    request,
    session.user.id,
    confirmed,
  ));
}
