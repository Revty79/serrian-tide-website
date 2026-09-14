CREATE TYPE "public"."tabletop_source_use_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'completed');--> statement-breakpoint
CREATE TABLE "tabletop_source_use_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"status" "tabletop_source_use_status" NOT NULL,
	"note" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tabletop_source_use_event_valid" CHECK ("tabletop_source_use_event"."actor_kind" IN ('player','god') AND length(trim("tabletop_source_use_event"."note")) BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "tabletop_source_use_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer,
	"character_id" integer NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_json" jsonb NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"intent" text NOT NULL,
	"status" "tabletop_source_use_status" DEFAULT 'pending' NOT NULL,
	"ruling" text DEFAULT '' NOT NULL,
	"ruled_by_user_id" text,
	"ruled_at" timestamp,
	"result_json" jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tabletop_source_use_text_valid" CHECK (length(trim("tabletop_source_use_request"."intent")) BETWEEN 1 AND 2000 AND length(trim("tabletop_source_use_request"."idempotency_key")) BETWEEN 1 AND 100 AND length("tabletop_source_use_request"."ruling") <= 4000),
	CONSTRAINT "tabletop_source_use_json_valid" CHECK (jsonb_typeof("tabletop_source_use_request"."source_json") = 'object' AND "tabletop_source_use_request"."source_json"->>'kind' IN ('spell','item') AND jsonb_typeof("tabletop_source_use_request"."snapshot_json") = 'object' AND ("tabletop_source_use_request"."result_json" IS NULL OR jsonb_typeof("tabletop_source_use_request"."result_json") = 'object')),
	CONSTRAINT "tabletop_source_use_ruling_valid" CHECK (("tabletop_source_use_request"."ruled_at" IS NULL AND "tabletop_source_use_request"."ruled_by_user_id" IS NULL AND "tabletop_source_use_request"."ruling" = '' AND "tabletop_source_use_request"."status" IN ('pending','cancelled')) OR ("tabletop_source_use_request"."ruled_at" IS NOT NULL AND "tabletop_source_use_request"."ruled_by_user_id" IS NOT NULL AND length(trim("tabletop_source_use_request"."ruling")) > 0 AND "tabletop_source_use_request"."status" IN ('approved','rejected','cancelled','completed'))),
	CONSTRAINT "tabletop_source_use_completion_valid" CHECK (("tabletop_source_use_request"."status" = 'completed' AND "tabletop_source_use_request"."result_json" IS NOT NULL AND "tabletop_source_use_request"."completed_at" IS NOT NULL) OR ("tabletop_source_use_request"."status" <> 'completed' AND "tabletop_source_use_request"."result_json" IS NULL AND "tabletop_source_use_request"."completed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "tabletop_source_use_event" ADD CONSTRAINT "tabletop_source_use_event_request_id_tabletop_source_use_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."tabletop_source_use_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_source_use_event" ADD CONSTRAINT "tabletop_source_use_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_source_use_request" ADD CONSTRAINT "tabletop_source_use_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_source_use_request" ADD CONSTRAINT "tabletop_source_use_request_ruled_by_user_id_user_id_fk" FOREIGN KEY ("ruled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_source_use_request" ADD CONSTRAINT "tabletop_source_use_session_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_source_use_request" ADD CONSTRAINT "tabletop_source_use_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_source_use_request" ADD CONSTRAINT "tabletop_source_use_character_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_source_use_request" ADD CONSTRAINT "tabletop_source_use_roster_fk" FOREIGN KEY ("session_id","character_id") REFERENCES "public"."campaign_session_roster"("session_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tabletop_source_use_event_history_idx" ON "tabletop_source_use_event" USING btree ("request_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tabletop_source_use_retry_uq" ON "tabletop_source_use_request" USING btree ("requested_by_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "tabletop_source_use_session_status_idx" ON "tabletop_source_use_request" USING btree ("session_id","status","id");--> statement-breakpoint
CREATE INDEX "tabletop_source_use_character_idx" ON "tabletop_source_use_request" USING btree ("character_id","id");