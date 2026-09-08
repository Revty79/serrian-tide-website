CREATE TABLE "campaign_session_encounter_reward_decision" (
	"id" serial PRIMARY KEY NOT NULL,
	"encounter_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"source_key" text NOT NULL,
	"request_key" text NOT NULL,
	"defeated_participant_id" integer,
	"frozen_decision_json" jsonb NOT NULL,
	"awarded_by_user_id" text NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "combat_reward_decision_hierarchy_uq" UNIQUE("id","encounter_id","scene_id","session_id","campaign_id"),
	CONSTRAINT "combat_reward_decision_keys_valid" CHECK (length(trim("campaign_session_encounter_reward_decision"."source_key")) > 0 AND length(trim("campaign_session_encounter_reward_decision"."request_key")) > 0),
	CONSTRAINT "combat_reward_decision_snapshot_valid" CHECK (jsonb_typeof("campaign_session_encounter_reward_decision"."frozen_decision_json") = 'object')
);
--> statement-breakpoint
DROP INDEX "campaign_session_encounter_reward_character_kind_uq";--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reward" ADD COLUMN "decision_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reward_decision" ADD CONSTRAINT "combat_reward_decision_encounter_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter"("id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reward_decision" ADD CONSTRAINT "combat_reward_decision_defeated_fk" FOREIGN KEY ("encounter_id","scene_id","session_id","campaign_id","defeated_participant_id") REFERENCES "public"."campaign_session_encounter_participant"("encounter_id","scene_id","session_id","campaign_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reward_decision" ADD CONSTRAINT "combat_reward_decision_awarded_by_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "combat_reward_decision_source_uq" ON "campaign_session_encounter_reward_decision" USING btree ("encounter_id","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "combat_reward_decision_request_uq" ON "campaign_session_encounter_reward_decision" USING btree ("encounter_id","request_key");--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reward" ADD CONSTRAINT "combat_reward_decision_receipt_fk" FOREIGN KEY ("decision_id","encounter_id","scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_encounter_reward_decision"("id","encounter_id","scene_id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "combat_reward_decision_recipient_uq" ON "campaign_session_encounter_reward" USING btree ("decision_id","character_id","reward_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_encounter_reward_character_kind_uq" ON "campaign_session_encounter_reward" USING btree ("encounter_id","character_id","reward_kind") WHERE "campaign_session_encounter_reward"."decision_id" IS NULL;