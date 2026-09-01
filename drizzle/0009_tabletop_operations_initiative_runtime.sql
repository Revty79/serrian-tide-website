CREATE TYPE "public"."campaign_session_encounter_initiative_participant_status" AS ENUM('active', 'holding', 'passed', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_initiative_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_pending_action_status" AS ENUM('active', 'interrupted', 'completed', 'abandoned', 'ended');--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_initiative" (
	"encounter_id" integer PRIMARY KEY NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"status" "campaign_session_encounter_initiative_status" DEFAULT 'active' NOT NULL,
	"round_number" integer DEFAULT 1 NOT NULL,
	"step_number" integer DEFAULT 1 NOT NULL,
	"timeline_initiative" double precision NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_initiative_round_positive" CHECK ("campaign_session_encounter_initiative"."round_number" > 0),
	CONSTRAINT "campaign_session_encounter_initiative_step_positive" CHECK ("campaign_session_encounter_initiative"."step_number" > 0),
	CONSTRAINT "campaign_session_encounter_initiative_timeline_nonnegative" CHECK ("campaign_session_encounter_initiative"."timeline_initiative" >= 0),
	CONSTRAINT "campaign_session_encounter_initiative_lifecycle_valid" CHECK ((
        ("campaign_session_encounter_initiative"."status" = 'active' AND "campaign_session_encounter_initiative"."closed_at" IS NULL)
        OR ("campaign_session_encounter_initiative"."status" = 'closed' AND "campaign_session_encounter_initiative"."closed_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_initiative_participant" (
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"normal_total_initiative" double precision NOT NULL,
	"current_initiative" double precision NOT NULL,
	"participation_status" "campaign_session_encounter_initiative_participant_status" DEFAULT 'active' NOT NULL,
	"deferred_initiative_cost" double precision DEFAULT 0 NOT NULL,
	"last_satisfied_step" integer DEFAULT 0 NOT NULL,
	"movement_mode" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_initiative_participant_encounter_id_character_id_pk" PRIMARY KEY("encounter_id","character_id"),
	CONSTRAINT "campaign_session_encounter_initiative_participant_normal_positive" CHECK ("campaign_session_encounter_initiative_participant"."normal_total_initiative" > 0),
	CONSTRAINT "campaign_session_encounter_initiative_participant_deferred_nonnegative" CHECK ("campaign_session_encounter_initiative_participant"."deferred_initiative_cost" >= 0),
	CONSTRAINT "campaign_session_encounter_initiative_participant_step_nonnegative" CHECK ("campaign_session_encounter_initiative_participant"."last_satisfied_step" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_pending_action" (
	"id" serial PRIMARY KEY NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"actor_character_id" integer NOT NULL,
	"label" text NOT NULL,
	"action_kind" text DEFAULT 'generic' NOT NULL,
	"allows_multi_round" boolean DEFAULT false NOT NULL,
	"original_initiative_cost" double precision NOT NULL,
	"initiative_spent" double precision DEFAULT 0 NOT NULL,
	"remaining_initiative_cost" double precision NOT NULL,
	"start_initiative" double precision NOT NULL,
	"start_timeline_initiative" double precision NOT NULL,
	"expected_completion_initiative" double precision NOT NULL,
	"status" "campaign_session_encounter_pending_action_status" DEFAULT 'active' NOT NULL,
	"started_round" integer NOT NULL,
	"completed_round" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_pending_action_label_nonblank" CHECK (length(trim("campaign_session_encounter_pending_action"."label")) > 0),
	CONSTRAINT "campaign_session_encounter_pending_action_original_cost_positive" CHECK ("campaign_session_encounter_pending_action"."original_initiative_cost" > 0),
	CONSTRAINT "campaign_session_encounter_pending_action_spent_nonnegative" CHECK ("campaign_session_encounter_pending_action"."initiative_spent" >= 0),
	CONSTRAINT "campaign_session_encounter_pending_action_remaining_nonnegative" CHECK ("campaign_session_encounter_pending_action"."remaining_initiative_cost" >= 0),
	CONSTRAINT "campaign_session_encounter_pending_action_start_timeline_nonnegative" CHECK ("campaign_session_encounter_pending_action"."start_timeline_initiative" >= 0),
	CONSTRAINT "campaign_session_encounter_pending_action_started_round_positive" CHECK ("campaign_session_encounter_pending_action"."started_round" > 0),
	CONSTRAINT "campaign_session_encounter_pending_action_completed_round_positive" CHECK ("campaign_session_encounter_pending_action"."completed_round" IS NULL OR "campaign_session_encounter_pending_action"."completed_round" > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_initiative" ADD CONSTRAINT "campaign_session_encounter_initiative_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_initiative_runtime_identity_uq" ON "campaign_session_encounter_initiative" USING btree ("encounter_id","scene_id","session_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_participant_runtime_identity_uq" ON "campaign_session_encounter_participant" USING btree ("encounter_id","scene_id","session_id","campaign_id","character_id");--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_initiative_participant" ADD CONSTRAINT "campaign_session_encounter_initiative_participant_runtime_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_initiative"("encounter_id","scene_id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_initiative_participant" ADD CONSTRAINT "campaign_session_encounter_initiative_participant_encounter_participant_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","character_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_initiative_participant_runtime_identity_uq" ON "campaign_session_encounter_initiative_participant" USING btree ("encounter_id","scene_id","session_id","campaign_id","character_id");--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_pending_action" ADD CONSTRAINT "campaign_session_encounter_pending_action_actor_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","actor_character_id") REFERENCES "public"."campaign_session_encounter_initiative_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_initiative_campaign_status_idx" ON "campaign_session_encounter_initiative" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_initiative_participant_current_idx" ON "campaign_session_encounter_initiative_participant" USING btree ("encounter_id","current_initiative");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_initiative_participant_status_idx" ON "campaign_session_encounter_initiative_participant" USING btree ("encounter_id","participation_status");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_pending_action_one_active_actor_uq" ON "campaign_session_encounter_pending_action" USING btree ("encounter_id","actor_character_id") WHERE "campaign_session_encounter_pending_action"."status" = 'active';--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_pending_action_timeline_idx" ON "campaign_session_encounter_pending_action" USING btree ("encounter_id","status","expected_completion_initiative");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_pending_action_actor_history_idx" ON "campaign_session_encounter_pending_action" USING btree ("encounter_id","actor_character_id","created_at");--> statement-breakpoint
