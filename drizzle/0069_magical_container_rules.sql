CREATE TABLE "inventory_container_substance" (
	"instance_id" integer PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"substance" jsonb NOT NULL,
	"quantity" double precision NOT NULL,
	CONSTRAINT "container_substance_quantity_valid" CHECK ("inventory_container_substance"."quantity" > 0 and "inventory_container_substance"."quantity" < 'Infinity'::float8)
);
--> statement-breakpoint
ALTER TABLE "container_profiles" DROP CONSTRAINT "container_weight_behavior_valid";--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "weight_capacity_mode" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "volume_capacity_mode" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "fixed_loaded_weight_lb" double precision;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "magical_content_restriction" text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "time_behavior" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "time_multiplier" double precision;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "time_applies_to" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "time_categories" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "time_record_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "living_contents_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "inventory_container_substance" ADD CONSTRAINT "inventory_container_substance_item_id_container_profiles_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."container_profiles"("item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_container_substance" ADD CONSTRAINT "container_substance_owned_fk" FOREIGN KEY ("instance_id","character_id","item_id") REFERENCES "public"."campaign_character_item_instance"("id","character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "container_substance_character_idx" ON "inventory_container_substance" USING btree ("character_id");--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_capacity_modes_valid" CHECK ("container_profiles"."weight_capacity_mode" in ('normal','unlimited') and "container_profiles"."volume_capacity_mode" in ('normal','unlimited'));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_fixed_weight_valid" CHECK (("container_profiles"."fixed_loaded_weight_lb" is null or ("container_profiles"."fixed_loaded_weight_lb" >= 0 and "container_profiles"."fixed_loaded_weight_lb" < 'Infinity'::float8)) and ("container_profiles"."contained_weight_behavior" <> 'fixed' or "container_profiles"."fixed_loaded_weight_lb" is not null));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_magic_restriction_valid" CHECK ("container_profiles"."magical_content_restriction" in ('any','mundane-only','magical-only'));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_time_valid" CHECK ("container_profiles"."time_behavior" in ('normal','suspended','slowed','accelerated') and ("container_profiles"."time_behavior" not in ('slowed','accelerated') or ("container_profiles"."time_multiplier" is not null and "container_profiles"."time_multiplier" > 0 and "container_profiles"."time_multiplier" < 'Infinity'::float8 and (("container_profiles"."time_behavior" = 'slowed' and "container_profiles"."time_multiplier" < 1) or ("container_profiles"."time_behavior" = 'accelerated' and "container_profiles"."time_multiplier" > 1)))));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_time_scope_valid" CHECK ("container_profiles"."time_applies_to" in ('all','perishables','living','categories-types'));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_source_valid" CHECK ("container_profiles"."source" is null or (jsonb_typeof("container_profiles"."source") = 'object' and "container_profiles"."source"->>'mode' in ('finite','infinite') and length("container_profiles"."source"->'substance'->>'id') > 0 and length("container_profiles"."source"->'substance'->>'name') > 0 and ("container_profiles"."source"->>'mode' <> 'infinite' or "container_profiles"."contained_weight_behavior" <> 'normal')));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_weight_behavior_valid" CHECK ("container_profiles"."contained_weight_behavior" in ('normal','contents-weightless','fixed'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_containment_instance_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE items SET updated_at=updated_at WHERE id=NEW.item_id;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR NEW.character_id <> OLD.character_id
    OR NEW.item_id <> OLD.item_id OR (OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL) THEN
    PERFORM lock_inventory_containment(OLD.character_id);
    IF EXISTS (SELECT 1 FROM inventory_instance_location WHERE container_instance_id=OLD.id)
      OR EXISTS (SELECT 1 FROM inventory_stack_location WHERE container_instance_id=OLD.id)
      OR EXISTS (SELECT 1 FROM inventory_container_substance WHERE instance_id=OLD.id) THEN
      RAISE EXCEPTION 'Empty the container before removing or retiring its owned copy.';
    END IF;
    IF EXISTS (SELECT 1 FROM inventory_instance_location WHERE instance_id=OLD.id) THEN
      RAISE EXCEPTION 'Move this owned copy to loose before removing or retiring it.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.item_id <> OLD.item_id THEN UPDATE items SET updated_at=updated_at WHERE id=NEW.item_id; END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
CREATE FUNCTION guard_inventory_substance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM lock_inventory_containment(OLD.character_id);
    IF TG_OP = 'UPDATE' AND (NEW.instance_id <> OLD.instance_id OR NEW.character_id <> OLD.character_id OR NEW.item_id <> OLD.item_id) THEN
      RAISE EXCEPTION 'Stored substance cannot change its owned container identity.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  PERFORM lock_inventory_containment(NEW.character_id);
  IF NOT EXISTS (SELECT 1 FROM campaign_character_item_instance WHERE id=NEW.instance_id AND character_id=NEW.character_id AND item_id=NEW.item_id AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'Choose an active owned container for substance storage.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER inventory_substance_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_container_substance
  FOR EACH ROW EXECUTE FUNCTION guard_inventory_substance();
