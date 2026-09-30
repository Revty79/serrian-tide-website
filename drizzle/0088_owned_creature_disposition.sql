ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "campaign_character_item_instance_definition_uq" UNIQUE("id","item_id");--> statement-breakpoint
CREATE TABLE "companion_disposition_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"actor_user_id" text,
	"request_key" text NOT NULL,
	"revision" integer NOT NULL,
	"command" jsonb NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companion_disposition_event_request_uq" UNIQUE("character_id","request_key"),
	CONSTRAINT "companion_disposition_event_revision_uq" UNIQUE("character_id","revision"),
	CONSTRAINT "companion_disposition_event_revision_valid" CHECK ("companion_disposition_event"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "creature_vessel_profile" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owned_creature_disposition" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"disposition" text NOT NULL,
	"away_note" text DEFAULT '' NOT NULL,
	"vessel_instance_id" integer,
	"vessel_item_id" integer,
	"revision" integer NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "owned_creature_vessel_one_creature" UNIQUE("vessel_instance_id"),
	CONSTRAINT "owned_creature_disposition_valid" CHECK ("owned_creature_disposition"."disposition" IN ('accompanying','vessel-bound','away')),
	CONSTRAINT "owned_creature_disposition_binding_valid" CHECK (("owned_creature_disposition"."disposition" = 'vessel-bound' AND "owned_creature_disposition"."vessel_instance_id" IS NOT NULL AND "owned_creature_disposition"."vessel_item_id" IS NOT NULL) OR ("owned_creature_disposition"."disposition" IN ('accompanying','away') AND "owned_creature_disposition"."vessel_instance_id" IS NULL AND "owned_creature_disposition"."vessel_item_id" IS NULL)),
	CONSTRAINT "owned_creature_disposition_note_valid" CHECK (length("owned_creature_disposition"."away_note") <= 240 AND ("owned_creature_disposition"."disposition" = 'away' OR "owned_creature_disposition"."away_note" = '')),
	CONSTRAINT "owned_creature_disposition_revision_valid" CHECK ("owned_creature_disposition"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "companion_disposition_event" ADD CONSTRAINT "companion_disposition_event_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_disposition_event" ADD CONSTRAINT "companion_disposition_event_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_disposition_event" ADD CONSTRAINT "companion_disposition_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_vessel_profile" ADD CONSTRAINT "creature_vessel_profile_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_creature_disposition" ADD CONSTRAINT "owned_creature_disposition_character_id_campaign_creature_npc_profile_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_creature_npc_profile"("character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_creature_disposition" ADD CONSTRAINT "owned_creature_disposition_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_creature_disposition" ADD CONSTRAINT "owned_creature_disposition_vessel_item_id_creature_vessel_profile_item_id_fk" FOREIGN KEY ("vessel_item_id") REFERENCES "public"."creature_vessel_profile"("item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_creature_disposition" ADD CONSTRAINT "owned_creature_disposition_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_creature_disposition" ADD CONSTRAINT "owned_creature_disposition_campaign_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_creature_disposition" ADD CONSTRAINT "owned_creature_vessel_exact_fk" FOREIGN KEY ("vessel_instance_id","vessel_item_id") REFERENCES "public"."campaign_character_item_instance"("id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companion_disposition_event_campaign_idx" ON "companion_disposition_event" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "owned_creature_disposition_campaign_idx" ON "owned_creature_disposition" USING btree ("campaign_id");--> statement-breakpoint

-- Deliberately no backfill: absence means the travel relationship has not been set.
CREATE FUNCTION guard_creature_vessel_profile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE model_id integer;
BEGIN
  model_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.item_id ELSE NEW.item_id END;
  UPDATE items SET updated_at = updated_at WHERE id = model_id;
  IF TG_OP = 'UPDATE' AND NEW.item_id <> OLD.item_id THEN
    RAISE EXCEPTION 'Creature Vessel profile identity cannot change.';
  END IF;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM campaign_character_item WHERE item_id = model_id) THEN
    RAISE EXCEPTION 'Resolve existing quantity stacks before enabling Creature Vessel exact-copy tracking; no automatic conversion is performed.';
  END IF;
  IF (TG_OP = 'DELETE' OR NOT NEW.enabled) AND EXISTS (SELECT 1 FROM owned_creature_disposition WHERE vessel_item_id = model_id) THEN
    RAISE EXCEPTION 'Unbind owned Creatures before removing or disabling Creature Vessel capability.';
  END IF;
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM campaign_character_item_instance WHERE item_id = model_id) THEN
    RAISE EXCEPTION 'Disable Creature Vessel capability instead; retain exact-copy tracking while owned copy records exist.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER creature_vessel_profile_guard BEFORE INSERT OR UPDATE OR DELETE ON creature_vessel_profile
  FOR EACH ROW EXECUTE FUNCTION guard_creature_vessel_profile();
--> statement-breakpoint
CREATE FUNCTION guard_creature_vessel_stack() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE items SET updated_at = updated_at WHERE id = NEW.item_id;
  IF EXISTS (SELECT 1 FROM creature_vessel_profile WHERE item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'Creature Vessel Items require exact owned copies, not quantity stacks.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER creature_vessel_stack_guard BEFORE INSERT OR UPDATE ON campaign_character_item
  FOR EACH ROW EXECUTE FUNCTION guard_creature_vessel_stack();
--> statement-breakpoint
CREATE FUNCTION guard_owned_creature_disposition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE individual campaign_character%ROWTYPE; owning campaign_character%ROWTYPE; holder_campaign integer; model_enabled boolean;
BEGIN
  SELECT * INTO individual FROM campaign_character WHERE id = NEW.character_id FOR UPDATE;
  IF NOT FOUND OR NOT individual.is_npc OR individual.npc_kind <> 'creature' OR individual.owner_character_id IS NULL OR individual.campaign_id <> NEW.campaign_id THEN
    RAISE EXCEPTION 'Travel disposition requires an owned persistent Creature NPC in this Campaign.';
  END IF;
  SELECT * INTO owning FROM campaign_character WHERE id = individual.owner_character_id FOR SHARE;
  IF NOT FOUND OR owning.campaign_id <> NEW.campaign_id OR (owning.is_npc AND owning.npc_kind <> 'race') THEN
    RAISE EXCEPTION 'The Creature owner must be a Character or Race NPC in the same Campaign.';
  END IF;
  IF NEW.vessel_instance_id IS NOT NULL THEN
    SELECT enabled INTO model_enabled FROM creature_vessel_profile WHERE item_id = NEW.vessel_item_id FOR SHARE;
    IF NOT FOUND OR NOT model_enabled THEN RAISE EXCEPTION 'Choose an enabled Creature Vessel Item definition.'; END IF;
    SELECT c.campaign_id INTO holder_campaign FROM campaign_character_item_instance i
      JOIN campaign_character c ON c.id = i.character_id
      WHERE i.id = NEW.vessel_instance_id AND i.item_id = NEW.vessel_item_id AND i.retired_at IS NULL FOR UPDATE OF i;
    IF NOT FOUND OR holder_campaign <> NEW.campaign_id THEN
      RAISE EXCEPTION 'Choose an active exact Creature Vessel copy in the same Campaign.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER owned_creature_disposition_guard BEFORE INSERT OR UPDATE ON owned_creature_disposition
  FOR EACH ROW EXECUTE FUNCTION guard_owned_creature_disposition();
--> statement-breakpoint
CREATE FUNCTION guard_bound_creature_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior owned_creature_disposition%ROWTYPE; next_revision integer;
BEGIN
  SELECT * INTO prior FROM owned_creature_disposition WHERE character_id = OLD.id;
  IF FOUND THEN
    IF NEW.owner_character_id IS DISTINCT FROM OLD.owner_character_id AND prior.vessel_instance_id IS NOT NULL THEN
      RAISE EXCEPTION 'Unbind this Creature and change its travel disposition before transferring, selling, or removing ownership. Its Vessel will not move automatically.';
    END IF;
    IF NEW.campaign_id <> OLD.campaign_id OR NOT NEW.is_npc OR NEW.npc_kind <> 'creature' THEN
      RAISE EXCEPTION 'Preserve the persistent Creature identity and Campaign of its travel disposition.';
    END IF;
    IF NEW.owner_character_id IS NULL THEN
      SELECT greatest(prior.revision, coalesce(max(revision), 0)) + 1 INTO next_revision FROM companion_disposition_event WHERE character_id = OLD.id;
      INSERT INTO companion_disposition_event(campaign_id, character_id, request_key, revision, command, "before", "after")
        VALUES(OLD.campaign_id, OLD.id, 'ownership-removed:' || next_revision, next_revision,
          jsonb_build_object('operation','ownership-removed','previousOwnerCharacterId',OLD.owner_character_id), to_jsonb(prior), NULL);
      DELETE FROM owned_creature_disposition WHERE character_id = OLD.id;
    END IF;
  END IF;
  IF (NEW.campaign_id <> OLD.campaign_id OR (NEW.is_npc AND NEW.npc_kind <> 'race')) AND EXISTS (
    SELECT 1 FROM owned_creature_disposition d JOIN campaign_character c ON c.id = d.character_id WHERE c.owner_character_id = OLD.id
  ) THEN RAISE EXCEPTION 'Preserve the Character owner identity and Campaign of configured companions.'; END IF;
  IF NEW.campaign_id <> OLD.campaign_id AND EXISTS (
    SELECT 1 FROM owned_creature_disposition d JOIN campaign_character_item_instance i ON i.id = d.vessel_instance_id WHERE i.character_id = OLD.id
  ) THEN RAISE EXCEPTION 'A bound Creature Vessel must remain in its Campaign.'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bound_creature_identity_guard BEFORE UPDATE ON campaign_character FOR EACH ROW EXECUTE FUNCTION guard_bound_creature_identity();
--> statement-breakpoint
CREATE FUNCTION guard_bound_vessel_copy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding_campaign integer; next_campaign integer;
BEGIN
  SELECT campaign_id INTO binding_campaign FROM owned_creature_disposition WHERE vessel_instance_id = OLD.id;
  IF FOUND THEN
    IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR NEW.item_id <> OLD.item_id OR NEW.retired_at IS NOT NULL THEN
      RAISE EXCEPTION 'Unbind the Creature before deleting, retiring, destroying, or selling its exact Creature Vessel copy.';
    END IF;
    SELECT campaign_id INTO next_campaign FROM campaign_character WHERE id = NEW.character_id;
    IF next_campaign IS DISTINCT FROM binding_campaign THEN RAISE EXCEPTION 'A bound Creature Vessel must remain in its Campaign.'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER bound_vessel_copy_guard BEFORE UPDATE OR DELETE ON campaign_character_item_instance FOR EACH ROW EXECUTE FUNCTION guard_bound_vessel_copy();
--> statement-breakpoint
CREATE FUNCTION guard_companion_event_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Companion disposition history is immutable.'; END $$;
--> statement-breakpoint
CREATE TRIGGER companion_event_update_guard BEFORE UPDATE ON companion_disposition_event FOR EACH ROW EXECUTE FUNCTION guard_companion_event_update();
