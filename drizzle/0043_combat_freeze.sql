ALTER TABLE "campaign_session_encounter" ADD COLUMN "frozen_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter" ADD COLUMN "freeze_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter" ADD CONSTRAINT "campaign_session_encounter_freeze_revision_valid" CHECK ("campaign_session_encounter"."freeze_revision" >= 0);