CREATE TYPE "public"."campaign_session_player_ruling_request_status" AS ENUM('pending', 'clarification-requested', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_player_ruling_request_type" AS ENUM('manual-action', 'called-shot', 'ally-defense', 'tackle', 'intervention', 'firearm-preparation');--> statement-breakpoint
CREATE TABLE "campaign_session_player_ruling_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"target_participant_id" integer,
	"request_type" "campaign_session_player_ruling_request_type" NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref" text DEFAULT '' NOT NULL,
	"source_instance_id" integer,
	"intent" text NOT NULL,
	"requested_timing" text DEFAULT '' NOT NULL,
	"blocked_reason" text NOT NULL,
	"frozen_request_json" jsonb NOT NULL,
	"status" "campaign_session_player_ruling_request_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"god_response" text DEFAULT '' NOT NULL,
	"ruling_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_declaration_id" integer,
	"linked_reaction_id" integer,
	"linked_firearm_attack_id" integer,
	"requested_by_user_id" text NOT NULL,
	"resolved_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "campaign_session_player_ruling_request_hierarchy_uq" UNIQUE("id","encounter_id","scene_id","session_id","campaign_id"),
	CONSTRAINT "campaign_session_player_ruling_request_character_positive" CHECK ("campaign_session_player_ruling_request"."character_id" > 0),
	CONSTRAINT "campaign_session_player_ruling_request_source_kind_nonblank" CHECK (length(trim("campaign_session_player_ruling_request"."source_kind")) > 0),
	CONSTRAINT "campaign_session_player_ruling_request_intent_nonblank" CHECK (length(trim("campaign_session_player_ruling_request"."intent")) > 0),
	CONSTRAINT "campaign_session_player_ruling_request_blocked_reason_nonblank" CHECK (length(trim("campaign_session_player_ruling_request"."blocked_reason")) > 0),
	CONSTRAINT "campaign_session_player_ruling_request_idempotency_nonblank" CHECK (length(trim("campaign_session_player_ruling_request"."idempotency_key")) > 0),
	CONSTRAINT "campaign_session_player_ruling_request_frozen_object" CHECK (jsonb_typeof("campaign_session_player_ruling_request"."frozen_request_json") = 'object'),
	CONSTRAINT "campaign_session_player_ruling_request_ruling_object" CHECK (jsonb_typeof("campaign_session_player_ruling_request"."ruling_json") = 'object'),
	CONSTRAINT "campaign_session_player_ruling_request_resolution_valid" CHECK ((
      "campaign_session_player_ruling_request"."status" IN ('pending','clarification-requested','cancelled')
      AND "campaign_session_player_ruling_request"."resolved_at" IS NULL
      AND "campaign_session_player_ruling_request"."resolved_by_user_id" IS NULL
    ) OR (
      "campaign_session_player_ruling_request"."status" IN ('approved','rejected')
      AND "campaign_session_player_ruling_request"."resolved_at" IS NOT NULL
      AND "campaign_session_player_ruling_request"."resolved_by_user_id" IS NOT NULL
      AND length(trim("campaign_session_player_ruling_request"."god_response")) > 0
    ))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_player_ruling_request_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"from_status" "campaign_session_player_ruling_request_status",
	"to_status" "campaign_session_player_ruling_request_status" NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_player_ruling_request_event_kind_nonblank" CHECK (length(trim("campaign_session_player_ruling_request_event"."event_kind")) > 0),
	CONSTRAINT "campaign_session_player_ruling_request_event_metadata_object" CHECK (jsonb_typeof("campaign_session_player_ruling_request_event"."metadata_json") = 'object')
);
--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request" ADD CONSTRAINT "campaign_session_player_ruling_request_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request" ADD CONSTRAINT "campaign_session_player_ruling_request_character_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","character_id") REFERENCES "public"."campaign_session_encounter_initiative_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request" ADD CONSTRAINT "campaign_session_player_ruling_request_target_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","target_participant_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request" ADD CONSTRAINT "campaign_session_player_ruling_request_declaration_fk" FOREIGN KEY ("linked_declaration_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_action_declaration"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request" ADD CONSTRAINT "campaign_session_player_ruling_request_reaction_fk" FOREIGN KEY ("linked_reaction_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_reaction"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request" ADD CONSTRAINT "campaign_session_player_ruling_request_firearm_attack_fk" FOREIGN KEY ("linked_firearm_attack_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_firearm_attack"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request" ADD CONSTRAINT "campaign_session_player_ruling_request_requested_by_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request" ADD CONSTRAINT "campaign_session_player_ruling_request_resolved_by_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request_event" ADD CONSTRAINT "campaign_session_player_ruling_request_event_request_fk" FOREIGN KEY ("request_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_player_ruling_request"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_player_ruling_request_event" ADD CONSTRAINT "campaign_session_player_ruling_request_event_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_player_ruling_request_idempotency_uq" ON "campaign_session_player_ruling_request" USING btree ("campaign_id","requested_by_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "campaign_session_player_ruling_request_encounter_status_idx" ON "campaign_session_player_ruling_request" USING btree ("encounter_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_player_ruling_request_character_idx" ON "campaign_session_player_ruling_request" USING btree ("character_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_player_ruling_request_event_history_idx" ON "campaign_session_player_ruling_request_event" USING btree ("request_id","created_at","id");