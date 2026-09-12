-- Magazine contents remain on the individual inventory copy; attachments hold identity only.
CREATE TABLE "firearm_magazine_attachment" (
	"weapon_instance_id" integer PRIMARY KEY NOT NULL,
	"magazine_instance_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"weapon_item_id" integer NOT NULL,
	"weapon_profile_id" integer NOT NULL,
	"magazine_item_id" integer NOT NULL,
	CONSTRAINT "firearm_magazine_attachment_magazine_instance_id_unique" UNIQUE("magazine_instance_id"),
	CONSTRAINT "firearm_magazine_distinct_copies" CHECK ("firearm_magazine_attachment"."weapon_instance_id" <> "firearm_magazine_attachment"."magazine_instance_id")
);
--> statement-breakpoint
ALTER TABLE "firearm_magazine_attachment" ADD CONSTRAINT "firearm_magazine_weapon_identity_fk" FOREIGN KEY ("weapon_instance_id","campaign_id","character_id","weapon_item_id","weapon_profile_id") REFERENCES "public"."campaign_character_firearm_state"("item_instance_id","campaign_id","character_id","item_id","weapon_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firearm_magazine_attachment" ADD CONSTRAINT "firearm_magazine_copy_identity_fk" FOREIGN KEY ("magazine_instance_id","character_id","magazine_item_id") REFERENCES "public"."campaign_character_item_instance"("id","character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firearm_magazine_attachment" ADD CONSTRAINT "firearm_magazine_physical_fit_fk" FOREIGN KEY ("weapon_profile_id","magazine_item_id") REFERENCES "public"."weapon_magazines"("weapon_profile_id","magazine_item_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION guard_attached_magazine_copies() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.character_id <> OLD.character_id OR NEW.item_id <> OLD.item_id OR NEW.id <> OLD.id THEN
    IF EXISTS (SELECT 1 FROM firearm_magazine_attachment WHERE weapon_instance_id = OLD.id OR magazine_instance_id = OLD.id)
      OR EXISTS (SELECT 1 FROM magazine_inventory_operation WHERE instance_id = OLD.id AND request->>'operation' = 'combat-fill' AND result->>'status' IN ('pending','interrupted')) THEN
      RAISE EXCEPTION 'Detach the magazine or resolve its unfinished filling action before removing or transferring this copy.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_attached_magazine_copy_update BEFORE UPDATE OF retired_at, character_id, item_id, id OR DELETE ON campaign_character_item_instance FOR EACH ROW EXECUTE FUNCTION guard_attached_magazine_copies();
--> statement-breakpoint
CREATE FUNCTION guard_firearm_magazine_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM campaign_character_item_instance WHERE id IN (NEW.weapon_instance_id, NEW.magazine_instance_id) AND retired_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM campaign_character_firearm_state WHERE item_instance_id = NEW.weapon_instance_id AND loaded_rounds <> 0) THEN
    RAISE EXCEPTION 'A magazine attachment requires active owned copies and no duplicate internal firearm load.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_firearm_magazine_attachment_insert BEFORE INSERT OR UPDATE ON firearm_magazine_attachment FOR EACH ROW EXECUTE FUNCTION guard_firearm_magazine_attachment();
--> statement-breakpoint
CREATE FUNCTION guard_firearm_internal_rounds() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.loaded_rounds <> 0 AND EXISTS (SELECT 1 FROM firearm_magazine_attachment WHERE weapon_instance_id = NEW.item_instance_id) THEN
    RAISE EXCEPTION 'Attached ammunition belongs to the magazine copy; the firearm cannot store a duplicate load.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_firearm_internal_rounds_update BEFORE UPDATE OF loaded_rounds ON campaign_character_firearm_state FOR EACH ROW EXECUTE FUNCTION guard_firearm_internal_rounds();
