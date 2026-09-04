CREATE TYPE "public"."campaign_session_encounter_effect_plan_status" AS ENUM('calculated', 'requires-god-ruling', 'approved', 'applied', 'partially-applied', 'declined', 'cancelled', 'superseded', 'application-failed');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_effect_status" AS ENUM('calculated', 'requires-god-ruling', 'approved', 'applied', 'declined', 'manual-resolved', 'application-failed');--> statement-breakpoint
ALTER TYPE "public"."campaign_session_encounter_action_source_kind" ADD VALUE 'derived-ability';--> statement-breakpoint
ALTER TYPE "public"."campaign_session_encounter_action_source_kind" ADD VALUE 'skill';--> statement-breakpoint
ALTER TYPE "public"."campaign_session_encounter_action_source_kind" ADD VALUE 'attribute';--> statement-breakpoint
ALTER TYPE "public"."campaign_session_encounter_action_source_kind" ADD VALUE 'no-roll';--> statement-breakpoint
ALTER TYPE "public"."campaign_session_encounter_action_source_kind" ADD VALUE 'manual';--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_effect" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"target_participant_id" integer NOT NULL,
	"effect_key" text NOT NULL,
	"effect_type" text NOT NULL,
	"source_kind" "campaign_session_encounter_action_source_kind" NOT NULL,
	"source_identity" text NOT NULL,
	"authored_value_json" jsonb NOT NULL,
	"calculated_value_json" jsonb,
	"final_value_json" jsonb,
	"unit" text DEFAULT '' NOT NULL,
	"resource" text DEFAULT '' NOT NULL,
	"application_supported" boolean DEFAULT false NOT NULL,
	"god_review_required" boolean DEFAULT false NOT NULL,
	"status" "campaign_session_encounter_effect_status" NOT NULL,
	"amendment_reason" text DEFAULT '' NOT NULL,
	"amended_by_user_id" text,
	"applied_result_json" jsonb,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_effect_key_nonblank" CHECK (length(trim("campaign_session_encounter_effect"."effect_key")) > 0),
	CONSTRAINT "campaign_session_encounter_effect_type_nonblank" CHECK (length(trim("campaign_session_encounter_effect"."effect_type")) > 0),
	CONSTRAINT "campaign_session_encounter_effect_source_nonblank" CHECK (length(trim("campaign_session_encounter_effect"."source_identity")) > 0),
	CONSTRAINT "campaign_session_encounter_effect_amendment_valid" CHECK ("campaign_session_encounter_effect"."amended_by_user_id" IS NULL OR length(trim("campaign_session_encounter_effect"."amendment_reason")) > 0),
	CONSTRAINT "campaign_session_encounter_effect_application_valid" CHECK (("campaign_session_encounter_effect"."applied_at" IS NULL AND "campaign_session_encounter_effect"."applied_result_json" IS NULL) OR ("campaign_session_encounter_effect"."applied_at" IS NOT NULL AND "campaign_session_encounter_effect"."applied_result_json" IS NOT NULL AND "campaign_session_encounter_effect"."status" IN ('applied','manual-resolved')))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_effect_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"declaration_id" integer NOT NULL,
	"pending_action_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"actor_participant_id" integer NOT NULL,
	"source_kind" "campaign_session_encounter_action_source_kind" NOT NULL,
	"source_identity" text NOT NULL,
	"source_id" text,
	"source_instance_id" integer,
	"status" "campaign_session_encounter_effect_plan_status" NOT NULL,
	"target_snapshot_json" jsonb NOT NULL,
	"source_snapshot_json" jsonb NOT NULL,
	"governing_roll_snapshot_json" jsonb,
	"defense_resolution_json" jsonb,
	"initiative_commitment_json" jsonb NOT NULL,
	"resource_costs_json" jsonb NOT NULL,
	"source_divergence_json" jsonb,
	"explanation" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"reviewed_by_user_id" text,
	"applied_by_user_id" text,
	"reviewed_at" timestamp,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_effect_plan_hierarchy_uq" UNIQUE("id","encounter_id","scene_id","session_id","campaign_id"),
	CONSTRAINT "campaign_session_encounter_effect_plan_source_identity_nonblank" CHECK (length(trim("campaign_session_encounter_effect_plan"."source_identity")) > 0),
	CONSTRAINT "campaign_session_encounter_effect_plan_targets_array" CHECK (jsonb_typeof("campaign_session_encounter_effect_plan"."target_snapshot_json") = 'array'),
	CONSTRAINT "campaign_session_encounter_effect_plan_source_object" CHECK (jsonb_typeof("campaign_session_encounter_effect_plan"."source_snapshot_json") = 'object'),
	CONSTRAINT "campaign_session_encounter_effect_plan_roll_object" CHECK ("campaign_session_encounter_effect_plan"."governing_roll_snapshot_json" IS NULL OR jsonb_typeof("campaign_session_encounter_effect_plan"."governing_roll_snapshot_json") = 'object'),
	CONSTRAINT "campaign_session_encounter_effect_plan_defense_object" CHECK ("campaign_session_encounter_effect_plan"."defense_resolution_json" IS NULL OR jsonb_typeof("campaign_session_encounter_effect_plan"."defense_resolution_json") = 'object'),
	CONSTRAINT "campaign_session_encounter_effect_plan_initiative_object" CHECK (jsonb_typeof("campaign_session_encounter_effect_plan"."initiative_commitment_json") = 'object'),
	CONSTRAINT "campaign_session_encounter_effect_plan_costs_array" CHECK (jsonb_typeof("campaign_session_encounter_effect_plan"."resource_costs_json") = 'array'),
	CONSTRAINT "campaign_session_encounter_effect_plan_divergence_object" CHECK ("campaign_session_encounter_effect_plan"."source_divergence_json" IS NULL OR jsonb_typeof("campaign_session_encounter_effect_plan"."source_divergence_json") = 'object'),
	CONSTRAINT "campaign_session_encounter_effect_plan_review_state_valid" CHECK (("campaign_session_encounter_effect_plan"."reviewed_at" IS NULL AND "campaign_session_encounter_effect_plan"."reviewed_by_user_id" IS NULL) OR ("campaign_session_encounter_effect_plan"."reviewed_at" IS NOT NULL AND "campaign_session_encounter_effect_plan"."reviewed_by_user_id" IS NOT NULL)),
	CONSTRAINT "campaign_session_encounter_effect_plan_application_state_valid" CHECK (("campaign_session_encounter_effect_plan"."applied_at" IS NULL AND "campaign_session_encounter_effect_plan"."applied_by_user_id" IS NULL) OR ("campaign_session_encounter_effect_plan"."applied_at" IS NOT NULL AND "campaign_session_encounter_effect_plan"."applied_by_user_id" IS NOT NULL AND "campaign_session_encounter_effect_plan"."status" IN ('applied','partially-applied')))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_effect_plan_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"from_status" "campaign_session_encounter_effect_plan_status",
	"to_status" "campaign_session_encounter_effect_plan_status" NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_effect_plan_event_kind_nonblank" CHECK (length(trim("campaign_session_encounter_effect_plan_event"."event_kind")) > 0),
	CONSTRAINT "campaign_session_encounter_effect_plan_event_metadata_object" CHECK (jsonb_typeof("campaign_session_encounter_effect_plan_event"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect" ADD CONSTRAINT "campaign_session_encounter_effect_plan_fk" FOREIGN KEY ("plan_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_effect_plan"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect" ADD CONSTRAINT "campaign_session_encounter_effect_target_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","target_participant_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect" ADD CONSTRAINT "campaign_session_encounter_effect_amended_by_fk" FOREIGN KEY ("amended_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect_plan" ADD CONSTRAINT "campaign_session_encounter_effect_plan_declaration_fk" FOREIGN KEY ("declaration_id","pending_action_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_action_declaration"("id","pending_action_id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect_plan" ADD CONSTRAINT "campaign_session_encounter_effect_plan_actor_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","actor_participant_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect_plan" ADD CONSTRAINT "campaign_session_encounter_effect_plan_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect_plan" ADD CONSTRAINT "campaign_session_encounter_effect_plan_reviewed_by_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect_plan" ADD CONSTRAINT "campaign_session_encounter_effect_plan_applied_by_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect_plan_event" ADD CONSTRAINT "campaign_session_encounter_effect_plan_event_plan_fk" FOREIGN KEY ("plan_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_effect_plan"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_effect_plan_event" ADD CONSTRAINT "campaign_session_encounter_effect_plan_event_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_effect_key_uq" ON "campaign_session_encounter_effect" USING btree ("plan_id","effect_key");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_effect_status_idx" ON "campaign_session_encounter_effect" USING btree ("plan_id","status","id");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_effect_target_idx" ON "campaign_session_encounter_effect" USING btree ("encounter_id","target_participant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_effect_plan_declaration_uq" ON "campaign_session_encounter_effect_plan" USING btree ("declaration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_effect_plan_pending_action_uq" ON "campaign_session_encounter_effect_plan" USING btree ("pending_action_id");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_effect_plan_status_idx" ON "campaign_session_encounter_effect_plan" USING btree ("encounter_id","status","created_at");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_effect_plan_event_history_idx" ON "campaign_session_encounter_effect_plan_event" USING btree ("plan_id","created_at","id");