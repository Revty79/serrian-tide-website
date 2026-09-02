CREATE TYPE "public"."campaign_session_roll_method" AS ENUM('random', 'entered');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_roll_purpose" AS ENUM('free', 'attribute', 'skill', 'attack', 'defense', 'ability', 'other');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_roll_status" AS ENUM('recorded', 'voided');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_roll_type" AS ENUM('percentile', 'hit-location');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_roll_visibility" AS ENUM('table', 'god-only');--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_reaction_hierarchy_uq" ON "campaign_session_encounter_reaction" USING btree ("id","encounter_id","scene_id","session_id","campaign_id");--> statement-breakpoint
CREATE TABLE "campaign_session_roll" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer,
	"encounter_id" integer,
	"roller_character_id" integer,
	"target_character_id" integer,
	"pending_action_id" integer,
	"reaction_id" integer,
	"recorded_by_user_id" text NOT NULL,
	"method" "campaign_session_roll_method" NOT NULL,
	"roll_type" "campaign_session_roll_type" NOT NULL,
	"visibility" "campaign_session_roll_visibility" DEFAULT 'god-only' NOT NULL,
	"purpose_kind" "campaign_session_roll_purpose" DEFAULT 'free' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"result_total" integer NOT NULL,
	"target_number" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"round_number" integer,
	"step_number" integer,
	"status" "campaign_session_roll_status" DEFAULT 'recorded' NOT NULL,
	"voided_at" timestamp,
	"void_reason" text DEFAULT '' NOT NULL,
	"voided_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_roll_type_result_valid" CHECK ((
        "campaign_session_roll"."roll_type" = 'percentile'
        AND "campaign_session_roll"."result_total" BETWEEN 1 AND 100
      ) OR (
        "campaign_session_roll"."roll_type" = 'hit-location'
        AND "campaign_session_roll"."result_total" BETWEEN 0 AND 9
      )),
	CONSTRAINT "campaign_session_roll_hierarchy_valid" CHECK ((
        ("campaign_session_roll"."scene_id" IS NULL AND "campaign_session_roll"."encounter_id" IS NULL)
        OR ("campaign_session_roll"."scene_id" IS NOT NULL)
      )
      AND ("campaign_session_roll"."pending_action_id" IS NULL OR "campaign_session_roll"."encounter_id" IS NOT NULL)
      AND ("campaign_session_roll"."reaction_id" IS NULL OR "campaign_session_roll"."encounter_id" IS NOT NULL)),
	CONSTRAINT "campaign_session_roll_initiative_snapshot_valid" CHECK ((
        "campaign_session_roll"."round_number" IS NULL
        AND "campaign_session_roll"."step_number" IS NULL
      ) OR (
        "campaign_session_roll"."encounter_id" IS NOT NULL
        AND "campaign_session_roll"."round_number" > 0
        AND "campaign_session_roll"."step_number" > 0
      )),
	CONSTRAINT "campaign_session_roll_label_length_valid" CHECK (length("campaign_session_roll"."label") <= 200),
	CONSTRAINT "campaign_session_roll_notes_length_valid" CHECK (length("campaign_session_roll"."notes") <= 2000),
	CONSTRAINT "campaign_session_roll_void_reason_length_valid" CHECK (length("campaign_session_roll"."void_reason") <= 500),
	CONSTRAINT "campaign_session_roll_lifecycle_valid" CHECK ((
        "campaign_session_roll"."status" = 'recorded'
        AND "campaign_session_roll"."voided_at" IS NULL
        AND "campaign_session_roll"."void_reason" = ''
        AND "campaign_session_roll"."voided_by_user_id" IS NULL
      ) OR (
        "campaign_session_roll"."status" = 'voided'
        AND "campaign_session_roll"."voided_at" IS NOT NULL
        AND length(trim("campaign_session_roll"."void_reason")) > 0
        AND "campaign_session_roll"."voided_by_user_id" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_session_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_roller_character_fk" FOREIGN KEY ("roller_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_target_character_fk" FOREIGN KEY ("target_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_pending_action_fk" FOREIGN KEY ("pending_action_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_pending_action"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_reaction_fk" FOREIGN KEY ("reaction_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_reaction"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_recorded_by_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_voided_by_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_session_roll_session_history_idx" ON "campaign_session_roll" USING btree ("session_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_roll_scene_history_idx" ON "campaign_session_roll" USING btree ("scene_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_roll_encounter_history_idx" ON "campaign_session_roll" USING btree ("encounter_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_roll_roller_history_idx" ON "campaign_session_roll" USING btree ("roller_character_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_roll_action_idx" ON "campaign_session_roll" USING btree ("pending_action_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_roll_reaction_idx" ON "campaign_session_roll" USING btree ("reaction_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_roll_visibility_status_idx" ON "campaign_session_roll" USING btree ("session_id","visibility","status");
