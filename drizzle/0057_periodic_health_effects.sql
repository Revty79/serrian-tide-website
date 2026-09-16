CREATE TABLE "campaign_session_periodic_health_effect" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"encounter_id" integer NOT NULL,
	"character_id" integer NOT NULL,
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
	CONSTRAINT "periodic_health_effect_status_valid" CHECK ("campaign_session_periodic_health_effect"."status" IN ('active','completed','closed'))
);
--> statement-breakpoint
CREATE INDEX "periodic_health_effect_encounter_idx" ON "campaign_session_periodic_health_effect" USING btree ("encounter_id","status","frequency");--> statement-breakpoint
CREATE INDEX "periodic_health_effect_character_idx" ON "campaign_session_periodic_health_effect" USING btree ("character_id","status");