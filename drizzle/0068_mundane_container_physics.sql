ALTER TABLE "items" ADD COLUMN "volume_l" double precision;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "longest_dimension_cm" double precision;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "classification" text DEFAULT 'generic' NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "max_weight_lb" double precision;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "volume_capacity_l" double precision;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "max_item_dimension_cm" double precision;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_volume_finite" CHECK ("items"."volume_l" is null or ("items"."volume_l" >= 0 and "items"."volume_l" < 'Infinity'::float8));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_dimension_finite" CHECK ("items"."longest_dimension_cm" is null or ("items"."longest_dimension_cm" >= 0 and "items"."longest_dimension_cm" < 'Infinity'::float8));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_classification_valid" CHECK ("container_profiles"."classification" in ('pocket','pouch','backpack','quiver','sheath','holster','case','chest','crate','bottle','flask','generic'));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_weight_finite" CHECK ("container_profiles"."max_weight_lb" is null or ("container_profiles"."max_weight_lb" >= 0 and "container_profiles"."max_weight_lb" < 'Infinity'::float8));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_volume_finite" CHECK ("container_profiles"."volume_capacity_l" is null or ("container_profiles"."volume_capacity_l" >= 0 and "container_profiles"."volume_capacity_l" < 'Infinity'::float8));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_dimension_finite" CHECK ("container_profiles"."max_item_dimension_cm" is null or ("container_profiles"."max_item_dimension_cm" >= 0 and "container_profiles"."max_item_dimension_cm" < 'Infinity'::float8));
--> statement-breakpoint
-- Backstop every Equipment State writer, including combat and administrative SQL.
-- Existing rows are preserved; contradictory legacy loads can always be moved loose.
CREATE FUNCTION guard_containment_equipment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_inventory_containment(NEW.character_id);
  IF EXISTS (SELECT 1 FROM inventory_instance_location l JOIN campaign_character_item_instance i ON i.id=l.instance_id
    WHERE l.character_id=NEW.character_id AND i.equipment_state IN ('worn','wielded')) THEN
    RAISE EXCEPTION 'Move this Item to loose before marking it Worn or Wielded; change Worn or Wielded Items to Equipped or Inactive before storing them.';
  END IF;
  IF EXISTS (SELECT 1 FROM campaign_character_item o WHERE o.character_id=NEW.character_id AND o.quantity <
    coalesce((SELECT sum(l.quantity) FROM inventory_stack_location l WHERE l.character_id=o.character_id AND l.item_id=o.item_id),0) +
    coalesce((SELECT sum(e.quantity) FROM campaign_character_item_equipment_state e WHERE e.character_id=o.character_id AND e.item_id=o.item_id AND e.state IN ('worn','wielded')),0)) THEN
    RAISE EXCEPTION 'Worn and Wielded stack copies must stay loose. Reduce those equipment quantities before storing more copies.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER containment_equipment_instance_guard AFTER INSERT OR UPDATE OF equipment_state ON campaign_character_item_instance
  FOR EACH ROW EXECUTE FUNCTION guard_containment_equipment();
--> statement-breakpoint
CREATE TRIGGER containment_equipment_stack_guard AFTER INSERT OR UPDATE ON campaign_character_item_equipment_state
  FOR EACH ROW EXECUTE FUNCTION guard_containment_equipment();
--> statement-breakpoint
CREATE TRIGGER containment_location_instance_equipment_guard AFTER INSERT OR UPDATE ON inventory_instance_location
  FOR EACH ROW EXECUTE FUNCTION guard_containment_equipment();
--> statement-breakpoint
CREATE TRIGGER containment_location_stack_equipment_guard AFTER INSERT OR UPDATE ON inventory_stack_location
  FOR EACH ROW EXECUTE FUNCTION guard_containment_equipment();

--> statement-breakpoint
-- The Pass 1 profile had only item_id. Allow new physical fields to be edited
-- while preserving its identity, ownership conversion, and removal guards.
CREATE OR REPLACE FUNCTION guard_container_profile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE model_id integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.item_id <> OLD.item_id THEN RAISE EXCEPTION 'A container profile cannot change Item identity.'; END IF;
  model_id := CASE WHEN TG_OP='DELETE' THEN OLD.item_id ELSE NEW.item_id END;
  UPDATE items SET updated_at=updated_at WHERE id=model_id;
  IF TG_OP='INSERT' AND EXISTS (SELECT 1 FROM campaign_character_item WHERE item_id=model_id) THEN
    RAISE EXCEPTION 'Existing stack ownership cannot be converted automatically. Resolve it before defining this Item as a container.';
  END IF;
  IF TG_OP='DELETE' AND EXISTS (SELECT 1 FROM campaign_character_item_instance WHERE item_id=model_id) THEN
    RAISE EXCEPTION 'Keep the container profile while owned copy records exist.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
CREATE TRIGGER containment_stack_quantity_equipment_guard AFTER INSERT OR UPDATE OF quantity ON campaign_character_item
  FOR EACH ROW EXECUTE FUNCTION guard_containment_equipment();
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "physical_form" text;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "allows_nested_containers" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "liquid_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "allowed_categories" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "allowed_record_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "contained_weight_behavior" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_physical_form_valid" CHECK ("items"."physical_form" is null or "items"."physical_form" in ('solid','liquid'));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_weight_behavior_valid" CHECK ("container_profiles"."contained_weight_behavior" = 'normal');