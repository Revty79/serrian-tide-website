"use server";

import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  campaignAllowedDerivedAbility,
  derivedAbility,
  derivedAbilityTrigger,
} from "@/db/derived-ability-schema";
import {
  getDerivedAbilityRequirementSummary,
  normalizeV1DerivedAbilityTrigger,
} from "@/features/derived-abilities/derived-ability-rules";
import type { DerivedAbilityTriggerDefinition } from "@/features/derived-abilities/models";
import { requireGod } from "@/lib/server-access";

export type DerivedAbilityLibraryFilters = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type DerivedAbilitySummary = {
  id: number;
  name: string;
  description: string;
  requirementSummary: string;
  sourceSystem: string | null;
};

export type DerivedAbilityLibraryResult = {
  items: DerivedAbilitySummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type DerivedAbilityDraft = {
  id?: number;
  core: {
    name: string;
    description: string;
    mechanicalEffect: string;
    sourceSystem: string | null;
    sourceExternalId: string | null;
  };
  trigger: DerivedAbilityTriggerDefinition;
};

export type DerivedAbilityAggregate = DerivedAbilityDraft & {
  id: number;
  createdAt: string;
  updatedAt: string;
  campaignAssignmentCount: number;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalize(input: DerivedAbilityDraft) {
  const name = clean(input.core.name);
  if (!name) throw new Error("Derived Ability name is required.");
  const trigger = normalizeV1DerivedAbilityTrigger(input.trigger);
  return {
    core: {
      name,
      description: clean(input.core.description),
      mechanicalEffect: clean(input.core.mechanicalEffect),
      sourceSystem: clean(input.core.sourceSystem) || null,
      sourceExternalId: clean(input.core.sourceExternalId) || null,
    },
    trigger: {
      triggerType: trigger.triggerType,
      attributeKey: trigger.attributeKey,
      minimumScore: trigger.minimumScore,
      sortOrder: 0,
    },
  };
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
  const where = conditions.length ? and(...conditions) : undefined;
  const [countRow] = await db.select({ value: count() }).from(derivedAbility).where(where);
  const total = Number(countRow?.value ?? 0);
  const rows = await db.select({
    id: derivedAbility.id,
    name: derivedAbility.name,
    description: derivedAbility.description,
    sourceSystem: derivedAbility.sourceSystem,
    triggerType: derivedAbilityTrigger.triggerType,
    attributeKey: derivedAbilityTrigger.attributeKey,
    minimumScore: derivedAbilityTrigger.minimumScore,
    sortOrder: derivedAbilityTrigger.sortOrder,
  }).from(derivedAbility)
    .innerJoin(derivedAbilityTrigger, eq(derivedAbilityTrigger.derivedAbilityId, derivedAbility.id))
    .where(where)
    .orderBy(asc(derivedAbility.name), asc(derivedAbility.id), asc(derivedAbilityTrigger.sortOrder))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      requirementSummary: getDerivedAbilityRequirementSummary({ triggers: [{
        triggerType: row.triggerType,
        attributeKey: row.attributeKey,
        minimumScore: row.minimumScore,
        sortOrder: row.sortOrder,
      }] }),
      sourceSystem: row.sourceSystem,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDerivedAbility(id: number): Promise<DerivedAbilityAggregate | null> {
  await requireGod();
  const [row] = await db.select().from(derivedAbility).where(eq(derivedAbility.id, id)).limit(1);
  if (!row) return null;
  const [triggerRows, assignmentRows] = await Promise.all([
    db.select().from(derivedAbilityTrigger).where(eq(derivedAbilityTrigger.derivedAbilityId, id)).orderBy(asc(derivedAbilityTrigger.sortOrder), asc(derivedAbilityTrigger.id)),
    db.select({ value: count() }).from(campaignAllowedDerivedAbility).where(eq(campaignAllowedDerivedAbility.derivedAbilityId, id)),
  ]);
  if (triggerRows.length !== 1) {
    throw new Error("V1 Derived Abilities must have exactly one Attribute trigger.");
  }
  const trigger = triggerRows[0]!;
  return {
    id: row.id,
    core: {
      name: row.name,
      description: row.description,
      mechanicalEffect: row.mechanicalEffect,
      sourceSystem: row.sourceSystem,
      sourceExternalId: row.sourceExternalId,
    },
    trigger: {
      id: trigger.id,
      derivedAbilityId: trigger.derivedAbilityId,
      triggerType: trigger.triggerType,
      attributeKey: trigger.attributeKey,
      minimumScore: trigger.minimumScore,
      sortOrder: trigger.sortOrder,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    campaignAssignmentCount: Number(assignmentRows[0]?.value ?? 0),
  };
}

export async function saveDerivedAbility(
  input: DerivedAbilityDraft,
): Promise<DerivedAbilityAggregate> {
  const session = await requireGod();
  const normalized = normalize(input);
  const savedId = await db.transaction(async (tx) => {
    let id = input.id;
    if (id === undefined) {
      const [created] = await tx.insert(derivedAbility).values({
        ...normalized.core,
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
        updatedAt: new Date(),
      }).where(eq(derivedAbility.id, id));
    }

    await tx.delete(derivedAbilityTrigger).where(eq(derivedAbilityTrigger.derivedAbilityId, id));
    await tx.insert(derivedAbilityTrigger).values({
      derivedAbilityId: id,
      ...normalized.trigger,
    });
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
    const [assignments] = await tx.select({ value: count() })
      .from(campaignAllowedDerivedAbility)
      .where(eq(campaignAllowedDerivedAbility.derivedAbilityId, id));
    if (Number(assignments?.value ?? 0) > 0) {
      throw new Error("Remove this Derived Ability from every Campaign before deleting it.");
    }
    await tx.delete(derivedAbility).where(eq(derivedAbility.id, id));
  });
  revalidatePath("/heavens/derived-abilities");
  revalidatePath("/heavens/campaigns");
}
