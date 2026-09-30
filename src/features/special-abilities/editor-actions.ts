"use server";

import { asc, eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { skill, skillExtension } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { catalogCandidateWhere } from "@/features/catalog-visibility/catalog-query";
import { readSpecialAbilityMechanics } from "./codec";
import { collectMechanicsReferences } from "./references";
import { SPECIAL_ABILITY_MECHANICS_EXTENSION } from "./models";
import type { MechanicsEditorReferences } from "./authoring";

/** Discovery follows catalog preferences; retained identities come only from storage. */
export async function getMechanicsEditorReferences(forSkillId?: number): Promise<MechanicsEditorReferences> {
  const { session } = await requireGodOrAdminAccessContext();
  if (forSkillId !== undefined && (!Number.isInteger(forSkillId) || forSkillId <= 0 || forSkillId > 2147483647)) throw new Error("Choose a saved Skill.");
  const [stored] = forSkillId === undefined ? [] : await db.select().from(skillExtension)
    .where(and(eq(skillExtension.skillId, forSkillId), eq(skillExtension.extensionType, SPECIAL_ABILITY_MECHANICS_EXTENSION)));
  const read = readSpecialAbilityMechanics(stored);
  const retained = read.status === "ready" ? collectMechanicsReferences(read.document) : [];
  const skills = retained.flatMap(ref => ref.kind === "skill" ? [ref.skillId] : []);
  const abilities = retained.flatMap(ref => ref.kind === "derived-ability" ? [ref.derivedAbilityId] : []);
  const skillWhere = await catalogCandidateWhere("skill", skill, session.user.id, skills, isNull(skill.archivedAt));
  const derivedWhere = await catalogCandidateWhere("derivedAbility", derivedAbility, session.user.id, abilities, isNull(derivedAbility.archivedAt));
  const [skillRows, derivedRows] = await Promise.all([
    db.select({ id: skill.id, name: skill.name, classification: skill.classification, archivedAt: skill.archivedAt }).from(skill).where(skillWhere).orderBy(asc(skill.name), asc(skill.id)),
    db.select({ id: derivedAbility.id, name: derivedAbility.name, archivedAt: derivedAbility.archivedAt }).from(derivedAbility).where(derivedWhere).orderBy(asc(derivedAbility.name), asc(derivedAbility.id)),
  ]);
  return { options: [
    ...skillRows.map(row => ({ kind: "skill" as const, skillId: row.id, name: row.name, classification: row.classification, archived: row.archivedAt !== null })),
    ...derivedRows.map(row => ({ kind: "derived-ability" as const, derivedAbilityId: row.id, name: row.name, archived: row.archivedAt !== null })),
  ] };
}
