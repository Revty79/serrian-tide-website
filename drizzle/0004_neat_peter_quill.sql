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
	CONSTRAINT "weapon_profiles_ammo_not_self" CHECK ("weapon_profiles"."ammunition_item_id" IS NULL OR "weapon_profiles"."ammunition_item_id" <> "weapon_profiles"."item_id")
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
	CONSTRAINT "campaign_character_profile_age_valid" CHECK ("campaign_character_profile"."age" IS NULL OR "campaign_character_profile"."age" >= 0),
	CONSTRAINT "campaign_character_profile_height_valid" CHECK ("campaign_character_profile"."height" IS NULL OR "campaign_character_profile"."height" >= 0),
	CONSTRAINT "campaign_character_profile_height_feet_valid" CHECK ("campaign_character_profile"."height_feet" IS NULL OR "campaign_character_profile"."height_feet" >= 0),
	CONSTRAINT "campaign_character_profile_height_inches_valid" CHECK ("campaign_character_profile"."height_inches" IS NULL OR ("campaign_character_profile"."height_inches" >= 0 AND "campaign_character_profile"."height_inches" <= 11)),
	CONSTRAINT "campaign_character_profile_weight_valid" CHECK ("campaign_character_profile"."weight" IS NULL OR "campaign_character_profile"."weight" >= 0),
	CONSTRAINT "campaign_character_profile_progress_valid" CHECK ("campaign_character_profile"."fame" >= 0 AND "campaign_character_profile"."experience" >= 0 AND "campaign_character_profile"."total_experience" >= 0 AND "campaign_character_profile"."quintessence" >= 0 AND "campaign_character_profile"."total_quintessence" >= 0),
	CONSTRAINT "campaign_character_profile_credits_valid" CHECK ("campaign_character_profile"."credits_remaining" >= 0),
	CONSTRAINT "campaign_character_profile_fate_valid" CHECK ("campaign_character_profile"."fate_points" IS NULL OR "campaign_character_profile"."fate_points" >= 0)
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