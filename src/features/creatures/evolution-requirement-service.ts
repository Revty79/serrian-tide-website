import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { creatureAbility, creatureEvolutionPath, creatureForm } from "@/db/creature-schema";
import { creatureEvolutionRequirement as requirement } from "@/db/creature-evolution-schema";
import { skill } from "@/db/skill-schema";
import { item } from "@/db/item-schema";
import { catalogBrowseWhere, getCatalogBrowseState, itemDiscoveryWhere } from "@/features/catalog-visibility/catalog-query";
import { normalizeEvolutionRequirements, type EvolutionRequirement, type EvolutionRequirementMode, type EvolutionRequirements } from "./evolution-requirements";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readEvolutionRequirements(tx: Transaction, pathId: number, mode: EvolutionRequirementMode): Promise<EvolutionRequirements> {
  const rows = await tx.select({ row: requirement, skillName: skill.name, skillArchive: skill.archivedAt, itemName: item.name, itemArchive: item.archivedAt }).from(requirement)
    .leftJoin(skill, eq(skill.id, requirement.skillId)).leftJoin(item, eq(item.id, requirement.itemId))
    .where(eq(requirement.pathId, pathId)).orderBy(asc(requirement.groupNumber), asc(requirement.sortOrder), asc(requirement.id));
  return { mode, requirements: rows.map(({ row, skillName, skillArchive, itemName, itemArchive }) => ({ ...row,
    referenceName: skillName ?? itemName ?? undefined, referenceArchived: !!(skillArchive || itemArchive) })) };
}

export async function evolutionSourceChoices(tx: Transaction, sourceId: number) {
  return {
    abilities: await tx.select({ canonicalId: creatureAbility.canonicalId, name: creatureAbility.abilityName }).from(creatureAbility).where(and(eq(creatureAbility.creatureId, sourceId), isNull(creatureAbility.variantId))).orderBy(asc(creatureAbility.sortOrder)),
    forms: await tx.select({ key: creatureForm.key, name: creatureForm.name }).from(creatureForm).where(eq(creatureForm.creatureId, sourceId)).orderBy(asc(creatureForm.sortOrder)),
  };
}

/** Existing references are retained by requirement key, never by a client label. */
export async function validateEvolutionReferences(tx: Transaction, sourceId: number, input: EvolutionRequirements, previous: EvolutionRequirements, userId: string) {
  const value = normalizeEvolutionRequirements(input), choices = await evolutionSourceChoices(tx, sourceId);
  const visibility = await getCatalogBrowseState(userId, "skill");
  for (const row of value.requirements) {
    const old = previous.requirements.find(old => old.key === row.key);
    if (row.skillId !== null) {
      const [found] = await tx.select({ id: skill.id, archived: skill.archivedAt }).from(skill).where(eq(skill.id, row.skillId)).for("share");
      if (!found) throw new Error("The referenced Skill no longer exists.");
      if (old?.skillId !== row.skillId) {
        const [visible] = await tx.select({ id: skill.id }).from(skill).where(catalogBrowseWhere(skill, userId, visibility, eq(skill.id, row.skillId), isNull(skill.archivedAt)));
        if (!visible) throw new Error("Choose an active Skill available in your catalog view. Archived references can only be retained.");
      }
    }
    if (row.itemId !== null) {
      const [found] = await tx.select({ id: item.id }).from(item).where(eq(item.id, row.itemId)).for("share");
      if (!found) throw new Error("The referenced Item no longer exists.");
      if (old?.itemId !== row.itemId) {
        const [visible] = await tx.select({ id: item.id }).from(item).where(await itemDiscoveryWhere(userId, eq(item.id, row.itemId), isNull(item.archivedAt)));
        if (!visible) throw new Error("Choose an active Item available in your catalog view. Archived references can only be retained.");
      }
    }
    if (row.creatureAbilityCanonicalId !== null && !choices.abilities.some(choice => choice.canonicalId === row.creatureAbilityCanonicalId)) throw new Error("Choose an Ability in this exact source Creature's Normal definition.");
    if (row.creatureFormKey !== null && !choices.forms.some(choice => choice.key === row.creatureFormKey)) throw new Error("Choose a Form on this exact source Creature.");
  }
  return value;
}

function values(row: EvolutionRequirement, pathId: number) {
  return { pathId, key: row.key, groupNumber: row.groupNumber, sortOrder: row.sortOrder, requirementType: row.requirementType,
    operator: row.operator, requiredValue: row.requiredValue, skillId: row.skillId, itemId: row.itemId, itemHolder: row.itemHolder as "creature" | "owner" | null,
    creatureAbilityCanonicalId: row.creatureAbilityCanonicalId, creatureFormKey: row.creatureFormKey,
    conditionName: row.conditionName, manualCategory: row.manualCategory, notes: row.notes };
}
/** Caller locks/authorizes source and checks the owning path version. */
export async function saveEvolutionRequirementRows(tx: Transaction, pathId: number, value: EvolutionRequirements) {
  const rows = await tx.select().from(requirement).where(eq(requirement.pathId, pathId));
  const removed = rows.filter(row => !value.requirements.some(next => next.key === row.key));
  if (removed.length) await tx.delete(requirement).where(inArray(requirement.id, removed.map(row => row.id)));
  for (const row of value.requirements) {
    const next = values(row, pathId);
    await tx.insert(requirement).values(next).onConflictDoUpdate({ target: [requirement.pathId, requirement.key], set: next });
  }
}

export async function cloneEvolutionRequirementRows(tx: Transaction, originalPathId: number, newPathId: number, abilityIds: ReadonlyMap<string, string>) {
  const rows = await tx.select().from(requirement).where(eq(requirement.pathId, originalPathId));
  for (const row of rows) {
    const ability = row.creatureAbilityCanonicalId;
    if (ability !== null && !abilityIds.has(ability)) throw new Error("Cannot clone an Evolution requirement with a missing source Ability.");
    // Form keys are portable owner-local keys, copied unchanged by Creature Form cloning.
    await tx.insert(requirement).values({ ...values(row, newPathId), creatureAbilityCanonicalId: ability === null ? null : abilityIds.get(ability)! });
  }
}

/** Called by master Creature save. Refuse silent invalidation of portable references. */
export async function assertEvolutionSourceReferences(tx: Transaction, sourceId: number, abilityIds: ReadonlySet<string>, formKeys: ReadonlySet<string>) {
  const rows = await tx.select({ ability: requirement.creatureAbilityCanonicalId, form: requirement.creatureFormKey }).from(requirement)
    .innerJoin(creatureEvolutionPath, eq(creatureEvolutionPath.id, requirement.pathId)).where(eq(creatureEvolutionPath.sourceCreatureId, sourceId));
  if (rows.some(row => row.ability !== null && !abilityIds.has(row.ability))) throw new Error("An Evolution requirement references a removed Normal Creature Ability. Update that requirement before removing the Ability.");
  if (rows.some(row => row.form !== null && !formKeys.has(row.form))) throw new Error("An Evolution requirement references a removed Creature Form. Update that requirement before removing the Form.");
}
