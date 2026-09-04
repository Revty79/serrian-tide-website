CREATE TYPE "public"."campaign_session_called_check_source_kind" AS ENUM('attribute', 'skill');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_called_check_status" AS ENUM('pending', 'answered', 'requires-god-ruling', 'resolved', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_high_low_mode" AS ENUM('neutral', 'player-calls-rolls', 'player-calls-god-rolls');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_high_low_side" AS ENUM('low', 'high');--> statement-breakpoint
CREATE TABLE "campaign_session_called_check_batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer,
	"encounter_id" integer,
	"issued_by_user_id" text NOT NULL,
	"source_kind" "campaign_session_called_check_source_kind" NOT NULL,
	"attribute_key" text,
	"endpoint_skill_id" integer,
	"selected_skill_path_json" jsonb,
	"purpose" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"recipient_scope" text NOT NULL,
	"visibility" "campaign_session_roll_visibility" NOT NULL,
	"roll_method" "campaign_session_roll_method" NOT NULL,
	"modifiers_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_called_check_batch_hierarchy_uq" UNIQUE("id","campaign_id","session_id"),
	CONSTRAINT "campaign_session_called_check_batch_hierarchy_valid" CHECK (("campaign_session_called_check_batch"."scene_id" IS NULL AND "campaign_session_called_check_batch"."encounter_id" IS NULL) OR ("campaign_session_called_check_batch"."scene_id" IS NOT NULL)),
	CONSTRAINT "campaign_session_called_check_batch_source_valid" CHECK (("campaign_session_called_check_batch"."source_kind" = 'attribute' AND "campaign_session_called_check_batch"."attribute_key" IN ('STR','DEX','CON','INT','WIS','CHR') AND "campaign_session_called_check_batch"."endpoint_skill_id" IS NULL AND "campaign_session_called_check_batch"."selected_skill_path_json" IS NULL) OR ("campaign_session_called_check_batch"."source_kind" = 'skill' AND "campaign_session_called_check_batch"."attribute_key" IS NULL AND "campaign_session_called_check_batch"."endpoint_skill_id" IS NOT NULL AND jsonb_typeof("campaign_session_called_check_batch"."selected_skill_path_json") = 'array' AND jsonb_array_length("campaign_session_called_check_batch"."selected_skill_path_json") > 0)),
	CONSTRAINT "campaign_session_called_check_batch_scope_valid" CHECK ("campaign_session_called_check_batch"."recipient_scope" IN ('one','selected','all-pcs')),
	CONSTRAINT "campaign_session_called_check_batch_text_valid" CHECK (length(trim("campaign_session_called_check_batch"."purpose")) > 0 AND length("campaign_session_called_check_batch"."purpose") <= 500 AND length("campaign_session_called_check_batch"."instructions") <= 2000 AND length(trim("campaign_session_called_check_batch"."idempotency_key")) > 0 AND length("campaign_session_called_check_batch"."idempotency_key") <= 200),
	CONSTRAINT "campaign_session_called_check_batch_modifiers_valid" CHECK (jsonb_typeof("campaign_session_called_check_batch"."modifiers_json") = 'array')
);
--> statement-breakpoint
CREATE TABLE "campaign_session_called_check_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"from_status" "campaign_session_called_check_status",
	"to_status" "campaign_session_called_check_status" NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_called_check_event_valid" CHECK (length(trim("campaign_session_called_check_event"."event_kind")) > 0 AND length("campaign_session_called_check_event"."event_kind") <= 100 AND length("campaign_session_called_check_event"."reason") <= 500 AND jsonb_typeof("campaign_session_called_check_event"."metadata_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "campaign_session_called_check_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer,
	"encounter_id" integer,
	"recipient_character_id" integer NOT NULL,
	"recipient_kind" text NOT NULL,
	"status" "campaign_session_called_check_status" DEFAULT 'pending' NOT NULL,
	"governing_source_json" jsonb,
	"governing_snapshot_json" jsonb,
	"original_target" double precision,
	"modifiers_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final_target" double precision,
	"resolution_json" jsonb,
	"roll_id" integer,
	"parent_request_id" integer,
	"response_idempotency_key" text,
	"cancellation_reason" text DEFAULT '' NOT NULL,
	"reroll_reason" text DEFAULT '' NOT NULL,
	"ruling_text" text DEFAULT '' NOT NULL,
	"revealed_visibility" "campaign_session_roll_visibility",
	"revealed_by_user_id" text,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"resolved_at" timestamp,
	"cancelled_at" timestamp,
	"revealed_at" timestamp,
	CONSTRAINT "campaign_session_called_check_request_hierarchy_uq" UNIQUE("id","campaign_id","session_id"),
	CONSTRAINT "campaign_session_called_check_request_hierarchy_valid" CHECK (("campaign_session_called_check_request"."scene_id" IS NULL AND "campaign_session_called_check_request"."encounter_id" IS NULL) OR ("campaign_session_called_check_request"."scene_id" IS NOT NULL)),
	CONSTRAINT "campaign_session_called_check_request_recipient_valid" CHECK ("campaign_session_called_check_request"."recipient_character_id" > 0 AND "campaign_session_called_check_request"."recipient_kind" IN ('pc','npc')),
	CONSTRAINT "campaign_session_called_check_request_snapshot_valid" CHECK (("campaign_session_called_check_request"."governing_source_json" IS NULL OR jsonb_typeof("campaign_session_called_check_request"."governing_source_json") = 'object') AND ("campaign_session_called_check_request"."governing_snapshot_json" IS NULL OR jsonb_typeof("campaign_session_called_check_request"."governing_snapshot_json") = 'object') AND jsonb_typeof("campaign_session_called_check_request"."modifiers_json") = 'array' AND ("campaign_session_called_check_request"."resolution_json" IS NULL OR jsonb_typeof("campaign_session_called_check_request"."resolution_json") = 'object')),
	CONSTRAINT "campaign_session_called_check_request_reroll_valid" CHECK (("campaign_session_called_check_request"."parent_request_id" IS NULL AND "campaign_session_called_check_request"."reroll_reason" = '') OR ("campaign_session_called_check_request"."parent_request_id" IS NOT NULL AND length(trim("campaign_session_called_check_request"."reroll_reason")) > 0 AND length("campaign_session_called_check_request"."reroll_reason") <= 500)),
	CONSTRAINT "campaign_session_called_check_request_cancellation_valid" CHECK (("campaign_session_called_check_request"."status" = 'cancelled' AND "campaign_session_called_check_request"."cancelled_at" IS NOT NULL AND length(trim("campaign_session_called_check_request"."cancellation_reason")) > 0) OR ("campaign_session_called_check_request"."status" <> 'cancelled' AND "campaign_session_called_check_request"."cancelled_at" IS NULL AND "campaign_session_called_check_request"."cancellation_reason" = '')),
	CONSTRAINT "campaign_session_called_check_request_response_valid" CHECK (("campaign_session_called_check_request"."roll_id" IS NULL AND "campaign_session_called_check_request"."responded_at" IS NULL AND "campaign_session_called_check_request"."resolution_json" IS NULL AND "campaign_session_called_check_request"."response_idempotency_key" IS NULL) OR ("campaign_session_called_check_request"."roll_id" IS NOT NULL AND "campaign_session_called_check_request"."responded_at" IS NOT NULL AND "campaign_session_called_check_request"."resolution_json" IS NOT NULL AND "campaign_session_called_check_request"."response_idempotency_key" IS NOT NULL)),
	CONSTRAINT "campaign_session_called_check_request_resolution_valid" CHECK (("campaign_session_called_check_request"."status" = 'resolved' AND "campaign_session_called_check_request"."resolved_at" IS NOT NULL) OR ("campaign_session_called_check_request"."status" IN ('pending','answered','cancelled') AND "campaign_session_called_check_request"."resolved_at" IS NULL) OR ("campaign_session_called_check_request"."status" IN ('requires-god-ruling','superseded'))),
	CONSTRAINT "campaign_session_called_check_request_reveal_valid" CHECK (("campaign_session_called_check_request"."revealed_at" IS NULL AND "campaign_session_called_check_request"."revealed_by_user_id" IS NULL AND "campaign_session_called_check_request"."revealed_visibility" IS NULL) OR ("campaign_session_called_check_request"."revealed_at" IS NOT NULL AND "campaign_session_called_check_request"."revealed_by_user_id" IS NOT NULL AND "campaign_session_called_check_request"."revealed_visibility" IN ('table','private'))),
	CONSTRAINT "campaign_session_called_check_request_text_valid" CHECK (length("campaign_session_called_check_request"."cancellation_reason") <= 500 AND length("campaign_session_called_check_request"."ruling_text") <= 2000 AND ("campaign_session_called_check_request"."response_idempotency_key" IS NULL OR (length(trim("campaign_session_called_check_request"."response_idempotency_key")) > 0 AND length("campaign_session_called_check_request"."response_idempotency_key") <= 200)))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_high_low_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"from_status" "campaign_session_called_check_status",
	"to_status" "campaign_session_called_check_status" NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_high_low_event_valid" CHECK (length(trim("campaign_session_high_low_event"."event_kind")) > 0 AND length("campaign_session_high_low_event"."event_kind") <= 100 AND length("campaign_session_high_low_event"."reason") <= 500 AND jsonb_typeof("campaign_session_high_low_event"."metadata_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "campaign_session_high_low_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer,
	"encounter_id" integer,
	"mode" "campaign_session_high_low_mode" NOT NULL,
	"participant_character_id" integer,
	"visibility" "campaign_session_roll_visibility" NOT NULL,
	"roll_method" "campaign_session_roll_method" NOT NULL,
	"purpose" text NOT NULL,
	"status" "campaign_session_called_check_status" DEFAULT 'pending' NOT NULL,
	"called_side" "campaign_session_high_low_side",
	"caller_user_id" text,
	"roll_id" integer,
	"result_snapshot_json" jsonb,
	"parent_request_id" integer,
	"issue_idempotency_key" text NOT NULL,
	"call_idempotency_key" text,
	"response_idempotency_key" text,
	"cancellation_reason" text DEFAULT '' NOT NULL,
	"reroll_reason" text DEFAULT '' NOT NULL,
	"ruling_text" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"called_at" timestamp,
	"responded_at" timestamp,
	"resolved_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_high_low_request_hierarchy_uq" UNIQUE("id","campaign_id","session_id"),
	CONSTRAINT "campaign_session_high_low_request_hierarchy_valid" CHECK (("campaign_session_high_low_request"."scene_id" IS NULL AND "campaign_session_high_low_request"."encounter_id" IS NULL) OR ("campaign_session_high_low_request"."scene_id" IS NOT NULL)),
	CONSTRAINT "campaign_session_high_low_request_participant_valid" CHECK (("campaign_session_high_low_request"."mode" = 'neutral' AND "campaign_session_high_low_request"."participant_character_id" IS NULL AND "campaign_session_high_low_request"."called_side" IS NULL AND "campaign_session_high_low_request"."caller_user_id" IS NULL AND "campaign_session_high_low_request"."called_at" IS NULL) OR ("campaign_session_high_low_request"."mode" IN ('player-calls-rolls','player-calls-god-rolls') AND "campaign_session_high_low_request"."participant_character_id" > 0)),
	CONSTRAINT "campaign_session_high_low_request_call_valid" CHECK (("campaign_session_high_low_request"."called_side" IS NULL AND "campaign_session_high_low_request"."caller_user_id" IS NULL AND "campaign_session_high_low_request"."called_at" IS NULL AND "campaign_session_high_low_request"."call_idempotency_key" IS NULL) OR ("campaign_session_high_low_request"."called_side" IS NOT NULL AND "campaign_session_high_low_request"."caller_user_id" IS NOT NULL AND "campaign_session_high_low_request"."called_at" IS NOT NULL AND "campaign_session_high_low_request"."call_idempotency_key" IS NOT NULL)),
	CONSTRAINT "campaign_session_high_low_request_response_valid" CHECK (("campaign_session_high_low_request"."roll_id" IS NULL AND "campaign_session_high_low_request"."result_snapshot_json" IS NULL AND "campaign_session_high_low_request"."responded_at" IS NULL AND "campaign_session_high_low_request"."response_idempotency_key" IS NULL) OR ("campaign_session_high_low_request"."roll_id" IS NOT NULL AND jsonb_typeof("campaign_session_high_low_request"."result_snapshot_json") = 'object' AND "campaign_session_high_low_request"."responded_at" IS NOT NULL AND "campaign_session_high_low_request"."response_idempotency_key" IS NOT NULL)),
	CONSTRAINT "campaign_session_high_low_request_reroll_valid" CHECK (("campaign_session_high_low_request"."parent_request_id" IS NULL AND "campaign_session_high_low_request"."reroll_reason" = '') OR ("campaign_session_high_low_request"."parent_request_id" IS NOT NULL AND length(trim("campaign_session_high_low_request"."reroll_reason")) > 0 AND length("campaign_session_high_low_request"."reroll_reason") <= 500)),
	CONSTRAINT "campaign_session_high_low_request_cancellation_valid" CHECK (("campaign_session_high_low_request"."status" = 'cancelled' AND "campaign_session_high_low_request"."cancelled_at" IS NOT NULL AND length(trim("campaign_session_high_low_request"."cancellation_reason")) > 0) OR ("campaign_session_high_low_request"."status" <> 'cancelled' AND "campaign_session_high_low_request"."cancelled_at" IS NULL AND "campaign_session_high_low_request"."cancellation_reason" = '')),
	CONSTRAINT "campaign_session_high_low_request_resolution_valid" CHECK (("campaign_session_high_low_request"."status" = 'resolved' AND "campaign_session_high_low_request"."resolved_at" IS NOT NULL) OR ("campaign_session_high_low_request"."status" IN ('pending','answered','requires-god-ruling','cancelled') AND "campaign_session_high_low_request"."resolved_at" IS NULL) OR ("campaign_session_high_low_request"."status" = 'superseded')),
	CONSTRAINT "campaign_session_high_low_request_text_valid" CHECK (length(trim("campaign_session_high_low_request"."purpose")) > 0 AND length("campaign_session_high_low_request"."purpose") <= 500 AND length("campaign_session_high_low_request"."cancellation_reason") <= 500 AND length("campaign_session_high_low_request"."ruling_text") <= 2000 AND length(trim("campaign_session_high_low_request"."issue_idempotency_key")) > 0 AND length("campaign_session_high_low_request"."issue_idempotency_key") <= 200 AND ("campaign_session_high_low_request"."call_idempotency_key" IS NULL OR length("campaign_session_high_low_request"."call_idempotency_key") <= 200) AND ("campaign_session_high_low_request"."response_idempotency_key" IS NULL OR length("campaign_session_high_low_request"."response_idempotency_key") <= 200))
);
--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_batch" ADD CONSTRAINT "campaign_session_called_check_batch_endpoint_skill_id_skill_id_fk" FOREIGN KEY ("endpoint_skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_batch" ADD CONSTRAINT "campaign_session_called_check_batch_session_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_batch" ADD CONSTRAINT "campaign_session_called_check_batch_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_batch" ADD CONSTRAINT "campaign_session_called_check_batch_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_batch" ADD CONSTRAINT "campaign_session_called_check_batch_issuer_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_event" ADD CONSTRAINT "campaign_session_called_check_event_request_fk" FOREIGN KEY ("request_id","campaign_id","session_id") REFERENCES "public"."campaign_session_called_check_request"("id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_event" ADD CONSTRAINT "campaign_session_called_check_event_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_request" ADD CONSTRAINT "campaign_session_called_check_request_batch_fk" FOREIGN KEY ("batch_id","campaign_id","session_id") REFERENCES "public"."campaign_session_called_check_batch"("id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_request" ADD CONSTRAINT "campaign_session_called_check_request_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_request" ADD CONSTRAINT "campaign_session_called_check_request_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_request" ADD CONSTRAINT "campaign_session_called_check_request_roster_fk" FOREIGN KEY ("session_id","recipient_character_id") REFERENCES "public"."campaign_session_roster"("session_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_request" ADD CONSTRAINT "campaign_session_called_check_request_roll_fk" FOREIGN KEY ("roll_id","campaign_id","session_id") REFERENCES "public"."campaign_session_roll"("id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_request" ADD CONSTRAINT "campaign_session_called_check_request_parent_fk" FOREIGN KEY ("parent_request_id","campaign_id","session_id") REFERENCES "public"."campaign_session_called_check_request"("id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_called_check_request" ADD CONSTRAINT "campaign_session_called_check_request_revealer_fk" FOREIGN KEY ("revealed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_event" ADD CONSTRAINT "campaign_session_high_low_event_request_fk" FOREIGN KEY ("request_id","campaign_id","session_id") REFERENCES "public"."campaign_session_high_low_request"("id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_event" ADD CONSTRAINT "campaign_session_high_low_event_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_request" ADD CONSTRAINT "campaign_session_high_low_request_session_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_request" ADD CONSTRAINT "campaign_session_high_low_request_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_request" ADD CONSTRAINT "campaign_session_high_low_request_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_request" ADD CONSTRAINT "campaign_session_high_low_request_roster_fk" FOREIGN KEY ("session_id","participant_character_id") REFERENCES "public"."campaign_session_roster"("session_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_request" ADD CONSTRAINT "campaign_session_high_low_request_roll_fk" FOREIGN KEY ("roll_id","campaign_id","session_id") REFERENCES "public"."campaign_session_roll"("id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_request" ADD CONSTRAINT "campaign_session_high_low_request_parent_fk" FOREIGN KEY ("parent_request_id","campaign_id","session_id") REFERENCES "public"."campaign_session_high_low_request"("id","campaign_id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_request" ADD CONSTRAINT "campaign_session_high_low_request_caller_fk" FOREIGN KEY ("caller_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_high_low_request" ADD CONSTRAINT "campaign_session_high_low_request_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_called_check_batch_idempotency_uq" ON "campaign_session_called_check_batch" USING btree ("campaign_id","issued_by_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "campaign_session_called_check_batch_history_idx" ON "campaign_session_called_check_batch" USING btree ("session_id","created_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_called_check_event_history_idx" ON "campaign_session_called_check_event" USING btree ("request_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_called_check_request_root_recipient_uq" ON "campaign_session_called_check_request" USING btree ("batch_id","recipient_character_id") WHERE "campaign_session_called_check_request"."parent_request_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_called_check_request_successor_uq" ON "campaign_session_called_check_request" USING btree ("parent_request_id") WHERE "campaign_session_called_check_request"."parent_request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_called_check_request_roll_uq" ON "campaign_session_called_check_request" USING btree ("roll_id") WHERE "campaign_session_called_check_request"."roll_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_called_check_request_response_idempotency_uq" ON "campaign_session_called_check_request" USING btree ("response_idempotency_key") WHERE "campaign_session_called_check_request"."response_idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_session_called_check_request_pending_idx" ON "campaign_session_called_check_request" USING btree ("session_id","status","recipient_character_id");--> statement-breakpoint
CREATE INDEX "campaign_session_called_check_request_history_idx" ON "campaign_session_called_check_request" USING btree ("batch_id","recipient_character_id","issued_at","id");--> statement-breakpoint
CREATE INDEX "campaign_session_high_low_event_history_idx" ON "campaign_session_high_low_event" USING btree ("request_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_high_low_request_issue_idempotency_uq" ON "campaign_session_high_low_request" USING btree ("campaign_id","created_by_user_id","issue_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_high_low_request_successor_uq" ON "campaign_session_high_low_request" USING btree ("parent_request_id") WHERE "campaign_session_high_low_request"."parent_request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_high_low_request_roll_uq" ON "campaign_session_high_low_request" USING btree ("roll_id") WHERE "campaign_session_high_low_request"."roll_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_high_low_request_call_idempotency_uq" ON "campaign_session_high_low_request" USING btree ("call_idempotency_key") WHERE "campaign_session_high_low_request"."call_idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_high_low_request_response_idempotency_uq" ON "campaign_session_high_low_request" USING btree ("response_idempotency_key") WHERE "campaign_session_high_low_request"."response_idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_session_high_low_request_pending_idx" ON "campaign_session_high_low_request" USING btree ("session_id","status","participant_character_id");--> statement-breakpoint
CREATE INDEX "campaign_session_high_low_request_history_idx" ON "campaign_session_high_low_request" USING btree ("session_id","created_at","id");
