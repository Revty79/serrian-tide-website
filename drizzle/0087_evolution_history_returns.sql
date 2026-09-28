ALTER TABLE "creature_evolution_events" ADD COLUMN "operation" text DEFAULT 'evolution' NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD COLUMN "reverses_event_id" integer;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD COLUMN "operation" text DEFAULT 'evolution' NOT NULL;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD COLUMN "reverses_event_id" integer;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD CONSTRAINT "creature_evolution_events_reverses_event_id_creature_evolution_events_id_fk" FOREIGN KEY ("reverses_event_id") REFERENCES "public"."creature_evolution_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD CONSTRAINT "race_evolution_events_reverses_event_id_race_evolution_events_id_fk" FOREIGN KEY ("reverses_event_id") REFERENCES "public"."race_evolution_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creature_evolution_event_return_once" ON "creature_evolution_events" USING btree ("reverses_event_id") WHERE "creature_evolution_events"."reverses_event_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "race_evolution_event_return_once" ON "race_evolution_events" USING btree ("reverses_event_id") WHERE "race_evolution_events"."reverses_event_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD CONSTRAINT "creature_evolution_event_operation" CHECK (("creature_evolution_events"."operation" = 'evolution' AND "creature_evolution_events"."reverses_event_id" IS NULL) OR ("creature_evolution_events"."operation" = 'return' AND "creature_evolution_events"."reverses_event_id" IS NOT NULL AND "creature_evolution_events"."reverses_event_id" <> "creature_evolution_events"."id"));--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD CONSTRAINT "race_evolution_event_operation" CHECK (("race_evolution_events"."operation" = 'evolution' AND "race_evolution_events"."reverses_event_id" IS NULL) OR ("race_evolution_events"."operation" = 'return' AND "race_evolution_events"."reverses_event_id" IS NOT NULL AND "race_evolution_events"."reverses_event_id" <> "race_evolution_events"."id"));
--> statement-breakpoint
CREATE FUNCTION verify_evolution_return_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original RECORD;
  original_source integer;
  original_destination integer;
  return_source integer;
  return_destination integer;
BEGIN
  IF NEW.operation <> 'return' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'race_evolution_events' THEN
    SELECT * INTO original FROM race_evolution_events WHERE id = NEW.reverses_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original Race Evolution event is missing.'; END IF;
    original_source := original.source_race_id; original_destination := original.destination_race_id;
    return_source := NEW.source_race_id; return_destination := NEW.destination_race_id;
  ELSE
    SELECT * INTO original FROM creature_evolution_events WHERE id = NEW.reverses_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original Creature Evolution event is missing.'; END IF;
    original_source := original.source_creature_id; original_destination := original.destination_creature_id;
    return_source := NEW.source_creature_id; return_destination := NEW.destination_creature_id;
  END IF;
  IF original.operation <> 'evolution' OR original.character_id <> NEW.character_id
    OR original.campaign_id <> NEW.campaign_id OR original.path_id <> NEW.path_id
    OR original.path_version <> NEW.path_version OR original_source <> return_destination
    OR original_destination <> return_source THEN
    RAISE EXCEPTION 'Return must reverse the exact forward Evolution for the same individual and Campaign.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER race_evolution_return_provenance BEFORE INSERT ON race_evolution_events FOR EACH ROW EXECUTE FUNCTION verify_evolution_return_provenance();
--> statement-breakpoint
CREATE TRIGGER creature_evolution_return_provenance BEFORE INSERT ON creature_evolution_events FOR EACH ROW EXECUTE FUNCTION verify_evolution_return_provenance();
