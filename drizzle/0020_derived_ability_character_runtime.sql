CREATE TYPE "public"."character_derived_ability_acquisition_method" AS ENUM('learned', 'awarded');--> statement-breakpoint
CREATE TABLE "character_derived_ability" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"acquisition_method" character_derived_ability_acquisition_method NOT NULL,
	"acquired_by_user_id" text,
	"acquisition_notes" text DEFAULT '' NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by_user_id" text,
	"revocation_notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "character_derived_ability_revocation_valid" CHECK (("character_derived_ability"."revoked_at" IS NULL AND "character_derived_ability"."revoked_by_user_id" IS NULL AND "character_derived_ability"."revocation_notes" = '') OR ("character_derived_ability"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "character_derived_ability_recharge" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"actor_user_id" text,
	"refresh_scope" text NOT NULL,
	"refresh_key" text,
	"session_id" integer,
	"scene_id" integer,
	"encounter_id" integer,
	"round_number" integer,
	"notes" text DEFAULT '' NOT NULL,
	"recharged_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_derived_ability_recharge_scope_valid" CHECK ("character_derived_ability_recharge"."refresh_scope" IN ('manual','event')),
	CONSTRAINT "character_derived_ability_recharge_key_valid" CHECK (("character_derived_ability_recharge"."refresh_scope" = 'manual' AND "character_derived_ability_recharge"."refresh_key" IS NULL) OR ("character_derived_ability_recharge"."refresh_scope" = 'event' AND "character_derived_ability_recharge"."refresh_key" IS NOT NULL AND length(trim("character_derived_ability_recharge"."refresh_key")) > 0)),
	CONSTRAINT "character_derived_ability_recharge_round_valid" CHECK ("character_derived_ability_recharge"."round_number" IS NULL OR "character_derived_ability_recharge"."round_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "character_derived_ability_use" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"ownership_id" integer,
	"actor_user_id" text,
	"session_id" integer,
	"scene_id" integer,
	"encounter_id" integer,
	"round_number" integer,
	"event_key" text,
	"effect_summary" text DEFAULT '' NOT NULL,
	"manual_steps" text DEFAULT '' NOT NULL,
	"use_notes" text DEFAULT '' NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_derived_ability_use_round_valid" CHECK ("character_derived_ability_use"."round_number" IS NULL OR "character_derived_ability_use"."round_number" > 0),
	CONSTRAINT "character_derived_ability_use_event_key_nonblank" CHECK ("character_derived_ability_use"."event_key" IS NULL OR length(trim("character_derived_ability_use"."event_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_character_active_condition" DROP CONSTRAINT "campaign_character_active_condition_source_kind_valid";--> statement-breakpoint
ALTER TABLE "campaign_character_active_modifier" DROP CONSTRAINT "campaign_character_active_modifier_source_kind_valid";--> statement-breakpoint
ALTER TABLE "character_derived_ability" ADD CONSTRAINT "character_derived_ability_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability" ADD CONSTRAINT "character_derived_ability_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability" ADD CONSTRAINT "character_derived_ability_acquired_by_user_id_user_id_fk" FOREIGN KEY ("acquired_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability" ADD CONSTRAINT "character_derived_ability_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_recharge" ADD CONSTRAINT "character_derived_ability_recharge_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_recharge" ADD CONSTRAINT "character_derived_ability_recharge_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_recharge" ADD CONSTRAINT "character_derived_ability_recharge_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_recharge" ADD CONSTRAINT "character_derived_ability_recharge_session_id_campaign_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."campaign_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_recharge" ADD CONSTRAINT "character_derived_ability_recharge_scene_id_campaign_session_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."campaign_session_scene"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_recharge" ADD CONSTRAINT "character_derived_ability_recharge_encounter_id_campaign_session_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."campaign_session_encounter"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_use" ADD CONSTRAINT "character_derived_ability_use_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_use" ADD CONSTRAINT "character_derived_ability_use_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_use" ADD CONSTRAINT "character_derived_ability_use_ownership_id_character_derived_ability_id_fk" FOREIGN KEY ("ownership_id") REFERENCES "public"."character_derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_use" ADD CONSTRAINT "character_derived_ability_use_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_use" ADD CONSTRAINT "character_derived_ability_use_session_id_campaign_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."campaign_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_use" ADD CONSTRAINT "character_derived_ability_use_scene_id_campaign_session_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."campaign_session_scene"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_derived_ability_use" ADD CONSTRAINT "character_derived_ability_use_encounter_id_campaign_session_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."campaign_session_encounter"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_derived_ability_active_uq" ON "character_derived_ability" USING btree ("character_id","derived_ability_id") WHERE "character_derived_ability"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "character_derived_ability_character_history_idx" ON "character_derived_ability" USING btree ("character_id","acquired_at","id");--> statement-breakpoint
CREATE INDEX "character_derived_ability_definition_history_idx" ON "character_derived_ability" USING btree ("derived_ability_id","revoked_at","id");--> statement-breakpoint
CREATE INDEX "character_derived_ability_recharge_character_idx" ON "character_derived_ability_recharge" USING btree ("character_id","derived_ability_id","refresh_scope","refresh_key","recharged_at","id");--> statement-breakpoint
CREATE INDEX "character_derived_ability_use_character_idx" ON "character_derived_ability_use" USING btree ("character_id","derived_ability_id","used_at","id");--> statement-breakpoint
CREATE INDEX "character_derived_ability_use_encounter_idx" ON "character_derived_ability_use" USING btree ("encounter_id","round_number","used_at");--> statement-breakpoint
CREATE INDEX "character_derived_ability_use_scene_idx" ON "character_derived_ability_use" USING btree ("scene_id","used_at");--> statement-breakpoint
ALTER TABLE "campaign_character_active_condition" ADD CONSTRAINT "campaign_character_active_condition_source_kind_valid" CHECK ("campaign_character_active_condition"."source_kind" IN ('item','spell','creature-ability','derived-ability','god','system'));--> statement-breakpoint
ALTER TABLE "campaign_character_active_modifier" ADD CONSTRAINT "campaign_character_active_modifier_source_kind_valid" CHECK ("campaign_character_active_modifier"."source_kind" IN ('item','spell','creature-ability','derived-ability','god','system'));