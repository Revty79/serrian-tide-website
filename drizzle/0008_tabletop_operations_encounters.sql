CREATE TYPE "public"."campaign_session_encounter_status" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_type" AS ENUM('combat', 'social', 'exploration', 'chase', 'hazard', 'other');--> statement-breakpoint
CREATE TABLE "campaign_session_encounter" (
	"id" serial PRIMARY KEY NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"sequence_number" integer NOT NULL,
	"title" text NOT NULL,
	"status" "campaign_session_encounter_status" DEFAULT 'planned' NOT NULL,
	"encounter_type" "campaign_session_encounter_type" DEFAULT 'other' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"god_notes" text DEFAULT '' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_title_nonblank" CHECK (length(trim("campaign_session_encounter"."title")) > 0),
	CONSTRAINT "campaign_session_encounter_sequence_positive" CHECK ("campaign_session_encounter"."sequence_number" > 0),
	CONSTRAINT "campaign_session_encounter_lifecycle_timestamps_valid" CHECK ((
        ("campaign_session_encounter"."status" = 'planned' AND "campaign_session_encounter"."started_at" IS NULL AND "campaign_session_encounter"."completed_at" IS NULL)
        OR ("campaign_session_encounter"."status" = 'active' AND "campaign_session_encounter"."started_at" IS NOT NULL AND "campaign_session_encounter"."completed_at" IS NULL)
        OR ("campaign_session_encounter"."status" = 'completed' AND "campaign_session_encounter"."started_at" IS NOT NULL AND "campaign_session_encounter"."completed_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_participant" (
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"prep_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_participant_encounter_id_character_id_pk" PRIMARY KEY("encounter_id","character_id"),
	CONSTRAINT "campaign_session_encounter_participant_sort_order_nonnegative" CHECK ("campaign_session_encounter_participant"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_session_encounter" ADD CONSTRAINT "campaign_session_encounter_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_id_scene_session_campaign_uq" ON "campaign_session_encounter" USING btree ("id","scene_id","session_id","campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD CONSTRAINT "campaign_session_encounter_participant_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD CONSTRAINT "campaign_session_encounter_participant_scene_member_fk" FOREIGN KEY ("scene_id","character_id") REFERENCES "public"."campaign_session_scene_member"("scene_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_scene_sequence_uq" ON "campaign_session_encounter" USING btree ("scene_id","sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_one_active_per_scene_uq" ON "campaign_session_encounter" USING btree ("scene_id") WHERE "campaign_session_encounter"."status" = 'active';--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_scene_status_idx" ON "campaign_session_encounter" USING btree ("scene_id","status");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_scene_order_idx" ON "campaign_session_encounter" USING btree ("scene_id","sequence_number");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_participant_order_idx" ON "campaign_session_encounter_participant" USING btree ("encounter_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_participant_scene_member_idx" ON "campaign_session_encounter_participant" USING btree ("scene_id","character_id");
