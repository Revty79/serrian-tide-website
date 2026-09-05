export type UserAccountForeignKeyDisposition = "block" | "cleanup";

export type UserAccountForeignKeyPlanEntry = {
  tableName: string;
  columnName: string;
  constraintName: string;
  onDelete: "cascade" | "no action" | "restrict" | "set null";
  disposition: UserAccountForeignKeyDisposition;
  label: string;
};

/**
 * Complete inbound-FK inventory for `user.id` in migration snapshot 0033.
 *
 * Account deletion is deliberately fail-closed: only authentication and
 * membership associations are cleanup rows. Every content, ownership,
 * attribution, and historical reference blocks deletion, even when its
 * database FK would otherwise cascade or set itself to null.
 */
export const USER_ACCOUNT_FOREIGN_KEY_PLAN = [
  { tableName: "account", columnName: "user_id", constraintName: "account_user_id_user_id_fk", onDelete: "cascade", disposition: "cleanup", label: "Authentication provider and credential accounts" },
  { tableName: "session", columnName: "user_id", constraintName: "session_user_id_user_id_fk", onDelete: "cascade", disposition: "cleanup", label: "Authenticated sessions" },
  { tableName: "user_role", columnName: "user_id", constraintName: "user_role_user_id_user_id_fk", onDelete: "cascade", disposition: "cleanup", label: "Serrian Tide role assignments" },
  { tableName: "lifecycle_audit_event", columnName: "actor_user_id", constraintName: "lifecycle_audit_event_actor_user_id_user_id_fk", onDelete: "restrict", disposition: "block", label: "Lifecycle audit history" },
  { tableName: "campaign", columnName: "created_by_user_id", constraintName: "campaign_created_by_user_id_user_id_fk", onDelete: "no action", disposition: "block", label: "Owned Campaigns" },
  { tableName: "campaign", columnName: "archived_by_user_id", constraintName: "campaign_archived_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Campaign archive attribution" },
  { tableName: "shop", columnName: "archived_by_user_id", constraintName: "shop_archived_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Shop archive attribution" },
  { tableName: "campaign_player", columnName: "user_id", constraintName: "campaign_player_user_id_user_id_fk", onDelete: "cascade", disposition: "cleanup", label: "Campaign memberships" },
  { tableName: "skill", columnName: "created_by_user_id", constraintName: "skill_created_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Authored Skills" },
  { tableName: "skill", columnName: "archived_by_user_id", constraintName: "skill_archived_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Skill archive attribution" },
  { tableName: "races", columnName: "created_by_user_id", constraintName: "races_created_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Authored Races" },
  { tableName: "races", columnName: "archived_by_user_id", constraintName: "races_archived_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Race archive attribution" },
  { tableName: "creatures", columnName: "created_by_user_id", constraintName: "creatures_created_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Authored Creatures" },
  { tableName: "creatures", columnName: "archived_by_user_id", constraintName: "creatures_archived_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Creature archive attribution" },
  { tableName: "character_derived_ability", columnName: "acquired_by_user_id", constraintName: "character_derived_ability_acquired_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Derived Ability acquisition attribution" },
  { tableName: "character_derived_ability", columnName: "revoked_by_user_id", constraintName: "character_derived_ability_revoked_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Derived Ability revocation attribution" },
  { tableName: "character_derived_ability_recharge", columnName: "actor_user_id", constraintName: "character_derived_ability_recharge_actor_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Derived Ability recharge history" },
  { tableName: "character_derived_ability_use", columnName: "actor_user_id", constraintName: "character_derived_ability_use_actor_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Derived Ability use history" },
  { tableName: "derived_ability", columnName: "created_by_user_id", constraintName: "derived_ability_created_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Authored Derived Abilities" },
  { tableName: "derived_ability", columnName: "archived_by_user_id", constraintName: "derived_ability_archived_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Derived Ability archive attribution" },
  { tableName: "items", columnName: "created_by_user_id", constraintName: "items_created_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Authored Items" },
  { tableName: "items", columnName: "archived_by_user_id", constraintName: "items_archived_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Item archive attribution" },
  { tableName: "weapon_skill_path_mappings", columnName: "updated_by_user_id", constraintName: "weapon_skill_path_mappings_updated_by_user_id_user_id_fk", onDelete: "restrict", disposition: "block", label: "Weapon Skill governance attribution" },
  { tableName: "campaign_character", columnName: "player_user_id", constraintName: "campaign_character_player_user_id_user_id_fk", onDelete: "cascade", disposition: "block", label: "Controlled player Characters and NPCs" },
  { tableName: "campaign_character", columnName: "archived_by_user_id", constraintName: "campaign_character_archived_by_user_id_user_id_fk", onDelete: "set null", disposition: "block", label: "Character and NPC archive attribution" },
  { tableName: "campaign_character_weapon_override", columnName: "updated_by_user_id", constraintName: "campaign_character_weapon_override_updated_by_user_id_user_id_fk", onDelete: "restrict", disposition: "block", label: "Character weapon-governance attribution" },
  { tableName: "campaign_character_firearm_event", columnName: "actor_user_id", constraintName: "campaign_character_firearm_event_actor_fk", onDelete: "restrict", disposition: "block", label: "Character firearm event history" },
  { tableName: "campaign_character_firearm_preparation", columnName: "created_by_user_id", constraintName: "campaign_character_firearm_preparation_created_by_fk", onDelete: "restrict", disposition: "block", label: "Created firearm preparations" },
  { tableName: "campaign_character_firearm_preparation", columnName: "resolved_by_user_id", constraintName: "campaign_character_firearm_preparation_resolved_by_fk", onDelete: "restrict", disposition: "block", label: "Resolved firearm preparations" },
  { tableName: "campaign_character_firearm_state", columnName: "initialized_by_user_id", constraintName: "campaign_character_firearm_state_initialized_by_fk", onDelete: "restrict", disposition: "block", label: "Initialized firearm state" },
  { tableName: "campaign_character_firearm_state", columnName: "updated_by_user_id", constraintName: "campaign_character_firearm_state_updated_by_fk", onDelete: "restrict", disposition: "block", label: "Updated firearm state" },
  { tableName: "campaign_session_called_check_batch", columnName: "issued_by_user_id", constraintName: "campaign_session_called_check_batch_issuer_fk", onDelete: "restrict", disposition: "block", label: "Issued Called Checks" },
  { tableName: "campaign_session_called_check_event", columnName: "actor_user_id", constraintName: "campaign_session_called_check_event_actor_fk", onDelete: "restrict", disposition: "block", label: "Called Check event history" },
  { tableName: "campaign_session_called_check_request", columnName: "revealed_by_user_id", constraintName: "campaign_session_called_check_request_revealer_fk", onDelete: "restrict", disposition: "block", label: "Called Check reveal attribution" },
  { tableName: "campaign_session_encounter_action_declaration", columnName: "created_by_user_id", constraintName: "campaign_session_encounter_action_declaration_created_by_fk", onDelete: "restrict", disposition: "block", label: "Created action declarations" },
  { tableName: "campaign_session_encounter_action_declaration", columnName: "locked_by_user_id", constraintName: "campaign_session_encounter_action_declaration_locked_by_fk", onDelete: "restrict", disposition: "block", label: "Locked action declarations" },
  { tableName: "campaign_session_encounter_action_declaration", columnName: "committed_by_user_id", constraintName: "campaign_session_encounter_action_declaration_committed_by_fk", onDelete: "restrict", disposition: "block", label: "Committed action declarations" },
  { tableName: "campaign_session_encounter_action_declaration", columnName: "ended_by_user_id", constraintName: "campaign_session_encounter_action_declaration_ended_by_fk", onDelete: "restrict", disposition: "block", label: "Ended action declarations" },
  { tableName: "campaign_session_encounter_action_declaration", columnName: "defense_resolved_by_user_id", constraintName: "campaign_session_encounter_action_declaration_defense_resolved_by_fk", onDelete: "restrict", disposition: "block", label: "Action-declaration defense attribution" },
  { tableName: "campaign_session_encounter_action_declaration_event", columnName: "actor_user_id", constraintName: "campaign_session_encounter_action_declaration_event_actor_fk", onDelete: "restrict", disposition: "block", label: "Action-declaration event history" },
  { tableName: "campaign_session_encounter_effect", columnName: "amended_by_user_id", constraintName: "campaign_session_encounter_effect_amended_by_fk", onDelete: "restrict", disposition: "block", label: "Encounter-effect amendment attribution" },
  { tableName: "campaign_session_encounter_effect_plan", columnName: "created_by_user_id", constraintName: "campaign_session_encounter_effect_plan_created_by_fk", onDelete: "restrict", disposition: "block", label: "Created encounter effect plans" },
  { tableName: "campaign_session_encounter_effect_plan", columnName: "reviewed_by_user_id", constraintName: "campaign_session_encounter_effect_plan_reviewed_by_fk", onDelete: "restrict", disposition: "block", label: "Reviewed encounter effect plans" },
  { tableName: "campaign_session_encounter_effect_plan", columnName: "applied_by_user_id", constraintName: "campaign_session_encounter_effect_plan_applied_by_fk", onDelete: "restrict", disposition: "block", label: "Applied encounter effect plans" },
  { tableName: "campaign_session_encounter_effect_plan_event", columnName: "actor_user_id", constraintName: "campaign_session_encounter_effect_plan_event_actor_fk", onDelete: "restrict", disposition: "block", label: "Encounter effect-plan event history" },
  { tableName: "campaign_session_encounter_firearm_attack", columnName: "created_by_user_id", constraintName: "campaign_session_encounter_firearm_attack_created_by_fk", onDelete: "restrict", disposition: "block", label: "Created firearm attacks" },
  { tableName: "campaign_session_encounter_firearm_attack", columnName: "fired_by_user_id", constraintName: "campaign_session_encounter_firearm_attack_fired_by_fk", onDelete: "restrict", disposition: "block", label: "Fired firearm attacks" },
  { tableName: "campaign_session_encounter_firearm_attack", columnName: "cancelled_by_user_id", constraintName: "campaign_session_encounter_firearm_attack_cancelled_by_fk", onDelete: "restrict", disposition: "block", label: "Cancelled firearm attacks" },
  { tableName: "campaign_session_encounter_firearm_attack_event", columnName: "actor_user_id", constraintName: "campaign_session_encounter_firearm_attack_event_actor_fk", onDelete: "restrict", disposition: "block", label: "Firearm attack event history" },
  { tableName: "campaign_session_encounter_reaction", columnName: "declared_by_user_id", constraintName: "campaign_session_encounter_reaction_declared_by_fk", onDelete: "restrict", disposition: "block", label: "Declared encounter reactions" },
  { tableName: "campaign_session_encounter_reaction", columnName: "god_approved_by_user_id", constraintName: "campaign_session_encounter_reaction_god_approved_by_fk", onDelete: "restrict", disposition: "block", label: "Approved encounter reactions" },
  { tableName: "campaign_session_encounter_reaction", columnName: "ruled_by_user_id", constraintName: "campaign_session_encounter_reaction_ruled_by_fk", onDelete: "restrict", disposition: "block", label: "Ruled encounter reactions" },
  { tableName: "campaign_session_encounter_reaction_event", columnName: "actor_user_id", constraintName: "campaign_session_encounter_reaction_event_actor_fk", onDelete: "restrict", disposition: "block", label: "Encounter reaction event history" },
  { tableName: "campaign_session_encounter_responder_opportunity", columnName: "created_by_user_id", constraintName: "campaign_session_encounter_responder_opportunity_created_by_fk", onDelete: "restrict", disposition: "block", label: "Created responder opportunities" },
  { tableName: "campaign_session_encounter_responder_opportunity", columnName: "reconciled_by_user_id", constraintName: "campaign_session_encounter_responder_opportunity_reconciled_by_fk", onDelete: "restrict", disposition: "block", label: "Reconciled responder opportunities" },
  { tableName: "campaign_session_high_low_event", columnName: "actor_user_id", constraintName: "campaign_session_high_low_event_actor_fk", onDelete: "restrict", disposition: "block", label: "High/Low event history" },
  { tableName: "campaign_session_high_low_request", columnName: "caller_user_id", constraintName: "campaign_session_high_low_request_caller_fk", onDelete: "restrict", disposition: "block", label: "High/Low calls" },
  { tableName: "campaign_session_high_low_request", columnName: "created_by_user_id", constraintName: "campaign_session_high_low_request_creator_fk", onDelete: "restrict", disposition: "block", label: "Created High/Low requests" },
  { tableName: "campaign_session_player_ruling_request", columnName: "requested_by_user_id", constraintName: "campaign_session_player_ruling_request_requested_by_fk", onDelete: "restrict", disposition: "block", label: "Player ruling requests" },
  { tableName: "campaign_session_player_ruling_request", columnName: "resolved_by_user_id", constraintName: "campaign_session_player_ruling_request_resolved_by_fk", onDelete: "restrict", disposition: "block", label: "Resolved player ruling requests" },
  { tableName: "campaign_session_player_ruling_request_event", columnName: "actor_user_id", constraintName: "campaign_session_player_ruling_request_event_actor_fk", onDelete: "restrict", disposition: "block", label: "Player ruling event history" },
  { tableName: "campaign_session_roll", columnName: "recorded_by_user_id", constraintName: "campaign_session_roll_recorded_by_fk", onDelete: "restrict", disposition: "block", label: "Recorded Rolls" },
  { tableName: "campaign_session_roll", columnName: "voided_by_user_id", constraintName: "campaign_session_roll_voided_by_fk", onDelete: "restrict", disposition: "block", label: "Voided Roll attribution" },
  { tableName: "campaign_session_roll_amendment", columnName: "created_by_user_id", constraintName: "campaign_session_roll_amendment_created_by_fk", onDelete: "restrict", disposition: "block", label: "Roll amendments" },
  { tableName: "defense_skill_path_mapping", columnName: "updated_by_user_id", constraintName: "defense_skill_path_mapping_updated_by_user_id_user_id_fk", onDelete: "restrict", disposition: "block", label: "Defense Skill governance attribution" },
  { tableName: "chat_message", columnName: "author_user_id", constraintName: "chat_message_author_user_id_user_id_fk", onDelete: "restrict", disposition: "block", label: "Authored Chat messages" },
  { tableName: "chat_message", columnName: "deleted_by_user_id", constraintName: "chat_message_deleted_by_user_id_user_id_fk", onDelete: "restrict", disposition: "block", label: "Chat moderation attribution" },
  { tableName: "chat_room_member", columnName: "user_id", constraintName: "chat_room_member_user_id_user_id_fk", onDelete: "cascade", disposition: "cleanup", label: "Chat room memberships" },
] as const satisfies readonly UserAccountForeignKeyPlanEntry[];

export const USER_ACCOUNT_FOREIGN_KEY_COUNT = 68;
