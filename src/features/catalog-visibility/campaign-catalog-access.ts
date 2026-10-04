import "server-only";
import { eq, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";

/** Callers must authorize Campaign membership first. Preferences never change gameplay access. */
export function campaignCatalogWhere(table: { isSystemCanon: AnyPgColumn; createdByUserId: AnyPgColumn }, campaignId: number) {
  return or(eq(table.isSystemCanon, true), sql`${table.createdByUserId} = (select created_by_user_id from campaign where id = ${campaignId})`)!;
}

/** Retained assignments and racial/Creature grants belong to the Campaign, even after reclassification. */
export function campaignSkillWhere(campaignId: number) {
  return or(campaignCatalogWhere(skill, campaignId), sql`${skill.id} in (
    select a.skill_id from campaign_character_skill_allocation a join campaign_character c on c.id = a.character_id where c.campaign_id = ${campaignId}
    union select l.skill_id from race_skill_links l join campaign_race r on r.race_id = l.race_id where r.campaign_id = ${campaignId}
    union select l.skill_id from race_skill_links l join campaign_character_profile p on p.race_id = l.race_id join campaign_character c on c.id = p.character_id where c.campaign_id = ${campaignId}
    union select (g->>'skillId')::integer from campaign_creature_npc_profile p join campaign_character c on c.id = p.character_id,
      lateral jsonb_array_elements(coalesce(p.current_snapshot_json::jsonb->'skillLinks', '[]'::jsonb)) g where c.campaign_id = ${campaignId}
    union select (g->>'skillId')::integer from campaign_session_encounter_participant p,
      lateral jsonb_array_elements(coalesce(p.creature_snapshot_json->'skillLinks', '[]'::jsonb)) g where p.campaign_id = ${campaignId}
  )`)!;
}

export function campaignDerivedAbilityWhere(campaignId: number) {
  return or(campaignCatalogWhere(derivedAbility, campaignId), sql`${derivedAbility.id} in (
    select a.derived_ability_id from character_derived_ability a join campaign_character c on c.id = a.character_id where c.campaign_id = ${campaignId}
    union select derived_ability_id from campaign_allowed_derived_ability where campaign_id = ${campaignId}
  )`)!;
}
