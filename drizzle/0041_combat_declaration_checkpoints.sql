CREATE TABLE "campaign_session_encounter_declaration_checkpoint" (
	"id" serial PRIMARY KEY NOT NULL,
	"encounter_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"timeline_initiative" double precision NOT NULL,
	"participant_ids_json" jsonb NOT NULL,
	"choices_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"before_state_json" jsonb NOT NULL,
	"revealed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "encounter_checkpoint_identity_uq" UNIQUE("id","encounter_id"),
	CONSTRAINT "encounter_checkpoint_round_positive" CHECK ("campaign_session_encounter_declaration_checkpoint"."round_number" > 0),
	CONSTRAINT "encounter_checkpoint_members_array" CHECK (jsonb_typeof("campaign_session_encounter_declaration_checkpoint"."participant_ids_json") = 'array' AND jsonb_array_length("campaign_session_encounter_declaration_checkpoint"."participant_ids_json") > 0),
	CONSTRAINT "encounter_checkpoint_choices_array" CHECK (jsonb_typeof("campaign_session_encounter_declaration_checkpoint"."choices_json") = 'array'),
	CONSTRAINT "encounter_checkpoint_before_object" CHECK (jsonb_typeof("campaign_session_encounter_declaration_checkpoint"."before_state_json") = 'object')
);
--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD COLUMN "checkpoint_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD COLUMN "checkpoint_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_declaration_checkpoint" ADD CONSTRAINT "campaign_session_encounter_declaration_checkpoint_encounter_id_campaign_session_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."campaign_session_encounter"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "encounter_checkpoint_open_uq" ON "campaign_session_encounter_declaration_checkpoint" USING btree ("encounter_id") WHERE "campaign_session_encounter_declaration_checkpoint"."revealed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_action_declaration" ADD CONSTRAINT "encounter_declaration_checkpoint_fk" FOREIGN KEY ("checkpoint_id","encounter_id") REFERENCES "public"."campaign_session_encounter_declaration_checkpoint"("id","encounter_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "encounter_reaction_checkpoint_fk" FOREIGN KEY ("checkpoint_id","encounter_id") REFERENCES "public"."campaign_session_encounter_declaration_checkpoint"("id","encounter_id") ON DELETE restrict ON UPDATE no action;