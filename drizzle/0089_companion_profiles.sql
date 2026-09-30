CREATE TABLE "companion_profile" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"control_model" text,
	"combat_preference" text,
	"relationship_notes" text DEFAULT '' NOT NULL,
	"requires_owner_review" boolean DEFAULT false NOT NULL,
	"revision" integer NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companion_profile_choices_valid" CHECK (("companion_profile"."control_model" IS NULL AND "companion_profile"."combat_preference" IS NULL) OR ("companion_profile"."control_model" IS NOT NULL AND "companion_profile"."combat_preference" IS NOT NULL AND "companion_profile"."control_model" IN ('player-directed','owner-commands','god-directed') AND "companion_profile"."combat_preference" IN ('normally-joins','normally-stays-out','decide-at-start'))),
	CONSTRAINT "companion_profile_notes_valid" CHECK (length("companion_profile"."relationship_notes") <= 1000),
	CONSTRAINT "companion_profile_revision_valid" CHECK ("companion_profile"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "companion_profile_event" (
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
	CONSTRAINT "companion_profile_event_request_uq" UNIQUE("character_id","request_key"),
	CONSTRAINT "companion_profile_event_revision_uq" UNIQUE("character_id","revision"),
	CONSTRAINT "companion_profile_event_revision_valid" CHECK ("companion_profile_event"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "companion_profile_role" (
	"character_id" integer NOT NULL,
	"role" text NOT NULL,
	"other_label" text DEFAULT '' NOT NULL,
	"maximum_riders" integer,
	"mount_notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "companion_profile_role_character_id_role_pk" PRIMARY KEY("character_id","role"),
	CONSTRAINT "companion_profile_role_valid" CHECK ("companion_profile_role"."role" IN ('companion','mount','familiar','pack-working','guard-combat','scout-utility','other')),
	CONSTRAINT "companion_profile_other_valid" CHECK (("companion_profile_role"."role" = 'other' AND length(btrim("companion_profile_role"."other_label")) BETWEEN 1 AND 120 AND "companion_profile_role"."other_label" ~ '[[:alnum:]]') OR ("companion_profile_role"."role" <> 'other' AND "companion_profile_role"."other_label" = '')),
	CONSTRAINT "companion_profile_mount_valid" CHECK (("companion_profile_role"."role" = 'mount' AND "companion_profile_role"."maximum_riders" IS NOT NULL AND "companion_profile_role"."maximum_riders" > 0 AND length("companion_profile_role"."mount_notes") <= 500) OR ("companion_profile_role"."role" <> 'mount' AND "companion_profile_role"."maximum_riders" IS NULL AND "companion_profile_role"."mount_notes" = ''))
);
--> statement-breakpoint
ALTER TABLE "companion_profile" ADD CONSTRAINT "companion_profile_character_id_campaign_creature_npc_profile_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_creature_npc_profile"("character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_profile" ADD CONSTRAINT "companion_profile_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_profile" ADD CONSTRAINT "companion_profile_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_profile" ADD CONSTRAINT "companion_profile_campaign_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_profile_event" ADD CONSTRAINT "companion_profile_event_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_profile_event" ADD CONSTRAINT "companion_profile_event_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_profile_event" ADD CONSTRAINT "companion_profile_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_profile_role" ADD CONSTRAINT "companion_profile_role_character_id_companion_profile_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."companion_profile"("character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companion_profile_campaign_idx" ON "companion_profile" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "companion_profile_event_campaign_idx" ON "companion_profile_event" USING btree ("campaign_id");
--> statement-breakpoint
-- No backfill. Notes-only records leave both behavior choices unconfigured.
CREATE FUNCTION guard_companion_profile_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE individual campaign_character%ROWTYPE; owning campaign_character%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.character_id <> OLD.character_id OR NEW.campaign_id <> OLD.campaign_id) THEN
    RAISE EXCEPTION 'Companion Profile individual and Campaign identity cannot change.';
  END IF;
  SELECT * INTO individual FROM campaign_character WHERE id=NEW.character_id FOR UPDATE;
  IF NOT FOUND OR NOT individual.is_npc OR individual.npc_kind <> 'creature' OR individual.campaign_id <> NEW.campaign_id THEN
    RAISE EXCEPTION 'Companion Profiles require an exact persistent Creature NPC in this Campaign.';
  END IF;
  IF individual.owner_character_id IS NULL THEN
    -- Only the nested ownership trigger may retain an unowned profile for later review.
    IF TG_OP <> 'UPDATE' OR pg_trigger_depth() < 2 OR NOT NEW.requires_owner_review OR
      (to_jsonb(NEW) - ARRAY['requires_owner_review','revision','updated_at','updated_by_user_id']) IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['requires_owner_review','revision','updated_at','updated_by_user_id']) THEN
      RAISE EXCEPTION 'Assign a current owner before editing this Companion Profile.';
    END IF;
  ELSE
    SELECT * INTO owning FROM campaign_character WHERE id=individual.owner_character_id FOR SHARE;
    IF NOT FOUND OR owning.campaign_id <> NEW.campaign_id OR (owning.is_npc AND owning.npc_kind <> 'race') THEN
      RAISE EXCEPTION 'Companion Profile owner must be a Player Character or Race NPC in the same Campaign.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER companion_profile_identity_guard BEFORE INSERT OR UPDATE ON companion_profile FOR EACH ROW EXECUTE FUNCTION guard_companion_profile_identity();
--> statement-breakpoint
CREATE FUNCTION guard_companion_role_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE individual_id integer;
BEGIN
  individual_id := CASE WHEN TG_OP='DELETE' THEN OLD.character_id ELSE NEW.character_id END;
  IF EXISTS (SELECT 1 FROM companion_profile p JOIN companion_profile_role r ON r.character_id=p.character_id WHERE p.character_id=individual_id AND p.control_model IS NULL) THEN
    RAISE EXCEPTION 'Configure Control Model and Combat Preference before assigning companion roles.';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER companion_roles_configured AFTER INSERT OR UPDATE OR DELETE ON companion_profile_role DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_companion_role_configuration();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER companion_choices_configured AFTER INSERT OR UPDATE ON companion_profile DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_companion_role_configuration();
--> statement-breakpoint
CREATE FUNCTION guard_companion_character_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.campaign_id <> OLD.campaign_id OR NOT NEW.is_npc OR NEW.npc_kind <> 'creature') AND EXISTS (SELECT 1 FROM companion_profile WHERE character_id=OLD.id) THEN
    RAISE EXCEPTION 'Preserve the persistent Creature identity and Campaign of its Companion Profile.';
  END IF;
  IF (NEW.campaign_id <> OLD.campaign_id OR (NEW.is_npc AND NEW.npc_kind <> 'race')) AND EXISTS (
    SELECT 1 FROM companion_profile p JOIN campaign_character c ON c.id=p.character_id WHERE c.owner_character_id=OLD.id
  ) THEN RAISE EXCEPTION 'Preserve the Character owner identity and Campaign of configured companions.'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER companion_character_identity_guard BEFORE UPDATE ON campaign_character FOR EACH ROW EXECUTE FUNCTION guard_companion_character_identity();
--> statement-breakpoint
CREATE FUNCTION mark_companion_profile_owner_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior companion_profile%ROWTYPE; changed companion_profile%ROWTYPE; role_data jsonb;
BEGIN
  IF NEW.owner_character_id IS NOT DISTINCT FROM OLD.owner_character_id THEN RETURN NEW; END IF;
  SELECT * INTO prior FROM companion_profile WHERE character_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) - 'character_id' ORDER BY r.role),'[]'::jsonb) INTO role_data FROM companion_profile_role r WHERE r.character_id=NEW.id;
  UPDATE companion_profile SET requires_owner_review=true, revision=revision+1, updated_by_user_id=NULL, updated_at=now() WHERE character_id=NEW.id RETURNING * INTO changed;
  INSERT INTO companion_profile_event(campaign_id,character_id,request_key,revision,command,"before","after") VALUES(
    NEW.campaign_id,NEW.id,'ownership-review:' || changed.revision,changed.revision,
    jsonb_build_object('operation','ownership-review','previousOwnerCharacterId',OLD.owner_character_id,'ownerCharacterId',NEW.owner_character_id),
    to_jsonb(prior) || jsonb_build_object('roles',role_data),to_jsonb(changed) || jsonb_build_object('roles',role_data));
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER companion_profile_owner_review AFTER UPDATE OF owner_character_id ON campaign_character FOR EACH ROW EXECUTE FUNCTION mark_companion_profile_owner_review();
--> statement-breakpoint
CREATE FUNCTION guard_companion_profile_event_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Companion Profile history is immutable.'; END $$;
--> statement-breakpoint
CREATE TRIGGER companion_profile_event_update_guard BEFORE UPDATE ON companion_profile_event FOR EACH ROW EXECUTE FUNCTION guard_companion_profile_event_update();
