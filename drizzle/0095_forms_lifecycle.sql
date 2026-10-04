CREATE TABLE "form_use_reset_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"actor_user_id" text NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"owner_kind" text NOT NULL,
	"source_id" integer NOT NULL,
	"form_id" integer NOT NULL,
	"form_key" text NOT NULL,
	"refresh_scope" text NOT NULL,
	"refresh_key" text,
	"after_entry_event_id" integer,
	"evidence" jsonb NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "form_use_reset_event_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "form_reset_positive" CHECK ("form_use_reset_event"."character_id">0 AND "form_use_reset_event"."source_id">0 AND "form_use_reset_event"."form_id">0),
	CONSTRAINT "form_reset_kind" CHECK ("form_use_reset_event"."owner_kind" IN ('race','creature')),
	CONSTRAINT "form_reset_scope" CHECK (("form_use_reset_event"."refresh_scope"='manual' AND "form_use_reset_event"."refresh_key" IS NULL) OR ("form_use_reset_event"."refresh_scope"='event' AND length(trim("form_use_reset_event"."refresh_key"))>0 AND "form_use_reset_event"."refresh_key" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "campaign_character_active_form" ADD COLUMN "return_due_json" jsonb;--> statement-breakpoint
ALTER TABLE "form_use_reset_event" ADD CONSTRAINT "form_use_reset_event_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_use_reset_event" ADD CONSTRAINT "form_use_reset_event_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_use_reset_event" ADD CONSTRAINT "form_use_reset_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_use_reset_event" ADD CONSTRAINT "form_use_reset_event_after_entry_event_id_form_transition_event_id_fk" FOREIGN KEY ("after_entry_event_id") REFERENCES "public"."form_transition_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_reset_individual" ON "form_use_reset_event" USING btree ("character_id","id");