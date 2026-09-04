CREATE TYPE "public"."campaign_session_roll_amendment_kind" AS ENUM('correction', 'void', 'ruling');--> statement-breakpoint
ALTER TYPE "public"."campaign_session_roll_visibility" ADD VALUE 'private' BEFORE 'god-only';--> statement-breakpoint
CREATE TABLE "campaign_session_roll_amendment" (
	"id" serial PRIMARY KEY NOT NULL,
	"roll_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"previous_amendment_id" integer,
	"kind" "campaign_session_roll_amendment_kind" NOT NULL,
	"reason" text NOT NULL,
	"mechanical_snapshot" jsonb,
	"ruling_text" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_roll_amendment_reason_valid" CHECK (length(trim("campaign_session_roll_amendment"."reason")) > 0 AND length("campaign_session_roll_amendment"."reason") <= 500),
	CONSTRAINT "campaign_session_roll_amendment_ruling_length_valid" CHECK (length("campaign_session_roll_amendment"."ruling_text") <= 2000),
	CONSTRAINT "campaign_session_roll_amendment_content_valid" CHECK ((
        "campaign_session_roll_amendment"."kind" = 'correction'
        AND "campaign_session_roll_amendment"."mechanical_snapshot" IS NOT NULL
        AND jsonb_typeof("campaign_session_roll_amendment"."mechanical_snapshot") = 'object'
      ) OR (
        "campaign_session_roll_amendment"."kind" = 'void'
        AND "campaign_session_roll_amendment"."mechanical_snapshot" IS NULL
        AND "campaign_session_roll_amendment"."ruling_text" = ''
      ) OR (
        "campaign_session_roll_amendment"."kind" = 'ruling'
        AND "campaign_session_roll_amendment"."mechanical_snapshot" IS NULL
        AND length(trim("campaign_session_roll_amendment"."ruling_text")) > 0
      ))
);
--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD COLUMN "mechanical_snapshot" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_roll_amendment_owner_uq" ON "campaign_session_roll" USING btree ("id","campaign_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_roll_amendment_chain_uq" ON "campaign_session_roll_amendment" USING btree ("id","roll_id","campaign_id","session_id");--> statement-breakpoint
ALTER TABLE "campaign_session_roll_amendment" ADD CONSTRAINT "campaign_session_roll_amendment_roll_fk" FOREIGN KEY ("roll_id","campaign_id","session_id") REFERENCES "public"."campaign_session_roll"("id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll_amendment" ADD CONSTRAINT "campaign_session_roll_amendment_previous_fk" FOREIGN KEY ("previous_amendment_id","roll_id","campaign_id","session_id") REFERENCES "public"."campaign_session_roll_amendment"("id","roll_id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll_amendment" ADD CONSTRAINT "campaign_session_roll_amendment_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_roll_amendment_first_uq" ON "campaign_session_roll_amendment" USING btree ("roll_id") WHERE "campaign_session_roll_amendment"."previous_amendment_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_roll_amendment_successor_uq" ON "campaign_session_roll_amendment" USING btree ("previous_amendment_id") WHERE "campaign_session_roll_amendment"."previous_amendment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_session_roll_amendment_history_idx" ON "campaign_session_roll_amendment" USING btree ("roll_id","id");--> statement-breakpoint
CREATE INDEX "campaign_session_roll_amendment_session_idx" ON "campaign_session_roll_amendment" USING btree ("session_id","roll_id","id");--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_mechanical_snapshot_valid" CHECK ("campaign_session_roll"."mechanical_snapshot" IS NULL OR jsonb_typeof("campaign_session_roll"."mechanical_snapshot") = 'object');
