CREATE TYPE "public"."shop_visit_member_exit_kind" AS ENUM('player-left', 'god-removed', 'visit-ended', 'lifecycle-ended', 'permission-lost');--> statement-breakpoint
CREATE TYPE "public"."shop_visit_member_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."shop_visit_mode" AS ENUM('roleplay', 'shopping');--> statement-breakpoint
CREATE TYPE "public"."shop_visit_placement_kind" AS ENUM('town', 'independent');--> statement-breakpoint
CREATE TYPE "public"."shop_visit_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TABLE "campaign_session_scene_shop_visit" (
	"id" serial PRIMARY KEY NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"placement_kind" "shop_visit_placement_kind" NOT NULL,
	"town_id" integer,
	"mode" "shop_visit_mode" DEFAULT 'shopping' NOT NULL,
	"status" "shop_visit_status" DEFAULT 'active' NOT NULL,
	"closed_shop_override" boolean DEFAULT false NOT NULL,
	"closed_shop_override_reason" text DEFAULT '' NOT NULL,
	"started_by_user_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_by_user_id" text,
	"ended_at" timestamp,
	"end_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_shop_visit_hierarchy_uq" UNIQUE("id","scene_id","session_id","campaign_id"),
	CONSTRAINT "campaign_session_scene_shop_visit_placement_valid" CHECK ((
        ("campaign_session_scene_shop_visit"."placement_kind" = 'town' AND "campaign_session_scene_shop_visit"."town_id" IS NOT NULL)
        OR ("campaign_session_scene_shop_visit"."placement_kind" = 'independent' AND "campaign_session_scene_shop_visit"."town_id" IS NULL)
      )),
	CONSTRAINT "campaign_session_scene_shop_visit_override_valid" CHECK ((
        ("campaign_session_scene_shop_visit"."closed_shop_override" = false AND "campaign_session_scene_shop_visit"."closed_shop_override_reason" = '')
        OR ("campaign_session_scene_shop_visit"."closed_shop_override" = true AND length(trim("campaign_session_scene_shop_visit"."closed_shop_override_reason")) > 0)
      )),
	CONSTRAINT "campaign_session_scene_shop_visit_state_valid" CHECK ((
        ("campaign_session_scene_shop_visit"."status" = 'active' AND "campaign_session_scene_shop_visit"."ended_at" IS NULL AND "campaign_session_scene_shop_visit"."ended_by_user_id" IS NULL AND "campaign_session_scene_shop_visit"."end_reason" = '')
        OR ("campaign_session_scene_shop_visit"."status" = 'ended' AND "campaign_session_scene_shop_visit"."ended_at" IS NOT NULL AND "campaign_session_scene_shop_visit"."ended_by_user_id" IS NOT NULL AND length(trim("campaign_session_scene_shop_visit"."end_reason")) > 0)
      )),
	CONSTRAINT "campaign_session_scene_shop_visit_reason_lengths_valid" CHECK (length("campaign_session_scene_shop_visit"."closed_shop_override_reason") <= 1000 AND length("campaign_session_scene_shop_visit"."end_reason") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_scene_shop_visit_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"visit_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"status" "shop_visit_member_status" DEFAULT 'active' NOT NULL,
	"entered_by_user_id" text NOT NULL,
	"entered_at" timestamp DEFAULT now() NOT NULL,
	"exited_by_user_id" text,
	"exited_at" timestamp,
	"exit_kind" "shop_visit_member_exit_kind",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_shop_visit_member_state_valid" CHECK ((
        ("campaign_session_scene_shop_visit_member"."status" = 'active' AND "campaign_session_scene_shop_visit_member"."exited_at" IS NULL AND "campaign_session_scene_shop_visit_member"."exited_by_user_id" IS NULL AND "campaign_session_scene_shop_visit_member"."exit_kind" IS NULL)
        OR ("campaign_session_scene_shop_visit_member"."status" = 'ended' AND "campaign_session_scene_shop_visit_member"."exited_at" IS NOT NULL AND "campaign_session_scene_shop_visit_member"."exited_by_user_id" IS NOT NULL AND "campaign_session_scene_shop_visit_member"."exit_kind" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit" ADD CONSTRAINT "campaign_session_scene_shop_visit_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit" ADD CONSTRAINT "campaign_session_scene_shop_visit_shop_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit" ADD CONSTRAINT "campaign_session_scene_shop_visit_town_fk" FOREIGN KEY ("town_id","campaign_id") REFERENCES "public"."town"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit" ADD CONSTRAINT "campaign_session_scene_shop_visit_started_by_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit" ADD CONSTRAINT "campaign_session_scene_shop_visit_ended_by_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit_member" ADD CONSTRAINT "campaign_session_scene_shop_visit_member_visit_fk" FOREIGN KEY ("visit_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene_shop_visit"("id","scene_id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit_member" ADD CONSTRAINT "campaign_session_scene_shop_visit_member_character_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit_member" ADD CONSTRAINT "campaign_session_scene_shop_visit_member_entered_by_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop_visit_member" ADD CONSTRAINT "campaign_session_scene_shop_visit_member_exited_by_fk" FOREIGN KEY ("exited_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_scene_shop_visit_one_active_shop_uq" ON "campaign_session_scene_shop_visit" USING btree ("scene_id","shop_id") WHERE "campaign_session_scene_shop_visit"."status" = 'active';--> statement-breakpoint
CREATE INDEX "campaign_session_scene_shop_visit_scene_status_idx" ON "campaign_session_scene_shop_visit" USING btree ("scene_id","status","started_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_shop_visit_shop_history_idx" ON "campaign_session_scene_shop_visit" USING btree ("shop_id","started_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_scene_shop_visit_member_one_active_character_uq" ON "campaign_session_scene_shop_visit_member" USING btree ("character_id") WHERE "campaign_session_scene_shop_visit_member"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_scene_shop_visit_member_one_active_visit_character_uq" ON "campaign_session_scene_shop_visit_member" USING btree ("visit_id","character_id") WHERE "campaign_session_scene_shop_visit_member"."status" = 'active';--> statement-breakpoint
CREATE INDEX "campaign_session_scene_shop_visit_member_visit_status_idx" ON "campaign_session_scene_shop_visit_member" USING btree ("visit_id","status","entered_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_shop_visit_member_character_history_idx" ON "campaign_session_scene_shop_visit_member" USING btree ("character_id","entered_at","id");
