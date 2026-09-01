CREATE TYPE "public"."campaign_session_encounter_action_resolution_status" AS ENUM('pending', 'resolved', 'cancelled', 'needs-ruling');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_action_source_kind" AS ENUM('weapon', 'creature-attack', 'spell', 'item', 'creature-ability');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_reaction_status" AS ENUM('declared', 'resolved', 'cancelled', 'needs-ruling');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_reaction_type" AS ENUM('dodge', 'block', 'parry', 'no-reaction');--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_pending_action_source" (
	"id" serial PRIMARY KEY NOT NULL,
	"pending_action_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"source_character_id" integer NOT NULL,
	"source_kind" "campaign_session_encounter_action_source_kind" NOT NULL,
	"source_ref" text NOT NULL,
	"source_instance_id" integer,
	"payload_json" text NOT NULL,
	"resolution_status" "campaign_session_encounter_action_resolution_status" DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp,
	"resolution_summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_pending_action_source_ref_nonblank" CHECK (length(trim("campaign_session_encounter_pending_action_source"."source_ref")) > 0),
	CONSTRAINT "campaign_session_encounter_pending_action_source_payload_nonblank" CHECK (length(trim("campaign_session_encounter_pending_action_source"."payload_json")) > 0),
	CONSTRAINT "campaign_session_encounter_pending_action_source_resolution_valid" CHECK ((
        ("campaign_session_encounter_pending_action_source"."resolution_status" = 'pending' AND "campaign_session_encounter_pending_action_source"."resolved_at" IS NULL)
        OR ("campaign_session_encounter_pending_action_source"."resolution_status" <> 'pending' AND "campaign_session_encounter_pending_action_source"."resolved_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_reaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"pending_action_id" integer NOT NULL,
	"reactor_character_id" integer NOT NULL,
	"reaction_type" "campaign_session_encounter_reaction_type" NOT NULL,
	"defending_item_id" integer,
	"defending_instance_id" integer,
	"committed_initiative_cost" double precision NOT NULL,
	"status" "campaign_session_encounter_reaction_status" DEFAULT 'declared' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"defender_final_cost" double precision,
	"attacker_additional_cost" double precision,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_reaction_cost_positive" CHECK ("campaign_session_encounter_reaction"."committed_initiative_cost" > 0),
	CONSTRAINT "campaign_session_encounter_reaction_final_cost_nonnegative" CHECK ("campaign_session_encounter_reaction"."defender_final_cost" IS NULL OR "campaign_session_encounter_reaction"."defender_final_cost" >= 0),
	CONSTRAINT "campaign_session_encounter_reaction_attacker_cost_nonnegative" CHECK ("campaign_session_encounter_reaction"."attacker_additional_cost" IS NULL OR "campaign_session_encounter_reaction"."attacker_additional_cost" >= 0),
	CONSTRAINT "campaign_session_encounter_reaction_resolution_valid" CHECK ((
        ("campaign_session_encounter_reaction"."status" = 'declared' AND "campaign_session_encounter_reaction"."resolved_at" IS NULL)
        OR ("campaign_session_encounter_reaction"."status" <> 'declared' AND "campaign_session_encounter_reaction"."resolved_at" IS NOT NULL)
      )),
	CONSTRAINT "campaign_session_encounter_reaction_defending_item_valid" CHECK ((
        ("campaign_session_encounter_reaction"."reaction_type" IN ('block', 'parry') AND "campaign_session_encounter_reaction"."defending_item_id" IS NOT NULL)
        OR ("campaign_session_encounter_reaction"."reaction_type" IN ('dodge', 'no-reaction') AND "campaign_session_encounter_reaction"."defending_item_id" IS NULL AND "campaign_session_encounter_reaction"."defending_instance_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_pending_action_hierarchy_uq" ON "campaign_session_encounter_pending_action" USING btree ("id","encounter_id","scene_id","session_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_pending_action_actor_hierarchy_uq" ON "campaign_session_encounter_pending_action" USING btree ("id","encounter_id","scene_id","session_id","campaign_id","actor_character_id");--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_pending_action_source" ADD CONSTRAINT "campaign_session_encounter_pending_action_source_action_fk" FOREIGN KEY ("pending_action_id","encounter_id","scene_id","session_id","campaign_id","source_character_id") REFERENCES "public"."campaign_session_encounter_pending_action"("id","encounter_id","scene_id","session_id","campaign_id","actor_character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_pending_action_source" ADD CONSTRAINT "campaign_session_encounter_pending_action_source_participant_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","source_character_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_action_fk" FOREIGN KEY ("pending_action_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_pending_action"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_reactor_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","reactor_character_id") REFERENCES "public"."campaign_session_encounter_initiative_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_pending_action_source_action_uq" ON "campaign_session_encounter_pending_action_source" USING btree ("pending_action_id");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_pending_action_source_history_idx" ON "campaign_session_encounter_pending_action_source" USING btree ("encounter_id","resolution_status","created_at");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_pending_action_source_character_idx" ON "campaign_session_encounter_pending_action_source" USING btree ("encounter_id","source_character_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_reaction_one_declared_reactor_uq" ON "campaign_session_encounter_reaction" USING btree ("pending_action_id","reactor_character_id") WHERE "campaign_session_encounter_reaction"."status" = 'declared';--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_reaction_history_idx" ON "campaign_session_encounter_reaction" USING btree ("encounter_id","pending_action_id","created_at");
