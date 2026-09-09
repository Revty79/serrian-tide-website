CREATE TABLE "magazine_ammunition" (
	"magazine_item_id" integer NOT NULL,
	"ammunition_item_id" integer NOT NULL,
	CONSTRAINT "magazine_ammunition_magazine_item_id_ammunition_item_id_pk" PRIMARY KEY("magazine_item_id","ammunition_item_id"),
	CONSTRAINT "magazine_ammo_not_self" CHECK ("magazine_ammunition"."magazine_item_id" <> "magazine_ammunition"."ammunition_item_id")
);
--> statement-breakpoint
CREATE TABLE "magazine_inventory_operation" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"instance_id" integer NOT NULL,
	"request_key" text NOT NULL,
	"actor_user_id" text,
	"request" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "magazine_inventory_retry_uq" UNIQUE("character_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "magazine_profiles" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"capacity_rounds" integer NOT NULL,
	CONSTRAINT "magazine_capacity_positive" CHECK ("magazine_profiles"."capacity_rounds" > 0)
);
--> statement-breakpoint
CREATE TABLE "weapon_magazines" (
	"weapon_profile_id" integer NOT NULL,
	"magazine_item_id" integer NOT NULL,
	CONSTRAINT "weapon_magazines_weapon_profile_id_magazine_item_id_pk" PRIMARY KEY("weapon_profile_id","magazine_item_id")
);
--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "reload_type" text;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD COLUMN "loaded_ammunition_item_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD COLUMN "loaded_rounds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD COLUMN "loaded_ammunition_unit_cost_credits" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "magazine_ammunition" ADD CONSTRAINT "magazine_ammunition_magazine_item_id_magazine_profiles_item_id_fk" FOREIGN KEY ("magazine_item_id") REFERENCES "public"."magazine_profiles"("item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magazine_ammunition" ADD CONSTRAINT "magazine_ammunition_ammunition_item_id_items_id_fk" FOREIGN KEY ("ammunition_item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magazine_inventory_operation" ADD CONSTRAINT "magazine_inventory_operation_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magazine_inventory_operation" ADD CONSTRAINT "magazine_inventory_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magazine_profiles" ADD CONSTRAINT "magazine_profiles_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_magazines" ADD CONSTRAINT "weapon_magazines_weapon_profile_id_weapon_profiles_id_fk" FOREIGN KEY ("weapon_profile_id") REFERENCES "public"."weapon_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_magazines" ADD CONSTRAINT "weapon_magazines_magazine_item_id_magazine_profiles_item_id_fk" FOREIGN KEY ("magazine_item_id") REFERENCES "public"."magazine_profiles"("item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "campaign_character_item_instance_loaded_ammunition_item_id_items_id_fk" FOREIGN KEY ("loaded_ammunition_item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_reload_type_valid" CHECK ("weapon_profiles"."reload_type" IS NULL OR "weapon_profiles"."reload_type" IN ('Single','Magazine'));--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "owned_magazine_contents_valid" CHECK ("campaign_character_item_instance"."loaded_rounds" >= 0 AND "campaign_character_item_instance"."loaded_ammunition_unit_cost_credits" >= 0 AND (("campaign_character_item_instance"."loaded_rounds" = 0 AND "campaign_character_item_instance"."loaded_ammunition_item_id" IS NULL AND "campaign_character_item_instance"."loaded_ammunition_unit_cost_credits" = 0) OR ("campaign_character_item_instance"."loaded_rounds" > 0 AND "campaign_character_item_instance"."loaded_ammunition_item_id" IS NOT NULL)));
--> statement-breakpoint
-- Protect contents across every ownership/catalog path, including sale and retirement.
CREATE FUNCTION protect_owned_magazine() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.loaded_rounds > 0 THEN RAISE EXCEPTION 'Empty the magazine before deleting its copy.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.loaded_rounds > 0 AND (NEW.item_id <> OLD.item_id OR NEW.character_id <> OLD.character_id OR NEW.retired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Empty the magazine before selling, transferring, or retiring its copy.';
  END IF;
  IF NEW.loaded_rounds > 0 THEN
    SELECT capacity_rounds INTO capacity FROM magazine_profiles WHERE item_id = NEW.item_id;
    IF capacity IS NULL OR NEW.loaded_rounds > capacity OR NOT EXISTS(SELECT 1 FROM magazine_ammunition WHERE magazine_item_id=NEW.item_id AND ammunition_item_id=NEW.loaded_ammunition_item_id) THEN
      RAISE EXCEPTION 'Magazine contents exceed capacity or use incompatible ammunition.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER owned_magazine_guard BEFORE INSERT OR UPDATE OR DELETE ON campaign_character_item_instance FOR EACH ROW EXECUTE FUNCTION protect_owned_magazine();
--> statement-breakpoint
CREATE FUNCTION protect_magazine_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS(SELECT 1 FROM campaign_character_item_instance WHERE item_id=OLD.item_id) THEN RAISE EXCEPTION 'Remove owned magazine copies before removing their profile.'; END IF;
    RETURN OLD;
  END IF;
  IF EXISTS(SELECT 1 FROM campaign_character_item_instance WHERE item_id=NEW.item_id AND loaded_rounds>NEW.capacity_rounds) THEN RAISE EXCEPTION 'Empty the affected magazines before reducing capacity.'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER magazine_profile_guard BEFORE UPDATE OR DELETE ON magazine_profiles FOR EACH ROW EXECUTE FUNCTION protect_magazine_profile();
--> statement-breakpoint
CREATE FUNCTION protect_magazine_ammunition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM campaign_character_item_instance WHERE item_id=OLD.magazine_item_id AND loaded_ammunition_item_id=OLD.ammunition_item_id AND loaded_rounds>0) THEN
    RAISE EXCEPTION 'Empty the affected magazines before removing ammunition compatibility.';
  END IF;
  IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER magazine_ammunition_guard BEFORE UPDATE OR DELETE ON magazine_ammunition FOR EACH ROW EXECUTE FUNCTION protect_magazine_ammunition();
--> statement-breakpoint
CREATE FUNCTION protect_magazine_catalog_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL) THEN
    IF EXISTS(SELECT 1 FROM campaign_character_item_instance WHERE loaded_rounds>0 AND (item_id=OLD.id OR loaded_ammunition_item_id=OLD.id)) THEN RAISE EXCEPTION 'Empty the affected magazines before archiving or deleting their model or ammunition.'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.record_type <> OLD.record_type AND lower(trim(OLD.record_type))='ammunition' AND EXISTS(SELECT 1 FROM magazine_ammunition WHERE ammunition_item_id=OLD.id) THEN
    RAISE EXCEPTION 'Remove magazine ammunition links before changing this ammunition definition into another item type.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER magazine_catalog_item_guard BEFORE UPDATE OR DELETE ON items FOR EACH ROW EXECUTE FUNCTION protect_magazine_catalog_item();
