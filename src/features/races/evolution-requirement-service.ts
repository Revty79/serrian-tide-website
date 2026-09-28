import "server-only";
import { asc, eq, inArray, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { raceForm } from "@/db/race-schema";
import { raceEvolutionPath } from "@/db/race-evolution-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { raceEvolutionRequirement as requirement } from "@/db/race-evolution-schema";
import { skill } from "@/db/skill-schema";
import { item } from "@/db/item-schema";
import { catalogBrowseWhere, getCatalogBrowseState, itemDiscoveryWhere } from "@/features/catalog-visibility/catalog-query";
import { normalizeEvolutionRequirements, type EvolutionRequirement, type EvolutionRequirementMode, type EvolutionRequirements } from "@/features/evolutions/evolution-requirements";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readEvolutionRequirements(tx: Transaction, pathId: number, mode: EvolutionRequirementMode): Promise<EvolutionRequirements> {
  const rows = await tx.select({ row: requirement, skillName: skill.name, skillArchive: skill.archivedAt, itemName: item.name, itemArchive: item.archivedAt, abilityName: derivedAbility.name, abilityArchive: derivedAbility.archivedAt }).from(requirement)
    .leftJoin(derivedAbility, eq(derivedAbility.id, requirement.derivedAbilityId)).leftJoin(skill, eq(skill.id, requirement.skillId)).leftJoin(item, eq(item.id, requirement.itemId))
    .where(eq(requirement.pathId, pathId)).orderBy(asc(requirement.groupNumber), asc(requirement.sortOrder), asc(requirement.id));
  return { mode, requirements: rows.map(({ row, skillName, skillArchive, itemName, itemArchive, abilityName, abilityArchive }) => ({ ...row, creatureAbilityCanonicalId: null, creatureFormKey: null,
    referenceName: skillName ?? itemName ?? abilityName ?? undefined, referenceArchived: !!(skillArchive || itemArchive || abilityArchive) })) };
}

export async function evolutionSourceChoices(tx: Transaction, sourceId: number) {
  return {
    abilities: [] as Array<{ canonicalId: string; name: string }>,
    forms: await tx.select({ key: raceForm.key, name: raceForm.name }).from(raceForm).where(eq(raceForm.raceId, sourceId)).orderBy(asc(raceForm.sortOrder)),
  };
}

/** Existing references are retained by requirement key, never by a client label. */
export async function validateEvolutionReferences(tx: Transaction, sourceId: number, input: EvolutionRequirements, previous: EvolutionRequirements, userId: string) {
  const value = normalizeEvolutionRequirements(input, "race"), choices = await evolutionSourceChoices(tx, sourceId);
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
    if (row.derivedAbilityId != null) {
      const [found] = await tx.select().from(derivedAbility).where(eq(derivedAbility.id, row.derivedAbilityId)).for("share");
      if (!found) throw new Error("The referenced Derived Ability no longer exists.");
      if (old?.derivedAbilityId !== row.derivedAbilityId) {
        const visibility = await getCatalogBrowseState(userId, "derivedAbility");
        const [visible] = await tx.select({ id: derivedAbility.id }).from(derivedAbility).where(catalogBrowseWhere(derivedAbility, userId, visibility, eq(derivedAbility.id, row.derivedAbilityId), isNull(derivedAbility.archivedAt)));
        if (!visible) throw new Error("Choose an active Derived Ability available in your catalog view.");
      }
    }
    if (row.raceFormKey != null && !choices.forms.some(choice => choice.key === row.raceFormKey)) throw new Error("Choose a Form on this exact source Race.");
  }
  return value;
}

function values(row: EvolutionRequirement, pathId: number) {
  return { pathId, key: row.key, groupNumber: row.groupNumber, sortOrder: row.sortOrder, requirementType: row.requirementType,
    operator: row.operator, requiredValue: row.requiredValue, skillId: row.skillId, itemId: row.itemId, itemHolder: row.itemHolder as "character" | null,
    derivedAbilityId: row.derivedAbilityId, raceFormKey: row.raceFormKey,
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

export async function cloneEvolutionRequirementRows(tx: Transaction, originalPathId: number, newPathId: number) {
  const rows = await tx.select().from(requirement).where(eq(requirement.pathId, originalPathId));
  for (const row of rows) await tx.insert(requirement).values({ ...row, id: undefined, pathId: newPathId });
}

/** Form keys are copied unchanged into the new source Race namespace. */
export async function assertRaceEvolutionSourceReferences(tx: Transaction, sourceId: number, formKeys: ReadonlySet<string>) {
  const rows = await tx.select({ form: requirement.raceFormKey }).from(requirement)
    .innerJoin(raceEvolutionPath, eq(raceEvolutionPath.id, requirement.pathId)).where(eq(raceEvolutionPath.sourceRaceId, sourceId));
  if (rows.some(row => row.form !== null && !formKeys.has(row.form))) throw new Error("An Evolution requirement references a removed Race Form. Update that requirement before removing the Form.");
}
