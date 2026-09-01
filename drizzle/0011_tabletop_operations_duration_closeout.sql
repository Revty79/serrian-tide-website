CREATE TYPE "public"."campaign_session_effect_duration_binding_status" AS ENUM('active', 'expired', 'closed');--> statement-breakpoint
CREATE TYPE "public"."campaign_session_encounter_reward_kind" AS ENUM('experience');--> statement-breakpoint
CREATE TABLE "campaign_session_effect_duration_binding" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"encounter_id" integer,
	"character_id" integer NOT NULL,
	"condition_id" integer,
	"modifier_id" integer,
	"duration_kind" text NOT NULL,
	"remaining_value" integer,
	"status" "campaign_session_effect_duration_binding_status" DEFAULT 'active' NOT NULL,
	"closed_at" timestamp,
	"close_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_effect_duration_binding_effect_identity_valid" CHECK (num_nonnulls("campaign_session_effect_duration_binding"."condition_id", "campaign_session_effect_duration_binding"."modifier_id") = 1),
	CONSTRAINT "campaign_session_effect_duration_binding_kind_valid" CHECK ("campaign_session_effect_duration_binding"."duration_kind" IN ('combat-steps','combat-rounds','scene')),
	CONSTRAINT "campaign_session_effect_duration_binding_context_valid" CHECK ((
        "campaign_session_effect_duration_binding"."duration_kind" IN ('combat-steps','combat-rounds')
        AND "campaign_session_effect_duration_binding"."encounter_id" IS NOT NULL
        AND "campaign_session_effect_duration_binding"."remaining_value" IS NOT NULL
        AND "campaign_session_effect_duration_binding"."remaining_value" >= 0
      ) OR (
        "campaign_session_effect_duration_binding"."duration_kind" = 'scene'
        AND "campaign_session_effect_duration_binding"."encounter_id" IS NULL
        AND "campaign_session_effect_duration_binding"."remaining_value" IS NULL
      )),
	CONSTRAINT "campaign_session_effect_duration_binding_lifecycle_valid" CHECK ((
        "campaign_session_effect_duration_binding"."status" = 'active'
        AND "campaign_session_effect_duration_binding"."closed_at" IS NULL
        AND "campaign_session_effect_duration_binding"."close_reason" = ''
        AND ("campaign_session_effect_duration_binding"."remaining_value" IS NULL OR "campaign_session_effect_duration_binding"."remaining_value" > 0)
      ) OR (
        "campaign_session_effect_duration_binding"."status" <> 'active'
        AND "campaign_session_effect_duration_binding"."closed_at" IS NOT NULL
        AND length(trim("campaign_session_effect_duration_binding"."close_reason")) > 0
      ))
);
--> statement-breakpoint
CREATE TABLE "campaign_session_encounter_reward" (
	"id" serial PRIMARY KEY NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"reward_kind" "campaign_session_encounter_reward_kind" DEFAULT 'experience' NOT NULL,
	"amount" double precision NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_encounter_reward_amount_positive" CHECK ("campaign_session_encounter_reward"."amount" > 0),
	CONSTRAINT "campaign_session_encounter_reward_kind_valid" CHECK ("campaign_session_encounter_reward"."reward_kind" = 'experience')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_active_condition_id_character_uq" ON "campaign_character_active_condition" USING btree ("id","character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_active_modifier_id_character_uq" ON "campaign_character_active_modifier" USING btree ("id","character_id");--> statement-breakpoint
ALTER TABLE "campaign_session_effect_duration_binding" ADD CONSTRAINT "campaign_session_effect_duration_binding_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_effect_duration_binding" ADD CONSTRAINT "campaign_session_effect_duration_binding_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_effect_duration_binding" ADD CONSTRAINT "campaign_session_effect_duration_binding_character_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_effect_duration_binding" ADD CONSTRAINT "campaign_session_effect_duration_binding_condition_fk" FOREIGN KEY ("condition_id","character_id") REFERENCES "public"."campaign_character_active_condition"("id","character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_effect_duration_binding" ADD CONSTRAINT "campaign_session_effect_duration_binding_modifier_fk" FOREIGN KEY ("modifier_id","character_id") REFERENCES "public"."campaign_character_active_modifier"("id","character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reward" ADD CONSTRAINT "campaign_session_encounter_reward_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reward" ADD CONSTRAINT "campaign_session_encounter_reward_participant_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","character_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reward" ADD CONSTRAINT "campaign_session_encounter_reward_profile_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character_profile"("character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_effect_duration_binding_condition_uq" ON "campaign_session_effect_duration_binding" USING btree ("condition_id") WHERE "campaign_session_effect_duration_binding"."condition_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_effect_duration_binding_modifier_uq" ON "campaign_session_effect_duration_binding" USING btree ("modifier_id") WHERE "campaign_session_effect_duration_binding"."modifier_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_session_effect_duration_binding_encounter_status_idx" ON "campaign_session_effect_duration_binding" USING btree ("encounter_id","status","duration_kind");--> statement-breakpoint
CREATE INDEX "campaign_session_effect_duration_binding_scene_status_idx" ON "campaign_session_effect_duration_binding" USING btree ("scene_id","status","duration_kind");--> statement-breakpoint
CREATE INDEX "campaign_session_effect_duration_binding_character_status_idx" ON "campaign_session_effect_duration_binding" USING btree ("character_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_reward_character_kind_uq" ON "campaign_session_encounter_reward" USING btree ("encounter_id","character_id","reward_kind");--> statement-breakpoint
CREATE INDEX "campaign_session_encounter_reward_history_idx" ON "campaign_session_encounter_reward" USING btree ("encounter_id","awarded_at","id");
