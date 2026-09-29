import "server-only";
import { getCatalogManagementState, catalogCreatorLabel } from "./admin-catalog-query";
import type { AdminCatalogBrowse } from "./admin-catalog-browse";
import { and, asc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { skill, skillRelationship } from "@/db/skill-schema";
import { buildRecursiveSkillLibrary } from "@/features/skills/recursive-skill-library";
import { catalogAncestorIds, catalogBrowseWhere, catalogSourceLabel } from "./catalog-query";

/** Authoring discovery only. Runtime and mutation validation keep the complete graph. */
export async function loadVisibleRecursiveSkillLibrary(currentUserId: string, adminBrowse?: AdminCatalogBrowse) {
  const visibility = await getCatalogManagementState(currentUserId, "skill", adminBrowse);
  const selection = { id: skill.id, name: skill.name, classification: skill.classification, tier: skill.tier,
    primaryAttribute: skill.primaryAttribute, secondaryAttribute: skill.secondaryAttribute, definition: skill.definition,
    sourceSystem: skill.sourceSystem, sourceExternalId: skill.sourceExternalId, archivedAt: skill.archivedAt,
    isSystemCanon: skill.isSystemCanon, createdByUserId: skill.createdByUserId };
  const matches = await db.select(selection).from(skill)
    .where(catalogBrowseWhere(skill, currentUserId, visibility, isNull(skill.archivedAt))).orderBy(asc(skill.name), asc(skill.id));
  const matchIds = new Set(matches.map((row) => row.id));
  const ids = visibility.enabled || visibility.admin ? await catalogAncestorIds("skill", [...matchIds]) : [...matchIds];
  const contextIds = ids.filter((id) => !matchIds.has(id));
  const contexts = contextIds.length ? await db.select(selection).from(skill).where(inArray(skill.id, contextIds)) : [];
  const relationships = ids.length ? await db.select().from(skillRelationship)
    .where(and(inArray(skillRelationship.skillId, ids), inArray(skillRelationship.relatedSkillId, ids))) : [];
  return buildRecursiveSkillLibrary([...matches, ...contexts].map(({ isSystemCanon, createdByUserId, archivedAt, ...row }) => ({
    ...row, archived: archivedAt !== null,
    creatorLabel: catalogCreatorLabel(visibility, createdByUserId),
    catalogSource: catalogSourceLabel({ isSystemCanon, createdByUserId }, currentUserId, !matchIds.has(row.id)),
  })), relationships);
}
