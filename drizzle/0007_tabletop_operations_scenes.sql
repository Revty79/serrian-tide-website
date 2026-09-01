CREATE TYPE "public"."campaign_session_scene_status" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TABLE "campaign_session_scene" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"sequence_number" integer NOT NULL,
	"title" text NOT NULL,
	"status" "campaign_session_scene_status" DEFAULT 'planned' NOT NULL,
	"location_label" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"god_notes" text DEFAULT '' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_title_nonblank" CHECK (length(trim("campaign_session_scene"."title")) > 0),
	CONSTRAINT "campaign_session_scene_sequence_positive" CHECK ("campaign_session_scene"."sequence_number" > 0),
	CONSTRAINT "campaign_session_scene_lifecycle_timestamps_valid" CHECK ((
        ("campaign_session_scene"."status" = 'planned' AND "campaign_session_scene"."started_at" IS NULL AND "campaign_session_scene"."completed_at" IS NULL)
        OR ("campaign_session_scene"."status" = 'active' AND "campaign_session_scene"."started_at" IS NOT NULL AND "campaign_session_scene"."completed_at" IS NULL)
        OR ("campaign_session_scene"."status" = 'completed' AND "campaign_session_scene"."started_at" IS NOT NULL AND "campaign_session_scene"."completed_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_scene_member" (
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_member_scene_id_character_id_pk" PRIMARY KEY("scene_id","character_id"),
	CONSTRAINT "campaign_session_scene_member_sort_order_nonnegative" CHECK ("campaign_session_scene_member"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_scene_id_session_campaign_uq" ON "campaign_session_scene" USING btree ("id","session_id","campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_session_scene" ADD CONSTRAINT "campaign_session_scene_session_campaign_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_member" ADD CONSTRAINT "campaign_session_scene_member_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_member" ADD CONSTRAINT "campaign_session_scene_member_roster_fk" FOREIGN KEY ("session_id","character_id") REFERENCES "public"."campaign_session_roster"("session_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_scene_session_sequence_uq" ON "campaign_session_scene" USING btree ("session_id","sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_scene_one_active_per_session_uq" ON "campaign_session_scene" USING btree ("session_id") WHERE "campaign_session_scene"."status" = 'active';--> statement-breakpoint
CREATE INDEX "campaign_session_scene_session_status_idx" ON "campaign_session_scene" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_session_order_idx" ON "campaign_session_scene" USING btree ("session_id","sequence_number");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_member_scene_order_idx" ON "campaign_session_scene_member" USING btree ("scene_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_member_roster_idx" ON "campaign_session_scene_member" USING btree ("session_id","character_id");
