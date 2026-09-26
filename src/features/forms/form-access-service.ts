import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { raceFormAccessRequirement, creatureFormAccessRequirement } from "@/db/form-access-schema";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { creatureAbility } from "@/db/creature-schema";
import { normalizeFormAccess, type FormAccess, type FormAccessMode, type FormAccessOwner } from "./form-access";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const tableFor = (owner: FormAccessOwner) => owner === "race" ? raceFormAccessRequirement : creatureFormAccessRequirement;

export async function readFormAccessInTransaction(tx: Transaction, owner: FormAccessOwner, forms: readonly { id: number; accessMode: FormAccessMode }[]) {
  const result = new Map<number, FormAccess>();
  if (!forms.length) return result;
  const table = tableFor(owner);
  const rows = await tx.select({ requirement: table, skillName: skill.name, classification: skill.classification, abilityName: derivedAbility.name, creatureAbilityName: creatureAbility.abilityName })
    .from(table).leftJoin(skill, eq(skill.id, table.skillId)).leftJoin(derivedAbility, eq(derivedAbility.id, table.requiredDerivedAbilityId))
    .leftJoin(creatureAbility, eq(creatureAbility.canonicalId, table.requiredCreatureAbilityCanonicalId))
    .where(inArray(table.formId, forms.map(form => form.id))).orderBy(asc(table.groupNumber), asc(table.sortOrder));
  for (const form of forms) result.set(form.id, { mode: form.accessMode, requirements: rows.filter(row => row.requirement.formId === form.id).map(({ requirement, skillName, classification, abilityName, creatureAbilityName }) => ({
    key: requirement.key, groupNumber: requirement.groupNumber, requirementType: requirement.requirementType, attributeKey: requirement.attributeKey, skillId: requirement.skillId, requiredDerivedAbilityId: requirement.requiredDerivedAbilityId,
    requiredCreatureAbilityCanonicalId: requirement.requiredCreatureAbilityCanonicalId, operator: requirement.operator, requiredValue: requirement.requiredValue, notes: requirement.notes, sortOrder: requirement.sortOrder,
    ...(skillName || abilityName || creatureAbilityName ? { referenceName: skillName ?? abilityName ?? creatureAbilityName! } : {}), ...(classification ? { skillClassification: classification } : {}),
  })) });
  return result;
}

/** Checks final Normal Creature identities before any access rows are replaced.
 * Labels supplied by a client are never saved as identity or reference authority. */
export async function validateFormAccessReferences(tx: Transaction, owner: FormAccessOwner, input: FormAccess | undefined, previous?: FormAccess, creatureAbilityIds: ReadonlySet<string> = new Set()) {
  const access = normalizeFormAccess(input, owner);
  const old = previous?.requirements ?? [];
  const skillIds = [...new Set(access.requirements.flatMap(row => row.skillId === null ? [] : [row.skillId]))];
  const abilityIds = [...new Set(access.requirements.flatMap(row => row.requiredDerivedAbilityId === null ? [] : [row.requiredDerivedAbilityId]))];
  if (skillIds.length) {
    const found = await tx.select({ id: skill.id, archivedAt: skill.archivedAt }).from(skill).where(inArray(skill.id, skillIds)).for("share");
    if (found.length !== skillIds.length) throw new Error("A Form Access Skill no longer exists.");
    if (found.some(row => row.archivedAt && !old.some(requirement => requirement.skillId === row.id))) throw new Error("Archived Skills cannot be newly assigned to Form Access.");
  }
  if (abilityIds.length) {
    const found = await tx.select({ id: derivedAbility.id, archivedAt: derivedAbility.archivedAt }).from(derivedAbility).where(inArray(derivedAbility.id, abilityIds)).for("share");
    if (found.length !== abilityIds.length) throw new Error("A Form Access Derived Ability no longer exists.");
    if (found.some(row => row.archivedAt && !old.some(requirement => requirement.requiredDerivedAbilityId === row.id))) throw new Error("Archived Derived Abilities cannot be newly assigned to Form Access.");
  }
  if (access.requirements.some(row => row.requiredCreatureAbilityCanonicalId !== null && !creatureAbilityIds.has(row.requiredCreatureAbilityCanonicalId))) throw new Error("A Form Access prerequisite must reference an Ability in this Creature's Normal definition. Remove or change the prerequisite before removing that Ability.");
  return access;
}

export async function saveFormAccessInTransaction(tx: Transaction, owner: FormAccessOwner, formId: number, access: FormAccess) {
  const table = tableFor(owner);
  await tx.delete(table).where(eq(table.formId, formId));
  if (access.requirements.length) await tx.insert(table).values(access.requirements.map(row => ({ formId, key: row.key, groupNumber: row.groupNumber, requirementType: row.requirementType, attributeKey: row.attributeKey,
    skillId: row.skillId, requiredDerivedAbilityId: row.requiredDerivedAbilityId, requiredCreatureAbilityCanonicalId: row.requiredCreatureAbilityCanonicalId, operator: row.operator, requiredValue: row.requiredValue, notes: row.notes, sortOrder: row.sortOrder })));
}

export async function cloneFormAccessInTransaction(tx: Transaction, owner: FormAccessOwner, sourceId: number, formId: number, abilityIds: ReadonlyMap<string, string> = new Map()) {
  const table = tableFor(owner);
  const rows = await tx.select().from(table).where(eq(table.formId, sourceId));
  if (rows.length) await tx.insert(table).values(rows.map(row => {
    const canonicalId = row.requiredCreatureAbilityCanonicalId;
    if (canonicalId && !abilityIds.has(canonicalId)) throw new Error("Cannot copy a Form Access requirement with a missing Normal Creature Ability.");
    return { ...row, id: undefined, formId, requiredCreatureAbilityCanonicalId: canonicalId ? abilityIds.get(canonicalId)! : null };
  }));
}
