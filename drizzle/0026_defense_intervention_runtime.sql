ALTER TYPE "public"."campaign_session_encounter_reaction_type" ADD VALUE IF NOT EXISTS 'tackle';--> statement-breakpoint
ALTER TYPE "public"."campaign_session_encounter_reaction_type" ADD VALUE IF NOT EXISTS 'intervention';--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_reaction_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"reaction_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"from_status" "campaign_session_encounter_reaction_status",
	"to_status" "campaign_session_encounter_reaction_status" NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_reaction_event_kind_nonblank" CHECK (length(trim("campaign_session_encounter_reaction_event"."event_kind")) > 0),
	CONSTRAINT "campaign_session_encounter_reaction_event_metadata_object" CHECK (jsonb_typeof("campaign_session_encounter_reaction_event"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "defense_skill_path_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"defense_type" text DEFAULT 'dodge' NOT NULL,
	"endpoint_skill_id" integer NOT NULL,
	"conditional" boolean DEFAULT false NOT NULL,
	"circumstance_label" text DEFAULT '' NOT NULL,
	"review_state" text DEFAULT 'review-required' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "defense_skill_path_mapping_type_valid" CHECK ("defense_skill_path_mapping"."defense_type" = 'dodge'),
	CONSTRAINT "defense_skill_path_mapping_review_valid" CHECK ("defense_skill_path_mapping"."review_state" IN ('review-required','approved')),
	CONSTRAINT "defense_skill_path_mapping_order_valid" CHECK ("defense_skill_path_mapping"."sort_order" >= 0),
	CONSTRAINT "defense_skill_path_mapping_condition_valid" CHECK (("defense_skill_path_mapping"."conditional" AND length(trim("defense_skill_path_mapping"."circumstance_label")) > 0) OR (NOT "defense_skill_path_mapping"."conditional" AND "defense_skill_path_mapping"."circumstance_label" = ''))
);
--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" DROP CONSTRAINT "campaign_session_encounter_reaction_cost_positive";--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" DROP CONSTRAINT "campaign_session_encounter_reaction_defending_item_valid";--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" DROP CONSTRAINT "campaign_session_encounter_participant_scene_member_fk";
--> statement-breakpoint
ALTER TABLE "campaign_session_roll" DROP CONSTRAINT "campaign_session_roll_roller_character_fk";
--> statement-breakpoint
ALTER TABLE "campaign_session_roll" DROP CONSTRAINT "campaign_session_roll_target_character_fk";
--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD COLUMN "defense_resolution_json" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD COLUMN "defense_resolved_by_user_id" text;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD COLUMN "defense_resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD COLUMN "participant_id" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD COLUMN "participant_kind" text DEFAULT 'campaign-character' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD COLUMN "creature_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD COLUMN "display_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD COLUMN "creature_snapshot_json" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD COLUMN "local_state_json" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_pending_action" ADD COLUMN "additional_initiative_cost" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "protected_target_character_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "target_character_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "opposes_reaction_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "declaration_snapshot_json" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "objective_comparison_json" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "resolution_snapshot_json" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "roll_required" boolean;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "god_approval_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "declared_by_user_id" text;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "god_approved_by_user_id" text;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "ruling_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "ruled_by_user_id" text;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "ruled_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "original_action_disposition" text;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "reconciliation_applied_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction_event" ADD CONSTRAINT "campaign_session_encounter_reaction_event_reaction_fk" FOREIGN KEY ("reaction_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_reaction"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction_event" ADD CONSTRAINT "campaign_session_encounter_reaction_event_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defense_skill_path_mapping" ADD CONSTRAINT "defense_skill_path_mapping_endpoint_skill_id_skill_id_fk" FOREIGN KEY ("endpoint_skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defense_skill_path_mapping" ADD CONSTRAINT "defense_skill_path_mapping_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_reaction_event_history_idx" ON "campaign_session_encounter_reaction_event" USING btree ("reaction_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "defense_skill_path_mapping_identity_uq" ON "defense_skill_path_mapping" USING btree ("defense_type","endpoint_skill_id");--> statement-breakpoint
CREATE INDEX "defense_skill_path_mapping_review_idx" ON "defense_skill_path_mapping" USING btree ("defense_type","review_state","sort_order","id");--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_defense_resolved_by_fk" FOREIGN KEY ("defense_resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD CONSTRAINT "campaign_session_encounter_participant_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_opposes_reaction_id_campaign_session_encounter_reaction_id_fk" FOREIGN KEY ("opposes_reaction_id") REFERENCES "public"."campaign_session_encounter_reaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_protected_target_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","protected_target_character_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_target_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","target_character_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_declared_by_fk" FOREIGN KEY ("declared_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_god_approved_by_fk" FOREIGN KEY ("god_approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_ruled_by_fk" FOREIGN KEY ("ruled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_roller_encounter_participant_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","roller_character_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roll" ADD CONSTRAINT "campaign_session_roll_target_encounter_participant_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","target_character_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_participant_id_uq" ON "campaign_session_encounter_participant" USING btree ("participant_id");--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_defense_json_object" CHECK ("campaign_session_encounter_action_declaration"."defense_resolution_json" IS NULL OR jsonb_typeof("campaign_session_encounter_action_declaration"."defense_resolution_json") = 'object');--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_defense_state_valid" CHECK (("campaign_session_encounter_action_declaration"."defense_resolution_json" IS NULL AND "campaign_session_encounter_action_declaration"."defense_resolved_by_user_id" IS NULL AND "campaign_session_encounter_action_declaration"."defense_resolved_at" IS NULL) OR ("campaign_session_encounter_action_declaration"."defense_resolution_json" IS NOT NULL AND "campaign_session_encounter_action_declaration"."defense_resolved_by_user_id" IS NOT NULL AND "campaign_session_encounter_action_declaration"."defense_resolved_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_participant" ADD CONSTRAINT "campaign_session_encounter_participant_source_valid" CHECK ((
      ("campaign_session_encounter_participant"."participant_kind" = 'campaign-character' AND "campaign_session_encounter_participant"."character_id" > 0 AND "campaign_session_encounter_participant"."creature_id" IS NULL AND "campaign_session_encounter_participant"."creature_snapshot_json" IS NULL)
      OR ("campaign_session_encounter_participant"."participant_kind" = 'creature' AND "campaign_session_encounter_participant"."character_id" < 0 AND "campaign_session_encounter_participant"."creature_id" IS NOT NULL AND "campaign_session_encounter_participant"."creature_snapshot_json" IS NOT NULL AND length(trim("campaign_session_encounter_participant"."display_label")) > 0)
    ));--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_pending_action" ADD CONSTRAINT "campaign_session_encounter_pending_action_additional_cost_nonnegative" CHECK ("campaign_session_encounter_pending_action"."additional_initiative_cost" >= 0);--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_cost_nonnegative" CHECK ("campaign_session_encounter_reaction"."committed_initiative_cost" >= 0);--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_declaration_snapshot_object" CHECK ("campaign_session_encounter_reaction"."declaration_snapshot_json" IS NULL OR jsonb_typeof("campaign_session_encounter_reaction"."declaration_snapshot_json") = 'object');--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_comparison_snapshot_object" CHECK ("campaign_session_encounter_reaction"."objective_comparison_json" IS NULL OR jsonb_typeof("campaign_session_encounter_reaction"."objective_comparison_json") = 'object');--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_resolution_snapshot_object" CHECK ("campaign_session_encounter_reaction"."resolution_snapshot_json" IS NULL OR jsonb_typeof("campaign_session_encounter_reaction"."resolution_snapshot_json") = 'object');--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_pass_seven_identity_valid" CHECK ("campaign_session_encounter_reaction"."declaration_snapshot_json" IS NULL OR ("campaign_session_encounter_reaction"."protected_target_character_id" IS NOT NULL AND "campaign_session_encounter_reaction"."declared_by_user_id" IS NOT NULL AND "campaign_session_encounter_reaction"."roll_required" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_no_defense_cost_valid" CHECK ("campaign_session_encounter_reaction"."declaration_snapshot_json" IS NULL OR "campaign_session_encounter_reaction"."reaction_type" <> 'no-reaction' OR ("campaign_session_encounter_reaction"."committed_initiative_cost" = 0 AND "campaign_session_encounter_reaction"."roll_required" = false));--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_ruling_valid" CHECK (("campaign_session_encounter_reaction"."ruled_at" IS NULL AND "campaign_session_encounter_reaction"."ruled_by_user_id" IS NULL) OR ("campaign_session_encounter_reaction"."ruled_at" IS NOT NULL AND "campaign_session_encounter_reaction"."ruled_by_user_id" IS NOT NULL AND length(trim("campaign_session_encounter_reaction"."ruling_reason")) > 0));--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_disposition_valid" CHECK ("campaign_session_encounter_reaction"."original_action_disposition" IS NULL OR "campaign_session_encounter_reaction"."original_action_disposition" IN ('continue','continue-modified','retarget','cancel','stopped','target-removed','awaiting-god-ruling'));--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_defending_item_valid" CHECK ((
        ("campaign_session_encounter_reaction"."reaction_type" IN ('block', 'parry') AND "campaign_session_encounter_reaction"."defending_item_id" IS NOT NULL)
        OR ("campaign_session_encounter_reaction"."reaction_type" IN ('dodge', 'no-reaction') AND "campaign_session_encounter_reaction"."defending_item_id" IS NULL AND "campaign_session_encounter_reaction"."defending_instance_id" IS NULL)
        OR ("campaign_session_encounter_reaction"."reaction_type" NOT IN ('block', 'parry', 'dodge', 'no-reaction'))
      ));
