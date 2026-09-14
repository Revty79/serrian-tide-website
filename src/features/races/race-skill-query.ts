import { and, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import { skill, skillRelationship } from "@/db/skill-schema";

export function raceSkillCandidateFilter(search = "", classification?: string): SQL {
  const conditions: SQL[] = [
    isNull(skill.archivedAt),
    or(eq(skill.tier, 1), sql`lower(btrim(${skill.classification})) = 'special ability'`)!,
  ];
  const needle = search.trim();
  if (needle) {
    // UNION visits each ancestor once, including multi-parent trees and malformed cycles.
    conditions.push(or(
      ilike(skill.name, `%${needle}%`),
      and(eq(skill.tier, 1), sql`${skill.id} in (
        with recursive ancestors(id) as (
          select ${skill.id} from ${skill}
          where ${skill.archivedAt} is null and ${skill.tier} > 1
            and lower(btrim(${skill.classification})) <> 'special ability'
            and ${skill.name} ilike ${`%${needle}%`}
          union
          select ${skillRelationship.relatedSkillId}
          from ${skillRelationship}
          inner join ancestors on ancestors.id = ${skillRelationship.skillId}
          inner join skill ancestor_skill on ancestor_skill.id = ancestors.id
          where ${skillRelationship.relationshipType} = 'parent'
            and ancestor_skill.tier is distinct from 1
        ) select id from ancestors
      )`),
    )!);
  }
  if (classification?.trim()) {
    conditions.push(sql`lower(btrim(${skill.classification})) = ${classification.trim().toLowerCase()}`);
  }
  return and(...conditions)!;
}
