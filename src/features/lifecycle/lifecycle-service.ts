import "server-only";

import { and, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import { campaign } from "@/db/campaign-schema";
import { chatRoom } from "@/db/chat-schema";
import { creature } from "@/db/creature-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { db } from "@/db";
import { item } from "@/db/item-schema";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import { race } from "@/db/race-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { skill } from "@/db/skill-schema";

import {
  CAMPAIGN_GRAPH_DELETE_STEPS,
  CAMPAIGN_GRAPH_SELF_REFERENCE_BREAKS,
} from "./campaign-delete-plan";
import { referencesFrameworkSkill } from "./skill-semantic-reference";
import {
  assertExactConfirmation,
  assertOwnedRootManager,
  assertPermanentDeletionEnabled,
  assertSharedRootManager,
  canManageOwnedRoot,
  canManageSharedRoot,
  isLifecycleActor,
  isPermanentDeletionEnabled,
  isProtectedSharedRoot,
  normalizeLifecycleReason,
  parseLifecycleTarget,
} from "./policy";
import type {
  LifecycleActor,
  LifecycleDeletionResult,
  LifecycleDependency,
  LifecycleEntityKind,
  LifecyclePreview,
  LifecycleTargetInput,
} from "./types";

export type LifecycleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type RootSnapshot = {
  id: number;
  name: string;
  campaign_id: number | null;
  campaign_name: string | null;
  owner_user_id: string | null;
  owner_label: string | null;
  source_system: string | null;
  archived_at: Date | string | null;
};

type CountRow = { value: number | string };

type DependencySpecBase = {
  label: string;
  blocking: boolean;
};

type DependencySpec = DependencySpecBase & (
  | { query: SQL<CountRow> }
  | { loadCount: (tx: LifecycleTransaction) => Promise<number> }
);

type SerializedDocumentRow = { serialized_document: string };

export type LifecycleDeletionTestSeam = {
  /** @internal Never pass this from a Server Action or client payload. */
  afterAudit?: () => void | Promise<void>;
  /** @internal Used only to prove whole-Campaign rollback. */
  afterCampaignDeleteStep?: (tableName: string) => void | Promise<void>;
};

const ENTITY_LABELS: Record<LifecycleEntityKind, string> = {
  campaign: "Campaign",
  "player-character": "player Character",
  "race-npc": "Race NPC",
  "creature-npc": "Creature NPC",
  race: "Race",
  creature: "Creature",
  skill: "Skill",
  item: "Item",
  "derived-ability": "Derived Ability",
};

const SHARED_ENTITY_KINDS = new Set<LifecycleEntityKind>([
  "race",
  "creature",
  "skill",
  "item",
  "derived-ability",
]);

function ownerDisplaySql(alias = "u") {
  return sql.raw(
    `coalesce(nullif(trim(${alias}.display_username), ''), nullif(trim(${alias}.name), ''), ${alias}.email, ${alias}.id)`,
  );
}

async function loadRootSnapshot(
  tx: LifecycleTransaction,
  target: LifecycleTargetInput,
  lock: boolean,
): Promise<RootSnapshot> {
  const lockClause = lock ? sql.raw("for update of c") : sql.raw("");
  let query: SQL<RootSnapshot>;

  switch (target.entityKind) {
    case "campaign":
      query = sql<RootSnapshot>`
        select c.id, c.name, c.id as campaign_id, c.name as campaign_name,
               c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label,
               null::text as source_system, c.archived_at
        from campaign c
        left join "user" u on u.id = c.created_by_user_id
        where c.id = ${target.entityId}
        ${lockClause}
      `;
      break;
    case "player-character":
    case "race-npc":
    case "creature-npc": {
      const npcPredicate = target.entityKind === "player-character"
        ? sql`c.is_npc = false`
        : target.entityKind === "race-npc"
          ? sql`c.is_npc = true and c.npc_kind = 'race'`
          : sql`c.is_npc = true and c.npc_kind = 'creature'`;
      query = sql<RootSnapshot>`
        select c.id, c.name, c.campaign_id, cp.name as campaign_name,
               cp.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label,
               null::text as source_system, c.archived_at
        from campaign_character c
        inner join campaign cp on cp.id = c.campaign_id
        left join "user" u on u.id = cp.created_by_user_id
        where c.id = ${target.entityId} and ${npcPredicate}
        ${lockClause}
      `;
      break;
    }
    case "race":
      query = sql<RootSnapshot>`
        select c.id, c.name, null::integer as campaign_id,
               null::text as campaign_name, c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label, c.source_system,
               c.archived_at
        from races c
        left join "user" u on u.id = c.created_by_user_id
        where c.id = ${target.entityId}
        ${lockClause}
      `;
      break;
    case "creature":
      query = sql<RootSnapshot>`
        select c.id, c.canonical_name as name, null::integer as campaign_id,
               null::text as campaign_name, c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label, c.source_system,
               c.archived_at
        from creatures c
        left join "user" u on u.id = c.created_by_user_id
        where c.id = ${target.entityId}
        ${lockClause}
      `;
      break;
    case "skill":
      query = sql<RootSnapshot>`
        select c.id, c.name, null::integer as campaign_id,
               null::text as campaign_name, c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label, c.source_system,
               c.archived_at
        from skill c
        left join "user" u on u.id = c.created_by_user_id
        where c.id = ${target.entityId}
        ${lockClause}
      `;
      break;
    case "item":
      query = sql<RootSnapshot>`
        select c.id, c.name, null::integer as campaign_id,
               null::text as campaign_name, c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label, c.source_system,
               c.archived_at
        from items c
        left join "user" u on u.id = c.created_by_user_id
        where c.id = ${target.entityId}
        ${lockClause}
      `;
      break;
    case "derived-ability":
      query = sql<RootSnapshot>`
        select c.id, c.name, null::integer as campaign_id,
               null::text as campaign_name, c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label, c.source_system,
               c.archived_at
        from derived_ability c
        left join "user" u on u.id = c.created_by_user_id
        where c.id = ${target.entityId}
        ${lockClause}
      `;
      break;
  }

  const result = await tx.execute(query);
  const row = result.rows[0] as RootSnapshot | undefined;
  if (!row) {
    throw new Error(`That ${ENTITY_LABELS[target.entityKind]} no longer exists.`);
  }
  return row;
}

async function collectDependencies(
  tx: LifecycleTransaction,
  specs: readonly DependencySpec[],
): Promise<LifecycleDependency[]> {
  const dependencies: LifecycleDependency[] = [];
  for (const spec of specs) {
    let value: number;
    if ("query" in spec) {
      const result = await tx.execute(spec.query);
      value = Number((result.rows[0] as CountRow | undefined)?.value ?? 0);
    } else {
      value = await spec.loadCount(tx);
    }
    dependencies.push({
      label: spec.label,
      count: Number.isFinite(value) ? value : 0,
      blocking: spec.blocking,
    });
  }
  return dependencies;
}

async function countSerializedFrameworkSkillReferences(
  tx: LifecycleTransaction,
  query: SQL<SerializedDocumentRow>,
  skillId: number,
): Promise<number> {
  const result = await tx.execute(query);
  return result.rows.filter((row) => referencesFrameworkSkill(
    (row as SerializedDocumentRow).serialized_document,
    skillId,
  )).length;
}

function campaignDependencySpecs(campaignId: number): DependencySpec[] {
  return [
    { label: "Campaign memberships", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_player where campaign_id = ${campaignId}` },
    { label: "Player Characters", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character where campaign_id = ${campaignId} and is_npc = false` },
    { label: "Race NPCs", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character where campaign_id = ${campaignId} and is_npc = true and npc_kind = 'race'` },
    { label: "Creature NPCs", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character where campaign_id = ${campaignId} and is_npc = true and npc_kind = 'creature'` },
    { label: "Inventory stacks", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_item i inner join campaign_character c on c.id = i.character_id where c.campaign_id = ${campaignId}` },
    { label: "Exact Item instances", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_item_instance i inner join campaign_character c on c.id = i.character_id where c.campaign_id = ${campaignId}` },
    { label: "Equipment states", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_item_equipment_state e inner join campaign_character c on c.id = e.character_id where c.campaign_id = ${campaignId}` },
    { label: "Character profiles and attributes", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_character_profile p inner join campaign_character c on c.id = p.character_id where c.campaign_id = ${campaignId}) + (select count(*) from campaign_character_attribute a inner join campaign_character c on c.id = a.character_id where c.campaign_id = ${campaignId}))::int as value` },
    { label: "Character Skills, spells, and weapon overrides", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_character_skill_allocation s inner join campaign_character c on c.id = s.character_id where c.campaign_id = ${campaignId}) + (select count(*) from campaign_character_spell_document d inner join campaign_character c on c.id = d.character_id where c.campaign_id = ${campaignId}) + (select count(*) from campaign_character_weapon_override where campaign_id = ${campaignId}))::int as value` },
    { label: "Character active state", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_character_active_health h inner join campaign_character c on c.id = h.character_id where c.campaign_id = ${campaignId}) + (select count(*) from campaign_character_active_mana m inner join campaign_character c on c.id = m.character_id where c.campaign_id = ${campaignId}) + (select count(*) from campaign_character_active_condition x inner join campaign_character c on c.id = x.character_id where c.campaign_id = ${campaignId}) + (select count(*) from campaign_character_active_modifier x inner join campaign_character c on c.id = x.character_id where c.campaign_id = ${campaignId}) + (select count(*) from campaign_character_active_health_pool x inner join campaign_character c on c.id = x.character_id where c.campaign_id = ${campaignId}) + (select count(*) from campaign_character_injury x inner join campaign_character c on c.id = x.character_id where c.campaign_id = ${campaignId}))::int as value` },
    { label: "Creature NPC snapshot profiles", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_creature_npc_profile p inner join campaign_character c on c.id = p.character_id where c.campaign_id = ${campaignId}` },
    { label: "Campaign currencies", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_derived_currency where campaign_id = ${campaignId}` },
    { label: "Character currency holdings", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_currency_holding h inner join campaign_character c on c.id = h.character_id where c.campaign_id = ${campaignId}` },
    { label: "Authorized library links", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_allowed_system where campaign_id = ${campaignId}) + (select count(*) from campaign_allowed_race where campaign_id = ${campaignId}) + (select count(*) from campaign_inventory_item where campaign_id = ${campaignId}) + (select count(*) from campaign_inventory_tag where campaign_id = ${campaignId}) + (select count(*) from campaign_allowed_derived_ability where campaign_id = ${campaignId}))::int as value` },
    { label: "Sessions", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_session where campaign_id = ${campaignId}` },
    { label: "Scenes", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_session_scene where campaign_id = ${campaignId}` },
    { label: "Encounters", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_session_encounter where campaign_id = ${campaignId}` },
    { label: "Roster and Scene memberships", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_session_roster where campaign_id = ${campaignId}) + (select count(*) from campaign_session_scene_member where campaign_id = ${campaignId}))::int as value` },
    { label: "Initiative and combat runtime rows", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_session_encounter_participant where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_initiative where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_initiative_participant where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_pending_action where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_reaction where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_action_declaration where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_effect_plan where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_effect where campaign_id = ${campaignId}))::int as value` },
    { label: "Action, reaction, and effect event history", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_session_encounter_pending_action_source where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_reaction_event where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_action_declaration_event where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_responder_opportunity where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_effect_plan_event where campaign_id = ${campaignId}))::int as value` },
    { label: "Duration bindings and Encounter rewards", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_session_effect_duration_binding where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_reward where campaign_id = ${campaignId}))::int as value` },
    { label: "Called-check and high-low records", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_session_called_check_batch where campaign_id = ${campaignId}) + (select count(*) from campaign_session_called_check_request where campaign_id = ${campaignId}) + (select count(*) from campaign_session_called_check_event where campaign_id = ${campaignId}) + (select count(*) from campaign_session_high_low_request where campaign_id = ${campaignId}) + (select count(*) from campaign_session_high_low_event where campaign_id = ${campaignId}))::int as value` },
    { label: "Player ruling records", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_session_player_ruling_request where campaign_id = ${campaignId}) + (select count(*) from campaign_session_player_ruling_request_event where campaign_id = ${campaignId}))::int as value` },
    { label: "Firearm runtime and history", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_character_firearm_state where campaign_id = ${campaignId}) + (select count(*) from campaign_character_firearm_preparation where campaign_id = ${campaignId}) + (select count(*) from campaign_character_firearm_event where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_firearm_attack where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_firearm_bullet where campaign_id = ${campaignId}) + (select count(*) from campaign_session_encounter_firearm_attack_event where campaign_id = ${campaignId}))::int as value` },
    { label: "Roll and Derived Ability history", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_session_roll where campaign_id = ${campaignId}) + (select count(*) from campaign_session_roll_amendment where campaign_id = ${campaignId}) + (select count(*) from character_derived_ability o inner join campaign_character c on c.id = o.character_id where c.campaign_id = ${campaignId}) + (select count(*) from character_derived_ability_use u inner join campaign_character c on c.id = u.character_id where c.campaign_id = ${campaignId}) + (select count(*) from character_derived_ability_recharge r inner join campaign_character c on c.id = r.character_id where c.campaign_id = ${campaignId}))::int as value` },
    { label: "Campaign chat rooms", blocking: false, query: sql<CountRow>`select count(*)::int as value from chat_room where campaign_id = ${campaignId}` },
    { label: "Campaign chat memberships", blocking: false, query: sql<CountRow>`select count(*)::int as value from chat_room_member m inner join chat_room r on r.id = m.room_id where r.campaign_id = ${campaignId}` },
    { label: "Campaign chat messages", blocking: false, query: sql<CountRow>`select count(*)::int as value from chat_message m inner join chat_room r on r.id = m.room_id where r.campaign_id = ${campaignId}` },
    { label: "Shops", blocking: false, query: sql<CountRow>`select count(*)::int as value from shop where campaign_id = ${campaignId}` },
    { label: "Shop staff assignments", blocking: false, query: sql<CountRow>`select count(*)::int as value from shop_staff_assignment where campaign_id = ${campaignId}` },
    { label: "Shop offerings", blocking: false, query: sql<CountRow>`select count(*)::int as value from shop_offering where campaign_id = ${campaignId}` },
  ];
}

function characterDependencySpecs(characterId: number, campaignId: number): DependencySpec[] {
  return [
    { label: "Character profile", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_profile where character_id = ${characterId}` },
    { label: "Attributes", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_attribute where character_id = ${characterId}` },
    { label: "Skills", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_skill_allocation where character_id = ${characterId}` },
    { label: "Currency holdings", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_currency_holding where character_id = ${characterId}` },
    { label: "Inventory stacks", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_item where character_id = ${characterId}` },
    { label: "Exact Item instances", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_item_instance where character_id = ${characterId}` },
    { label: "Equipment states", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_item_equipment_state where character_id = ${characterId}` },
    { label: "Weapon overrides", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_weapon_override where campaign_id = ${campaignId} and character_id = ${characterId}` },
    { label: "Spell documents", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_spell_document where character_id = ${characterId}` },
    { label: "Active health, mana, effects, pools, and injuries", blocking: false, query: sql<CountRow>`select ((select count(*) from campaign_character_active_health where character_id = ${characterId}) + (select count(*) from campaign_character_active_mana where character_id = ${characterId}) + (select count(*) from campaign_character_active_condition where character_id = ${characterId}) + (select count(*) from campaign_character_active_modifier where character_id = ${characterId}) + (select count(*) from campaign_character_active_health_pool where character_id = ${characterId}) + (select count(*) from campaign_character_injury where character_id = ${characterId}))::int as value` },
    { label: "Creature snapshot profile", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_creature_npc_profile where character_id = ${characterId}` },
    { label: "Firearm state without history", blocking: false, query: sql<CountRow>`select count(*)::int as value from campaign_character_firearm_state where campaign_id = ${campaignId} and character_id = ${characterId}` },
    { label: "Derived Ability ownership history", blocking: true, query: sql<CountRow>`select count(*)::int as value from character_derived_ability where character_id = ${characterId}` },
    { label: "Derived Ability use and recharge history", blocking: true, query: sql<CountRow>`select ((select count(*) from character_derived_ability_use where character_id = ${characterId}) + (select count(*) from character_derived_ability_recharge where character_id = ${characterId}))::int as value` },
    { label: "Session roster references", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_roster where campaign_id = ${campaignId} and character_id = ${characterId}` },
    { label: "Scene member references", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_scene_member where campaign_id = ${campaignId} and character_id = ${characterId}` },
    { label: "Encounter participant references", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_encounter_participant where campaign_id = ${campaignId} and character_id = ${characterId}` },
    { label: "Initiative and action runtime references", blocking: true, query: sql<CountRow>`select ((select count(*) from campaign_session_encounter_initiative_participant where campaign_id = ${campaignId} and character_id = ${characterId}) + (select count(*) from campaign_session_encounter_pending_action where campaign_id = ${campaignId} and actor_character_id = ${characterId}) + (select count(*) from campaign_session_encounter_pending_action_source where campaign_id = ${campaignId} and source_character_id = ${characterId}) + (select count(*) from campaign_session_encounter_action_declaration where campaign_id = ${campaignId} and actor_character_id = ${characterId}) + (select count(*) from campaign_session_encounter_reaction where campaign_id = ${campaignId} and (reactor_character_id = ${characterId} or target_character_id = ${characterId} or protected_target_character_id = ${characterId})) + (select count(*) from campaign_session_encounter_responder_opportunity where campaign_id = ${campaignId} and responder_character_id = ${characterId}) + (select count(*) from campaign_session_encounter_effect_plan where campaign_id = ${campaignId} and actor_participant_id = ${characterId}) + (select count(*) from campaign_session_encounter_effect where campaign_id = ${campaignId} and target_participant_id = ${characterId}))::int as value` },
    { label: "Timed effect bindings", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_effect_duration_binding where campaign_id = ${campaignId} and character_id = ${characterId}` },
    { label: "Encounter rewards", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_encounter_reward where campaign_id = ${campaignId} and character_id = ${characterId}` },
    { label: "Roll history", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_roll where campaign_id = ${campaignId} and (roller_character_id = ${characterId} or target_character_id = ${characterId})` },
    { label: "Called-check requests", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_called_check_request where campaign_id = ${campaignId} and recipient_character_id = ${characterId}` },
    { label: "High-low requests", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_high_low_request where campaign_id = ${campaignId} and participant_character_id = ${characterId}` },
    { label: "Player ruling requests", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_player_ruling_request where campaign_id = ${campaignId} and (character_id = ${characterId} or target_participant_id = ${characterId})` },
    { label: "Firearm preparation and event history", blocking: true, query: sql<CountRow>`select ((select count(*) from campaign_character_firearm_preparation where campaign_id = ${campaignId} and character_id = ${characterId}) + (select count(*) from campaign_character_firearm_event where campaign_id = ${campaignId} and character_id = ${characterId}) + (select count(*) from campaign_session_encounter_firearm_attack where campaign_id = ${campaignId} and (actor_participant_id = ${characterId} or target_participant_id = ${characterId})))::int as value` },
  ];
}

function raceDependencySpecs(id: number): DependencySpec[] {
  return [
    { label: "Attribute caps", blocking: false, query: sql<CountRow>`select count(*)::int as value from race_attribute_caps where race_id = ${id}` },
    { label: "Movement modes", blocking: false, query: sql<CountRow>`select count(*)::int as value from race_movement_modes where race_id = ${id}` },
    { label: "Race Skill grants", blocking: false, query: sql<CountRow>`select count(*)::int as value from race_skill_links where race_id = ${id}` },
    { label: "Campaign allowlists", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_allowed_race where race_id = ${id}` },
    { label: "Player Character and Race NPC profiles", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_character_profile where race_id = ${id}` },
  ];
}

function creatureDependencySpecs(id: number): DependencySpec[] {
  return [
    { label: "Variants and authored definition rows", blocking: false, query: sql<CountRow>`select ((select count(*) from creature_variants where creature_id = ${id}) + (select count(*) from creature_attributes where creature_id = ${id}) + (select count(*) from creature_movement where creature_id = ${id}) + (select count(*) from creature_hp_pools where creature_id = ${id}) + (select count(*) from creature_hit_locations where creature_id = ${id}) + (select count(*) from creature_attacks where creature_id = ${id}) + (select count(*) from creature_skill_links where creature_id = ${id}) + (select count(*) from creature_abilities where creature_id = ${id}) + (select count(*) from creature_defenses where creature_id = ${id}) + (select count(*) from creature_uses where creature_id = ${id}))::int as value` },
    { label: "Derived child Creatures", blocking: true, query: sql<CountRow>`select count(*)::int as value from creatures where parent_creature_id = ${id}` },
    { label: "Creature NPC snapshot profiles", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_creature_npc_profile where creature_id = ${id}` },
    { label: "Temporary encounter Creature participants", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_encounter_participant where creature_id = ${id}` },
    { label: "Item properties linked to this Creature", blocking: true, query: sql<CountRow>`select count(*)::int as value from item_properties p inner join creatures c on c.canonical_id = p.related_creature_canonical_id where c.id = ${id}` },
  ];
}

function skillDependencySpecs(id: number): DependencySpec[] {
  const frameworkSkillKey = '%"frameworkSkillId"%';
  return [
    { label: "Skill extensions", blocking: false, query: sql<CountRow>`select count(*)::int as value from skill_extension where skill_id = ${id}` },
    { label: "Parent relationships", blocking: true, query: sql<CountRow>`select count(*)::int as value from skill_relationship where skill_id = ${id}` },
    { label: "Child relationships", blocking: true, query: sql<CountRow>`select count(*)::int as value from skill_relationship where related_skill_id = ${id}` },
    { label: "Race grants", blocking: true, query: sql<CountRow>`select count(*)::int as value from race_skill_links where skill_id = ${id}` },
    { label: "Creature Skill links", blocking: true, query: sql<CountRow>`select count(*)::int as value from creature_skill_links where skill_id = ${id}` },
    { label: "Character Skill allocations", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_character_skill_allocation where skill_id = ${id}` },
    { label: "Derived Ability requirements", blocking: true, query: sql<CountRow>`select count(*)::int as value from derived_ability_requirement where skill_id = ${id}` },
    { label: "Weapon Skill-path mappings", blocking: true, query: sql<CountRow>`select count(*)::int as value from weapon_skill_path_mappings where endpoint_skill_id = ${id}` },
    { label: "Defense Skill-path mappings", blocking: true, query: sql<CountRow>`select count(*)::int as value from defense_skill_path_mapping where endpoint_skill_id = ${id}` },
    { label: "Called-check history", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_called_check_batch where endpoint_skill_id = ${id}` },
    {
      label: "Saved Character spell documents using this framework Skill",
      blocking: true,
      loadCount: (tx) => countSerializedFrameworkSkillReferences(
        tx,
        sql<SerializedDocumentRow>`
          select document_json as serialized_document
          from campaign_character_spell_document
          where document_json like ${frameworkSkillKey}
        `,
        id,
      ),
    },
    {
      label: "Other spell-construction Skill extensions using this framework Skill",
      blocking: true,
      loadCount: (tx) => countSerializedFrameworkSkillReferences(
        tx,
        sql<SerializedDocumentRow>`
          select data_json as serialized_document
          from skill_extension
          where skill_id <> ${id}
            and extension_type = 'spell-construction'
            and data_json like ${frameworkSkillKey}
        `,
        id,
      ),
    },
  ];
}

function itemDependencySpecs(id: number): DependencySpec[] {
  const itemSourceId = String(id);
  const itemActionSourceRef = `item:${id}`;
  return [
    { label: "Owned Item definition rows", blocking: false, query: sql<CountRow>`select ((select count(*) from item_runtime_profiles where item_id = ${id}) + (select count(*) from item_effects where item_id = ${id}) + (select count(*) from item_passive_effects where item_id = ${id}) + (select count(*) from weapon_profiles where item_id = ${id}) + (select count(*) from armor_profiles where item_id = ${id}) + (select count(*) from item_armor_damage_modifiers where item_id = ${id}) + (select count(*) from armor_locations where item_id = ${id}) + (select count(*) from item_properties where item_id = ${id}) + (select count(*) from item_tag_links where item_id = ${id}))::int as value` },
    { label: "Child Item variants", blocking: true, query: sql<CountRow>`select count(*)::int as value from items where parent_item_id = ${id}` },
    { label: "Weapons using this ammunition", blocking: true, query: sql<CountRow>`select count(*)::int as value from weapon_profiles where ammunition_item_id = ${id}` },
    { label: "Other Item properties linked to this Item", blocking: true, query: sql<CountRow>`select count(*)::int as value from item_properties where related_item_id = ${id}` },
    { label: "Campaign inventory authorization", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_inventory_item where item_id = ${id}` },
    { label: "Character inventory stacks", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_character_item where item_id = ${id}` },
    { label: "Character exact Item instances", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_character_item_instance where item_id = ${id}` },
    { label: "Character weapon overrides", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_character_weapon_override where item_id = ${id}` },
    { label: "Weapon Skill governance", blocking: true, query: sql<CountRow>`select count(*)::int as value from weapon_skill_path_mappings m inner join weapon_profiles p on p.id = m.weapon_profile_id where p.item_id = ${id}` },
    { label: "Firearm runtime and history", blocking: true, query: sql<CountRow>`select ((select count(*) from campaign_character_firearm_state where item_id = ${id} or loaded_ammunition_item_id = ${id}) + (select count(*) from campaign_character_firearm_preparation where item_id = ${id} or ammunition_item_id = ${id}) + (select count(*) from campaign_session_encounter_firearm_attack where item_id = ${id} or ammunition_item_id = ${id}))::int as value` },
    { label: "Active and historical Item-sourced Conditions and Modifiers", blocking: true, query: sql<CountRow>`select ((select count(*) from campaign_character_active_condition where source_kind = 'item' and source_id = ${itemSourceId}) + (select count(*) from campaign_character_active_modifier where source_kind = 'item' and source_id = ${itemSourceId}))::int as value` },
    { label: "Tabletop Item action, effect-plan, and reaction history", blocking: true, query: sql<CountRow>`select ((select count(*) from campaign_session_encounter_pending_action_source where source_kind = 'item' and source_ref = ${itemActionSourceRef}) + (select count(*) from campaign_session_encounter_effect_plan where source_kind = 'item' and source_id = ${itemSourceId}) + (select count(*) from campaign_session_encounter_reaction where defending_item_id = ${id}))::int as value` },
  ];
}

function derivedAbilityDependencySpecs(id: number): DependencySpec[] {
  return [
    { label: "Owned definition rows", blocking: false, query: sql<CountRow>`select ((select count(*) from derived_ability_requirement where derived_ability_id = ${id}) + (select count(*) from derived_ability_use_condition where derived_ability_id = ${id}) + (select count(*) from derived_ability_cost where derived_ability_id = ${id}) + (select count(*) from derived_ability_use_limit where derived_ability_id = ${id}) + (select count(*) from derived_ability_effect where derived_ability_id = ${id}) + (select count(*) from derived_ability_trigger where derived_ability_id = ${id}))::int as value` },
    { label: "Other Derived Ability prerequisites", blocking: true, query: sql<CountRow>`select count(*)::int as value from derived_ability_requirement where required_derived_ability_id = ${id}` },
    { label: "Legacy Campaign allowlists", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_allowed_derived_ability where derived_ability_id = ${id}` },
    { label: "Character ownership history", blocking: true, query: sql<CountRow>`select count(*)::int as value from character_derived_ability where derived_ability_id = ${id}` },
    { label: "Character use history", blocking: true, query: sql<CountRow>`select count(*)::int as value from character_derived_ability_use where derived_ability_id = ${id}` },
    { label: "Character recharge history", blocking: true, query: sql<CountRow>`select count(*)::int as value from character_derived_ability_recharge where derived_ability_id = ${id}` },
  ];
}

function dependencySpecsFor(
  target: LifecycleTargetInput,
  root: RootSnapshot,
): DependencySpec[] {
  switch (target.entityKind) {
    case "campaign":
      return campaignDependencySpecs(target.entityId);
    case "player-character":
    case "race-npc":
    case "creature-npc":
      if (root.campaign_id === null) throw new Error("Character Campaign context is missing.");
      return characterDependencySpecs(target.entityId, root.campaign_id);
    case "race":
      return raceDependencySpecs(target.entityId);
    case "creature":
      return creatureDependencySpecs(target.entityId);
    case "skill":
      return skillDependencySpecs(target.entityId);
    case "item":
      return itemDependencySpecs(target.entityId);
    case "derived-ability":
      return derivedAbilityDependencySpecs(target.entityId);
  }
}

function isSharedEntityKind(kind: LifecycleEntityKind): boolean {
  return SHARED_ENTITY_KINDS.has(kind);
}

function actorCanManage(
  actor: LifecycleActor,
  target: LifecycleTargetInput,
  root: RootSnapshot,
): boolean {
  if (isSharedEntityKind(target.entityKind)) {
    return canManageSharedRoot(actor, {
      createdByUserId: root.owner_user_id,
      sourceSystem: root.source_system,
    });
  }
  return canManageOwnedRoot(actor, root.owner_user_id);
}

function assertMutationAuthorization(
  actor: LifecycleActor,
  target: LifecycleTargetInput,
  root: RootSnapshot,
): void {
  const label = ENTITY_LABELS[target.entityKind];
  if (isSharedEntityKind(target.entityKind)) {
    assertSharedRootManager(actor, {
      createdByUserId: root.owner_user_id,
      sourceSystem: root.source_system,
    }, label);
    return;
  }
  assertOwnedRootManager(actor, root.owner_user_id, label);
}

async function buildPreview(
  tx: LifecycleTransaction,
  actor: LifecycleActor,
  target: LifecycleTargetInput,
  lock: boolean,
): Promise<{ preview: LifecyclePreview; root: RootSnapshot }> {
  if (!isLifecycleActor(actor)) {
    throw new Error("G.O.D. or administrator access is required.");
  }

  const root = await loadRootSnapshot(tx, target, lock);
  if (!isSharedEntityKind(target.entityKind)) {
    // Campaign dependency inventories are private to their owner and admins;
    // reject before querying dependent rows rather than returning a disabled
    // preview to an unrelated G.O.D.
    assertOwnedRootManager(
      actor,
      root.owner_user_id,
      ENTITY_LABELS[target.entityKind],
    );
  }
  const dependencies = await collectDependencies(
    tx,
    dependencySpecsFor(target, root),
  );
  const canonical = isSharedEntityKind(target.entityKind)
    && isProtectedSharedRoot({
      createdByUserId: root.owner_user_id,
      sourceSystem: root.source_system,
    });
  const authorized = actorCanManage(actor, target, root);
  const permanentDeletionEnabled = isPermanentDeletionEnabled();
  const dependencyBlockers = dependencies.filter(
    ({ blocking, count }) => blocking && count > 0,
  );
  const blockers: string[] = [];

  if (canonical) {
    blockers.push(
      "Canonical, imported, system-owned, and ambiguous legacy records are protected.",
    );
  } else if (!authorized) {
    blockers.push(
      `Only the ${ENTITY_LABELS[target.entityKind]} creator or an administrator can manage this record.`,
    );
  }
  if (!permanentDeletionEnabled) {
    blockers.push("Permanent deletion is disabled by production recovery protection.");
  }
  for (const dependency of dependencyBlockers) {
    blockers.push(`${dependency.label}: ${dependency.count}`);
  }

  const archived = root.archived_at !== null;
  return {
    root,
    preview: {
      entityKind: target.entityKind,
      entityId: target.entityId,
      entityName: root.name,
      ...(root.campaign_name ? { campaignName: root.campaign_name } : {}),
      ...(root.owner_label ? { ownerLabel: root.owner_label } : {}),
      archived,
      canonical,
      canArchive: authorized && !canonical && !archived,
      canRestore: authorized && !canonical && archived,
      canDelete: authorized
        && !canonical
        && permanentDeletionEnabled
        && dependencyBlockers.length === 0,
      permanentDeletionEnabled,
      dependencies,
      blockers,
    },
  };
}

async function recordLifecycleAudit(
  tx: LifecycleTransaction,
  actor: LifecycleActor,
  action: "archive" | "restore" | "delete",
  target: LifecycleTargetInput,
  root: RootSnapshot,
  preview: LifecyclePreview,
  reason: string,
): Promise<void> {
  await tx.insert(lifecycleAuditEvent).values({
    action,
    entityKind: target.entityKind,
    targetId: String(target.entityId),
    targetName: root.name,
    campaignIdSnapshot: root.campaign_id,
    ownerUserIdSnapshot: root.owner_user_id,
    actorUserId: actor.userId,
    reason,
    dependencySummaryJson: {
      dependencies: preview.dependencies,
      blockers: preview.blockers,
    },
  });
}

async function updateRootArchiveState(
  tx: LifecycleTransaction,
  target: LifecycleTargetInput,
  actorUserId: string,
  archived: boolean,
  reason: string,
): Promise<void> {
  const values = archived
    ? { archivedAt: new Date(), archivedByUserId: actorUserId, archiveReason: reason }
    : { archivedAt: null, archivedByUserId: null, archiveReason: "" };
  const expectedState = archived ? isNull : isNotNull;
  let updatedId: number | undefined;

  switch (target.entityKind) {
    case "campaign": {
      const [updated] = await tx.update(campaign).set(values).where(and(
        eq(campaign.id, target.entityId),
        expectedState(campaign.archivedAt),
      )).returning({ id: campaign.id });
      updatedId = updated?.id;
      await tx.update(chatRoom).set({
        isArchived: archived,
        updatedAt: new Date(),
      }).where(and(
        eq(chatRoom.campaignId, target.entityId),
        eq(chatRoom.scope, "campaign"),
      ));
      break;
    }
    case "player-character":
    case "race-npc":
    case "creature-npc": {
      const [updated] = await tx.update(campaignCharacter).set(values).where(and(
        eq(campaignCharacter.id, target.entityId),
        expectedState(campaignCharacter.archivedAt),
      )).returning({ id: campaignCharacter.id });
      updatedId = updated?.id;
      break;
    }
    case "race": {
      const [updated] = await tx.update(race).set(values).where(and(
        eq(race.id, target.entityId),
        expectedState(race.archivedAt),
      )).returning({ id: race.id });
      updatedId = updated?.id;
      break;
    }
    case "creature": {
      const [updated] = await tx.update(creature).set(values).where(and(
        eq(creature.id, target.entityId),
        expectedState(creature.archivedAt),
      )).returning({ id: creature.id });
      updatedId = updated?.id;
      break;
    }
    case "skill": {
      const [updated] = await tx.update(skill).set(values).where(and(
        eq(skill.id, target.entityId),
        expectedState(skill.archivedAt),
      )).returning({ id: skill.id });
      updatedId = updated?.id;
      break;
    }
    case "item": {
      const [updated] = await tx.update(item).set(values).where(and(
        eq(item.id, target.entityId),
        expectedState(item.archivedAt),
      )).returning({ id: item.id });
      updatedId = updated?.id;
      break;
    }
    case "derived-ability": {
      const [updated] = await tx.update(derivedAbility).set(values).where(and(
        eq(derivedAbility.id, target.entityId),
        expectedState(derivedAbility.archivedAt),
      )).returning({ id: derivedAbility.id });
      updatedId = updated?.id;
      break;
    }
  }

  if (updatedId === undefined) {
    throw new Error(
      archived
        ? `That ${ENTITY_LABELS[target.entityKind]} is already archived.`
        : `That ${ENTITY_LABELS[target.entityKind]} is already active.`,
    );
  }
}

function scopedCampaignPredicate(
  scope: "campaign" | "character" | "chat-room",
  campaignId: number,
): SQL {
  if (scope === "campaign") return sql`campaign_id = ${campaignId}`;
  if (scope === "character") {
    return sql`character_id in (select id from campaign_character where campaign_id = ${campaignId})`;
  }
  return sql`room_id in (select id from chat_room where campaign_id = ${campaignId})`;
}

async function deleteCampaignGraph(
  tx: LifecycleTransaction,
  campaignId: number,
  testSeam?: LifecycleDeletionTestSeam,
): Promise<void> {
  for (const reference of CAMPAIGN_GRAPH_SELF_REFERENCE_BREAKS) {
    await tx.execute(sql`
      update ${sql.identifier(reference.tableName)}
      set ${sql.identifier(reference.columnName)} = null
      where ${scopedCampaignPredicate(reference.scope, campaignId)}
    `);
  }

  for (const step of CAMPAIGN_GRAPH_DELETE_STEPS) {
    await tx.execute(sql`
      delete from ${sql.identifier(step.tableName)}
      where ${scopedCampaignPredicate(step.scope, campaignId)}
    `);
    await testSeam?.afterCampaignDeleteStep?.(step.tableName);
  }

  const [removed] = await tx.delete(campaign)
    .where(eq(campaign.id, campaignId))
    .returning({ id: campaign.id });
  if (!removed) throw new Error("The locked Campaign could not be deleted.");
}

async function deleteNonCampaignRoot(
  tx: LifecycleTransaction,
  target: LifecycleTargetInput,
  root: RootSnapshot,
): Promise<void> {
  let removedId: number | undefined;
  switch (target.entityKind) {
    case "campaign":
      throw new Error("Campaign deletion requires the complete graph plan.");
    case "player-character":
    case "race-npc":
    case "creature-npc": {
      if (root.campaign_id === null) throw new Error("Character Campaign context is missing.");
      // Firearm state is mutable Character-owned state, but its history is a
      // blocker. Removing it first permits the verified Character cascade.
      await tx.execute(sql`
        delete from campaign_character_firearm_state
        where campaign_id = ${root.campaign_id} and character_id = ${target.entityId}
      `);
      const [removed] = await tx.delete(campaignCharacter).where(and(
        eq(campaignCharacter.id, target.entityId),
        eq(campaignCharacter.campaignId, root.campaign_id),
      )).returning({ id: campaignCharacter.id });
      removedId = removed?.id;
      break;
    }
    case "race": {
      const [removed] = await tx.delete(race).where(eq(race.id, target.entityId)).returning({ id: race.id });
      removedId = removed?.id;
      break;
    }
    case "creature": {
      // Hit locations restrict their referenced HP pools, so remove those
      // owned rows before the remaining Creature aggregate cascades.
      await tx.execute(sql`delete from creature_hit_locations where creature_id = ${target.entityId}`);
      const [removed] = await tx.delete(creature).where(eq(creature.id, target.entityId)).returning({ id: creature.id });
      removedId = removed?.id;
      break;
    }
    case "skill": {
      const [removed] = await tx.delete(skill).where(eq(skill.id, target.entityId)).returning({ id: skill.id });
      removedId = removed?.id;
      break;
    }
    case "item": {
      const [removed] = await tx.delete(item).where(eq(item.id, target.entityId)).returning({ id: item.id });
      removedId = removed?.id;
      break;
    }
    case "derived-ability": {
      const [removed] = await tx.delete(derivedAbility).where(eq(derivedAbility.id, target.entityId)).returning({ id: derivedAbility.id });
      removedId = removed?.id;
      break;
    }
  }
  if (removedId === undefined) {
    throw new Error(`The locked ${ENTITY_LABELS[target.entityKind]} could not be deleted.`);
  }
}

export async function previewLifecycleEntityForActor(
  input: LifecycleTargetInput,
  actor: LifecycleActor,
): Promise<LifecyclePreview> {
  const target = parseLifecycleTarget(input);
  return db.transaction(async (tx) => (
    await buildPreview(tx, actor, target, false)
  ).preview);
}

export async function archiveLifecycleEntityForActor(
  input: LifecycleTargetInput,
  actor: LifecycleActor,
  reason?: string,
): Promise<LifecyclePreview> {
  const target = parseLifecycleTarget(input);
  const normalizedReason = normalizeLifecycleReason(reason);
  return db.transaction(async (tx) => {
    const before = await buildPreview(tx, actor, target, true);
    assertMutationAuthorization(actor, target, before.root);
    if (before.preview.archived) {
      throw new Error(`That ${ENTITY_LABELS[target.entityKind]} is already archived.`);
    }
    await updateRootArchiveState(tx, target, actor.userId, true, normalizedReason);
    await recordLifecycleAudit(
      tx,
      actor,
      "archive",
      target,
      before.root,
      before.preview,
      normalizedReason,
    );
    return (await buildPreview(tx, actor, target, false)).preview;
  });
}

export async function restoreLifecycleEntityForActor(
  input: LifecycleTargetInput,
  actor: LifecycleActor,
): Promise<LifecyclePreview> {
  const target = parseLifecycleTarget(input);
  return db.transaction(async (tx) => {
    const before = await buildPreview(tx, actor, target, true);
    assertMutationAuthorization(actor, target, before.root);
    if (!before.preview.archived) {
      throw new Error(`That ${ENTITY_LABELS[target.entityKind]} is already active.`);
    }
    await updateRootArchiveState(tx, target, actor.userId, false, "");
    await recordLifecycleAudit(tx, actor, "restore", target, before.root, before.preview, "");
    return (await buildPreview(tx, actor, target, false)).preview;
  });
}

export async function permanentlyDeleteLifecycleEntityForActor(
  input: LifecycleTargetInput,
  actor: LifecycleActor,
  confirmationName?: string,
  testSeam?: LifecycleDeletionTestSeam,
): Promise<LifecycleDeletionResult> {
  const target = parseLifecycleTarget(input);
  // Check before opening a transaction and again after the root is locked. The
  // second check is the authoritative safety boundary.
  assertPermanentDeletionEnabled();

  return db.transaction(async (tx) => {
    assertPermanentDeletionEnabled();
    const current = await buildPreview(tx, actor, target, true);
    assertMutationAuthorization(actor, target, current.root);
    if (target.entityKind === "campaign") {
      assertExactConfirmation(current.root.name, confirmationName);
    }
    const blockers = current.preview.dependencies.filter(
      ({ blocking, count }) => blocking && count > 0,
    );
    if (blockers.length > 0) {
      throw new Error(
        `${ENTITY_LABELS[target.entityKind]} cannot be permanently deleted while referenced: ${blockers.map(({ label, count }) => `${label} (${count})`).join(", ")}. Archive it instead or resolve those references explicitly.`,
      );
    }

    await recordLifecycleAudit(
      tx,
      actor,
      "delete",
      target,
      current.root,
      current.preview,
      "",
    );
    await testSeam?.afterAudit?.();

    if (target.entityKind === "campaign") {
      await deleteCampaignGraph(tx, target.entityId, testSeam);
    } else {
      await deleteNonCampaignRoot(tx, target, current.root);
    }

    return {
      entityKind: target.entityKind,
      entityId: target.entityId,
      entityName: current.root.name,
      ...(current.root.campaign_id !== null
        ? { campaignId: current.root.campaign_id }
        : {}),
    };
  });
}
