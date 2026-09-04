CREATE TABLE "campaign_character_firearm_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_instance_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"preparation_id" integer,
	"event_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"before_state_json" jsonb,
	"after_state_json" jsonb,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_firearm_event_kind_nonblank" CHECK (length(trim("campaign_character_firearm_event"."event_kind")) > 0),
	CONSTRAINT "campaign_character_firearm_event_before_object" CHECK ("campaign_character_firearm_event"."before_state_json" IS NULL OR jsonb_typeof("campaign_character_firearm_event"."before_state_json") = 'object'),
	CONSTRAINT "campaign_character_firearm_event_after_object" CHECK ("campaign_character_firearm_event"."after_state_json" IS NULL OR jsonb_typeof("campaign_character_firearm_event"."after_state_json") = 'object'),
	CONSTRAINT "campaign_character_firearm_event_metadata_object" CHECK (jsonb_typeof("campaign_character_firearm_event"."metadata_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "campaign_character_firearm_preparation" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_instance_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"weapon_profile_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"action_declaration_id" integer,
	"pending_action_id" integer,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"state_version" integer NOT NULL,
	"target_firing_mode_id" integer,
	"ammunition_item_id" integer,
	"ammunition_profile_id" integer,
	"requested_rounds" integer,
	"replace_current_load" boolean DEFAULT false NOT NULL,
	"partial_load_disposition" text DEFAULT 'none' NOT NULL,
	"initiative_cost" integer NOT NULL,
	"timing_source" text NOT NULL,
	"frozen_snapshot_json" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"resolved_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "campaign_character_firearm_preparation_hierarchy_uq" UNIQUE("id","item_instance_id","campaign_id","character_id"),
	CONSTRAINT "campaign_character_firearm_preparation_operation_valid" CHECK ("campaign_character_firearm_preparation"."operation" IN ('draw','ready','load','reload','unload','change-mode','cycle','recover-recoil')),
	CONSTRAINT "campaign_character_firearm_preparation_status_valid" CHECK ("campaign_character_firearm_preparation"."status" IN ('pending','interrupted','completed','cancelled','requires-god-ruling','manual-handling')),
	CONSTRAINT "campaign_character_firearm_preparation_state_version_positive" CHECK ("campaign_character_firearm_preparation"."state_version" > 0),
	CONSTRAINT "campaign_character_firearm_preparation_requested_rounds_valid" CHECK ("campaign_character_firearm_preparation"."requested_rounds" IS NULL OR "campaign_character_firearm_preparation"."requested_rounds" > 0),
	CONSTRAINT "campaign_character_firearm_preparation_disposition_valid" CHECK ("campaign_character_firearm_preparation"."partial_load_disposition" IN ('none','retain','discard')),
	CONSTRAINT "campaign_character_firearm_preparation_cost_nonnegative" CHECK ("campaign_character_firearm_preparation"."initiative_cost" >= 0),
	CONSTRAINT "campaign_character_firearm_preparation_timing_source_valid" CHECK ("campaign_character_firearm_preparation"."timing_source" IN ('canonical','god-ruling')),
	CONSTRAINT "campaign_character_firearm_preparation_snapshot_object" CHECK (jsonb_typeof("campaign_character_firearm_preparation"."frozen_snapshot_json") = 'object'),
	CONSTRAINT "campaign_character_firearm_preparation_idempotency_nonblank" CHECK (length(trim("campaign_character_firearm_preparation"."idempotency_key")) > 0),
	CONSTRAINT "campaign_character_firearm_preparation_action_identity_valid" CHECK (("campaign_character_firearm_preparation"."action_declaration_id" IS NULL AND "campaign_character_firearm_preparation"."pending_action_id" IS NULL AND "campaign_character_firearm_preparation"."initiative_cost" = 0) OR ("campaign_character_firearm_preparation"."action_declaration_id" IS NOT NULL AND "campaign_character_firearm_preparation"."pending_action_id" IS NOT NULL AND "campaign_character_firearm_preparation"."initiative_cost" > 0)),
	CONSTRAINT "campaign_character_firearm_preparation_reason_valid" CHECK (("campaign_character_firearm_preparation"."timing_source" <> 'god-ruling' AND "campaign_character_firearm_preparation"."partial_load_disposition" <> 'discard' AND "campaign_character_firearm_preparation"."status" NOT IN ('requires-god-ruling','manual-handling')) OR length(trim("campaign_character_firearm_preparation"."reason")) > 0),
	CONSTRAINT "campaign_character_firearm_preparation_lifecycle_valid" CHECK (("campaign_character_firearm_preparation"."status" IN ('completed','cancelled','manual-handling') AND "campaign_character_firearm_preparation"."resolved_at" IS NOT NULL AND "campaign_character_firearm_preparation"."resolved_by_user_id" IS NOT NULL) OR ("campaign_character_firearm_preparation"."status" IN ('pending','interrupted','requires-god-ruling') AND "campaign_character_firearm_preparation"."resolved_at" IS NULL AND "campaign_character_firearm_preparation"."resolved_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "campaign_character_firearm_state" (
	"item_instance_id" integer PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"weapon_profile_id" integer NOT NULL,
	"selected_firing_mode_id" integer NOT NULL,
	"loaded_ammunition_item_id" integer,
	"loaded_ammunition_profile_id" integer,
	"loaded_ammunition_unit_cost_credits" double precision,
	"loaded_rounds" integer DEFAULT 0 NOT NULL,
	"capacity_rounds" integer,
	"capacity_source" text,
	"readiness_mode" text,
	"readiness_mode_source" text,
	"readied" boolean DEFAULT false NOT NULL,
	"requires_cycling" boolean DEFAULT false NOT NULL,
	"requires_recoil_recovery" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"initialization_key" text NOT NULL,
	"initialized_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_firearm_state_runtime_identity_uq" UNIQUE("item_instance_id","campaign_id","character_id","item_id","weapon_profile_id"),
	CONSTRAINT "campaign_character_firearm_state_owner_identity_uq" UNIQUE("item_instance_id","campaign_id","character_id"),
	CONSTRAINT "campaign_character_firearm_state_loaded_nonnegative" CHECK ("campaign_character_firearm_state"."loaded_rounds" >= 0),
	CONSTRAINT "campaign_character_firearm_state_capacity_positive" CHECK ("campaign_character_firearm_state"."capacity_rounds" IS NULL OR "campaign_character_firearm_state"."capacity_rounds" > 0),
	CONSTRAINT "campaign_character_firearm_state_capacity_source_valid" CHECK (("campaign_character_firearm_state"."capacity_rounds" IS NULL AND "campaign_character_firearm_state"."capacity_source" IS NULL) OR ("campaign_character_firearm_state"."capacity_rounds" IS NOT NULL AND "campaign_character_firearm_state"."capacity_source" IN ('canonical','god-ruling'))),
	CONSTRAINT "campaign_character_firearm_state_readiness_mode_valid" CHECK (("campaign_character_firearm_state"."readiness_mode" IS NULL AND "campaign_character_firearm_state"."readiness_mode_source" IS NULL) OR ("campaign_character_firearm_state"."readiness_mode" IN ('draw-is-ready','separate-ready-action') AND "campaign_character_firearm_state"."readiness_mode_source" IN ('canonical','god-ruling'))),
	CONSTRAINT "campaign_character_firearm_state_readied_relationship_valid" CHECK (NOT "campaign_character_firearm_state"."readied" OR "campaign_character_firearm_state"."readiness_mode" IS NOT NULL),
	CONSTRAINT "campaign_character_firearm_state_ammunition_identity_valid" CHECK (("campaign_character_firearm_state"."loaded_rounds" = 0 AND "campaign_character_firearm_state"."loaded_ammunition_item_id" IS NULL AND "campaign_character_firearm_state"."loaded_ammunition_profile_id" IS NULL AND "campaign_character_firearm_state"."loaded_ammunition_unit_cost_credits" IS NULL) OR ("campaign_character_firearm_state"."loaded_rounds" > 0 AND "campaign_character_firearm_state"."loaded_ammunition_item_id" IS NOT NULL AND "campaign_character_firearm_state"."loaded_ammunition_profile_id" IS NOT NULL AND "campaign_character_firearm_state"."loaded_ammunition_unit_cost_credits" >= 0)),
	CONSTRAINT "campaign_character_firearm_state_within_capacity" CHECK ("campaign_character_firearm_state"."capacity_rounds" IS NULL OR "campaign_character_firearm_state"."loaded_rounds" <= "campaign_character_firearm_state"."capacity_rounds"),
	CONSTRAINT "campaign_character_firearm_state_version_positive" CHECK ("campaign_character_firearm_state"."version" > 0),
	CONSTRAINT "campaign_character_firearm_state_initialization_nonblank" CHECK (length(trim("campaign_character_firearm_state"."initialization_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "capacity_rounds" integer;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "readiness_mode" text;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "draw_initiative_cost" integer;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "ready_initiative_cost" integer;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "reload_initiative_cost" integer;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "unload_initiative_cost" integer;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "firing_mode_change_initiative_cost" integer;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "campaign_character_item_instance_exact_identity_uq" UNIQUE("id","character_id","item_id");--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_event" ADD CONSTRAINT "campaign_character_firearm_event_state_fk" FOREIGN KEY ("item_instance_id","campaign_id","character_id") REFERENCES "public"."campaign_character_firearm_state"("item_instance_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_event" ADD CONSTRAINT "campaign_character_firearm_event_preparation_fk" FOREIGN KEY ("preparation_id","item_instance_id","campaign_id","character_id") REFERENCES "public"."campaign_character_firearm_preparation"("id","item_instance_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_event" ADD CONSTRAINT "campaign_character_firearm_event_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_preparation" ADD CONSTRAINT "campaign_character_firearm_preparation_state_fk" FOREIGN KEY ("item_instance_id","campaign_id","character_id","item_id","weapon_profile_id") REFERENCES "public"."campaign_character_firearm_state"("item_instance_id","campaign_id","character_id","item_id","weapon_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_preparation" ADD CONSTRAINT "campaign_character_firearm_preparation_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_preparation" ADD CONSTRAINT "campaign_character_firearm_preparation_declaration_fk" FOREIGN KEY ("action_declaration_id","pending_action_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_action_declaration"("id","pending_action_id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_preparation" ADD CONSTRAINT "campaign_character_firearm_preparation_target_mode_fk" FOREIGN KEY ("target_firing_mode_id","weapon_profile_id") REFERENCES "public"."weapon_firing_modes"("id","weapon_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_preparation" ADD CONSTRAINT "campaign_character_firearm_preparation_ammunition_profile_fk" FOREIGN KEY ("ammunition_profile_id","ammunition_item_id") REFERENCES "public"."weapon_profiles"("id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_preparation" ADD CONSTRAINT "campaign_character_firearm_preparation_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_preparation" ADD CONSTRAINT "campaign_character_firearm_preparation_resolved_by_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_state" ADD CONSTRAINT "campaign_character_firearm_state_character_campaign_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_state" ADD CONSTRAINT "campaign_character_firearm_state_owned_instance_fk" FOREIGN KEY ("item_instance_id","character_id","item_id") REFERENCES "public"."campaign_character_item_instance"("id","character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_state" ADD CONSTRAINT "campaign_character_firearm_state_profile_item_fk" FOREIGN KEY ("weapon_profile_id","item_id") REFERENCES "public"."weapon_profiles"("id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_state" ADD CONSTRAINT "campaign_character_firearm_state_mode_profile_fk" FOREIGN KEY ("selected_firing_mode_id","weapon_profile_id") REFERENCES "public"."weapon_firing_modes"("id","weapon_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_state" ADD CONSTRAINT "campaign_character_firearm_state_ammunition_profile_fk" FOREIGN KEY ("loaded_ammunition_profile_id","loaded_ammunition_item_id") REFERENCES "public"."weapon_profiles"("id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_state" ADD CONSTRAINT "campaign_character_firearm_state_ammunition_item_fk" FOREIGN KEY ("loaded_ammunition_item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_state" ADD CONSTRAINT "campaign_character_firearm_state_initialized_by_fk" FOREIGN KEY ("initialized_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_state" ADD CONSTRAINT "campaign_character_firearm_state_updated_by_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_character_firearm_event_history_idx" ON "campaign_character_firearm_event" USING btree ("item_instance_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_character_firearm_event_campaign_idx" ON "campaign_character_firearm_event" USING btree ("campaign_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_firearm_preparation_idempotency_uq" ON "campaign_character_firearm_preparation" USING btree ("campaign_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_firearm_preparation_one_open_uq" ON "campaign_character_firearm_preparation" USING btree ("item_instance_id") WHERE "campaign_character_firearm_preparation"."status" IN ('pending','interrupted','requires-god-ruling');--> statement-breakpoint
CREATE INDEX "campaign_character_firearm_preparation_encounter_idx" ON "campaign_character_firearm_preparation" USING btree ("encounter_id","status","created_at");--> statement-breakpoint
CREATE INDEX "campaign_character_firearm_state_character_idx" ON "campaign_character_firearm_state" USING btree ("campaign_id","character_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_firearm_state_initialization_uq" ON "campaign_character_firearm_state" USING btree ("campaign_id","initialization_key");--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_capacity_rounds_valid" CHECK ("weapon_profiles"."capacity_rounds" IS NULL OR "weapon_profiles"."capacity_rounds" > 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_readiness_mode_valid" CHECK ("weapon_profiles"."readiness_mode" IS NULL OR "weapon_profiles"."readiness_mode" IN ('draw-is-ready','separate-ready-action'));--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_draw_cost_valid" CHECK ("weapon_profiles"."draw_initiative_cost" IS NULL OR "weapon_profiles"."draw_initiative_cost" >= 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_ready_cost_valid" CHECK ("weapon_profiles"."ready_initiative_cost" IS NULL OR "weapon_profiles"."ready_initiative_cost" >= 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_reload_cost_valid" CHECK ("weapon_profiles"."reload_initiative_cost" IS NULL OR "weapon_profiles"."reload_initiative_cost" >= 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_unload_cost_valid" CHECK ("weapon_profiles"."unload_initiative_cost" IS NULL OR "weapon_profiles"."unload_initiative_cost" >= 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_mode_change_cost_valid" CHECK ("weapon_profiles"."firing_mode_change_initiative_cost" IS NULL OR "weapon_profiles"."firing_mode_change_initiative_cost" >= 0);
