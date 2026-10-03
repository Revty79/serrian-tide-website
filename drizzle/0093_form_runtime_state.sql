CREATE TABLE "campaign_character_active_form" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"entry_event_id" integer NOT NULL,
	CONSTRAINT "campaign_character_active_form_entry_event_id_unique" UNIQUE("entry_event_id"),
	CONSTRAINT "active_form_positive" CHECK ("campaign_character_active_form"."character_id">0)
);
--> statement-breakpoint
CREATE TABLE "form_transition_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"operation" text NOT NULL,
	"entered_event_id" integer,
	"owner_kind" text NOT NULL,
	"source_race_id" integer,
	"race_form_id" integer,
	"source_creature_id" integer,
	"creature_form_id" integer,
	"form_key" text NOT NULL,
	"source_hash" text NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "form_transition_event_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "form_event_positive" CHECK ("form_transition_event"."character_id">0),
	CONSTRAINT "form_event_identity" CHECK (("form_transition_event"."owner_kind"='race' AND "form_transition_event"."source_race_id" IS NOT NULL AND "form_transition_event"."race_form_id" IS NOT NULL AND "form_transition_event"."race_form_id">0 AND "form_transition_event"."source_creature_id" IS NULL AND "form_transition_event"."creature_form_id" IS NULL) OR ("form_transition_event"."owner_kind"='creature' AND "form_transition_event"."source_creature_id" IS NOT NULL AND "form_transition_event"."creature_form_id" IS NOT NULL AND "form_transition_event"."creature_form_id">0 AND "form_transition_event"."source_race_id" IS NULL AND "form_transition_event"."race_form_id" IS NULL)),
	CONSTRAINT "form_event_operation" CHECK (("form_transition_event"."operation"='enter' AND "form_transition_event"."entered_event_id" IS NULL) OR ("form_transition_event"."operation"='return' AND "form_transition_event"."entered_event_id" IS NOT NULL AND "form_transition_event"."entered_event_id"<>"form_transition_event"."id"))
);
--> statement-breakpoint
CREATE TABLE "form_transition_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"actor_user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"encounter_id" integer,
	"pending_action_id" integer,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "form_transition_request_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "form_request_positive" CHECK ("form_transition_request"."character_id">0),
	CONSTRAINT "form_request_operation" CHECK ("form_transition_request"."operation" IN ('enter','return')),
	CONSTRAINT "form_request_status" CHECK ("form_transition_request"."status" IN ('pending','completed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "form_event_character_identity" ON "form_transition_event" USING btree ("id","character_id");--> statement-breakpoint
ALTER TABLE "campaign_character_active_form" ADD CONSTRAINT "campaign_character_active_form_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_active_form" ADD CONSTRAINT "active_form_exact_entry" FOREIGN KEY ("entry_event_id","character_id") REFERENCES "public"."form_transition_event"("id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_event" ADD CONSTRAINT "form_transition_event_request_id_form_transition_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."form_transition_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_event" ADD CONSTRAINT "form_transition_event_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_event" ADD CONSTRAINT "form_transition_event_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_event" ADD CONSTRAINT "form_transition_event_entered_event_id_form_transition_event_id_fk" FOREIGN KEY ("entered_event_id") REFERENCES "public"."form_transition_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_event" ADD CONSTRAINT "form_transition_event_source_race_id_races_id_fk" FOREIGN KEY ("source_race_id") REFERENCES "public"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_event" ADD CONSTRAINT "form_transition_event_source_creature_id_creatures_id_fk" FOREIGN KEY ("source_creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_request" ADD CONSTRAINT "form_transition_request_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_request" ADD CONSTRAINT "form_transition_request_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_request" ADD CONSTRAINT "form_transition_request_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_request" ADD CONSTRAINT "form_transition_request_encounter_id_campaign_session_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."campaign_session_encounter"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_transition_request" ADD CONSTRAINT "form_transition_request_pending_action_id_campaign_session_encounter_pending_action_id_fk" FOREIGN KEY ("pending_action_id") REFERENCES "public"."campaign_session_encounter_pending_action"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "form_event_return_once" ON "form_transition_event" USING btree ("entered_event_id");--> statement-breakpoint
CREATE INDEX "form_event_individual" ON "form_transition_event" USING btree ("character_id","id");--> statement-breakpoint
CREATE INDEX "form_event_campaign" ON "form_transition_event" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_request_pending_individual" ON "form_transition_request" USING btree ("character_id") WHERE "form_transition_request"."status"='pending';--> statement-breakpoint
CREATE UNIQUE INDEX "form_request_pending_action" ON "form_transition_request" USING btree ("pending_action_id");--> statement-breakpoint
CREATE INDEX "form_request_campaign" ON "form_transition_request" USING btree ("campaign_id");

--> statement-breakpoint
CREATE FUNCTION verify_form_transition_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r form_transition_request%ROWTYPE; original form_transition_event%ROWTYPE; individual campaign_character%ROWTYPE;
BEGIN
  SELECT * INTO r FROM form_transition_request WHERE id=NEW.request_id;
  SELECT * INTO individual FROM campaign_character WHERE id=NEW.character_id;
  IF r.id IS NULL OR individual.id IS NULL OR r.character_id<>NEW.character_id OR r.campaign_id<>NEW.campaign_id OR individual.campaign_id<>NEW.campaign_id OR r.operation<>NEW.operation OR r.status<>'pending' THEN
    RAISE EXCEPTION 'Form event must complete the exact pending request and individual.';
  END IF;
  IF (NEW.owner_kind='creature') <> (individual.is_npc AND individual.npc_kind='creature') THEN RAISE EXCEPTION 'Form owner type does not match the individual.'; END IF;
  IF NEW.operation='return' THEN
    SELECT * INTO original FROM form_transition_event WHERE id=NEW.entered_event_id;
    IF original.id IS NULL OR original.operation<>'enter' OR original.character_id<>NEW.character_id OR original.campaign_id<>NEW.campaign_id OR original.owner_kind<>NEW.owner_kind OR original.form_key<>NEW.form_key OR original.source_hash<>NEW.source_hash OR original.source_race_id IS DISTINCT FROM NEW.source_race_id OR original.race_form_id IS DISTINCT FROM NEW.race_form_id OR original.source_creature_id IS DISTINCT FROM NEW.source_creature_id OR original.creature_form_id IS DISTINCT FROM NEW.creature_form_id OR NOT EXISTS(SELECT 1 FROM campaign_character_active_form WHERE character_id=NEW.character_id AND entry_event_id=original.id) THEN
      RAISE EXCEPTION 'Return to Normal must end the exact current Form entry.';
    END IF;
  ELSIF EXISTS(SELECT 1 FROM campaign_character_active_form WHERE character_id=NEW.character_id) THEN RAISE EXCEPTION 'Return to Normal before entering another Form.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER form_event_provenance BEFORE INSERT ON form_transition_event FOR EACH ROW EXECUTE FUNCTION verify_form_transition_event();
--> statement-breakpoint
CREATE FUNCTION prevent_form_event_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Form transition history is immutable.'; END $$;
--> statement-breakpoint
CREATE TRIGGER form_event_immutable BEFORE UPDATE ON form_transition_event FOR EACH ROW EXECUTE FUNCTION prevent_form_event_update();
--> statement-breakpoint
CREATE FUNCTION verify_active_form_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM form_transition_event WHERE id=NEW.entry_event_id AND character_id=NEW.character_id AND operation='enter') OR EXISTS(SELECT 1 FROM form_transition_event WHERE entered_event_id=NEW.entry_event_id) THEN
    RAISE EXCEPTION 'Active Form must reference an unreturned entry for this exact individual.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER active_form_entry BEFORE INSERT OR UPDATE ON campaign_character_active_form FOR EACH ROW EXECUTE FUNCTION verify_active_form_entry();
