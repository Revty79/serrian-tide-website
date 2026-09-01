CREATE TYPE "public"."campaign_session_status" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TABLE "campaign_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"title" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"status" "campaign_session_status" DEFAULT 'planned' NOT NULL,
	"planned_for" date,
	"god_notes" text DEFAULT '' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_title_nonblank" CHECK (length(trim("campaign_session"."title")) > 0),
	CONSTRAINT "campaign_session_sequence_positive" CHECK ("campaign_session"."sequence_number" > 0),
	CONSTRAINT "campaign_session_lifecycle_timestamps_valid" CHECK ((
        ("campaign_session"."status" = 'planned' AND "campaign_session"."started_at" IS NULL AND "campaign_session"."completed_at" IS NULL)
        OR ("campaign_session"."status" = 'active' AND "campaign_session"."started_at" IS NOT NULL AND "campaign_session"."completed_at" IS NULL)
        OR ("campaign_session"."status" = 'completed' AND "campaign_session"."started_at" IS NOT NULL AND "campaign_session"."completed_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "campaign_session" ADD CONSTRAINT "campaign_session_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_session_campaign_id_idx" ON "campaign_session" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_session_campaign_status_idx" ON "campaign_session" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_campaign_sequence_uq" ON "campaign_session" USING btree ("campaign_id","sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_one_active_per_campaign_uq" ON "campaign_session" USING btree ("campaign_id") WHERE "campaign_session"."status" = 'active';