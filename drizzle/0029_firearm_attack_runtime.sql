CREATE TABLE "campaign_session_encounter_firearm_attack" (
	"id" serial PRIMARY KEY NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"actor_participant_id" integer NOT NULL,
	"target_participant_id" integer NOT NULL,
	"item_instance_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"weapon_profile_id" integer NOT NULL,
	"firing_mode_id" integer NOT NULL,
	"ammunition_item_id" integer NOT NULL,
	"ammunition_profile_id" integer NOT NULL,
	"aim_declaration_id" integer,
	"aim_pending_action_id" integer,
	"trigger_declaration_id" integer NOT NULL,
	"trigger_pending_action_id" integer,
	"attack_roll_id" integer,
	"effect_plan_id" integer,
	"status" text NOT NULL,
	"state_version_before" integer NOT NULL,
	"aim_initiative" integer DEFAULT 0 NOT NULL,
	"called_shot_declared" boolean DEFAULT false NOT NULL,
	"called_shot_objective" text DEFAULT '' NOT NULL,
	"called_shot_location_number" integer,
	"called_shot_penalty" double precision,
	"called_shot_reason" text DEFAULT '' NOT NULL,
	"firing_duration_initiative" integer DEFAULT 1 NOT NULL,
	"rounds_per_cadence" integer NOT NULL,
	"rounds_declared" integer NOT NULL,
	"rounds_consumed" integer DEFAULT 0 NOT NULL,
	"rounds_loaded_before" integer NOT NULL,
	"rounds_loaded_after" integer,
	"final_target" double precision NOT NULL,
	"frozen_snapshot_json" jsonb NOT NULL,
	"governing_snapshot_json" jsonb NOT NULL,
	"attack_roll_snapshot_json" jsonb,
	"defense_resolution_json" jsonb,
	"bullet_allocation_json" jsonb,
	"damage_resolution_json" jsonb,
	"post_shot_state_json" jsonb,
	"ruling_reasons_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"fired_by_user_id" text,
	"cancelled_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"fired_at" timestamp,
	"cancelled_at" timestamp,
	CONSTRAINT "campaign_session_encounter_firearm_attack_hierarchy_uq" UNIQUE("id","encounter_id","scene_id","session_id","campaign_id"),
	CONSTRAINT "campaign_session_encounter_firearm_attack_status_valid" CHECK ("campaign_session_encounter_firearm_attack"."status" IN ('aiming','trigger-ready','committed','fired-awaiting-timing','consequence-planned','requires-god-ruling','cancelled')),
	CONSTRAINT "campaign_session_encounter_firearm_attack_identity_distinct" CHECK ("campaign_session_encounter_firearm_attack"."actor_participant_id" > 0 AND "campaign_session_encounter_firearm_attack"."target_participant_id" <> "campaign_session_encounter_firearm_attack"."actor_participant_id"),
	CONSTRAINT "campaign_session_encounter_firearm_attack_state_version_positive" CHECK ("campaign_session_encounter_firearm_attack"."state_version_before" > 0),
	CONSTRAINT "campaign_session_encounter_firearm_attack_aim_nonnegative" CHECK ("campaign_session_encounter_firearm_attack"."aim_initiative" >= 0),
	CONSTRAINT "campaign_session_encounter_firearm_attack_called_shot_valid" CHECK ((NOT "campaign_session_encounter_firearm_attack"."called_shot_declared" AND "campaign_session_encounter_firearm_attack"."called_shot_objective" = '' AND "campaign_session_encounter_firearm_attack"."called_shot_location_number" IS NULL AND "campaign_session_encounter_firearm_attack"."called_shot_penalty" IS NULL AND "campaign_session_encounter_firearm_attack"."called_shot_reason" = '') OR ("campaign_session_encounter_firearm_attack"."called_shot_declared" AND length(trim("campaign_session_encounter_firearm_attack"."called_shot_objective")) > 0 AND "campaign_session_encounter_firearm_attack"."called_shot_penalty" >= 0 AND length(trim("campaign_session_encounter_firearm_attack"."called_shot_reason")) > 0)),
	CONSTRAINT "campaign_session_encounter_firearm_attack_rounds_positive" CHECK ("campaign_session_encounter_firearm_attack"."firing_duration_initiative" > 0 AND "campaign_session_encounter_firearm_attack"."rounds_per_cadence" > 0 AND "campaign_session_encounter_firearm_attack"."rounds_declared" > 0),
	CONSTRAINT "campaign_session_encounter_firearm_attack_consumption_valid" CHECK ("campaign_session_encounter_firearm_attack"."rounds_consumed" >= 0 AND "campaign_session_encounter_firearm_attack"."rounds_consumed" <= "campaign_session_encounter_firearm_attack"."rounds_declared" AND "campaign_session_encounter_firearm_attack"."rounds_loaded_before" >= "campaign_session_encounter_firearm_attack"."rounds_declared" AND ("campaign_session_encounter_firearm_attack"."rounds_loaded_after" IS NULL OR "campaign_session_encounter_firearm_attack"."rounds_loaded_after" >= 0)),
	CONSTRAINT "campaign_session_encounter_firearm_attack_aim_identity_valid" CHECK (("campaign_session_encounter_firearm_attack"."aim_initiative" = 0 AND "campaign_session_encounter_firearm_attack"."aim_declaration_id" IS NULL AND "campaign_session_encounter_firearm_attack"."aim_pending_action_id" IS NULL) OR ("campaign_session_encounter_firearm_attack"."aim_initiative" > 0 AND "campaign_session_encounter_firearm_attack"."aim_declaration_id" IS NOT NULL AND "campaign_session_encounter_firearm_attack"."aim_pending_action_id" IS NOT NULL)),
	CONSTRAINT "campaign_session_encounter_firearm_attack_trigger_identity_valid" CHECK (("campaign_session_encounter_firearm_attack"."trigger_pending_action_id" IS NULL AND "campaign_session_encounter_firearm_attack"."status" IN ('aiming','trigger-ready','cancelled')) OR ("campaign_session_encounter_firearm_attack"."trigger_pending_action_id" IS NOT NULL AND "campaign_session_encounter_firearm_attack"."status" NOT IN ('aiming','trigger-ready'))),
	CONSTRAINT "campaign_session_encounter_firearm_attack_fire_state_valid" CHECK (("campaign_session_encounter_firearm_attack"."fired_at" IS NULL AND "campaign_session_encounter_firearm_attack"."fired_by_user_id" IS NULL AND "campaign_session_encounter_firearm_attack"."attack_roll_id" IS NULL AND "campaign_session_encounter_firearm_attack"."rounds_consumed" = 0 AND "campaign_session_encounter_firearm_attack"."rounds_loaded_after" IS NULL) OR ("campaign_session_encounter_firearm_attack"."fired_at" IS NOT NULL AND "campaign_session_encounter_firearm_attack"."fired_by_user_id" IS NOT NULL AND "campaign_session_encounter_firearm_attack"."attack_roll_id" IS NOT NULL AND "campaign_session_encounter_firearm_attack"."rounds_consumed" = "campaign_session_encounter_firearm_attack"."rounds_declared" AND "campaign_session_encounter_firearm_attack"."rounds_loaded_after" = "campaign_session_encounter_firearm_attack"."rounds_loaded_before" - "campaign_session_encounter_firearm_attack"."rounds_consumed")),
	CONSTRAINT "campaign_session_encounter_firearm_attack_cancel_state_valid" CHECK (("campaign_session_encounter_firearm_attack"."status" = 'cancelled' AND "campaign_session_encounter_firearm_attack"."cancelled_at" IS NOT NULL AND "campaign_session_encounter_firearm_attack"."cancelled_by_user_id" IS NOT NULL) OR ("campaign_session_encounter_firearm_attack"."status" <> 'cancelled' AND "campaign_session_encounter_firearm_attack"."cancelled_at" IS NULL AND "campaign_session_encounter_firearm_attack"."cancelled_by_user_id" IS NULL)),
	CONSTRAINT "campaign_session_encounter_firearm_attack_snapshot_objects" CHECK (jsonb_typeof("campaign_session_encounter_firearm_attack"."frozen_snapshot_json") = 'object' AND jsonb_typeof("campaign_session_encounter_firearm_attack"."governing_snapshot_json") = 'object' AND ("campaign_session_encounter_firearm_attack"."attack_roll_snapshot_json" IS NULL OR jsonb_typeof("campaign_session_encounter_firearm_attack"."attack_roll_snapshot_json") = 'object') AND ("campaign_session_encounter_firearm_attack"."defense_resolution_json" IS NULL OR jsonb_typeof("campaign_session_encounter_firearm_attack"."defense_resolution_json") = 'object') AND ("campaign_session_encounter_firearm_attack"."bullet_allocation_json" IS NULL OR jsonb_typeof("campaign_session_encounter_firearm_attack"."bullet_allocation_json") = 'object') AND ("campaign_session_encounter_firearm_attack"."damage_resolution_json" IS NULL OR jsonb_typeof("campaign_session_encounter_firearm_attack"."damage_resolution_json") = 'object') AND ("campaign_session_encounter_firearm_attack"."post_shot_state_json" IS NULL OR jsonb_typeof("campaign_session_encounter_firearm_attack"."post_shot_state_json") = 'object') AND jsonb_typeof("campaign_session_encounter_firearm_attack"."ruling_reasons_json") = 'array'),
	CONSTRAINT "campaign_session_encounter_firearm_attack_idempotency_nonblank" CHECK (length(trim("campaign_session_encounter_firearm_attack"."idempotency_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_firearm_attack_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"attack_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_firearm_attack_event_status_valid" CHECK (("campaign_session_encounter_firearm_attack_event"."from_status" IS NULL OR "campaign_session_encounter_firearm_attack_event"."from_status" IN ('aiming','trigger-ready','committed','fired-awaiting-timing','consequence-planned','requires-god-ruling','cancelled')) AND "campaign_session_encounter_firearm_attack_event"."to_status" IN ('aiming','trigger-ready','committed','fired-awaiting-timing','consequence-planned','requires-god-ruling','cancelled')),
	CONSTRAINT "campaign_session_encounter_firearm_attack_event_kind_nonblank" CHECK (length(trim("campaign_session_encounter_firearm_attack_event"."event_kind")) > 0),
	CONSTRAINT "campaign_session_encounter_firearm_attack_event_metadata_object" CHECK (jsonb_typeof("campaign_session_encounter_firearm_attack_event"."metadata_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_firearm_bullet" (
	"id" serial PRIMARY KEY NOT NULL,
	"attack_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"bullet_index" integer NOT NULL,
	"status" text NOT NULL,
	"cancelled_by_reaction_id" integer,
	"hit_location_number" integer,
	"hit_location_name" text DEFAULT '' NOT NULL,
	"hp_pool_key" text DEFAULT '' NOT NULL,
	"authored_damage" double precision,
	"dex_damage_modifier" double precision DEFAULT 0 NOT NULL,
	"additional_success_damage" integer DEFAULT 0 NOT NULL,
	"gross_damage" double precision,
	"armor" double precision,
	"soak" double precision,
	"proposed_net_damage" double precision,
	"armor_snapshot_json" jsonb NOT NULL,
	"ruling_reasons_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_firearm_bullet_index_positive" CHECK ("campaign_session_encounter_firearm_bullet"."bullet_index" > 0),
	CONSTRAINT "campaign_session_encounter_firearm_bullet_status_valid" CHECK ("campaign_session_encounter_firearm_bullet"."status" IN ('cancelled-by-defense','surviving','requires-god-ruling')),
	CONSTRAINT "campaign_session_encounter_firearm_bullet_damage_nonnegative" CHECK (("campaign_session_encounter_firearm_bullet"."authored_damage" IS NULL OR "campaign_session_encounter_firearm_bullet"."authored_damage" >= 0) AND "campaign_session_encounter_firearm_bullet"."additional_success_damage" >= 0 AND ("campaign_session_encounter_firearm_bullet"."gross_damage" IS NULL OR "campaign_session_encounter_firearm_bullet"."gross_damage" >= 0) AND ("campaign_session_encounter_firearm_bullet"."armor" IS NULL OR "campaign_session_encounter_firearm_bullet"."armor" >= 0) AND ("campaign_session_encounter_firearm_bullet"."soak" IS NULL OR "campaign_session_encounter_firearm_bullet"."soak" >= 0) AND ("campaign_session_encounter_firearm_bullet"."proposed_net_damage" IS NULL OR "campaign_session_encounter_firearm_bullet"."proposed_net_damage" >= 0)),
	CONSTRAINT "campaign_session_encounter_firearm_bullet_snapshot_valid" CHECK (jsonb_typeof("campaign_session_encounter_firearm_bullet"."armor_snapshot_json") = 'object' AND jsonb_typeof("campaign_session_encounter_firearm_bullet"."ruling_reasons_json") = 'array')
);
--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_actor_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","actor_participant_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_target_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","target_participant_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_state_fk" FOREIGN KEY ("item_instance_id","campaign_id","actor_participant_id","item_id","weapon_profile_id") REFERENCES "public"."campaign_character_firearm_state"("item_instance_id","campaign_id","character_id","item_id","weapon_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_mode_fk" FOREIGN KEY ("firing_mode_id","weapon_profile_id") REFERENCES "public"."weapon_firing_modes"("id","weapon_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_ammunition_fk" FOREIGN KEY ("ammunition_profile_id","ammunition_item_id") REFERENCES "public"."weapon_profiles"("id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_aim_declaration_fk" FOREIGN KEY ("aim_declaration_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_action_declaration"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_aim_pending_fk" FOREIGN KEY ("aim_pending_action_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_pending_action"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_trigger_declaration_fk" FOREIGN KEY ("trigger_declaration_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_action_declaration"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_trigger_pending_fk" FOREIGN KEY ("trigger_pending_action_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_pending_action"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_roll_fk" FOREIGN KEY ("attack_roll_id") REFERENCES "public"."campaign_session_roll"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_effect_plan_fk" FOREIGN KEY ("effect_plan_id") REFERENCES "public"."campaign_session_encounter_effect_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_fired_by_fk" FOREIGN KEY ("fired_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_cancelled_by_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack_event" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_event_attack_fk" FOREIGN KEY ("attack_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_firearm_attack"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_attack_event" ADD CONSTRAINT "campaign_session_encounter_firearm_attack_event_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_bullet" ADD CONSTRAINT "campaign_session_encounter_firearm_bullet_attack_fk" FOREIGN KEY ("attack_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_firearm_attack"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_firearm_bullet" ADD CONSTRAINT "campaign_session_encounter_firearm_bullet_reaction_fk" FOREIGN KEY ("cancelled_by_reaction_id") REFERENCES "public"."campaign_session_encounter_reaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_firearm_attack_idempotency_uq" ON "campaign_session_encounter_firearm_attack" USING btree ("campaign_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_firearm_attack_trigger_declaration_uq" ON "campaign_session_encounter_firearm_attack" USING btree ("trigger_declaration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_firearm_attack_aim_declaration_uq" ON "campaign_session_encounter_firearm_attack" USING btree ("aim_declaration_id") WHERE "campaign_session_encounter_firearm_attack"."aim_declaration_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_firearm_attack_roll_uq" ON "campaign_session_encounter_firearm_attack" USING btree ("attack_roll_id") WHERE "campaign_session_encounter_firearm_attack"."attack_roll_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_firearm_attack_effect_plan_uq" ON "campaign_session_encounter_firearm_attack" USING btree ("effect_plan_id") WHERE "campaign_session_encounter_firearm_attack"."effect_plan_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_firearm_attack_one_open_instance_uq" ON "campaign_session_encounter_firearm_attack" USING btree ("item_instance_id") WHERE "campaign_session_encounter_firearm_attack"."status" IN ('aiming','trigger-ready','committed');--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_firearm_attack_history_idx" ON "campaign_session_encounter_firearm_attack" USING btree ("encounter_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_firearm_attack_actor_idx" ON "campaign_session_encounter_firearm_attack" USING btree ("actor_participant_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_firearm_attack_event_history_idx" ON "campaign_session_encounter_firearm_attack_event" USING btree ("attack_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_firearm_bullet_order_uq" ON "campaign_session_encounter_firearm_bullet" USING btree ("attack_id","bullet_index");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_firearm_bullet_attack_idx" ON "campaign_session_encounter_firearm_bullet" USING btree ("attack_id","status","bullet_index");