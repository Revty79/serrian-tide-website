CREATE TABLE "campaign_session_periodic_health_effect" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"application_key" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"effect_kind" text NOT NULL,
	"amount" double precision NOT NULL,
	"application" text NOT NULL,
	"pool_key" text,
	"frequency" text NOT NULL,
	"remaining_applications" integer NOT NULL,
	"next_step" integer NOT NULL,
	"next_round" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"completed_at" timestamp,
	"close_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "periodic_health_effect_kind_valid" CHECK ("campaign_session_periodic_health_effect"."effect_kind" IN ('health.heal','health.damage')),
	CONSTRAINT "periodic_health_effect_application_valid" CHECK ("campaign_session_periodic_health_effect"."application" IN ('area','full-body')),
	CONSTRAINT "periodic_health_effect_frequency_valid" CHECK ("campaign_session_periodic_health_effect"."frequency" IN ('combat-steps','combat-rounds')),
	CONSTRAINT "periodic_health_effect_amount_valid" CHECK ("campaign_session_periodic_health_effect"."amount" > 0),
	CONSTRAINT "periodic_health_effect_remaining_valid" CHECK ("campaign_session_periodic_health_effect"."remaining_applications" >= 0),
	CONSTRAINT "periodic_health_effect_status_valid" CHECK ("campaign_session_periodic_health_effect"."status" IN ('active','completed','closed')),
	CONSTRAINT "periodic_health_effect_source_kind_nonblank" CHECK (length(trim("campaign_session_periodic_health_effect"."source_kind")) > 0),
	CONSTRAINT "periodic_health_effect_source_id_nonblank" CHECK (length(trim("campaign_session_periodic_health_effect"."source_id")) > 0),
	CONSTRAINT "periodic_health_effect_application_key_nonblank" CHECK (length(trim("campaign_session_periodic_health_effect"."application_key")) > 0),
	CONSTRAINT "periodic_health_effect_step_positive" CHECK ("campaign_session_periodic_health_effect"."next_step" > 0),
	CONSTRAINT "periodic_health_effect_round_positive" CHECK ("campaign_session_periodic_health_effect"."next_round" > 0),
	CONSTRAINT "periodic_health_effect_pool_identity_valid" CHECK (("campaign_session_periodic_health_effect"."application" = 'area' AND "campaign_session_periodic_health_effect"."pool_key" IS NOT NULL AND length(trim("campaign_session_periodic_health_effect"."pool_key")) > 0) OR ("campaign_session_periodic_health_effect"."application" = 'full-body' AND "campaign_session_periodic_health_effect"."pool_key" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "campaign_session_periodic_health_effect" ADD CONSTRAINT "periodic_health_effect_participant_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","character_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "periodic_health_effect_encounter_idx" ON "campaign_session_periodic_health_effect" USING btree ("encounter_id","status","frequency");--> statement-breakpoint
CREATE INDEX "periodic_health_effect_character_idx" ON "campaign_session_periodic_health_effect" USING btree ("character_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "periodic_health_effect_application_uq" ON "campaign_session_periodic_health_effect" USING btree ("encounter_id","application_key");