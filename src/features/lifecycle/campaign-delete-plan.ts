export type CampaignDeleteScope = "campaign" | "character" | "chat-room";

export type CampaignDeleteStep = {
  tableName: string;
  scope: CampaignDeleteScope;
};

/**
 * Child-before-parent order for every table in the Campaign-owned FK closure.
 * The list is deliberately explicit: adding a Campaign-owned table requires a
 * conscious deletion-policy decision and a matching test update.
 */
export const CAMPAIGN_GRAPH_DELETE_STEPS = [
  { tableName: "campaign_allowed_derived_ability", scope: "campaign" },
  { tableName: "campaign_allowed_race", scope: "campaign" },
  { tableName: "campaign_allowed_system", scope: "campaign" },
  { tableName: "campaign_character_active_health_pool", scope: "character" },
  { tableName: "campaign_character_active_mana", scope: "character" },
  { tableName: "campaign_character_currency_holding", scope: "character" },
  { tableName: "campaign_character_firearm_event", scope: "campaign" },
  { tableName: "campaign_character_firearm_preparation", scope: "campaign" },
  { tableName: "campaign_character_injury", scope: "character" },
  { tableName: "campaign_character_active_health", scope: "character" },
  { tableName: "campaign_character_item_equipment_state", scope: "character" },
  { tableName: "campaign_character_item", scope: "character" },
  { tableName: "campaign_character_spell_document", scope: "character" },
  { tableName: "campaign_character_weapon_override", scope: "campaign" },
  { tableName: "campaign_character_attribute", scope: "character" },
  { tableName: "campaign_character_skill_allocation", scope: "character" },
  { tableName: "campaign_creature_npc_profile", scope: "character" },
  { tableName: "campaign_derived_currency", scope: "campaign" },
  { tableName: "shop_offering", scope: "campaign" },
  { tableName: "campaign_inventory_item", scope: "campaign" },
  { tableName: "campaign_inventory_tag", scope: "campaign" },
  { tableName: "shop_staff_assignment", scope: "campaign" },
  { tableName: "campaign_session_called_check_event", scope: "campaign" },
  { tableName: "campaign_session_called_check_request", scope: "campaign" },
  { tableName: "campaign_session_called_check_batch", scope: "campaign" },
  { tableName: "campaign_session_effect_duration_binding", scope: "campaign" },
  { tableName: "campaign_character_active_condition", scope: "character" },
  { tableName: "campaign_character_active_modifier", scope: "character" },
  { tableName: "campaign_session_encounter_action_declaration_event", scope: "campaign" },
  { tableName: "campaign_session_encounter_effect", scope: "campaign" },
  { tableName: "campaign_session_encounter_effect_plan_event", scope: "campaign" },
  { tableName: "campaign_session_encounter_firearm_attack_event", scope: "campaign" },
  { tableName: "campaign_session_encounter_firearm_bullet", scope: "campaign" },
  { tableName: "campaign_session_encounter_pending_action_source", scope: "campaign" },
  { tableName: "campaign_session_encounter_reaction_event", scope: "campaign" },
  { tableName: "campaign_session_encounter_responder_opportunity", scope: "campaign" },
  { tableName: "campaign_session_encounter_reward", scope: "campaign" },
  { tableName: "campaign_character_profile", scope: "character" },
  { tableName: "campaign_session_high_low_event", scope: "campaign" },
  { tableName: "campaign_session_high_low_request", scope: "campaign" },
  { tableName: "campaign_session_player_ruling_request_event", scope: "campaign" },
  { tableName: "campaign_session_player_ruling_request", scope: "campaign" },
  { tableName: "campaign_session_encounter_firearm_attack", scope: "campaign" },
  { tableName: "campaign_character_firearm_state", scope: "campaign" },
  { tableName: "campaign_character_item_instance", scope: "character" },
  { tableName: "campaign_session_encounter_effect_plan", scope: "campaign" },
  { tableName: "campaign_session_encounter_action_declaration", scope: "campaign" },
  { tableName: "campaign_session_roll_amendment", scope: "campaign" },
  { tableName: "campaign_session_roll", scope: "campaign" },
  { tableName: "campaign_session_encounter_reaction", scope: "campaign" },
  { tableName: "campaign_session_encounter_pending_action", scope: "campaign" },
  { tableName: "campaign_session_encounter_initiative_participant", scope: "campaign" },
  { tableName: "campaign_session_encounter_initiative", scope: "campaign" },
  { tableName: "campaign_session_encounter_participant", scope: "campaign" },
  { tableName: "campaign_session_scene_member", scope: "campaign" },
  { tableName: "campaign_session_roster", scope: "campaign" },
  { tableName: "character_derived_ability_recharge", scope: "character" },
  { tableName: "character_derived_ability_use", scope: "character" },
  { tableName: "campaign_session_encounter", scope: "campaign" },
  { tableName: "campaign_session_scene", scope: "campaign" },
  { tableName: "campaign_session", scope: "campaign" },
  { tableName: "character_derived_ability", scope: "character" },
  { tableName: "campaign_character", scope: "campaign" },
  { tableName: "campaign_player", scope: "campaign" },
  { tableName: "chat_message", scope: "chat-room" },
  { tableName: "chat_room_member", scope: "chat-room" },
  { tableName: "chat_room", scope: "campaign" },
  { tableName: "shop", scope: "campaign" },
] as const satisfies readonly CampaignDeleteStep[];

/** Nullable self-references must be detached before their table is removed. */
export const CAMPAIGN_GRAPH_SELF_REFERENCE_BREAKS = [
  { tableName: "campaign_character_skill_allocation", columnName: "parent_allocation_id", scope: "character" },
  { tableName: "campaign_session_encounter_action_declaration", columnName: "supersedes_declaration_id", scope: "campaign" },
  { tableName: "campaign_session_encounter_reaction", columnName: "opposes_reaction_id", scope: "campaign" },
  { tableName: "campaign_session_called_check_request", columnName: "parent_request_id", scope: "campaign" },
  { tableName: "campaign_session_high_low_request", columnName: "parent_request_id", scope: "campaign" },
  { tableName: "campaign_session_roll_amendment", columnName: "previous_amendment_id", scope: "campaign" },
] as const;
