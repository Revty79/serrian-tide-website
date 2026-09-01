CREATE TABLE "creature_ability_effects" (
	"id" serial PRIMARY KEY NOT NULL,
	"ability_id" integer NOT NULL,
	"effect_key" text NOT NULL,
	"schema_version" integer NOT NULL,
	"effect_json" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_ability_effects_ability_key_uq" UNIQUE("ability_id","effect_key"),
	CONSTRAINT "creature_ability_effects_ability_order_uq" UNIQUE("ability_id","sort_order"),
	CONSTRAINT "creature_ability_effects_key_nonblank" CHECK (length(trim("creature_ability_effects"."effect_key")) > 0),
	CONSTRAINT "creature_ability_effects_schema_version_positive" CHECK ("creature_ability_effects"."schema_version" > 0),
	CONSTRAINT "creature_ability_effects_sort_order_nonnegative" CHECK ("creature_ability_effects"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_effects" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"effect_json" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_effects_schema_version_valid" CHECK ("item_effects"."schema_version" > 0),
	CONSTRAINT "item_effects_sort_order_valid" CHECK ("item_effects"."sort_order" >= 0),
	CONSTRAINT "item_effects_json_object" CHECK (jsonb_typeof("item_effects"."effect_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "item_passive_effects" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"required_equipment_state" text NOT NULL,
	"schema_version" integer NOT NULL,
	"effect_json" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_passive_effects_required_state_valid" CHECK ("item_passive_effects"."required_equipment_state" IN ('equipped','worn','wielded')),
	CONSTRAINT "item_passive_effects_schema_version_valid" CHECK ("item_passive_effects"."schema_version" > 0),
	CONSTRAINT "item_passive_effects_sort_order_valid" CHECK ("item_passive_effects"."sort_order" >= 0),
	CONSTRAINT "item_passive_effects_json_object" CHECK (jsonb_typeof("item_passive_effects"."effect_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "item_runtime_profiles" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"use_mode" text DEFAULT 'none' NOT NULL,
	"quantity_per_use" integer,
	"maximum_charges" integer,
	"charges_per_use" integer,
	"recharge_notes" text DEFAULT '' NOT NULL,
	"activation_label" text DEFAULT 'Use' NOT NULL,
	"use_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_runtime_profiles_mode_valid" CHECK ("item_runtime_profiles"."use_mode" IN ('none', 'consume-item', 'charges', 'unlimited')),
	CONSTRAINT "item_runtime_profiles_activation_label_nonblank" CHECK (length(trim("item_runtime_profiles"."activation_label")) > 0),
	CONSTRAINT "item_runtime_profiles_fields_valid" CHECK ((
        ("item_runtime_profiles"."use_mode" IN ('none', 'unlimited') AND "item_runtime_profiles"."quantity_per_use" IS NULL AND "item_runtime_profiles"."maximum_charges" IS NULL AND "item_runtime_profiles"."charges_per_use" IS NULL)
        OR ("item_runtime_profiles"."use_mode" = 'consume-item' AND "item_runtime_profiles"."quantity_per_use" > 0 AND "item_runtime_profiles"."maximum_charges" IS NULL AND "item_runtime_profiles"."charges_per_use" IS NULL)
        OR ("item_runtime_profiles"."use_mode" = 'charges' AND "item_runtime_profiles"."quantity_per_use" IS NULL AND "item_runtime_profiles"."maximum_charges" > 0 AND "item_runtime_profiles"."charges_per_use" > 0 AND "item_runtime_profiles"."charges_per_use" <= "item_runtime_profiles"."maximum_charges")
      ))
);
--> statement-breakpoint
CREATE TABLE "campaign_character_active_condition" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_effect_key" text,
	"duration_kind" text NOT NULL,
	"duration_value" integer,
	"duration_label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolution_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "campaign_character_active_condition_name_nonblank" CHECK (length(trim("campaign_character_active_condition"."name")) > 0),
	CONSTRAINT "campaign_character_active_condition_source_kind_valid" CHECK ("campaign_character_active_condition"."source_kind" IN ('item','spell','creature-ability','god','system')),
	CONSTRAINT "campaign_character_active_condition_source_nonblank" CHECK (length(trim("campaign_character_active_condition"."source_id")) > 0 AND length(trim("campaign_character_active_condition"."source_name")) > 0),
	CONSTRAINT "campaign_character_active_condition_duration_kind_valid" CHECK ("campaign_character_active_condition"."duration_kind" IN ('until-removed','combat-steps','combat-rounds','scene')),
	CONSTRAINT "campaign_character_active_condition_duration_valid" CHECK (("campaign_character_active_condition"."duration_kind" IN ('combat-steps','combat-rounds') AND "campaign_character_active_condition"."duration_value" > 0) OR ("campaign_character_active_condition"."duration_kind" IN ('until-removed','scene') AND "campaign_character_active_condition"."duration_value" IS NULL)),
	CONSTRAINT "campaign_character_active_condition_duration_label_nonblank" CHECK (length(trim("campaign_character_active_condition"."duration_label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_active_health" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"total_damage" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_active_health_total_damage_valid" CHECK ("campaign_character_active_health"."total_damage" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_active_health_pool" (
	"character_id" integer NOT NULL,
	"pool_key" text NOT NULL,
	"pool_name_snapshot" text NOT NULL,
	"damage" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_active_health_pool_character_id_pool_key_pk" PRIMARY KEY("character_id","pool_key"),
	CONSTRAINT "campaign_character_active_health_pool_key_nonblank" CHECK (length(trim("campaign_character_active_health_pool"."pool_key")) > 0),
	CONSTRAINT "campaign_character_active_health_pool_name_nonblank" CHECK (length(trim("campaign_character_active_health_pool"."pool_name_snapshot")) > 0),
	CONSTRAINT "campaign_character_active_health_pool_damage_valid" CHECK ("campaign_character_active_health_pool"."damage" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_active_mana" (
	"character_id" integer NOT NULL,
	"system" text NOT NULL,
	"mana_spent" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_active_mana_character_id_system_pk" PRIMARY KEY("character_id","system"),
	CONSTRAINT "campaign_character_active_mana_system_valid" CHECK ("campaign_character_active_mana"."system" IN ('Spellcraft', 'Talismanism', 'Faith', 'Psyonics', 'Bardic Resonance')),
	CONSTRAINT "campaign_character_active_mana_spent_valid" CHECK ("campaign_character_active_mana"."mana_spent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_active_modifier" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"label" text NOT NULL,
	"modifier_channel" text NOT NULL,
	"target_key" text NOT NULL,
	"amount" integer NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_effect_key" text,
	"duration_kind" text NOT NULL,
	"duration_value" integer,
	"duration_label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"end_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "campaign_character_active_modifier_label_nonblank" CHECK (length(trim("campaign_character_active_modifier"."label")) > 0),
	CONSTRAINT "campaign_character_active_modifier_channel_valid" CHECK ("campaign_character_active_modifier"."modifier_channel" IN ('attribute','skill','movement','initiative','soak','damage')),
	CONSTRAINT "campaign_character_active_modifier_target_nonblank" CHECK (length(trim("campaign_character_active_modifier"."target_key")) > 0),
	CONSTRAINT "campaign_character_active_modifier_amount_nonzero" CHECK ("campaign_character_active_modifier"."amount" <> 0),
	CONSTRAINT "campaign_character_active_modifier_source_kind_valid" CHECK ("campaign_character_active_modifier"."source_kind" IN ('item','spell','creature-ability','god','system')),
	CONSTRAINT "campaign_character_active_modifier_source_nonblank" CHECK (length(trim("campaign_character_active_modifier"."source_id")) > 0 AND length(trim("campaign_character_active_modifier"."source_name")) > 0),
	CONSTRAINT "campaign_character_active_modifier_duration_kind_valid" CHECK ("campaign_character_active_modifier"."duration_kind" IN ('until-removed','combat-steps','combat-rounds','scene')),
	CONSTRAINT "campaign_character_active_modifier_duration_valid" CHECK (("campaign_character_active_modifier"."duration_kind" IN ('combat-steps','combat-rounds') AND "campaign_character_active_modifier"."duration_value" > 0) OR ("campaign_character_active_modifier"."duration_kind" IN ('until-removed','scene') AND "campaign_character_active_modifier"."duration_value" IS NULL)),
	CONSTRAINT "campaign_character_active_modifier_duration_label_nonblank" CHECK (length(trim("campaign_character_active_modifier"."duration_label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_injury" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"pool_key" text NOT NULL,
	"pool_name_snapshot" text NOT NULL,
	"hit_location_number" integer,
	"hit_location_name_snapshot" text,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"damage_amount" double precision,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_injury_pool_key_nonblank" CHECK (length(trim("campaign_character_injury"."pool_key")) > 0),
	CONSTRAINT "campaign_character_injury_pool_name_nonblank" CHECK (length(trim("campaign_character_injury"."pool_name_snapshot")) > 0),
	CONSTRAINT "campaign_character_injury_name_nonblank" CHECK (length(trim("campaign_character_injury"."name")) > 0),
	CONSTRAINT "campaign_character_injury_location_valid" CHECK ("campaign_character_injury"."hit_location_number" IS NULL OR "campaign_character_injury"."hit_location_number" BETWEEN 0 AND 9),
	CONSTRAINT "campaign_character_injury_damage_valid" CHECK ("campaign_character_injury"."damage_amount" IS NULL OR "campaign_character_injury"."damage_amount" >= 0),
	CONSTRAINT "campaign_character_injury_resolution_valid" CHECK (("campaign_character_injury"."resolved" = false AND "campaign_character_injury"."resolved_at" IS NULL) OR ("campaign_character_injury"."resolved" = true AND "campaign_character_injury"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "campaign_character_item_equipment_state" (
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"state" text NOT NULL,
	"quantity" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_item_equipment_state_character_id_item_id_state_pk" PRIMARY KEY("character_id","item_id","state"),
	CONSTRAINT "campaign_character_item_equipment_state_state_valid" CHECK ("campaign_character_item_equipment_state"."state" IN ('equipped','worn','wielded')),
	CONSTRAINT "campaign_character_item_equipment_state_quantity_valid" CHECK ("campaign_character_item_equipment_state"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_character_item_instance" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"current_charges" integer NOT NULL,
	"equipment_state" text DEFAULT 'inactive' NOT NULL,
	"unit_cost_credits" double precision NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_item_instance_charges_valid" CHECK ("campaign_character_item_instance"."current_charges" >= 0),
	CONSTRAINT "campaign_character_item_instance_equipment_state_valid" CHECK ("campaign_character_item_instance"."equipment_state" IN ('inactive','equipped','worn','wielded')),
	CONSTRAINT "campaign_character_item_instance_cost_valid" CHECK ("campaign_character_item_instance"."unit_cost_credits" >= 0)
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_magical" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_character_profile" ADD COLUMN "base_movement_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_character_profile" ADD COLUMN "base_magic_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_ability_effects" ADD CONSTRAINT "creature_ability_effects_ability_id_creature_abilities_id_fk" FOREIGN KEY ("ability_id") REFERENCES "public"."creature_abilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_effects" ADD CONSTRAINT "item_effects_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_passive_effects" ADD CONSTRAINT "item_passive_effects_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_runtime_profiles" ADD CONSTRAINT "item_runtime_profiles_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_active_condition" ADD CONSTRAINT "campaign_character_active_condition_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_active_health" ADD CONSTRAINT "campaign_character_active_health_character_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_active_health_pool" ADD CONSTRAINT "campaign_character_active_health_pool_health_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character_active_health"("character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_active_mana" ADD CONSTRAINT "campaign_character_active_mana_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_active_modifier" ADD CONSTRAINT "campaign_character_active_modifier_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_injury" ADD CONSTRAINT "campaign_character_injury_health_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character_active_health"("character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_item_equipment_state" ADD CONSTRAINT "campaign_character_item_equipment_state_ownership_fk" FOREIGN KEY ("character_id","item_id") REFERENCES "public"."campaign_character_item"("character_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "campaign_character_item_instance_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "campaign_character_item_instance_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creature_ability_effects_ability_id_idx" ON "creature_ability_effects" USING btree ("ability_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_effects_order_uq" ON "item_effects" USING btree ("item_id","sort_order");--> statement-breakpoint
CREATE INDEX "item_effects_item_id_idx" ON "item_effects" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_passive_effects_item_order_idx" ON "item_passive_effects" USING btree ("item_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "campaign_character_active_condition_state_idx" ON "campaign_character_active_condition" USING btree ("character_id","resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "campaign_character_active_health_pool_damage_idx" ON "campaign_character_active_health_pool" USING btree ("character_id","damage");--> statement-breakpoint
CREATE INDEX "campaign_character_active_mana_system_idx" ON "campaign_character_active_mana" USING btree ("system","character_id");--> statement-breakpoint
CREATE INDEX "campaign_character_active_modifier_state_idx" ON "campaign_character_active_modifier" USING btree ("character_id","ended_at","modifier_channel","target_key");--> statement-breakpoint
CREATE INDEX "campaign_character_injury_state_idx" ON "campaign_character_injury" USING btree ("character_id","resolved","created_at");--> statement-breakpoint
CREATE INDEX "campaign_character_injury_pool_idx" ON "campaign_character_injury" USING btree ("character_id","pool_key");--> statement-breakpoint
CREATE INDEX "campaign_character_item_equipment_state_item_idx" ON "campaign_character_item_equipment_state" USING btree ("item_id","character_id");--> statement-breakpoint
CREATE INDEX "campaign_character_item_instance_character_idx" ON "campaign_character_item_instance" USING btree ("character_id","item_id");--> statement-breakpoint
CREATE INDEX "campaign_character_item_instance_catalog_idx" ON "campaign_character_item_instance" USING btree ("item_id","character_id");--> statement-breakpoint
ALTER TABLE "campaign_character_profile" ADD CONSTRAINT "campaign_character_profile_base_movement_steps_valid" CHECK ("campaign_character_profile"."base_movement_steps" >= 0);--> statement-breakpoint
ALTER TABLE "campaign_character_profile" ADD CONSTRAINT "campaign_character_profile_base_magic_steps_valid" CHECK ("campaign_character_profile"."base_magic_steps" >= 0);