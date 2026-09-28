CREATE TABLE "creature_evolution_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"executed_by_user_id" text NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"path_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"path_id" integer NOT NULL,
	"source_creature_id" integer NOT NULL,
	"destination_creature_id" integer NOT NULL,
	"source_baseline_snapshot_json" text NOT NULL,
	"source_current_snapshot_json" text NOT NULL,
	"destination_baseline_snapshot_json" text NOT NULL,
	"destination_current_snapshot_json" text NOT NULL,
	"hp_adjustment" double precision NOT NULL,
	CONSTRAINT "creature_evolution_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "creature_evolution_event_transition" CHECK ("creature_evolution_events"."source_creature_id" <> "creature_evolution_events"."destination_creature_id" AND "creature_evolution_events"."path_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "race_evolution_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"executed_by_user_id" text NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"path_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"path_id" integer NOT NULL,
	"source_race_id" integer NOT NULL,
	"destination_race_id" integer NOT NULL,
	CONSTRAINT "race_evolution_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "race_evolution_event_transition" CHECK ("race_evolution_events"."source_race_id" <> "race_evolution_events"."destination_race_id" AND "race_evolution_events"."path_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "race_evolution_paths" ADD COLUMN "transition_json" jsonb;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD CONSTRAINT "creature_evolution_events_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD CONSTRAINT "creature_evolution_events_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD CONSTRAINT "creature_evolution_events_executed_by_user_id_user_id_fk" FOREIGN KEY ("executed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD CONSTRAINT "creature_evolution_events_path_id_creature_evolution_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."creature_evolution_paths"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD CONSTRAINT "creature_evolution_events_source_creature_id_creatures_id_fk" FOREIGN KEY ("source_creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_evolution_events" ADD CONSTRAINT "creature_evolution_events_destination_creature_id_creatures_id_fk" FOREIGN KEY ("destination_creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD CONSTRAINT "race_evolution_events_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD CONSTRAINT "race_evolution_events_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD CONSTRAINT "race_evolution_events_executed_by_user_id_user_id_fk" FOREIGN KEY ("executed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD CONSTRAINT "race_evolution_events_path_id_race_evolution_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."race_evolution_paths"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD CONSTRAINT "race_evolution_events_source_race_id_races_id_fk" FOREIGN KEY ("source_race_id") REFERENCES "public"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_events" ADD CONSTRAINT "race_evolution_events_destination_race_id_races_id_fk" FOREIGN KEY ("destination_race_id") REFERENCES "public"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creature_evolution_event_individual" ON "creature_evolution_events" USING btree ("character_id","id");--> statement-breakpoint
CREATE INDEX "creature_evolution_event_campaign" ON "creature_evolution_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "creature_evolution_event_path" ON "creature_evolution_events" USING btree ("path_id");--> statement-breakpoint
CREATE INDEX "race_evolution_event_individual" ON "race_evolution_events" USING btree ("character_id","id");--> statement-breakpoint
CREATE INDEX "race_evolution_event_campaign" ON "race_evolution_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "race_evolution_event_path" ON "race_evolution_events" USING btree ("path_id");--> statement-breakpoint
ALTER TABLE "race_evolution_paths" ADD CONSTRAINT "race_evolution_transition_shape" CHECK ("race_evolution_paths"."transition_json" IS NULL OR coalesce(jsonb_typeof("race_evolution_paths"."transition_json") = 'object' AND "race_evolution_paths"."transition_json"->>'schemaVersion' = '1' AND jsonb_typeof("race_evolution_paths"."transition_json"->'attributes') = 'array', false));
--> statement-breakpoint
CREATE FUNCTION prevent_evolution_event_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Evolution history is immutable. Author a new transition instead.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER race_evolution_event_immutable BEFORE UPDATE ON race_evolution_events FOR EACH ROW EXECUTE FUNCTION prevent_evolution_event_update();
--> statement-breakpoint
CREATE TRIGGER creature_evolution_event_immutable BEFORE UPDATE ON creature_evolution_events FOR EACH ROW EXECUTE FUNCTION prevent_evolution_event_update();
