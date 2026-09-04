CREATE TYPE "public"."campaign_session_encounter_action_declaration_status" AS ENUM('draft', 'locked', 'committed', 'rolling-ready', 'rolling', 'awaiting-god-ruling', 'resolved', 'cancelled', 'interrupted', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_responder_opportunity_source" AS ENUM('initiative', 'god-exception');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_responder_opportunity_status" AS ENUM('pending', 'response-declared', 'declined', 'ineligible', 'cancelled');--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_action_declaration" (
	"id" serial PRIMARY KEY NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"actor_character_id" integer NOT NULL,
	"pending_action_id" integer,
	"supersedes_declaration_id" integer,
	"status" "campaign_session_encounter_action_declaration_status" DEFAULT 'draft' NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"draft_json" jsonb NOT NULL,
	"locked_snapshot_json" jsonb,
	"ruling_reason" text DEFAULT '' NOT NULL,
	"ruling_notes" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"locked_by_user_id" text,
	"committed_by_user_id" text,
	"ended_by_user_id" text,
	"locked_at" timestamp,
	"committed_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_action_declaration_hierarchy_uq" UNIQUE("id","encounter_id","scene_id","session_id","campaign_id"),
	CONSTRAINT "campaign_session_encounter_action_declaration_pending_hierarchy_uq" UNIQUE("id","pending_action_id","encounter_id","scene_id","session_id","campaign_id"),
	CONSTRAINT "campaign_session_encounter_action_declaration_version_positive" CHECK ("campaign_session_encounter_action_declaration"."version_number" > 0),
	CONSTRAINT "campaign_session_encounter_action_declaration_draft_object" CHECK (jsonb_typeof("campaign_session_encounter_action_declaration"."draft_json") = 'object'),
	CONSTRAINT "campaign_session_encounter_action_declaration_snapshot_object" CHECK ("campaign_session_encounter_action_declaration"."locked_snapshot_json" IS NULL OR jsonb_typeof("campaign_session_encounter_action_declaration"."locked_snapshot_json") = 'object'),
	CONSTRAINT "campaign_session_encounter_action_declaration_lifecycle_valid" CHECK ((
        "campaign_session_encounter_action_declaration"."status" = 'draft'
        AND "campaign_session_encounter_action_declaration"."pending_action_id" IS NULL
        AND "campaign_session_encounter_action_declaration"."locked_snapshot_json" IS NULL
        AND "campaign_session_encounter_action_declaration"."locked_at" IS NULL
        AND "campaign_session_encounter_action_declaration"."locked_by_user_id" IS NULL
        AND "campaign_session_encounter_action_declaration"."committed_at" IS NULL
        AND "campaign_session_encounter_action_declaration"."committed_by_user_id" IS NULL
      ) OR (
        "campaign_session_encounter_action_declaration"."status" = 'locked'
        AND "campaign_session_encounter_action_declaration"."pending_action_id" IS NULL
        AND "campaign_session_encounter_action_declaration"."locked_snapshot_json" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."locked_at" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."locked_by_user_id" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."committed_at" IS NULL
        AND "campaign_session_encounter_action_declaration"."committed_by_user_id" IS NULL
      ) OR (
        "campaign_session_encounter_action_declaration"."status" IN ('committed','rolling-ready','rolling','awaiting-god-ruling','resolved','interrupted','abandoned')
        AND "campaign_session_encounter_action_declaration"."pending_action_id" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."locked_snapshot_json" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."locked_at" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."locked_by_user_id" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."committed_at" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."committed_by_user_id" IS NOT NULL
      ) OR (
        "campaign_session_encounter_action_declaration"."status" = 'cancelled'
        AND (
          (
            "campaign_session_encounter_action_declaration"."pending_action_id" IS NULL
            AND "campaign_session_encounter_action_declaration"."locked_snapshot_json" IS NULL
            AND "campaign_session_encounter_action_declaration"."locked_at" IS NULL
            AND "campaign_session_encounter_action_declaration"."locked_by_user_id" IS NULL
            AND "campaign_session_encounter_action_declaration"."committed_at" IS NULL
            AND "campaign_session_encounter_action_declaration"."committed_by_user_id" IS NULL
          ) OR (
            "campaign_session_encounter_action_declaration"."pending_action_id" IS NULL
            AND "campaign_session_encounter_action_declaration"."locked_snapshot_json" IS NOT NULL
            AND "campaign_session_encounter_action_declaration"."locked_at" IS NOT NULL
            AND "campaign_session_encounter_action_declaration"."locked_by_user_id" IS NOT NULL
            AND "campaign_session_encounter_action_declaration"."committed_at" IS NULL
            AND "campaign_session_encounter_action_declaration"."committed_by_user_id" IS NULL
          ) OR (
            "campaign_session_encounter_action_declaration"."pending_action_id" IS NOT NULL
            AND "campaign_session_encounter_action_declaration"."locked_snapshot_json" IS NOT NULL
            AND "campaign_session_encounter_action_declaration"."locked_at" IS NOT NULL
            AND "campaign_session_encounter_action_declaration"."locked_by_user_id" IS NOT NULL
            AND "campaign_session_encounter_action_declaration"."committed_at" IS NOT NULL
            AND "campaign_session_encounter_action_declaration"."committed_by_user_id" IS NOT NULL
          )
        )
      )),
	CONSTRAINT "campaign_session_encounter_action_declaration_end_valid" CHECK ((
        "campaign_session_encounter_action_declaration"."status" IN ('resolved','cancelled','abandoned')
        AND "campaign_session_encounter_action_declaration"."ended_at" IS NOT NULL
        AND "campaign_session_encounter_action_declaration"."ended_by_user_id" IS NOT NULL
      ) OR (
        "campaign_session_encounter_action_declaration"."status" NOT IN ('resolved','cancelled','abandoned')
        AND "campaign_session_encounter_action_declaration"."ended_at" IS NULL
        AND "campaign_session_encounter_action_declaration"."ended_by_user_id" IS NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_action_declaration_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"declaration_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"from_status" "campaign_session_encounter_action_declaration_status",
	"to_status" "campaign_session_encounter_action_declaration_status" NOT NULL,
	"event_kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_action_declaration_event_kind_nonblank" CHECK (length(trim("campaign_session_encounter_action_declaration_event"."event_kind")) > 0),
	CONSTRAINT "campaign_session_encounter_action_declaration_event_metadata_object" CHECK (jsonb_typeof("campaign_session_encounter_action_declaration_event"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_responder_opportunity" (
	"id" serial PRIMARY KEY NOT NULL,
	"declaration_id" integer NOT NULL,
	"pending_action_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"responder_character_id" integer NOT NULL,
	"reaction_id" integer,
	"source" "campaign_session_encounter_responder_opportunity_source" NOT NULL,
	"status" "campaign_session_encounter_responder_opportunity_status" DEFAULT 'pending' NOT NULL,
	"window_sequence" integer DEFAULT 1 NOT NULL,
	"reached_at_initiative" double precision NOT NULL,
	"reason" text NOT NULL,
	"requires_god_confirmation" boolean DEFAULT true NOT NULL,
	"response_label" text DEFAULT '' NOT NULL,
	"ruling_reason" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"reconciled_by_user_id" text,
	"reconciled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_responder_opportunity_window_positive" CHECK ("campaign_session_encounter_responder_opportunity"."window_sequence" > 0),
	CONSTRAINT "campaign_session_encounter_responder_opportunity_reason_nonblank" CHECK (length(trim("campaign_session_encounter_responder_opportunity"."reason")) > 0),
	CONSTRAINT "campaign_session_encounter_responder_opportunity_reconciliation_valid" CHECK ((
        "campaign_session_encounter_responder_opportunity"."status" = 'pending'
        AND "campaign_session_encounter_responder_opportunity"."reconciled_at" IS NULL
        AND "campaign_session_encounter_responder_opportunity"."reconciled_by_user_id" IS NULL
      ) OR (
        "campaign_session_encounter_responder_opportunity"."status" <> 'pending'
        AND "campaign_session_encounter_responder_opportunity"."reconciled_at" IS NOT NULL
        AND "campaign_session_encounter_responder_opportunity"."reconciled_by_user_id" IS NOT NULL
      )),
	CONSTRAINT "campaign_session_encounter_responder_opportunity_ineligible_reason" CHECK ("campaign_session_encounter_responder_opportunity"."status" <> 'ineligible' OR length(trim("campaign_session_encounter_responder_opportunity"."ruling_reason")) > 0),
	CONSTRAINT "campaign_session_encounter_responder_opportunity_exception_reason" CHECK ("campaign_session_encounter_responder_opportunity"."source" <> 'god-exception' OR length(trim("campaign_session_encounter_responder_opportunity"."ruling_reason")) > 0),
	CONSTRAINT "campaign_session_encounter_responder_opportunity_response_label" CHECK ("campaign_session_encounter_responder_opportunity"."status" <> 'response-declared' OR length(trim("campaign_session_encounter_responder_opportunity"."response_label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_actor_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","actor_character_id") REFERENCES "public"."campaign_session_encounter_initiative_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_pending_action_fk" FOREIGN KEY ("pending_action_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_pending_action"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_revision_fk" FOREIGN KEY ("supersedes_declaration_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_action_declaration"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_locked_by_fk" FOREIGN KEY ("locked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_committed_by_fk" FOREIGN KEY ("committed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "campaign_session_encounter_action_declaration_ended_by_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration_event" ADD CONSTRAINT "campaign_session_encounter_action_declaration_event_declaration_fk" FOREIGN KEY ("declaration_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_action_declaration"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration_event" ADD CONSTRAINT "campaign_session_encounter_action_declaration_event_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_responder_opportunity" ADD CONSTRAINT "campaign_session_encounter_responder_opportunity_declaration_fk" FOREIGN KEY ("declaration_id","pending_action_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_action_declaration"("id","pending_action_id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_responder_opportunity" ADD CONSTRAINT "campaign_session_encounter_responder_opportunity_responder_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","responder_character_id") REFERENCES "public"."campaign_session_encounter_initiative_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_responder_opportunity" ADD CONSTRAINT "campaign_session_encounter_responder_opportunity_reaction_fk" FOREIGN KEY ("reaction_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_reaction"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_responder_opportunity" ADD CONSTRAINT "campaign_session_encounter_responder_opportunity_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_responder_opportunity" ADD CONSTRAINT "campaign_session_encounter_responder_opportunity_reconciled_by_fk" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_action_declaration_pending_action_uq" ON "campaign_session_encounter_action_declaration" USING btree ("pending_action_id") WHERE "campaign_session_encounter_action_declaration"."pending_action_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_action_declaration_supersedes_uq" ON "campaign_session_encounter_action_declaration" USING btree ("supersedes_declaration_id") WHERE "campaign_session_encounter_action_declaration"."supersedes_declaration_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_action_declaration_status_idx" ON "campaign_session_encounter_action_declaration" USING btree ("encounter_id","status","created_at");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_action_declaration_actor_idx" ON "campaign_session_encounter_action_declaration" USING btree ("encounter_id","actor_character_id","created_at");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_action_declaration_event_history_idx" ON "campaign_session_encounter_action_declaration_event" USING btree ("declaration_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_responder_opportunity_character_uq" ON "campaign_session_encounter_responder_opportunity" USING btree ("declaration_id","window_sequence","responder_character_id");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_responder_opportunity_status_idx" ON "campaign_session_encounter_responder_opportunity" USING btree ("declaration_id","status","reached_at_initiative");