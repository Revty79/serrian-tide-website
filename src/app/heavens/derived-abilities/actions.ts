"use server";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  campaignAllowedDerivedAbility,
  derivedAbility,
  derivedAbilityCost,
  derivedAbilityEffect,
  derivedAbilityRequirement,
  derivedAbilityTrigger,
  derivedAbilityUseCondition,
  derivedAbilityUseLimit,
} from "@/db/derived-ability-schema";
import { skill } from "@/db/skill-schema";
import {
  type DerivedAbilityAuthoringAggregate,
  type DerivedAbilityAuthoringDraft,
  definitionToDerivedAbilityDraft,
  normalizeDerivedAbilityAuthoringDraft,
} from "@/features/derived-abilities/derived-ability-authoring";
import { assembleDerivedAbilityCatalog } from "@/features/derived-abilities/derived-ability-catalog";
import {
  decodeDerivedAbilityEffects,
  encodeDerivedAbilityEffects,
} from "@/features/derived-abilities/derived-ability-effects";
import {
  getDerivedAbilityRequirementOrigin,
  getDerivedAbilityRequirementSummary,
  getLegacyTriggerMirrorForDefinition,
} from "@/features/derived-abilities/derived-ability-rules";
import type {
  DerivedAbilityAcquisitionType,
  DerivedAbilityActivationType,
  DerivedAbilityCostType,
  DerivedAbilityRefreshScope,
  DerivedAbilityRequirementOperator,
  DerivedAbilityRequirementType,
  DerivedAbilityUseConditionType,
} from "@/features/derived-abilities/models";
import { requireGod } from "@/lib/server-access";

export type DerivedAbilityDraft = DerivedAbilityAuthoringDraft;
export type DerivedAbilityAggregate = DerivedAbilityAuthoringAggregate;

export type DerivedAbilityLibraryFilters = {
  search?: string;
  acquisitionType?: DerivedAbilityAcquisitionType | "";
  activationType?: DerivedAbilityActivationType | "";
  page?: number;
  pageSize?: number;
};

export type DerivedAbilitySummary = {
  id: number;
  name: string;
  description: string;
  requirementSummary: string;
  requirementOrigin: "ATTRIBUTE" | "SKILL" | "ABILITY" | "MANUAL" | "MIXED" | "NONE";
  acquisitionType: DerivedAbilityAcquisitionType;
  activationType: DerivedAbilityActivationType;
  effectCount: number;
  sourceSystem: string | null;
};

export type DerivedAbilityLibraryResult = {
  items: DerivedAbilitySummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type DerivedAbilityEditorReferences = {
  skills: Array<{
    id: number;
    name: string;
    tier: number | null;
    classification: string;
  }>;
  abilities: Array<{ id: number; name: string }>;
};

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function loadTriggerRows(ids?: readonly number[]) {
  return db.select().from(derivedAbilityTrigger)
    .where(ids ? inArray(derivedAbilityTrigger.derivedAbilityId, [...ids]) : undefined)
    .orderBy(
      asc(derivedAbilityTrigger.derivedAbilityId),
      asc(derivedAbilityTrigger.sortOrder),
      asc(derivedAbilityTrigger.id),
    );
}

function loadRequirementRows(ids?: readonly number[]) {
  return db.select().from(derivedAbilityRequirement)
    .where(ids ? inArray(derivedAbilityRequirement.derivedAbilityId, [...ids]) : undefined)
    .orderBy(
      asc(derivedAbilityRequirement.derivedAbilityId),
      asc(derivedAbilityRequirement.requirementScope),
      asc(derivedAbilityRequirement.groupNumber),
      asc(derivedAbilityRequirement.sortOrder),
      asc(derivedAbilityRequirement.id),
    );
}

function loadConditionRows(ids?: readonly number[]) {
  return db.select().from(derivedAbilityUseCondition)
    .where(ids ? inArray(derivedAbilityUseCondition.derivedAbilityId, [...ids]) : undefined)
    .orderBy(
      asc(derivedAbilityUseCondition.derivedAbilityId),
      asc(derivedAbilityUseCondition.sortOrder),
      asc(derivedAbilityUseCondition.id),
    );
}

function loadCostRows(ids?: readonly number[]) {
  return db.select().from(derivedAbilityCost)
    .where(ids ? inArray(derivedAbilityCost.derivedAbilityId, [...ids]) : undefined)
    .orderBy(
      asc(derivedAbilityCost.derivedAbilityId),
      asc(derivedAbilityCost.sortOrder),
      asc(derivedAbilityCost.id),
    );
}

function loadLimitRows(ids?: readonly number[]) {
  return db.select().from(derivedAbilityUseLimit)
    .where(ids ? inArray(derivedAbilityUseLimit.derivedAbilityId, [...ids]) : undefined)
    .orderBy(
      asc(derivedAbilityUseLimit.derivedAbilityId),
      asc(derivedAbilityUseLimit.sortOrder),
      asc(derivedAbilityUseLimit.id),
    );
}

function loadEffectRows(ids?: readonly number[]) {
  return db.select().from(derivedAbilityEffect)
    .where(ids ? inArray(derivedAbilityEffect.derivedAbilityId, [...ids]) : undefined)
    .orderBy(
      asc(derivedAbilityEffect.derivedAbilityId),
      asc(derivedAbilityEffect.sortOrder),
      asc(derivedAbilityEffect.id),
    );
}

function mapRequirementRows(
  rows: Awaited<ReturnType<typeof loadRequirementRows>>,
) {
  return rows.map((requirement) => ({
    ...requirement,
    requirementType:
      requirement.requirementType as DerivedAbilityRequirementType,
    operator:
      requirement.operator as DerivedAbilityRequirementOperator | null,
  }));
}

function mapConditionRows(
  rows: Awaited<ReturnType<typeof loadConditionRows>>,
) {
  return rows.map((condition) => ({
    ...condition,
    conditionType: condition.conditionType as DerivedAbilityUseConditionType,
    operator: condition.operator as DerivedAbilityRequirementOperator | null,
  }));
}

function mapCostRows(rows: Awaited<ReturnType<typeof loadCostRows>>) {
  return rows.map((cost) => ({
    ...cost,
    costType: cost.costType as DerivedAbilityCostType,
  }));
}

function mapLimitRows(rows: Awaited<ReturnType<typeof loadLimitRows>>) {
  return rows.map((limit) => ({
    ...limit,
    refreshScope: limit.refreshScope as DerivedAbilityRefreshScope,
  }));
}

export async function getDerivedAbilityEditorReferences(): Promise<DerivedAbilityEditorReferences> {
  await requireGod();
  const [skills, abilities] = await Promise.all([
    db.select({
      id: skill.id,
      name: skill.name,
      tier: skill.tier,
      classification: skill.classification,
    }).from(skill).orderBy(asc(skill.name), asc(skill.id)),
    db.select({ id: derivedAbility.id, name: derivedAbility.name })
      .from(derivedAbility)
      .orderBy(asc(derivedAbility.name), asc(derivedAbility.id)),
  ]);
  return { skills, abilities };
}

export async function listDerivedAbilities(
  filters: DerivedAbilityLibraryFilters = {},
): Promise<DerivedAbilityLibraryResult> {
  await requireGod();
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 40)));
  const conditions: SQL[] = [];
  const search = clean(filters.search);
  if (search) {
    conditions.push(or(
      ilike(derivedAbility.name, `%${search}%`),
      ilike(derivedAbility.description, `%${search}%`),
      ilike(derivedAbility.mechanicalEffect, `%${search}%`),
    )!);
  }
  if (filters.acquisitionType) {
    conditions.push(eq(derivedAbility.acquisitionType, filters.acquisitionType));
  }
  if (filters.activationType) {
    conditions.push(eq(derivedAbility.activationType, filters.activationType));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [countRow] = await db.select({ value: count() }).from(derivedAbility).where(where);
  const total = Number(countRow?.value ?? 0);
  const rows = await db.select({
    id: derivedAbility.id,
    name: derivedAbility.name,
    description: derivedAbility.description,
    mechanicalEffect: derivedAbility.mechanicalEffect,
    acquisitionType: derivedAbility.acquisitionType,
    activationType: derivedAbility.activationType,
    sourceSystem: derivedAbility.sourceSystem,
    sourceExternalId: derivedAbility.sourceExternalId,
  }).from(derivedAbility)
    .where(where)
    .orderBy(asc(derivedAbility.name), asc(derivedAbility.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = rows.map(({ id }) => id);
  const [triggerRows, rawRequirementRows, effectRows] = ids.length
    ? await Promise.all([
        loadTriggerRows(ids),
        loadRequirementRows(ids),
        loadEffectRows(ids),
      ])
    : [[], [], []];
  const requirements = mapRequirementRows(rawRequirementRows);
  const skillIds = [...new Set(requirements.flatMap((entry) =>
    entry.skillId === null ? [] : [entry.skillId]))];
  const prerequisiteIds = [...new Set(requirements.flatMap((entry) =>
    entry.requiredDerivedAbilityId === null ? [] : [entry.requiredDerivedAbilityId]))];
  const [skillNames, prerequisiteNames] = await Promise.all([
    skillIds.length
      ? db.select({ id: skill.id, name: skill.name }).from(skill)
        .where(inArray(skill.id, skillIds))
      : Promise.resolve([]),
    prerequisiteIds.length
      ? db.select({ id: derivedAbility.id, name: derivedAbility.name })
        .from(derivedAbility)
        .where(inArray(derivedAbility.id, prerequisiteIds))
      : Promise.resolve([]),
  ]);
  const catalog = assembleDerivedAbilityCatalog({
    definitions: rows,
    triggers: triggerRows,
    requirements,
  });
  const references = {
    skillNames: new Map(skillNames.map((entry) => [entry.id, entry.name])),
    derivedAbilityNames: new Map(
      prerequisiteNames.map((entry) => [entry.id, entry.name]),
    ),
  };
  const effectCounts = new Map<number, number>();
  for (const effect of effectRows) {
    effectCounts.set(
      effect.derivedAbilityId,
      (effectCounts.get(effect.derivedAbilityId) ?? 0) + 1,
    );
  }

  return {
    items: catalog.map((ability) => ({
      id: ability.id,
      name: ability.name,
      description: ability.description,
      requirementSummary: getDerivedAbilityRequirementSummary(ability, references),
      requirementOrigin: getDerivedAbilityRequirementOrigin(ability),
      acquisitionType: ability.acquisitionType,
      activationType: ability.activationType,
      effectCount: effectCounts.get(ability.id) ?? 0,
      sourceSystem: ability.sourceSystem,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDerivedAbility(
  id: number,
): Promise<DerivedAbilityAggregate | null> {
  await requireGod();
  const [row] = await db.select().from(derivedAbility)
    .where(eq(derivedAbility.id, id)).limit(1);
  if (!row) return null;
  const [
    triggerRows,
    requirementRows,
    conditionRows,
    costRows,
    limitRows,
    effectRows,
    legacyReferenceRows,
  ] = await Promise.all([
    loadTriggerRows([id]),
    loadRequirementRows([id]),
    loadConditionRows([id]),
    loadCostRows([id]),
    loadLimitRows([id]),
    loadEffectRows([id]),
    db.select({ value: count() }).from(campaignAllowedDerivedAbility)
      .where(eq(campaignAllowedDerivedAbility.derivedAbilityId, id)),
  ]);
  const [definition] = assembleDerivedAbilityCatalog({
    definitions: [row],
    triggers: triggerRows,
    requirements: mapRequirementRows(requirementRows),
    useConditions: mapConditionRows(conditionRows),
    costs: mapCostRows(costRows),
    useLimits: mapLimitRows(limitRows),
    effects: decodeDerivedAbilityEffects(effectRows).map((effect, sortOrder) => ({
      derivedAbilityId: id,
      sortOrder,
      effect,
    })),
  });
  if (!definition) return null;
  return {
    ...definitionToDerivedAbilityDraft(definition),
    id: definition.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    legacyCampaignReferenceCount: Number(legacyReferenceRows[0]?.value ?? 0),
  };
}

export async function saveDerivedAbility(
  input: DerivedAbilityDraft,
): Promise<DerivedAbilityAggregate> {
  const session = await requireGod();
  const normalized = normalizeDerivedAbilityAuthoringDraft(input);
  const savedId = await db.transaction(async (tx) => {
    let id = normalized.id;
    if (id === undefined) {
      const [created] = await tx.insert(derivedAbility).values({
        name: normalized.core.name,
        description: normalized.core.description,
        mechanicalEffect: normalized.core.mechanicalEffect,
        acquisitionType: normalized.acquisitionType,
        activationType: normalized.activationType,
        sourceSystem: null,
        sourceExternalId: null,
        createdByUserId: session.user.id,
      }).returning({ id: derivedAbility.id });
      id = created.id;
    } else {
      const [stored] = await tx.select({
        sourceSystem: derivedAbility.sourceSystem,
        sourceExternalId: derivedAbility.sourceExternalId,
      }).from(derivedAbility).where(eq(derivedAbility.id, id)).limit(1);
      if (!stored) throw new Error("That Derived Ability no longer exists.");
      if (
        stored.sourceSystem !== normalized.core.sourceSystem ||
        stored.sourceExternalId !== normalized.core.sourceExternalId
      ) {
        throw new Error("Canonical Derived Ability source identity cannot be changed.");
      }
      await tx.update(derivedAbility).set({
        name: normalized.core.name,
        description: normalized.core.description,
        mechanicalEffect: normalized.core.mechanicalEffect,
        acquisitionType: normalized.acquisitionType,
        activationType: normalized.activationType,
        updatedAt: new Date(),
      }).where(eq(derivedAbility.id, id));
    }

    // A new record's generated ID is not known at the first normalization
    // boundary. Normalize again with the owning ID so even a forged new-draft
    // payload cannot create a direct self-prerequisite.
    const ownedDefinition = normalizeDerivedAbilityAuthoringDraft({
      ...normalized,
      id,
    });
    const requirements = ownedDefinition.requirements.map((requirement) => ({
      derivedAbilityId: id,
      requirementScope: requirement.requirementScope,
      requirementType: requirement.requirementType,
      groupNumber: requirement.groupNumber,
      attributeKey: requirement.attributeKey,
      skillId: requirement.skillId,
      requiredDerivedAbilityId: requirement.requiredDerivedAbilityId,
      operator: requirement.operator,
      requiredValue: requirement.requiredValue,
      notes: requirement.notes,
      sortOrder: requirement.sortOrder,
    }));
    const conditions = ownedDefinition.useConditions.map((condition) => ({
      derivedAbilityId: id,
      conditionType: condition.conditionType,
      conditionKey: condition.conditionKey,
      operator: condition.operator,
      numericValue: condition.numericValue,
      textValue: condition.textValue,
      notes: condition.notes,
      sortOrder: condition.sortOrder,
    }));
    const costs = ownedDefinition.costs.map((cost) => ({
      derivedAbilityId: id,
      costType: cost.costType,
      amount: cost.amount,
      resourceKey: cost.resourceKey,
      notes: cost.notes,
      sortOrder: cost.sortOrder,
    }));
    const limits = ownedDefinition.useLimits.map((limit) => ({
      derivedAbilityId: id,
      maximumUses: limit.maximumUses,
      refreshScope: limit.refreshScope,
      refreshKey: limit.refreshKey,
      notes: limit.notes,
      sortOrder: limit.sortOrder,
    }));
    const effects = encodeDerivedAbilityEffects(ownedDefinition.effects).map((effect) => ({
      derivedAbilityId: id,
      ...effect,
    }));

    await tx.delete(derivedAbilityRequirement)
      .where(eq(derivedAbilityRequirement.derivedAbilityId, id));
    await tx.delete(derivedAbilityUseCondition)
      .where(eq(derivedAbilityUseCondition.derivedAbilityId, id));
    await tx.delete(derivedAbilityCost)
      .where(eq(derivedAbilityCost.derivedAbilityId, id));
    await tx.delete(derivedAbilityUseLimit)
      .where(eq(derivedAbilityUseLimit.derivedAbilityId, id));
    await tx.delete(derivedAbilityEffect)
      .where(eq(derivedAbilityEffect.derivedAbilityId, id));
    if (requirements.length) await tx.insert(derivedAbilityRequirement).values(requirements);
    if (conditions.length) await tx.insert(derivedAbilityUseCondition).values(conditions);
    if (costs.length) await tx.insert(derivedAbilityCost).values(costs);
    if (limits.length) await tx.insert(derivedAbilityUseLimit).values(limits);
    if (effects.length) await tx.insert(derivedAbilityEffect).values(effects);

    await tx.delete(derivedAbilityTrigger)
      .where(eq(derivedAbilityTrigger.derivedAbilityId, id));
    const legacyMirror = getLegacyTriggerMirrorForDefinition(ownedDefinition);
    if (legacyMirror) {
      await tx.insert(derivedAbilityTrigger).values({
        derivedAbilityId: id,
        ...legacyMirror,
      });
    }
    return id;
  });

  revalidatePath("/heavens/derived-abilities");
  revalidatePath("/heavens/campaigns");
  revalidatePath("/realms");
  const saved = await getDerivedAbility(savedId);
  if (!saved) throw new Error("The saved Derived Ability could not be reloaded.");
  return saved;
}

export async function deleteDerivedAbility(id: number): Promise<void> {
  await requireGod();
  await db.transaction(async (tx) => {
    const [stored] = await tx.select({
      sourceSystem: derivedAbility.sourceSystem,
    }).from(derivedAbility).where(eq(derivedAbility.id, id)).limit(1);
    if (!stored) throw new Error("That Derived Ability no longer exists.");
    if (stored.sourceSystem) {
      throw new Error("Canonical Derived Abilities cannot be deleted.");
    }
    const [prerequisiteRows, legacyReferenceRows] = await Promise.all([
      tx.select({ value: count() }).from(derivedAbilityRequirement)
        .where(eq(derivedAbilityRequirement.requiredDerivedAbilityId, id)),
      tx.select({ value: count() }).from(campaignAllowedDerivedAbility)
        .where(eq(campaignAllowedDerivedAbility.derivedAbilityId, id)),
    ]);
    if (Number(prerequisiteRows[0]?.value ?? 0) > 0) {
      throw new Error(
        "This Derived Ability is required by another Derived Ability and cannot be deleted until that prerequisite is removed.",
      );
    }
    if (Number(legacyReferenceRows[0]?.value ?? 0) > 0) {
      throw new Error(
        "This record still has legacy campaign references. Those references must be reconciled before deletion.",
      );
    }
    await tx.delete(derivedAbility).where(eq(derivedAbility.id, id));
  });
  revalidatePath("/heavens/derived-abilities");
  revalidatePath("/heavens/campaigns");
}
