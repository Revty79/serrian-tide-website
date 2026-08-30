CREATE TYPE "public"."serrian_role" AS ENUM('admin', 'god', 'player');--> statement-breakpoint
CREATE TYPE "public"."campaign_currency_system" AS ENUM('Credits', 'Derived Currency');--> statement-breakpoint
CREATE TYPE "public"."campaign_fate_point_method" AS ENUM('Assigned', 'Rolled');--> statement-breakpoint
CREATE TYPE "public"."campaign_system" AS ENUM('Tier 1', 'Tier 2', 'Tier 3', 'Spellcraft', 'Talismanism', 'Faith', 'Psyonics', 'Special Abilities', 'Bardic Resonance');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"user_id" text NOT NULL,
	"role" "serrian_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"attribute_points" double precision NOT NULL,
	"skill_points" double precision NOT NULL,
	"max_starting_skill" double precision NOT NULL,
	"points_to_unlock_next_tier" double precision NOT NULL,
	"max_points_in_skill" double precision NOT NULL,
	"starting_credit_amount" double precision NOT NULL,
	"currency_system" "campaign_currency_system" NOT NULL,
	"fate_point_method" "campaign_fate_point_method" NOT NULL,
	"assigned_fate_points" integer,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_allowed_system" (
	"campaign_id" integer NOT NULL,
	"system" "campaign_system" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_allowed_system_campaign_id_system_pk" PRIMARY KEY("campaign_id","system")
);
--> statement-breakpoint
CREATE TABLE "campaign_derived_currency" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"credits_per_unit" double precision NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_player" (
	"campaign_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"is_npc_controller" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_player_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"classification" text DEFAULT 'standard' NOT NULL,
	"tier" integer,
	"primary_attribute" text,
	"secondary_attribute" text,
	"definition" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"source_system" text,
	"source_external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_name_not_blank" CHECK (length(trim("skill"."name")) > 0),
	CONSTRAINT "skill_classification_not_blank" CHECK (length(trim("skill"."classification")) > 0),
	CONSTRAINT "skill_tier_positive" CHECK ("skill"."tier" IS NULL OR "skill"."tier" > 0)
);
--> statement-breakpoint
CREATE TABLE "skill_extension" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" integer NOT NULL,
	"extension_type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"data_json" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_extension_type_not_blank" CHECK (length(trim("skill_extension"."extension_type")) > 0),
	CONSTRAINT "skill_extension_schema_version_positive" CHECK ("skill_extension"."schema_version" > 0),
	CONSTRAINT "skill_extension_data_not_blank" CHECK (length(trim("skill_extension"."data_json")) > 0)
);
--> statement-breakpoint
CREATE TABLE "skill_relationship" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" integer NOT NULL,
	"related_skill_id" integer NOT NULL,
	"relationship_type" text DEFAULT 'parent' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_relationship_type_not_blank" CHECK (length(trim("skill_relationship"."relationship_type")) > 0),
	CONSTRAINT "skill_relationship_not_self" CHECK ("skill_relationship"."skill_id" <> "skill_relationship"."related_skill_id")
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legacy_description" text DEFAULT '' NOT NULL,
	"physical_characteristics" text DEFAULT '' NOT NULL,
	"physical_description" text DEFAULT '' NOT NULL,
	"age_range_text" text DEFAULT '' NOT NULL,
	"age_min" integer,
	"age_max" integer,
	"size" text DEFAULT '' NOT NULL,
	"base_magic" double precision,
	"racial_quirk_name" text DEFAULT '' NOT NULL,
	"quirk_success_effect" text DEFAULT '' NOT NULL,
	"quirk_failure_effect" text DEFAULT '' NOT NULL,
	"common_languages_known" text DEFAULT '' NOT NULL,
	"common_archetypes" text DEFAULT '' NOT NULL,
	"genre_examples" text DEFAULT '' NOT NULL,
	"cultural_mindset" text DEFAULT '' NOT NULL,
	"outlook_on_magic" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"source_system" text,
	"source_external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "races_name_nonblank" CHECK (length(trim("races"."name")) > 0),
	CONSTRAINT "races_age_min_valid" CHECK ("races"."age_min" IS NULL OR "races"."age_min" >= 0),
	CONSTRAINT "races_age_max_valid" CHECK ("races"."age_max" IS NULL OR "races"."age_max" >= 0),
	CONSTRAINT "races_age_order_valid" CHECK ("races"."age_min" IS NULL OR "races"."age_max" IS NULL OR "races"."age_min" <= "races"."age_max")
);
--> statement-breakpoint
CREATE TABLE "race_attribute_caps" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"attribute_key" text NOT NULL,
	"max_value" double precision NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "race_attribute_caps_attribute_nonblank" CHECK (length(trim("race_attribute_caps"."attribute_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "race_movement_modes" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"movement_mode" text NOT NULL,
	"base_value" double precision NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "race_movement_modes_name_nonblank" CHECK (length(trim("race_movement_modes"."movement_mode")) > 0)
);
--> statement-breakpoint
CREATE TABLE "race_skill_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"link_type" text NOT NULL,
	"value" double precision,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "race_skill_links_type_nonblank" CHECK (length(trim("race_skill_links"."link_type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "challenge_rating_reference" (
	"challenge_rating" integer PRIMARY KEY NOT NULL,
	"threat_band" text DEFAULT '' NOT NULL,
	"attack_target_guidance" text DEFAULT '' NOT NULL,
	"damage_guidance" text DEFAULT '' NOT NULL,
	"initiative_guidance" text DEFAULT '' NOT NULL,
	"soak_guidance" text DEFAULT '' NOT NULL,
	"hp_toughness_guidance" text DEFAULT '' NOT NULL,
	"kill_xp" integer,
	"current_creature_example" text DEFAULT '' NOT NULL,
	"example_notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_rating_reference_range" CHECK ("challenge_rating_reference"."challenge_rating" BETWEEN 1 AND 50),
	CONSTRAINT "challenge_rating_reference_xp" CHECK ("challenge_rating_reference"."kill_xp" IS NULL OR "challenge_rating_reference"."kill_xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "creatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"canonical_name" text NOT NULL,
	"family" text DEFAULT '' NOT NULL,
	"creature_type" text DEFAULT '' NOT NULL,
	"size" text NOT NULL,
	"challenge_rating" integer,
	"kill_xp" integer,
	"description" text DEFAULT '' NOT NULL,
	"typical_behavior" text DEFAULT '' NOT NULL,
	"habitat_ecology" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"source_system" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"parent_creature_id" integer,
	"calculated_challenge_rating" integer,
	"challenge_rating_adjustment" integer DEFAULT 0 NOT NULL,
	"challenge_rating_adjustment_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "creatures_canonical_id_uq" UNIQUE("canonical_id"),
	CONSTRAINT "creatures_canonical_id_nonblank" CHECK (length(trim("creatures"."canonical_id")) > 0),
	CONSTRAINT "creatures_canonical_id_uppercase" CHECK ("creatures"."canonical_id" = upper("creatures"."canonical_id")),
	CONSTRAINT "creatures_name_nonblank" CHECK (length(trim("creatures"."canonical_name")) > 0),
	CONSTRAINT "creatures_size_valid" CHECK ("creatures"."size" IN ('Minuscule','Tiny','Small','Medium','Large','Huge','Gargantuan','Colossal')),
	CONSTRAINT "creatures_parent_not_self" CHECK ("creatures"."parent_creature_id" IS NULL OR "creatures"."parent_creature_id" <> "creatures"."id"),
	CONSTRAINT "creatures_cr_valid" CHECK ("creatures"."challenge_rating" IS NULL OR "creatures"."challenge_rating" BETWEEN 1 AND 50),
	CONSTRAINT "creatures_calculated_cr_valid" CHECK ("creatures"."calculated_challenge_rating" IS NULL OR "creatures"."calculated_challenge_rating" BETWEEN 1 AND 50),
	CONSTRAINT "creatures_xp_valid" CHECK ("creatures"."kill_xp" IS NULL OR "creatures"."kill_xp" >= 0),
	CONSTRAINT "creatures_adjustment_valid" CHECK ("creatures"."challenge_rating_adjustment" BETWEEN -49 AND 49)
);
--> statement-breakpoint
CREATE TABLE "creature_abilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"ability_name" text NOT NULL,
	"ability_type" text DEFAULT '' NOT NULL,
	"activation" text DEFAULT '' NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"uses_recharge" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"mechanical_effect" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"cr_impact" text DEFAULT 'None' NOT NULL,
	CONSTRAINT "creature_abilities_canonical_id_uq" UNIQUE("canonical_id"),
	CONSTRAINT "creature_abilities_canonical_id_uppercase" CHECK ("creature_abilities"."canonical_id" = upper("creature_abilities"."canonical_id")),
	CONSTRAINT "creature_abilities_canonical_id_nonblank" CHECK (length(trim("creature_abilities"."canonical_id")) > 0),
	CONSTRAINT "creature_abilities_name_nonblank" CHECK (length(trim("creature_abilities"."ability_name")) > 0),
	CONSTRAINT "creature_abilities_cr_impact_valid" CHECK ("creature_abilities"."cr_impact" IN ('None','Minor','Moderate','Major','Extreme'))
);
--> statement-breakpoint
CREATE TABLE "creature_attacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"attack_name" text NOT NULL,
	"attack_percentage" double precision,
	"damage" text,
	"damage_type" text DEFAULT '' NOT NULL,
	"range_reach" text DEFAULT '' NOT NULL,
	"required_anatomy" text DEFAULT '' NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"uses_recharge" text DEFAULT '' NOT NULL,
	"special_effect" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_attacks_canonical_id_uq" UNIQUE("canonical_id"),
	CONSTRAINT "creature_attacks_canonical_id_uppercase" CHECK ("creature_attacks"."canonical_id" = upper("creature_attacks"."canonical_id")),
	CONSTRAINT "creature_attacks_canonical_id_nonblank" CHECK (length(trim("creature_attacks"."canonical_id")) > 0),
	CONSTRAINT "creature_attacks_name_nonblank" CHECK (length(trim("creature_attacks"."attack_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "creature_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"attribute_key" text NOT NULL,
	"value" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_attributes_key_valid" CHECK ("creature_attributes"."attribute_key" IN ('Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'))
);
--> statement-breakpoint
CREATE TABLE "creature_defenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"seed_identity" text,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"defense_type" text NOT NULL,
	"against" text DEFAULT '' NOT NULL,
	"value" text,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"cr_impact" text DEFAULT 'None' NOT NULL,
	CONSTRAINT "creature_defenses_type_nonblank" CHECK (length(trim("creature_defenses"."defense_type")) > 0),
	CONSTRAINT "creature_defenses_cr_impact_valid" CHECK ("creature_defenses"."cr_impact" IN ('None','Minor','Moderate','Major','Extreme'))
);
--> statement-breakpoint
CREATE TABLE "creature_hit_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"hit_location_number" integer NOT NULL,
	"location_name" text DEFAULT '' NOT NULL,
	"body_parts_included" text DEFAULT '' NOT NULL,
	"hp_pool_id" integer,
	"natural_armor" double precision,
	"soak" double precision,
	"location_effect" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_hit_locations_number_valid" CHECK ("creature_hit_locations"."hit_location_number" BETWEEN 0 AND 9)
);
--> statement-breakpoint
CREATE TABLE "creature_hp_pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"pool_name" text NOT NULL,
	"hp_percentage" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_hp_pools_canonical_id_uq" UNIQUE("canonical_id"),
	CONSTRAINT "creature_hp_pools_id_creature_uq" UNIQUE("id","creature_id"),
	CONSTRAINT "creature_hp_pools_id_variant_uq" UNIQUE("id","variant_id"),
	CONSTRAINT "creature_hp_pools_canonical_id_uppercase" CHECK ("creature_hp_pools"."canonical_id" = upper("creature_hp_pools"."canonical_id")),
	CONSTRAINT "creature_hp_pools_canonical_id_nonblank" CHECK (length(trim("creature_hp_pools"."canonical_id")) > 0),
	CONSTRAINT "creature_hp_pools_name_nonblank" CHECK (length(trim("creature_hp_pools"."pool_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "creature_movement" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"movement_mode" text NOT NULL,
	"movement_value" double precision,
	"initiative" double precision,
	"requirements" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_movement_mode_nonblank" CHECK (length(trim("creature_movement"."movement_mode")) > 0)
);
--> statement-breakpoint
CREATE TABLE "creature_skill_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"skill_id" integer NOT NULL,
	"rank" text,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creature_uses" (
	"id" serial PRIMARY KEY NOT NULL,
	"seed_identity" text,
	"creature_id" integer NOT NULL,
	"variant_id" integer,
	"use_name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_uses_name_nonblank" CHECK (length(trim("creature_uses"."use_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "creature_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"creature_id" integer NOT NULL,
	"variant_name" text NOT NULL,
	"variant_type" text DEFAULT '' NOT NULL,
	"size_override" text,
	"challenge_rating_override" integer,
	"kill_xp_override" integer,
	"description" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_variants_canonical_id_uq" UNIQUE("canonical_id"),
	CONSTRAINT "creature_variants_id_creature_uq" UNIQUE("id","creature_id"),
	CONSTRAINT "creature_variants_canonical_id_uppercase" CHECK ("creature_variants"."canonical_id" = upper("creature_variants"."canonical_id")),
	CONSTRAINT "creature_variants_canonical_id_nonblank" CHECK (length(trim("creature_variants"."canonical_id")) > 0),
	CONSTRAINT "creature_variants_name_nonblank" CHECK (length(trim("creature_variants"."variant_name")) > 0),
	CONSTRAINT "creature_variants_size_valid" CHECK ("creature_variants"."size_override" IS NULL OR "creature_variants"."size_override" IN ('Minuscule','Tiny','Small','Medium','Large','Huge','Gargantuan','Colossal')),
	CONSTRAINT "creature_variants_cr_valid" CHECK ("creature_variants"."challenge_rating_override" IS NULL OR "creature_variants"."challenge_rating_override" BETWEEN 1 AND 50),
	CONSTRAINT "creature_variants_xp_valid" CHECK ("creature_variants"."kill_xp_override" IS NULL OR "creature_variants"."kill_xp_override" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_allowed_derived_ability" (
	"campaign_id" integer NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_allowed_derived_ability_campaign_id_derived_ability_id_pk" PRIMARY KEY("campaign_id","derived_ability_id"),
	CONSTRAINT "campaign_allowed_derived_ability_order_valid" CHECK ("campaign_allowed_derived_ability"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "derived_ability" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"mechanical_effect" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"source_system" text,
	"source_external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_name_nonblank" CHECK (length(trim("derived_ability"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "derived_ability_trigger" (
	"id" serial PRIMARY KEY NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"trigger_type" text NOT NULL,
	"attribute_key" text,
	"minimum_score" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_trigger_type_v1" CHECK ("derived_ability_trigger"."trigger_type" = 'attribute'),
	CONSTRAINT "derived_ability_trigger_attribute_key_v1" CHECK ("derived_ability_trigger"."attribute_key" IS NOT NULL AND "derived_ability_trigger"."attribute_key" IN ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHR')),
	CONSTRAINT "derived_ability_trigger_minimum_score_v1" CHECK ("derived_ability_trigger"."minimum_score" IS NOT NULL AND "derived_ability_trigger"."minimum_score" >= 0),
	CONSTRAINT "derived_ability_trigger_order_valid" CHECK ("derived_ability_trigger"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "armor_locations" (
	"item_id" integer NOT NULL,
	"location_code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "armor_locations_item_id_location_code_pk" PRIMARY KEY("item_id","location_code")
);
--> statement-breakpoint
CREATE TABLE "armor_location_reference" (
	"location_code" text PRIMARY KEY NOT NULL,
	"location_name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "armor_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"armor_type" text DEFAULT '' NOT NULL,
	"coverage" text DEFAULT '' NOT NULL,
	"base_soak" double precision,
	"damage_modifiers_source_text" text DEFAULT '' NOT NULL,
	"rules_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "armor_profiles_soak_valid" CHECK ("armor_profiles"."base_soak" IS NULL OR "armor_profiles"."base_soak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"name" text NOT NULL,
	"catalog_scope" text NOT NULL,
	"equipment_group" text,
	"record_type" text NOT NULL,
	"family" text NOT NULL,
	"category" text NOT NULL,
	"subtype" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"weight" double precision,
	"weight_unit" text DEFAULT '' NOT NULL,
	"size" text DEFAULT '' NOT NULL,
	"durability" double precision,
	"credits" double precision,
	"price_basis" text NOT NULL,
	"parent_item_id" integer,
	"created_by_user_id" text,
	"source_system" text,
	"source_external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "items_canonical_id_uq" UNIQUE("canonical_id"),
	CONSTRAINT "items_canonical_id_nonblank" CHECK (length(trim("items"."canonical_id")) > 0),
	CONSTRAINT "items_canonical_id_uppercase" CHECK ("items"."canonical_id" = upper("items"."canonical_id")),
	CONSTRAINT "items_name_nonblank" CHECK (length(trim("items"."name")) > 0),
	CONSTRAINT "items_scope_valid" CHECK ("items"."catalog_scope" IN ('equipment', 'inventory')),
	CONSTRAINT "items_equipment_group_valid" CHECK ("items"."equipment_group" IS NULL OR "items"."equipment_group" IN ('weapon', 'armor', 'general')),
	CONSTRAINT "items_scope_group_valid" CHECK (("items"."catalog_scope" = 'inventory' AND "items"."equipment_group" IS NULL) OR ("items"."catalog_scope" = 'equipment' AND "items"."equipment_group" IN ('weapon', 'armor', 'general'))),
	CONSTRAINT "items_weight_valid" CHECK ("items"."weight" IS NULL OR "items"."weight" >= 0),
	CONSTRAINT "items_weight_unit_valid" CHECK (("items"."weight" IS NULL AND length(trim("items"."weight_unit")) = 0) OR ("items"."weight" IS NOT NULL AND length(trim("items"."weight_unit")) > 0)),
	CONSTRAINT "items_durability_valid" CHECK ("items"."durability" IS NULL OR "items"."durability" >= 0),
	CONSTRAINT "items_credits_valid" CHECK ("items"."credits" IS NULL OR "items"."credits" >= 0),
	CONSTRAINT "items_parent_not_self" CHECK ("items"."parent_item_id" IS NULL OR "items"."parent_item_id" <> "items"."id")
);
--> statement-breakpoint
CREATE TABLE "item_armor_damage_modifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"modifier_text" text DEFAULT '' NOT NULL,
	"damage_type" text NOT NULL,
	"modifier" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_armor_damage_modifiers_type_nonblank" CHECK (length(trim("item_armor_damage_modifiers"."damage_type")) > 0),
	CONSTRAINT "item_armor_damage_modifiers_modifier_nonblank" CHECK (length(trim("item_armor_damage_modifiers"."modifier")) > 0)
);
--> statement-breakpoint
CREATE TABLE "item_properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"property_name" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"related_item_id" integer,
	"related_creature_canonical_id" text,
	"quantity" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_properties_name_nonblank" CHECK (length(trim("item_properties"."property_name")) > 0),
	CONSTRAINT "item_properties_quantity_valid" CHECK ("item_properties"."quantity" IS NULL OR "item_properties"."quantity" > 0),
	CONSTRAINT "item_properties_one_relation" CHECK ("item_properties"."related_item_id" IS NULL OR "item_properties"."related_creature_canonical_id" IS NULL),
	CONSTRAINT "item_properties_creature_id_uppercase" CHECK ("item_properties"."related_creature_canonical_id" IS NULL OR "item_properties"."related_creature_canonical_id" = upper("item_properties"."related_creature_canonical_id"))
);
--> statement-breakpoint
CREATE TABLE "item_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"rule_name" text NOT NULL,
	"rule_text" text NOT NULL,
	"implementation_guidance" text NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "item_rules_rule_id_uq" UNIQUE("rule_id"),
	CONSTRAINT "item_rules_rule_id_uppercase" CHECK ("item_rules"."rule_id" = upper("item_rules"."rule_id")),
	CONSTRAINT "item_rules_rule_id_nonblank" CHECK (length(trim("item_rules"."rule_id")) > 0),
	CONSTRAINT "item_rules_name_nonblank" CHECK (length(trim("item_rules"."rule_name")) > 0),
	CONSTRAINT "item_rules_text_nonblank" CHECK (length(trim("item_rules"."rule_text")) > 0),
	CONSTRAINT "item_rules_guidance_nonblank" CHECK (length(trim("item_rules"."implementation_guidance")) > 0),
	CONSTRAINT "item_rules_status_nonblank" CHECK (length(trim("item_rules"."status")) > 0)
);
--> statement-breakpoint
CREATE TABLE "item_tags_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_id" text NOT NULL,
	"name" text NOT NULL,
	"tag_group" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "item_tags_catalog_canonical_id_uq" UNIQUE("canonical_id"),
	CONSTRAINT "item_tags_catalog_canonical_id_uppercase" CHECK ("item_tags_catalog"."canonical_id" = upper("item_tags_catalog"."canonical_id")),
	CONSTRAINT "item_tags_catalog_canonical_id_nonblank" CHECK (length(trim("item_tags_catalog"."canonical_id")) > 0),
	CONSTRAINT "item_tags_catalog_name_nonblank" CHECK (length(trim("item_tags_catalog"."name")) > 0),
	CONSTRAINT "item_tags_catalog_group_nonblank" CHECK (length(trim("item_tags_catalog"."tag_group")) > 0),
	CONSTRAINT "item_tags_catalog_description_nonblank" CHECK (length(trim("item_tags_catalog"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "item_tag_links" (
	"item_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "item_tag_links_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "weapon_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"profile_record_type" text DEFAULT '' NOT NULL,
	"weapon_type" text DEFAULT '' NOT NULL,
	"handedness" text DEFAULT '' NOT NULL,
	"damage_source" text DEFAULT '' NOT NULL,
	"damage" text DEFAULT '' NOT NULL,
	"initiative_cost" integer,
	"damage_type" text DEFAULT '' NOT NULL,
	"range_text" text DEFAULT '' NOT NULL,
	"reach_text" text DEFAULT '' NOT NULL,
	"ammunition_item_id" integer,
	"compatibility" text DEFAULT '' NOT NULL,
	"capacity" text DEFAULT '' NOT NULL,
	"fire_modes" text DEFAULT '[]' NOT NULL,
	"rate_of_fire" text DEFAULT '' NOT NULL,
	"reload_initiative" text DEFAULT '' NOT NULL,
	"rules_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weapon_profiles_fire_modes_json_valid" CHECK ("weapon_profiles"."fire_modes"::jsonb IS NOT NULL AND jsonb_typeof("weapon_profiles"."fire_modes"::jsonb) = 'array'),
	CONSTRAINT "weapon_profiles_ammo_not_self" CHECK ("weapon_profiles"."ammunition_item_id" IS NULL OR "weapon_profiles"."ammunition_item_id" <> "weapon_profiles"."item_id"),
	CONSTRAINT "weapon_profiles_initiative_cost_valid" CHECK ("weapon_profiles"."initiative_cost" IS NULL OR "weapon_profiles"."initiative_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_allowed_race" (
	"campaign_id" integer NOT NULL,
	"race_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_allowed_race_campaign_id_race_id_pk" PRIMARY KEY("campaign_id","race_id"),
	CONSTRAINT "campaign_allowed_race_order_valid" CHECK ("campaign_allowed_race"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"player_user_id" text NOT NULL,
	"name" text DEFAULT 'New Character' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_npc" boolean DEFAULT false NOT NULL,
	"npc_kind" text DEFAULT 'race' NOT NULL,
	CONSTRAINT "campaign_character_name_nonblank" CHECK (length(trim("campaign_character"."name")) > 0),
	CONSTRAINT "campaign_character_npc_kind_valid" CHECK ("campaign_character"."npc_kind" IN ('race', 'creature'))
);
--> statement-breakpoint
CREATE TABLE "campaign_character_attribute" (
	"character_id" integer NOT NULL,
	"attribute_key" text NOT NULL,
	"value" double precision DEFAULT 25 NOT NULL,
	CONSTRAINT "campaign_character_attribute_character_id_attribute_key_pk" PRIMARY KEY("character_id","attribute_key"),
	CONSTRAINT "campaign_character_attribute_key_valid" CHECK ("campaign_character_attribute"."attribute_key" IN ('STR','DEX','CON','INT','WIS','CHR')),
	CONSTRAINT "campaign_character_attribute_value_valid" CHECK ("campaign_character_attribute"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_currency_holding" (
	"character_id" integer NOT NULL,
	"currency_id" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_currency_holding_character_id_currency_id_pk" PRIMARY KEY("character_id","currency_id"),
	CONSTRAINT "campaign_character_currency_quantity_valid" CHECK ("campaign_character_currency_holding"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_item" (
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_credits" double precision NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_item_character_id_item_id_pk" PRIMARY KEY("character_id","item_id"),
	CONSTRAINT "campaign_character_item_quantity_valid" CHECK ("campaign_character_item"."quantity" > 0),
	CONSTRAINT "campaign_character_item_cost_valid" CHECK ("campaign_character_item"."unit_cost_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_profile" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"race_id" integer,
	"age" integer,
	"sex" text DEFAULT '' NOT NULL,
	"height" double precision,
	"weight" double precision,
	"skin_color" text DEFAULT '' NOT NULL,
	"eye_color" text DEFAULT '' NOT NULL,
	"hair_color" text DEFAULT '' NOT NULL,
	"deity" text DEFAULT '' NOT NULL,
	"defining_marks" text DEFAULT '' NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"secrets" text DEFAULT '' NOT NULL,
	"backstory" text DEFAULT '' NOT NULL,
	"motivations" text DEFAULT '' NOT NULL,
	"fame" double precision DEFAULT 0 NOT NULL,
	"experience" double precision DEFAULT 0 NOT NULL,
	"total_experience" double precision DEFAULT 0 NOT NULL,
	"quintessence" double precision DEFAULT 0 NOT NULL,
	"total_quintessence" double precision DEFAULT 0 NOT NULL,
	"credits_remaining" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"creation_completed_at" timestamp,
	"height_feet" integer,
	"height_inches" integer,
	"fate_points" integer,
	"hp_multiplier_steps" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_character_profile_age_valid" CHECK ("campaign_character_profile"."age" IS NULL OR "campaign_character_profile"."age" >= 0),
	CONSTRAINT "campaign_character_profile_height_valid" CHECK ("campaign_character_profile"."height" IS NULL OR "campaign_character_profile"."height" >= 0),
	CONSTRAINT "campaign_character_profile_height_feet_valid" CHECK ("campaign_character_profile"."height_feet" IS NULL OR "campaign_character_profile"."height_feet" >= 0),
	CONSTRAINT "campaign_character_profile_height_inches_valid" CHECK ("campaign_character_profile"."height_inches" IS NULL OR ("campaign_character_profile"."height_inches" >= 0 AND "campaign_character_profile"."height_inches" <= 11)),
	CONSTRAINT "campaign_character_profile_weight_valid" CHECK ("campaign_character_profile"."weight" IS NULL OR "campaign_character_profile"."weight" >= 0),
	CONSTRAINT "campaign_character_profile_progress_valid" CHECK ("campaign_character_profile"."fame" >= 0 AND "campaign_character_profile"."experience" >= 0 AND "campaign_character_profile"."total_experience" >= 0 AND "campaign_character_profile"."quintessence" >= 0 AND "campaign_character_profile"."total_quintessence" >= 0),
	CONSTRAINT "campaign_character_profile_credits_valid" CHECK ("campaign_character_profile"."credits_remaining" >= 0),
	CONSTRAINT "campaign_character_profile_fate_valid" CHECK ("campaign_character_profile"."fate_points" IS NULL OR "campaign_character_profile"."fate_points" >= 0),
	CONSTRAINT "campaign_character_profile_hp_multiplier_steps_valid" CHECK ("campaign_character_profile"."hp_multiplier_steps" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_skill_allocation" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"parent_allocation_id" integer,
	"points" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_skill_allocation_character_uq" UNIQUE("id","character_id"),
	CONSTRAINT "campaign_character_skill_allocation_points_valid" CHECK ("campaign_character_skill_allocation"."points" >= 0),
	CONSTRAINT "campaign_character_skill_allocation_not_self" CHECK ("campaign_character_skill_allocation"."parent_allocation_id" IS NULL OR "campaign_character_skill_allocation"."parent_allocation_id" <> "campaign_character_skill_allocation"."id")
);
--> statement-breakpoint
CREATE TABLE "campaign_character_spell_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"document_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"tradition" text NOT NULL,
	"document_json" text NOT NULL,
	"in_spellbook" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_spell_document_id_nonblank" CHECK (length(trim("campaign_character_spell_document"."document_id")) > 0),
	CONSTRAINT "campaign_character_spell_document_tradition_valid" CHECK ("campaign_character_spell_document"."tradition" IN ('Spellcraft/Talismanism/Faith', 'Psionics', 'Bardic Resonance')),
	CONSTRAINT "campaign_character_spell_document_json_nonblank" CHECK (length(trim("campaign_character_spell_document"."document_json")) > 0),
	CONSTRAINT "campaign_character_spell_document_json_valid" CHECK ("campaign_character_spell_document"."document_json"::jsonb IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "campaign_creature_npc_profile" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"instance_notes" text DEFAULT '' NOT NULL,
	"hp_adjustment" double precision DEFAULT 0 NOT NULL,
	"baseline_snapshot_json" text NOT NULL,
	"current_snapshot_json" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_creature_npc_baseline_nonblank" CHECK (length(trim("campaign_creature_npc_profile"."baseline_snapshot_json")) > 0),
	CONSTRAINT "campaign_creature_npc_current_nonblank" CHECK (length(trim("campaign_creature_npc_profile"."current_snapshot_json")) > 0),
	CONSTRAINT "campaign_creature_npc_baseline_json_valid" CHECK ("campaign_creature_npc_profile"."baseline_snapshot_json"::jsonb IS NOT NULL),
	CONSTRAINT "campaign_creature_npc_current_json_valid" CHECK ("campaign_creature_npc_profile"."current_snapshot_json"::jsonb IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "campaign_inventory_item" (
	"campaign_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_inventory_item_campaign_id_item_id_pk" PRIMARY KEY("campaign_id","item_id"),
	CONSTRAINT "campaign_inventory_item_order_valid" CHECK ("campaign_inventory_item"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_inventory_tag" (
	"campaign_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_inventory_tag_campaign_id_tag_id_pk" PRIMARY KEY("campaign_id","tag_id"),
	CONSTRAINT "campaign_inventory_tag_order_valid" CHECK ("campaign_inventory_tag"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attribute_score_reference" (
	"attribute_key" varchar(3) NOT NULL,
	"score" integer NOT NULL,
	"max_carry" integer,
	"max_lift" integer,
	"max_spheres" integer,
	"spell_weaving" integer,
	"teaching_base" integer,
	"loyalty_base" integer,
	CONSTRAINT "attribute_score_reference_attribute_key_score_pk" PRIMARY KEY("attribute_key","score"),
	CONSTRAINT "attribute_score_reference_key_valid" CHECK ("attribute_score_reference"."attribute_key" IN ('STR', 'INT', 'WIS', 'CHR')),
	CONSTRAINT "attribute_score_reference_score_range" CHECK ("attribute_score_reference"."score" BETWEEN 1 AND 100),
	CONSTRAINT "attribute_score_reference_values_nonnegative" CHECK (("attribute_score_reference"."max_carry" IS NULL OR "attribute_score_reference"."max_carry" >= 0)
        AND ("attribute_score_reference"."max_lift" IS NULL OR "attribute_score_reference"."max_lift" >= 0)
        AND ("attribute_score_reference"."max_spheres" IS NULL OR "attribute_score_reference"."max_spheres" >= 0)
        AND ("attribute_score_reference"."spell_weaving" IS NULL OR "attribute_score_reference"."spell_weaving" >= 0)
        AND ("attribute_score_reference"."teaching_base" IS NULL OR "attribute_score_reference"."teaching_base" >= 0)
        AND ("attribute_score_reference"."loyalty_base" IS NULL OR "attribute_score_reference"."loyalty_base" >= 0)),
	CONSTRAINT "attribute_score_reference_fields_match_key" CHECK ((
          "attribute_score_reference"."attribute_key" = 'STR'
          AND "attribute_score_reference"."max_carry" IS NOT NULL
          AND "attribute_score_reference"."max_lift" IS NOT NULL
          AND "attribute_score_reference"."max_spheres" IS NULL
          AND "attribute_score_reference"."spell_weaving" IS NULL
          AND "attribute_score_reference"."teaching_base" IS NULL
          AND "attribute_score_reference"."loyalty_base" IS NULL
        ) OR (
          "attribute_score_reference"."attribute_key" = 'INT'
          AND "attribute_score_reference"."max_carry" IS NULL
          AND "attribute_score_reference"."max_lift" IS NULL
          AND "attribute_score_reference"."max_spheres" IS NOT NULL
          AND "attribute_score_reference"."spell_weaving" IS NOT NULL
          AND "attribute_score_reference"."teaching_base" IS NULL
          AND "attribute_score_reference"."loyalty_base" IS NULL
        ) OR (
          "attribute_score_reference"."attribute_key" = 'WIS'
          AND "attribute_score_reference"."max_carry" IS NULL
          AND "attribute_score_reference"."max_lift" IS NULL
          AND "attribute_score_reference"."max_spheres" IS NULL
          AND "attribute_score_reference"."spell_weaving" IS NULL
          AND "attribute_score_reference"."teaching_base" IS NOT NULL
          AND "attribute_score_reference"."loyalty_base" IS NULL
        ) OR (
          "attribute_score_reference"."attribute_key" = 'CHR'
          AND "attribute_score_reference"."max_carry" IS NULL
          AND "attribute_score_reference"."max_lift" IS NULL
          AND "attribute_score_reference"."max_spheres" IS NULL
          AND "attribute_score_reference"."spell_weaving" IS NULL
          AND "attribute_score_reference"."teaching_base" IS NULL
          AND "attribute_score_reference"."loyalty_base" IS NOT NULL
        ))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_allowed_system" ADD CONSTRAINT "campaign_allowed_system_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_derived_currency" ADD CONSTRAINT "campaign_derived_currency_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_player" ADD CONSTRAINT "campaign_player_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_player" ADD CONSTRAINT "campaign_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_extension" ADD CONSTRAINT "skill_extension_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_relationship" ADD CONSTRAINT "skill_relationship_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_relationship" ADD CONSTRAINT "skill_relationship_related_skill_id_skill_id_fk" FOREIGN KEY ("related_skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_attribute_caps" ADD CONSTRAINT "race_attribute_caps_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_movement_modes" ADD CONSTRAINT "race_movement_modes_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_skill_links" ADD CONSTRAINT "race_skill_links_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_skill_links" ADD CONSTRAINT "race_skill_links_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_challenge_rating_challenge_rating_reference_challenge_rating_fk" FOREIGN KEY ("challenge_rating") REFERENCES "public"."challenge_rating_reference"("challenge_rating") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_parent_creature_id_creatures_id_fk" FOREIGN KEY ("parent_creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_abilities" ADD CONSTRAINT "creature_abilities_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_abilities" ADD CONSTRAINT "creature_abilities_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_attacks" ADD CONSTRAINT "creature_attacks_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_attacks" ADD CONSTRAINT "creature_attacks_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_attributes" ADD CONSTRAINT "creature_attributes_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_attributes" ADD CONSTRAINT "creature_attributes_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_defenses" ADD CONSTRAINT "creature_defenses_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_defenses" ADD CONSTRAINT "creature_defenses_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_hit_locations" ADD CONSTRAINT "creature_hit_locations_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_hit_locations" ADD CONSTRAINT "creature_hit_locations_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_hit_locations" ADD CONSTRAINT "creature_hit_locations_hp_pool_owner_fk" FOREIGN KEY ("hp_pool_id","creature_id") REFERENCES "public"."creature_hp_pools"("id","creature_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_hit_locations" ADD CONSTRAINT "creature_hit_locations_hp_pool_variant_fk" FOREIGN KEY ("hp_pool_id","variant_id") REFERENCES "public"."creature_hp_pools"("id","variant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_hp_pools" ADD CONSTRAINT "creature_hp_pools_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_hp_pools" ADD CONSTRAINT "creature_hp_pools_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_movement" ADD CONSTRAINT "creature_movement_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_movement" ADD CONSTRAINT "creature_movement_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_skill_links" ADD CONSTRAINT "creature_skill_links_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_skill_links" ADD CONSTRAINT "creature_skill_links_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_skill_links" ADD CONSTRAINT "creature_skill_links_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_uses" ADD CONSTRAINT "creature_uses_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_uses" ADD CONSTRAINT "creature_uses_variant_owner_fk" FOREIGN KEY ("variant_id","creature_id") REFERENCES "public"."creature_variants"("id","creature_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_variants" ADD CONSTRAINT "creature_variants_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_variants" ADD CONSTRAINT "creature_variants_challenge_rating_override_challenge_rating_reference_challenge_rating_fk" FOREIGN KEY ("challenge_rating_override") REFERENCES "public"."challenge_rating_reference"("challenge_rating") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_allowed_derived_ability" ADD CONSTRAINT "campaign_allowed_derived_ability_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_allowed_derived_ability" ADD CONSTRAINT "campaign_allowed_derived_ability_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD CONSTRAINT "derived_ability_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability_trigger" ADD CONSTRAINT "derived_ability_trigger_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "armor_locations" ADD CONSTRAINT "armor_locations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "armor_locations" ADD CONSTRAINT "armor_locations_location_code_armor_location_reference_location_code_fk" FOREIGN KEY ("location_code") REFERENCES "public"."armor_location_reference"("location_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "armor_profiles" ADD CONSTRAINT "armor_profiles_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_parent_item_id_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_armor_damage_modifiers" ADD CONSTRAINT "item_armor_damage_modifiers_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_properties" ADD CONSTRAINT "item_properties_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_properties" ADD CONSTRAINT "item_properties_related_item_id_items_id_fk" FOREIGN KEY ("related_item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_properties" ADD CONSTRAINT "item_properties_related_creature_canonical_id_creatures_canonical_id_fk" FOREIGN KEY ("related_creature_canonical_id") REFERENCES "public"."creatures"("canonical_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag_links" ADD CONSTRAINT "item_tag_links_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag_links" ADD CONSTRAINT "item_tag_links_tag_id_item_tags_catalog_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."item_tags_catalog"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_ammunition_item_id_items_id_fk" FOREIGN KEY ("ammunition_item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_allowed_race" ADD CONSTRAINT "campaign_allowed_race_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_allowed_race" ADD CONSTRAINT "campaign_allowed_race_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD CONSTRAINT "campaign_character_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD CONSTRAINT "campaign_character_player_user_id_user_id_fk" FOREIGN KEY ("player_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD CONSTRAINT "campaign_character_campaign_player_fk" FOREIGN KEY ("campaign_id","player_user_id") REFERENCES "public"."campaign_player"("campaign_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_attribute" ADD CONSTRAINT "campaign_character_attribute_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_currency_holding" ADD CONSTRAINT "campaign_character_currency_holding_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_currency_holding" ADD CONSTRAINT "campaign_character_currency_holding_currency_id_campaign_derived_currency_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."campaign_derived_currency"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_item" ADD CONSTRAINT "campaign_character_item_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_item" ADD CONSTRAINT "campaign_character_item_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_profile" ADD CONSTRAINT "campaign_character_profile_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_profile" ADD CONSTRAINT "campaign_character_profile_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_skill_allocation" ADD CONSTRAINT "campaign_character_skill_allocation_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_skill_allocation" ADD CONSTRAINT "campaign_character_skill_allocation_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_skill_allocation" ADD CONSTRAINT "campaign_character_skill_allocation_parent_fk" FOREIGN KEY ("parent_allocation_id","character_id") REFERENCES "public"."campaign_character_skill_allocation"("id","character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_spell_document" ADD CONSTRAINT "campaign_character_spell_document_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_creature_npc_profile" ADD CONSTRAINT "campaign_creature_npc_profile_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_creature_npc_profile" ADD CONSTRAINT "campaign_creature_npc_profile_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_inventory_item" ADD CONSTRAINT "campaign_inventory_item_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_inventory_item" ADD CONSTRAINT "campaign_inventory_item_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_inventory_tag" ADD CONSTRAINT "campaign_inventory_tag_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_inventory_tag" ADD CONSTRAINT "campaign_inventory_tag_tag_id_item_tags_catalog_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."item_tags_catalog"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "user_role_user_id_idx" ON "user_role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "campaign_created_by_user_id_idx" ON "campaign" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "campaign_allowed_system_campaign_id_idx" ON "campaign_allowed_system" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_derived_currency_campaign_id_idx" ON "campaign_derived_currency" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_player_user_id_idx" ON "campaign_player" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_classification_idx" ON "skill" USING btree ("classification","name","id");--> statement-breakpoint
CREATE INDEX "skill_created_by_user_idx" ON "skill" USING btree ("created_by_user_id","name","id");--> statement-breakpoint
CREATE INDEX "skill_name_idx" ON "skill" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "skill_primary_attribute_idx" ON "skill" USING btree ("primary_attribute","name","id");--> statement-breakpoint
CREATE INDEX "skill_secondary_attribute_idx" ON "skill" USING btree ("secondary_attribute","name","id");--> statement-breakpoint
CREATE INDEX "skill_tier_idx" ON "skill" USING btree ("tier","name","id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_source_identity_idx" ON "skill" USING btree ("source_system","source_external_id") WHERE
          "skill"."source_system" IS NOT NULL
          AND "skill"."source_external_id" IS NOT NULL
        ;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_extension_unique_idx" ON "skill_extension" USING btree ("skill_id","extension_type");--> statement-breakpoint
CREATE INDEX "skill_extension_type_idx" ON "skill_extension" USING btree ("extension_type","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_relationship_unique_idx" ON "skill_relationship" USING btree ("skill_id","related_skill_id","relationship_type");--> statement-breakpoint
CREATE INDEX "skill_relationship_skill_idx" ON "skill_relationship" USING btree ("skill_id","relationship_type","sort_order","id");--> statement-breakpoint
CREATE INDEX "skill_relationship_related_idx" ON "skill_relationship" USING btree ("related_skill_id","relationship_type","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "races_source_identity_uq" ON "races" USING btree ("source_system","source_external_id") WHERE "races"."source_system" IS NOT NULL AND "races"."source_external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "races_name_idx" ON "races" USING btree ("name");--> statement-breakpoint
CREATE INDEX "races_size_idx" ON "races" USING btree ("size");--> statement-breakpoint
CREATE INDEX "race_attribute_caps_race_id_idx" ON "race_attribute_caps" USING btree ("race_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_attribute_caps_race_attribute_uq" ON "race_attribute_caps" USING btree ("race_id","attribute_key");--> statement-breakpoint
CREATE INDEX "race_movement_modes_race_id_idx" ON "race_movement_modes" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "race_skill_links_race_id_idx" ON "race_skill_links" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "race_skill_links_skill_id_idx" ON "race_skill_links" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_skill_links_identity_uq" ON "race_skill_links" USING btree ("race_id","skill_id","link_type");--> statement-breakpoint
CREATE INDEX "creatures_name_idx" ON "creatures" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "creatures_family_idx" ON "creatures" USING btree ("family");--> statement-breakpoint
CREATE INDEX "creatures_type_idx" ON "creatures" USING btree ("creature_type");--> statement-breakpoint
CREATE INDEX "creatures_size_idx" ON "creatures" USING btree ("size");--> statement-breakpoint
CREATE INDEX "creature_abilities_creature_id_idx" ON "creature_abilities" USING btree ("creature_id");--> statement-breakpoint
CREATE INDEX "creature_attacks_creature_id_idx" ON "creature_attacks" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creature_attributes_base_uq" ON "creature_attributes" USING btree ("creature_id","attribute_key") WHERE "creature_attributes"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "creature_attributes_variant_uq" ON "creature_attributes" USING btree ("variant_id","attribute_key") WHERE "creature_attributes"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "creature_attributes_creature_id_idx" ON "creature_attributes" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creature_defenses_seed_identity_uq" ON "creature_defenses" USING btree ("seed_identity") WHERE "creature_defenses"."seed_identity" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "creature_defenses_creature_id_idx" ON "creature_defenses" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creature_hit_locations_base_uq" ON "creature_hit_locations" USING btree ("creature_id","hit_location_number") WHERE "creature_hit_locations"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "creature_hit_locations_variant_uq" ON "creature_hit_locations" USING btree ("variant_id","hit_location_number") WHERE "creature_hit_locations"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "creature_hit_locations_creature_id_idx" ON "creature_hit_locations" USING btree ("creature_id");--> statement-breakpoint
CREATE INDEX "creature_hp_pools_creature_id_idx" ON "creature_hp_pools" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creature_movement_base_uq" ON "creature_movement" USING btree ("creature_id","movement_mode") WHERE "creature_movement"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "creature_movement_variant_uq" ON "creature_movement" USING btree ("variant_id","movement_mode") WHERE "creature_movement"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "creature_movement_creature_id_idx" ON "creature_movement" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creature_skill_links_base_uq" ON "creature_skill_links" USING btree ("creature_id","skill_id") WHERE "creature_skill_links"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "creature_skill_links_variant_uq" ON "creature_skill_links" USING btree ("variant_id","skill_id") WHERE "creature_skill_links"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "creature_skill_links_creature_id_idx" ON "creature_skill_links" USING btree ("creature_id");--> statement-breakpoint
CREATE INDEX "creature_skill_links_skill_id_idx" ON "creature_skill_links" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creature_uses_seed_identity_uq" ON "creature_uses" USING btree ("seed_identity") WHERE "creature_uses"."seed_identity" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "creature_uses_creature_id_idx" ON "creature_uses" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creature_variants_name_uq" ON "creature_variants" USING btree ("creature_id","variant_name");--> statement-breakpoint
CREATE INDEX "creature_variants_creature_id_idx" ON "creature_variants" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_allowed_derived_ability_order_uq" ON "campaign_allowed_derived_ability" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_allowed_derived_ability_ability_idx" ON "campaign_allowed_derived_ability" USING btree ("derived_ability_id","campaign_id");--> statement-breakpoint
CREATE INDEX "derived_ability_name_idx" ON "derived_ability" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "derived_ability_created_by_user_idx" ON "derived_ability" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_source_identity_uq" ON "derived_ability" USING btree ("source_system","source_external_id") WHERE "derived_ability"."source_system" IS NOT NULL AND "derived_ability"."source_external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "derived_ability_trigger_ability_idx" ON "derived_ability_trigger" USING btree ("derived_ability_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_trigger_order_uq" ON "derived_ability_trigger" USING btree ("derived_ability_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "armor_locations_order_uq" ON "armor_locations" USING btree ("item_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "armor_location_reference_name_uq" ON "armor_location_reference" USING btree ("location_name");--> statement-breakpoint
CREATE UNIQUE INDEX "armor_location_reference_order_uq" ON "armor_location_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "armor_profiles_item_id_uq" ON "armor_profiles" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_source_identity_uq" ON "items" USING btree ("source_system","source_external_id") WHERE "items"."source_system" IS NOT NULL AND "items"."source_external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "items_name_idx" ON "items" USING btree ("name");--> statement-breakpoint
CREATE INDEX "items_catalog_scope_idx" ON "items" USING btree ("catalog_scope");--> statement-breakpoint
CREATE INDEX "items_equipment_group_idx" ON "items" USING btree ("equipment_group");--> statement-breakpoint
CREATE INDEX "items_record_type_idx" ON "items" USING btree ("record_type");--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "item_armor_damage_modifiers_order_uq" ON "item_armor_damage_modifiers" USING btree ("item_id","sort_order");--> statement-breakpoint
CREATE INDEX "item_armor_damage_modifiers_item_id_idx" ON "item_armor_damage_modifiers" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_properties_order_uq" ON "item_properties" USING btree ("item_id","sort_order");--> statement-breakpoint
CREATE INDEX "item_properties_item_id_idx" ON "item_properties" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_tags_catalog_name_uq" ON "item_tags_catalog" USING btree ("name");--> statement-breakpoint
CREATE INDEX "item_tag_links_tag_id_idx" ON "item_tag_links" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_profiles_item_id_uq" ON "weapon_profiles" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "weapon_profiles_ammunition_item_id_idx" ON "weapon_profiles" USING btree ("ammunition_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_allowed_race_order_uq" ON "campaign_allowed_race" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_allowed_race_race_idx" ON "campaign_allowed_race" USING btree ("race_id","campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_character_campaign_id_idx" ON "campaign_character" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_character_player_user_id_idx" ON "campaign_character" USING btree ("player_user_id");--> statement-breakpoint
CREATE INDEX "campaign_character_player_campaign_idx" ON "campaign_character" USING btree ("player_user_id","campaign_id","is_npc");--> statement-breakpoint
CREATE INDEX "campaign_character_currency_currency_idx" ON "campaign_character_currency_holding" USING btree ("currency_id","character_id");--> statement-breakpoint
CREATE INDEX "campaign_character_item_catalog_idx" ON "campaign_character_item" USING btree ("item_id","character_id");--> statement-breakpoint
CREATE INDEX "campaign_character_profile_race_idx" ON "campaign_character_profile" USING btree ("race_id","character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_skill_root_uq" ON "campaign_character_skill_allocation" USING btree ("character_id","skill_id") WHERE "campaign_character_skill_allocation"."parent_allocation_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_skill_branch_uq" ON "campaign_character_skill_allocation" USING btree ("character_id","skill_id","parent_allocation_id") WHERE "campaign_character_skill_allocation"."parent_allocation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_character_skill_allocation_character_idx" ON "campaign_character_skill_allocation" USING btree ("character_id","parent_allocation_id","skill_id");--> statement-breakpoint
CREATE INDEX "campaign_character_skill_allocation_skill_idx" ON "campaign_character_skill_allocation" USING btree ("skill_id","character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_spell_document_identity_uq" ON "campaign_character_spell_document" USING btree ("character_id","document_id");--> statement-breakpoint
CREATE INDEX "campaign_character_spell_document_character_idx" ON "campaign_character_spell_document" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "campaign_creature_npc_profile_creature_idx" ON "campaign_creature_npc_profile" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_inventory_item_order_uq" ON "campaign_inventory_item" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_inventory_item_item_idx" ON "campaign_inventory_item" USING btree ("item_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_inventory_tag_order_uq" ON "campaign_inventory_tag" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_inventory_tag_tag_idx" ON "campaign_inventory_tag" USING btree ("tag_id","campaign_id");
--> statement-breakpoint
-- SERRIAN TIDE BASELINE CANON SEEDS

-- Final Challenge Rating XP canon.
INSERT INTO "challenge_rating_reference" (
  "challenge_rating",
  "kill_xp"
) VALUES
  (1, 2),
  (2, 3),
  (3, 4),
  (4, 5),
  (5, 7),
  (6, 9),
  (7, 11),
  (8, 13),
  (9, 15),
  (10, 18),
  (11, 21),
  (12, 24),
  (13, 27),
  (14, 30),
  (15, 34),
  (16, 38),
  (17, 42),
  (18, 46),
  (19, 50),
  (20, 55),
  (21, 60),
  (22, 65),
  (23, 70),
  (24, 75),
  (25, 81),
  (26, 87),
  (27, 93),
  (28, 100),
  (29, 107),
  (30, 115),
  (31, 123),
  (32, 131),
  (33, 139),
  (34, 147),
  (35, 156),
  (36, 165),
  (37, 174),
  (38, 183),
  (39, 192),
  (40, 201),
  (41, 211),
  (42, 221),
  (43, 231),
  (44, 241),
  (45, 252),
  (46, 263),
  (47, 274),
  (48, 286),
  (49, 298),
  (50, 310)
ON CONFLICT ("challenge_rating") DO UPDATE SET
  "kill_xp" = EXCLUDED."kill_xp",
  "updated_at" = now();
--> statement-breakpoint

-- Finalized Derived Ability canon and Attribute triggers.
INSERT INTO "derived_ability" (
	"name",
	"description",
	"mechanical_effect",
	"source_system",
	"source_external_id"
) VALUES
	('Durable Muscles', '', '', 'serrian-tide-derived-ability-canon', 'DA-STR-40-DURABLE-MUSCLES'),
	('Ambidexterity', '', '', 'serrian-tide-derived-ability-canon', 'DA-DEX-40-AMBIDEXTERITY'),
	('Poison Resistance', '', '', 'serrian-tide-derived-ability-canon', 'DA-CON-40-POISON-RESISTANCE'),
	('Eidetic Memory', '', '', 'serrian-tide-derived-ability-canon', 'DA-INT-40-EIDETIC-MEMORY'),
	('Indomitable Will', '', '', 'serrian-tide-derived-ability-canon', 'DA-WIS-40-INDOMITABLE-WILL'),
	('Likeable', '', '', 'serrian-tide-derived-ability-canon', 'DA-CHR-40-LIKEABLE')
ON CONFLICT ("source_system", "source_external_id")
WHERE "source_system" IS NOT NULL AND "source_external_id" IS NOT NULL
DO NOTHING;
--> statement-breakpoint
INSERT INTO "derived_ability_trigger" (
	"derived_ability_id",
	"trigger_type",
	"attribute_key",
	"minimum_score",
	"sort_order"
)
SELECT
	ability."id",
	'attribute',
	canonical."attribute_key",
	40,
	0
FROM (VALUES
	('DA-STR-40-DURABLE-MUSCLES', 'STR'),
	('DA-DEX-40-AMBIDEXTERITY', 'DEX'),
	('DA-CON-40-POISON-RESISTANCE', 'CON'),
	('DA-INT-40-EIDETIC-MEMORY', 'INT'),
	('DA-WIS-40-INDOMITABLE-WILL', 'WIS'),
	('DA-CHR-40-LIKEABLE', 'CHR')
) AS canonical("source_external_id", "attribute_key")
INNER JOIN "derived_ability" AS ability
	ON ability."source_system" = 'serrian-tide-derived-ability-canon'
	AND ability."source_external_id" = canonical."source_external_id"
ON CONFLICT ("derived_ability_id", "sort_order") DO UPDATE SET
	"trigger_type" = EXCLUDED."trigger_type",
	"attribute_key" = EXCLUDED."attribute_key",
	"minimum_score" = EXCLUDED."minimum_score";
--> statement-breakpoint

-- Exact Attribute Reference canon.
-- Seed the checked-in Serrian Tide Attribute Reference canon for every environment.
-- This table was created by migration 0005, but its data previously depended on a separate broad canon import.
INSERT INTO "attribute_score_reference" (
	"attribute_key",
	"score",
	"max_carry",
	"max_lift",
	"max_spheres",
	"spell_weaving",
	"teaching_base",
	"loyalty_base"
) VALUES
	('STR', 1, 1, 2, NULL, NULL, NULL, NULL),
	('STR', 2, 2, 4, NULL, NULL, NULL, NULL),
	('STR', 3, 3, 6, NULL, NULL, NULL, NULL),
	('STR', 4, 4, 8, NULL, NULL, NULL, NULL),
	('STR', 5, 5, 10, NULL, NULL, NULL, NULL),
	('STR', 6, 6, 12, NULL, NULL, NULL, NULL),
	('STR', 7, 7, 14, NULL, NULL, NULL, NULL),
	('STR', 8, 8, 16, NULL, NULL, NULL, NULL),
	('STR', 9, 9, 18, NULL, NULL, NULL, NULL),
	('STR', 10, 16, 26, NULL, NULL, NULL, NULL),
	('STR', 11, 24, 35, NULL, NULL, NULL, NULL),
	('STR', 12, 33, 45, NULL, NULL, NULL, NULL),
	('STR', 13, 43, 56, NULL, NULL, NULL, NULL),
	('STR', 14, 54, 68, NULL, NULL, NULL, NULL),
	('STR', 15, 67, 83, NULL, NULL, NULL, NULL),
	('STR', 16, 81, 97, NULL, NULL, NULL, NULL),
	('STR', 17, 96, 113, NULL, NULL, NULL, NULL),
	('STR', 18, 112, 130, NULL, NULL, NULL, NULL),
	('STR', 19, 129, 148, NULL, NULL, NULL, NULL),
	('STR', 20, 139, 159, NULL, NULL, NULL, NULL),
	('STR', 21, 159, 180, NULL, NULL, NULL, NULL),
	('STR', 22, 180, 202, NULL, NULL, NULL, NULL),
	('STR', 23, 202, 225, NULL, NULL, NULL, NULL),
	('STR', 24, 225, 249, NULL, NULL, NULL, NULL),
	('STR', 25, 250, 275, NULL, NULL, NULL, NULL),
	('STR', 26, 276, 302, NULL, NULL, NULL, NULL),
	('STR', 27, 303, 330, NULL, NULL, NULL, NULL),
	('STR', 28, 331, 359, NULL, NULL, NULL, NULL),
	('STR', 29, 360, 389, NULL, NULL, NULL, NULL),
	('STR', 30, 391, 421, NULL, NULL, NULL, NULL),
	('STR', 31, 423, 454, NULL, NULL, NULL, NULL),
	('STR', 32, 456, 488, NULL, NULL, NULL, NULL),
	('STR', 33, 490, 523, NULL, NULL, NULL, NULL),
	('STR', 34, 524, 558, NULL, NULL, NULL, NULL),
	('STR', 35, 561, 596, NULL, NULL, NULL, NULL),
	('STR', 36, 599, 635, NULL, NULL, NULL, NULL),
	('STR', 37, 638, 675, NULL, NULL, NULL, NULL),
	('STR', 38, 678, 716, NULL, NULL, NULL, NULL),
	('STR', 39, 719, 758, NULL, NULL, NULL, NULL),
	('STR', 40, 762, 802, NULL, NULL, NULL, NULL),
	('STR', 41, 806, 847, NULL, NULL, NULL, NULL),
	('STR', 42, 851, 893, NULL, NULL, NULL, NULL),
	('STR', 43, 897, 940, NULL, NULL, NULL, NULL),
	('STR', 44, 944, 988, NULL, NULL, NULL, NULL),
	('STR', 45, 993, 1038, NULL, NULL, NULL, NULL),
	('STR', 46, 1043, 1089, NULL, NULL, NULL, NULL),
	('STR', 47, 1094, 1141, NULL, NULL, NULL, NULL),
	('STR', 48, 1146, 1194, NULL, NULL, NULL, NULL),
	('STR', 49, 1199, 1248, NULL, NULL, NULL, NULL),
	('STR', 50, 1254, 1304, NULL, NULL, NULL, NULL),
	('STR', 51, 1631, 1682, NULL, NULL, NULL, NULL),
	('STR', 52, 1688, 1740, NULL, NULL, NULL, NULL),
	('STR', 53, 1746, 1799, NULL, NULL, NULL, NULL),
	('STR', 54, 1805, 1859, NULL, NULL, NULL, NULL),
	('STR', 55, 2325, 2380, NULL, NULL, NULL, NULL),
	('STR', 56, 2387, 2443, NULL, NULL, NULL, NULL),
	('STR', 57, 2450, 2507, NULL, NULL, NULL, NULL),
	('STR', 58, 2514, 2572, NULL, NULL, NULL, NULL),
	('STR', 59, 2879, 2938, NULL, NULL, NULL, NULL),
	('STR', 60, 3599, 3659, NULL, NULL, NULL, NULL),
	('STR', 61, 3667, 3728, NULL, NULL, NULL, NULL),
	('STR', 62, 3736, 3798, NULL, NULL, NULL, NULL),
	('STR', 63, 3806, 3869, NULL, NULL, NULL, NULL),
	('STR', 64, 3877, 3941, NULL, NULL, NULL, NULL),
	('STR', 65, 4927, 4992, NULL, NULL, NULL, NULL),
	('STR', 66, 5001, 5067, NULL, NULL, NULL, NULL),
	('STR', 67, 5079, 5143, NULL, NULL, NULL, NULL),
	('STR', 68, 5155, 5223, NULL, NULL, NULL, NULL),
	('STR', 69, 5232, 5301, NULL, NULL, NULL, NULL),
	('STR', 70, 6627, 6697, NULL, NULL, NULL, NULL),
	('STR', 71, 6707, 6778, NULL, NULL, NULL, NULL),
	('STR', 72, 6788, 6860, NULL, NULL, NULL, NULL),
	('STR', 73, 6870, 6943, NULL, NULL, NULL, NULL),
	('STR', 74, 6953, 7027, NULL, NULL, NULL, NULL),
	('STR', 75, 8785, 8860, NULL, NULL, NULL, NULL),
	('STR', 76, 8871, 8947, NULL, NULL, NULL, NULL),
	('STR', 77, 8957, 9033, NULL, NULL, NULL, NULL),
	('STR', 78, 9045, 9123, NULL, NULL, NULL, NULL),
	('STR', 79, 9134, 9213, NULL, NULL, NULL, NULL),
	('STR', 80, 11517, 11597, NULL, NULL, NULL, NULL),
	('STR', 81, 11609, 11690, NULL, NULL, NULL, NULL),
	('STR', 82, 11702, 11784, NULL, NULL, NULL, NULL),
	('STR', 83, 11796, 11879, NULL, NULL, NULL, NULL),
	('STR', 84, 11891, 11975, NULL, NULL, NULL, NULL),
	('STR', 85, 14970, 15055, NULL, NULL, NULL, NULL),
	('STR', 86, 15068, 15154, NULL, NULL, NULL, NULL),
	('STR', 87, 15167, 15254, NULL, NULL, NULL, NULL),
	('STR', 88, 15267, 15355, NULL, NULL, NULL, NULL),
	('STR', 89, 15368, 15457, NULL, NULL, NULL, NULL),
	('STR', 90, 19338, 19428, NULL, NULL, NULL, NULL),
	('STR', 91, 19442, 19533, NULL, NULL, NULL, NULL),
	('STR', 92, 19547, 19639, NULL, NULL, NULL, NULL),
	('STR', 93, 19653, 19746, NULL, NULL, NULL, NULL),
	('STR', 94, 19760, 19854, NULL, NULL, NULL, NULL),
	('STR', 95, 24835, 24930, NULL, NULL, NULL, NULL),
	('STR', 96, 24945, 25041, NULL, NULL, NULL, NULL),
	('STR', 97, 25056, 25153, NULL, NULL, NULL, NULL),
	('STR', 98, 25168, 25266, NULL, NULL, NULL, NULL),
	('STR', 99, 25281, 25380, NULL, NULL, NULL, NULL),
	('STR', 100, 38094, 38194, NULL, NULL, NULL, NULL),
	('INT', 1, NULL, NULL, 0, 0, NULL, NULL),
	('INT', 2, NULL, NULL, 0, 0, NULL, NULL),
	('INT', 3, NULL, NULL, 0, 0, NULL, NULL),
	('INT', 4, NULL, NULL, 0, 0, NULL, NULL),
	('INT', 5, NULL, NULL, 1, 0, NULL, NULL),
	('INT', 6, NULL, NULL, 1, 0, NULL, NULL),
	('INT', 7, NULL, NULL, 1, 0, NULL, NULL),
	('INT', 8, NULL, NULL, 1, 0, NULL, NULL),
	('INT', 9, NULL, NULL, 1, 0, NULL, NULL),
	('INT', 10, NULL, NULL, 2, 0, NULL, NULL),
	('INT', 11, NULL, NULL, 2, 0, NULL, NULL),
	('INT', 12, NULL, NULL, 3, 0, NULL, NULL),
	('INT', 13, NULL, NULL, 3, 0, NULL, NULL),
	('INT', 14, NULL, NULL, 3, 0, NULL, NULL),
	('INT', 15, NULL, NULL, 4, 0, NULL, NULL),
	('INT', 16, NULL, NULL, 4, 0, NULL, NULL),
	('INT', 17, NULL, NULL, 5, 0, NULL, NULL),
	('INT', 18, NULL, NULL, 5, 0, NULL, NULL),
	('INT', 19, NULL, NULL, 6, 0, NULL, NULL),
	('INT', 20, NULL, NULL, 6, 0, NULL, NULL),
	('INT', 21, NULL, NULL, 7, 0, NULL, NULL),
	('INT', 22, NULL, NULL, 7, 0, NULL, NULL),
	('INT', 23, NULL, NULL, 7, 0, NULL, NULL),
	('INT', 24, NULL, NULL, 7, 0, NULL, NULL),
	('INT', 25, NULL, NULL, 8, 0, NULL, NULL),
	('INT', 26, NULL, NULL, 8, 0, NULL, NULL),
	('INT', 27, NULL, NULL, 8, 0, NULL, NULL),
	('INT', 28, NULL, NULL, 9, 0, NULL, NULL),
	('INT', 29, NULL, NULL, 9, 0, NULL, NULL),
	('INT', 30, NULL, NULL, 10, 0, NULL, NULL),
	('INT', 31, NULL, NULL, 10, 0, NULL, NULL),
	('INT', 32, NULL, NULL, 10, 0, NULL, NULL),
	('INT', 33, NULL, NULL, 11, 0, NULL, NULL),
	('INT', 34, NULL, NULL, 11, 0, NULL, NULL),
	('INT', 35, NULL, NULL, 14, 0, NULL, NULL),
	('INT', 36, NULL, NULL, 14, 0, NULL, NULL),
	('INT', 37, NULL, NULL, 15, 0, NULL, NULL),
	('INT', 38, NULL, NULL, 16, 0, NULL, NULL),
	('INT', 39, NULL, NULL, 16, 0, NULL, NULL),
	('INT', 40, NULL, NULL, 16, 1, NULL, NULL),
	('INT', 41, NULL, NULL, 16, 2, NULL, NULL),
	('INT', 42, NULL, NULL, 16, 3, NULL, NULL),
	('INT', 43, NULL, NULL, 16, 4, NULL, NULL),
	('INT', 44, NULL, NULL, 16, 5, NULL, NULL),
	('INT', 45, NULL, NULL, 16, 6, NULL, NULL),
	('INT', 46, NULL, NULL, 16, 6, NULL, NULL),
	('INT', 47, NULL, NULL, 16, 6, NULL, NULL),
	('INT', 48, NULL, NULL, 16, 6, NULL, NULL),
	('INT', 49, NULL, NULL, 16, 6, NULL, NULL),
	('INT', 50, NULL, NULL, 16, 7, NULL, NULL),
	('INT', 51, NULL, NULL, 16, 7, NULL, NULL),
	('INT', 52, NULL, NULL, 16, 7, NULL, NULL),
	('INT', 53, NULL, NULL, 16, 7, NULL, NULL),
	('INT', 54, NULL, NULL, 16, 7, NULL, NULL),
	('INT', 55, NULL, NULL, 16, 8, NULL, NULL),
	('INT', 56, NULL, NULL, 16, 8, NULL, NULL),
	('INT', 57, NULL, NULL, 16, 8, NULL, NULL),
	('INT', 58, NULL, NULL, 16, 8, NULL, NULL),
	('INT', 59, NULL, NULL, 16, 8, NULL, NULL),
	('INT', 60, NULL, NULL, 16, 9, NULL, NULL),
	('INT', 61, NULL, NULL, 16, 9, NULL, NULL),
	('INT', 62, NULL, NULL, 16, 9, NULL, NULL),
	('INT', 63, NULL, NULL, 16, 9, NULL, NULL),
	('INT', 64, NULL, NULL, 16, 9, NULL, NULL),
	('INT', 65, NULL, NULL, 16, 10, NULL, NULL),
	('INT', 66, NULL, NULL, 16, 10, NULL, NULL),
	('INT', 67, NULL, NULL, 16, 10, NULL, NULL),
	('INT', 68, NULL, NULL, 16, 10, NULL, NULL),
	('INT', 69, NULL, NULL, 16, 10, NULL, NULL),
	('INT', 70, NULL, NULL, 16, 11, NULL, NULL),
	('INT', 71, NULL, NULL, 16, 11, NULL, NULL),
	('INT', 72, NULL, NULL, 16, 11, NULL, NULL),
	('INT', 73, NULL, NULL, 16, 11, NULL, NULL),
	('INT', 74, NULL, NULL, 16, 11, NULL, NULL),
	('INT', 75, NULL, NULL, 16, 12, NULL, NULL),
	('INT', 76, NULL, NULL, 16, 12, NULL, NULL),
	('INT', 77, NULL, NULL, 16, 12, NULL, NULL),
	('INT', 78, NULL, NULL, 16, 12, NULL, NULL),
	('INT', 79, NULL, NULL, 16, 12, NULL, NULL),
	('INT', 80, NULL, NULL, 16, 13, NULL, NULL),
	('INT', 81, NULL, NULL, 16, 13, NULL, NULL),
	('INT', 82, NULL, NULL, 16, 13, NULL, NULL),
	('INT', 83, NULL, NULL, 16, 13, NULL, NULL),
	('INT', 84, NULL, NULL, 16, 13, NULL, NULL),
	('INT', 85, NULL, NULL, 16, 14, NULL, NULL),
	('INT', 86, NULL, NULL, 16, 14, NULL, NULL),
	('INT', 87, NULL, NULL, 16, 14, NULL, NULL),
	('INT', 88, NULL, NULL, 16, 14, NULL, NULL),
	('INT', 89, NULL, NULL, 16, 14, NULL, NULL),
	('INT', 90, NULL, NULL, 16, 15, NULL, NULL),
	('INT', 91, NULL, NULL, 16, 15, NULL, NULL),
	('INT', 92, NULL, NULL, 16, 15, NULL, NULL),
	('INT', 93, NULL, NULL, 16, 15, NULL, NULL),
	('INT', 94, NULL, NULL, 16, 15, NULL, NULL),
	('INT', 95, NULL, NULL, 16, 16, NULL, NULL),
	('INT', 96, NULL, NULL, 16, 16, NULL, NULL),
	('INT', 97, NULL, NULL, 16, 16, NULL, NULL),
	('INT', 98, NULL, NULL, 16, 16, NULL, NULL),
	('INT', 99, NULL, NULL, 16, 16, NULL, NULL),
	('INT', 100, NULL, NULL, 16, 16, NULL, NULL),
	('WIS', 1, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 2, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 3, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 4, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 5, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 6, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 7, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 8, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 9, NULL, NULL, NULL, NULL, 1, NULL),
	('WIS', 10, NULL, NULL, NULL, NULL, 2, NULL),
	('WIS', 11, NULL, NULL, NULL, NULL, 2, NULL),
	('WIS', 12, NULL, NULL, NULL, NULL, 2, NULL),
	('WIS', 13, NULL, NULL, NULL, NULL, 2, NULL),
	('WIS', 14, NULL, NULL, NULL, NULL, 2, NULL),
	('WIS', 15, NULL, NULL, NULL, NULL, 3, NULL),
	('WIS', 16, NULL, NULL, NULL, NULL, 3, NULL),
	('WIS', 17, NULL, NULL, NULL, NULL, 3, NULL),
	('WIS', 18, NULL, NULL, NULL, NULL, 3, NULL),
	('WIS', 19, NULL, NULL, NULL, NULL, 3, NULL),
	('WIS', 20, NULL, NULL, NULL, NULL, 4, NULL),
	('WIS', 21, NULL, NULL, NULL, NULL, 4, NULL),
	('WIS', 22, NULL, NULL, NULL, NULL, 4, NULL),
	('WIS', 23, NULL, NULL, NULL, NULL, 4, NULL),
	('WIS', 24, NULL, NULL, NULL, NULL, 4, NULL),
	('WIS', 25, NULL, NULL, NULL, NULL, 5, NULL),
	('WIS', 26, NULL, NULL, NULL, NULL, 5, NULL),
	('WIS', 27, NULL, NULL, NULL, NULL, 5, NULL),
	('WIS', 28, NULL, NULL, NULL, NULL, 5, NULL),
	('WIS', 29, NULL, NULL, NULL, NULL, 5, NULL),
	('WIS', 30, NULL, NULL, NULL, NULL, 7, NULL),
	('WIS', 31, NULL, NULL, NULL, NULL, 7, NULL),
	('WIS', 32, NULL, NULL, NULL, NULL, 7, NULL),
	('WIS', 33, NULL, NULL, NULL, NULL, 7, NULL),
	('WIS', 34, NULL, NULL, NULL, NULL, 7, NULL),
	('WIS', 35, NULL, NULL, NULL, NULL, 9, NULL),
	('WIS', 36, NULL, NULL, NULL, NULL, 9, NULL),
	('WIS', 37, NULL, NULL, NULL, NULL, 9, NULL),
	('WIS', 38, NULL, NULL, NULL, NULL, 9, NULL),
	('WIS', 39, NULL, NULL, NULL, NULL, 9, NULL),
	('WIS', 40, NULL, NULL, NULL, NULL, 11, NULL),
	('WIS', 41, NULL, NULL, NULL, NULL, 11, NULL),
	('WIS', 42, NULL, NULL, NULL, NULL, 11, NULL),
	('WIS', 43, NULL, NULL, NULL, NULL, 11, NULL),
	('WIS', 44, NULL, NULL, NULL, NULL, 11, NULL),
	('WIS', 45, NULL, NULL, NULL, NULL, 13, NULL),
	('WIS', 46, NULL, NULL, NULL, NULL, 13, NULL),
	('WIS', 47, NULL, NULL, NULL, NULL, 13, NULL),
	('WIS', 48, NULL, NULL, NULL, NULL, 13, NULL),
	('WIS', 49, NULL, NULL, NULL, NULL, 13, NULL),
	('WIS', 50, NULL, NULL, NULL, NULL, 15, NULL),
	('WIS', 51, NULL, NULL, NULL, NULL, 15, NULL),
	('WIS', 52, NULL, NULL, NULL, NULL, 15, NULL),
	('WIS', 53, NULL, NULL, NULL, NULL, 15, NULL),
	('WIS', 54, NULL, NULL, NULL, NULL, 15, NULL),
	('WIS', 55, NULL, NULL, NULL, NULL, 17, NULL),
	('WIS', 56, NULL, NULL, NULL, NULL, 17, NULL),
	('WIS', 57, NULL, NULL, NULL, NULL, 17, NULL),
	('WIS', 58, NULL, NULL, NULL, NULL, 17, NULL),
	('WIS', 59, NULL, NULL, NULL, NULL, 17, NULL),
	('WIS', 60, NULL, NULL, NULL, NULL, 19, NULL),
	('WIS', 61, NULL, NULL, NULL, NULL, 19, NULL),
	('WIS', 62, NULL, NULL, NULL, NULL, 19, NULL),
	('WIS', 63, NULL, NULL, NULL, NULL, 19, NULL),
	('WIS', 64, NULL, NULL, NULL, NULL, 19, NULL),
	('WIS', 65, NULL, NULL, NULL, NULL, 21, NULL),
	('WIS', 66, NULL, NULL, NULL, NULL, 21, NULL),
	('WIS', 67, NULL, NULL, NULL, NULL, 21, NULL),
	('WIS', 68, NULL, NULL, NULL, NULL, 21, NULL),
	('WIS', 69, NULL, NULL, NULL, NULL, 21, NULL),
	('WIS', 70, NULL, NULL, NULL, NULL, 23, NULL),
	('WIS', 71, NULL, NULL, NULL, NULL, 23, NULL),
	('WIS', 72, NULL, NULL, NULL, NULL, 23, NULL),
	('WIS', 73, NULL, NULL, NULL, NULL, 23, NULL),
	('WIS', 74, NULL, NULL, NULL, NULL, 23, NULL),
	('WIS', 75, NULL, NULL, NULL, NULL, 25, NULL),
	('WIS', 76, NULL, NULL, NULL, NULL, 25, NULL),
	('WIS', 77, NULL, NULL, NULL, NULL, 25, NULL),
	('WIS', 78, NULL, NULL, NULL, NULL, 25, NULL),
	('WIS', 79, NULL, NULL, NULL, NULL, 25, NULL),
	('WIS', 80, NULL, NULL, NULL, NULL, 27, NULL),
	('WIS', 81, NULL, NULL, NULL, NULL, 27, NULL),
	('WIS', 82, NULL, NULL, NULL, NULL, 27, NULL),
	('WIS', 83, NULL, NULL, NULL, NULL, 27, NULL),
	('WIS', 84, NULL, NULL, NULL, NULL, 27, NULL),
	('WIS', 85, NULL, NULL, NULL, NULL, 29, NULL),
	('WIS', 86, NULL, NULL, NULL, NULL, 29, NULL),
	('WIS', 87, NULL, NULL, NULL, NULL, 29, NULL),
	('WIS', 88, NULL, NULL, NULL, NULL, 29, NULL),
	('WIS', 89, NULL, NULL, NULL, NULL, 29, NULL),
	('WIS', 90, NULL, NULL, NULL, NULL, 31, NULL),
	('WIS', 91, NULL, NULL, NULL, NULL, 31, NULL),
	('WIS', 92, NULL, NULL, NULL, NULL, 31, NULL),
	('WIS', 93, NULL, NULL, NULL, NULL, 31, NULL),
	('WIS', 94, NULL, NULL, NULL, NULL, 31, NULL),
	('WIS', 95, NULL, NULL, NULL, NULL, 33, NULL),
	('WIS', 96, NULL, NULL, NULL, NULL, 33, NULL),
	('WIS', 97, NULL, NULL, NULL, NULL, 33, NULL),
	('WIS', 98, NULL, NULL, NULL, NULL, 33, NULL),
	('WIS', 99, NULL, NULL, NULL, NULL, 33, NULL),
	('WIS', 100, NULL, NULL, NULL, NULL, 35, NULL),
	('CHR', 1, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 2, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 3, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 4, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 5, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 6, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 7, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 8, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 9, NULL, NULL, NULL, NULL, NULL, 0),
	('CHR', 10, NULL, NULL, NULL, NULL, NULL, 1),
	('CHR', 11, NULL, NULL, NULL, NULL, NULL, 1),
	('CHR', 12, NULL, NULL, NULL, NULL, NULL, 1),
	('CHR', 13, NULL, NULL, NULL, NULL, NULL, 1),
	('CHR', 14, NULL, NULL, NULL, NULL, NULL, 1),
	('CHR', 15, NULL, NULL, NULL, NULL, NULL, 2),
	('CHR', 16, NULL, NULL, NULL, NULL, NULL, 2),
	('CHR', 17, NULL, NULL, NULL, NULL, NULL, 2),
	('CHR', 18, NULL, NULL, NULL, NULL, NULL, 2),
	('CHR', 19, NULL, NULL, NULL, NULL, NULL, 2),
	('CHR', 20, NULL, NULL, NULL, NULL, NULL, 3),
	('CHR', 21, NULL, NULL, NULL, NULL, NULL, 3),
	('CHR', 22, NULL, NULL, NULL, NULL, NULL, 3),
	('CHR', 23, NULL, NULL, NULL, NULL, NULL, 3),
	('CHR', 24, NULL, NULL, NULL, NULL, NULL, 3),
	('CHR', 25, NULL, NULL, NULL, NULL, NULL, 4),
	('CHR', 26, NULL, NULL, NULL, NULL, NULL, 4),
	('CHR', 27, NULL, NULL, NULL, NULL, NULL, 4),
	('CHR', 28, NULL, NULL, NULL, NULL, NULL, 4),
	('CHR', 29, NULL, NULL, NULL, NULL, NULL, 4),
	('CHR', 30, NULL, NULL, NULL, NULL, NULL, 6),
	('CHR', 31, NULL, NULL, NULL, NULL, NULL, 6),
	('CHR', 32, NULL, NULL, NULL, NULL, NULL, 6),
	('CHR', 33, NULL, NULL, NULL, NULL, NULL, 6),
	('CHR', 34, NULL, NULL, NULL, NULL, NULL, 6),
	('CHR', 35, NULL, NULL, NULL, NULL, NULL, 8),
	('CHR', 36, NULL, NULL, NULL, NULL, NULL, 8),
	('CHR', 37, NULL, NULL, NULL, NULL, NULL, 8),
	('CHR', 38, NULL, NULL, NULL, NULL, NULL, 8),
	('CHR', 39, NULL, NULL, NULL, NULL, NULL, 8),
	('CHR', 40, NULL, NULL, NULL, NULL, NULL, 10),
	('CHR', 41, NULL, NULL, NULL, NULL, NULL, 10),
	('CHR', 42, NULL, NULL, NULL, NULL, NULL, 10),
	('CHR', 43, NULL, NULL, NULL, NULL, NULL, 10),
	('CHR', 44, NULL, NULL, NULL, NULL, NULL, 10),
	('CHR', 45, NULL, NULL, NULL, NULL, NULL, 12),
	('CHR', 46, NULL, NULL, NULL, NULL, NULL, 12),
	('CHR', 47, NULL, NULL, NULL, NULL, NULL, 12),
	('CHR', 48, NULL, NULL, NULL, NULL, NULL, 12),
	('CHR', 49, NULL, NULL, NULL, NULL, NULL, 12),
	('CHR', 50, NULL, NULL, NULL, NULL, NULL, 14),
	('CHR', 51, NULL, NULL, NULL, NULL, NULL, 14),
	('CHR', 52, NULL, NULL, NULL, NULL, NULL, 14),
	('CHR', 53, NULL, NULL, NULL, NULL, NULL, 14),
	('CHR', 54, NULL, NULL, NULL, NULL, NULL, 14),
	('CHR', 55, NULL, NULL, NULL, NULL, NULL, 16),
	('CHR', 56, NULL, NULL, NULL, NULL, NULL, 16),
	('CHR', 57, NULL, NULL, NULL, NULL, NULL, 16),
	('CHR', 58, NULL, NULL, NULL, NULL, NULL, 16),
	('CHR', 59, NULL, NULL, NULL, NULL, NULL, 16),
	('CHR', 60, NULL, NULL, NULL, NULL, NULL, 18),
	('CHR', 61, NULL, NULL, NULL, NULL, NULL, 18),
	('CHR', 62, NULL, NULL, NULL, NULL, NULL, 18),
	('CHR', 63, NULL, NULL, NULL, NULL, NULL, 18),
	('CHR', 64, NULL, NULL, NULL, NULL, NULL, 18),
	('CHR', 65, NULL, NULL, NULL, NULL, NULL, 20),
	('CHR', 66, NULL, NULL, NULL, NULL, NULL, 20),
	('CHR', 67, NULL, NULL, NULL, NULL, NULL, 20),
	('CHR', 68, NULL, NULL, NULL, NULL, NULL, 20),
	('CHR', 69, NULL, NULL, NULL, NULL, NULL, 20),
	('CHR', 70, NULL, NULL, NULL, NULL, NULL, 22),
	('CHR', 71, NULL, NULL, NULL, NULL, NULL, 22),
	('CHR', 72, NULL, NULL, NULL, NULL, NULL, 22),
	('CHR', 73, NULL, NULL, NULL, NULL, NULL, 22),
	('CHR', 74, NULL, NULL, NULL, NULL, NULL, 22),
	('CHR', 75, NULL, NULL, NULL, NULL, NULL, 24),
	('CHR', 76, NULL, NULL, NULL, NULL, NULL, 24),
	('CHR', 77, NULL, NULL, NULL, NULL, NULL, 24),
	('CHR', 78, NULL, NULL, NULL, NULL, NULL, 24),
	('CHR', 79, NULL, NULL, NULL, NULL, NULL, 24),
	('CHR', 80, NULL, NULL, NULL, NULL, NULL, 26),
	('CHR', 81, NULL, NULL, NULL, NULL, NULL, 26),
	('CHR', 82, NULL, NULL, NULL, NULL, NULL, 26),
	('CHR', 83, NULL, NULL, NULL, NULL, NULL, 26),
	('CHR', 84, NULL, NULL, NULL, NULL, NULL, 26),
	('CHR', 85, NULL, NULL, NULL, NULL, NULL, 28),
	('CHR', 86, NULL, NULL, NULL, NULL, NULL, 28),
	('CHR', 87, NULL, NULL, NULL, NULL, NULL, 28),
	('CHR', 88, NULL, NULL, NULL, NULL, NULL, 28),
	('CHR', 89, NULL, NULL, NULL, NULL, NULL, 28),
	('CHR', 90, NULL, NULL, NULL, NULL, NULL, 30),
	('CHR', 91, NULL, NULL, NULL, NULL, NULL, 30),
	('CHR', 92, NULL, NULL, NULL, NULL, NULL, 30),
	('CHR', 93, NULL, NULL, NULL, NULL, NULL, 30),
	('CHR', 94, NULL, NULL, NULL, NULL, NULL, 30),
	('CHR', 95, NULL, NULL, NULL, NULL, NULL, 32),
	('CHR', 96, NULL, NULL, NULL, NULL, NULL, 32),
	('CHR', 97, NULL, NULL, NULL, NULL, NULL, 32),
	('CHR', 98, NULL, NULL, NULL, NULL, NULL, 32),
	('CHR', 99, NULL, NULL, NULL, NULL, NULL, 32),
	('CHR', 100, NULL, NULL, NULL, NULL, NULL, 34)
ON CONFLICT ("attribute_key", "score") DO UPDATE SET
	"max_carry" = EXCLUDED."max_carry",
	"max_lift" = EXCLUDED."max_lift",
	"max_spheres" = EXCLUDED."max_spheres",
	"spell_weaving" = EXCLUDED."spell_weaving",
	"teaching_base" = EXCLUDED."teaching_base",
	"loyalty_base" = EXCLUDED."loyalty_base";
--> statement-breakpoint

-- Firearm Skill canon, including its required Precision Ranged parent.
INSERT INTO "skill" (
  "name",
  "classification",
  "tier",
  "primary_attribute",
  "secondary_attribute",
  "definition",
  "source_system",
  "source_external_id"
) VALUES
  ('Precision Ranged', 'standard', 1, 'DEX', NULL, 'The foundational discipline of targeting with distance weapons using control, timing, and keen awareness. Precision Ranged isn’t about firepower—it’s about placement. It trains hand-eye coordination, breath management, and muscle memory. From bow to blade, the shot lands where you intend it.', 'serrian-tide-core', 'skill-54ddbeedb989b48cf76384f1262a3c72191781ee4e112cd3aa039d373a781aa2'),
  ('Firearm Mastery', 'standard', 2, 'DEX', NULL, 'Firearm Mastery trains the controlled use of handguns, rifles, shotguns, and other conventional firearms. It covers sight alignment, trigger control, weapon presentation, recoil recovery, target acquisition, and maintaining accuracy under pressure. The Skill represents practical shooting proficiency across firearm families before more specialized training is applied.', 'serrian-tide-core', 'skill-fbd3588eba38cf211cb6f64520373ed82c7cc2bac48ca131670f0c8a28a53604'),
  ('Handgun Mastery', 'standard', 3, 'DEX', NULL, 'Handgun Mastery specializes in pistols, revolvers, and similar compact firearms. Training emphasizes presentation, sight recovery, controlled follow-up shots, shooting from constrained positions, and maintaining accuracy with short sight radii and one- or two-handed grips.', 'serrian-tide-core', 'skill-ff96545a45c174e7e66de155a9deba37cd699eee2c418b600f5b3ab1a5a963ba'),
  ('Rifle Mastery', 'standard', 3, 'DEX', NULL, 'Rifle Mastery specializes in shoulder-fired rifles and carbines. It emphasizes stable firing positions, sight alignment, controlled trigger use, target transitions, range judgment, and maintaining precision from supported and unsupported positions.', 'serrian-tide-core', 'skill-6291ff297a9d1030d6c8a1ace511a9234f51836ece7844a42922397c204d53c8'),
  ('Shotgun Mastery', 'standard', 3, 'DEX', NULL, 'Shotgun Mastery specializes in smoothbore and shotgun-pattern firearms. It covers rapid target acquisition, recoil recovery, ammunition handling, pattern awareness, and effective use of shot, slug, and other compatible loads at appropriate ranges.', 'serrian-tide-core', 'skill-ec73e36889d80b972f3fbc4d6da3c31772a8fcbc99b6981abaec0c5fb96b19dd'),
  ('Automatic Fire Control', 'standard', 3, 'DEX', NULL, 'Automatic Fire Control trains the deliberate use of burst and fully automatic fire. It emphasizes muzzle control, burst discipline, target tracking, controlled sweep, ammunition management, and maintaining useful accuracy while repeated recoil attempts to drive the weapon off target.', 'serrian-tide-core', 'skill-d85ebe7958af14cb0cd9e890f81cd1bc4a62dba3f7c9a6ee7388e818584ee2e4')
ON CONFLICT ("source_system", "source_external_id")
WHERE "source_system" IS NOT NULL AND "source_external_id" IS NOT NULL
DO UPDATE SET
  "name" = EXCLUDED."name",
  "classification" = EXCLUDED."classification",
  "tier" = EXCLUDED."tier",
  "primary_attribute" = EXCLUDED."primary_attribute",
  "secondary_attribute" = EXCLUDED."secondary_attribute",
  "definition" = EXCLUDED."definition",
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "skill_relationship" (
  "skill_id",
  "related_skill_id",
  "relationship_type",
  "sort_order"
)
SELECT child."id", parent."id", 'parent', 0
FROM (VALUES
  ('skill-fbd3588eba38cf211cb6f64520373ed82c7cc2bac48ca131670f0c8a28a53604', 'skill-54ddbeedb989b48cf76384f1262a3c72191781ee4e112cd3aa039d373a781aa2'),
  ('skill-ff96545a45c174e7e66de155a9deba37cd699eee2c418b600f5b3ab1a5a963ba', 'skill-fbd3588eba38cf211cb6f64520373ed82c7cc2bac48ca131670f0c8a28a53604'),
  ('skill-6291ff297a9d1030d6c8a1ace511a9234f51836ece7844a42922397c204d53c8', 'skill-fbd3588eba38cf211cb6f64520373ed82c7cc2bac48ca131670f0c8a28a53604'),
  ('skill-ec73e36889d80b972f3fbc4d6da3c31772a8fcbc99b6981abaec0c5fb96b19dd', 'skill-fbd3588eba38cf211cb6f64520373ed82c7cc2bac48ca131670f0c8a28a53604'),
  ('skill-d85ebe7958af14cb0cd9e890f81cd1bc4a62dba3f7c9a6ee7388e818584ee2e4', 'skill-fbd3588eba38cf211cb6f64520373ed82c7cc2bac48ca131670f0c8a28a53604')
) AS canonical("child_external_id", "parent_external_id")
INNER JOIN "skill" AS child
  ON child."source_system" = 'serrian-tide-core'
  AND child."source_external_id" = canonical."child_external_id"
INNER JOIN "skill" AS parent
  ON parent."source_system" = 'serrian-tide-core'
  AND parent."source_external_id" = canonical."parent_external_id"
ON CONFLICT ("skill_id", "related_skill_id", "relationship_type")
DO UPDATE SET "sort_order" = EXCLUDED."sort_order";
