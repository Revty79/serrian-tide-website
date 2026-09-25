-- Additive location storage. Existing ownership, costs, equipment and loaded ammunition are unchanged.
CREATE TABLE "container_profiles" (
	"item_id" integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_instance_location" (
	"instance_id" integer PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"container_instance_id" integer NOT NULL,
	"container_item_id" integer NOT NULL,
	CONSTRAINT "instance_location_not_self" CHECK ("inventory_instance_location"."instance_id" <> "inventory_instance_location"."container_instance_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_stack_location" (
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"container_instance_id" integer NOT NULL,
	"container_item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "inventory_stack_location_character_id_item_id_container_instance_id_pk" PRIMARY KEY("character_id","item_id","container_instance_id"),
	CONSTRAINT "stack_location_quantity_positive" CHECK ("inventory_stack_location"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_profiles_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_instance_location" ADD CONSTRAINT "inventory_instance_location_container_item_id_container_profiles_item_id_fk" FOREIGN KEY ("container_item_id") REFERENCES "public"."container_profiles"("item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_instance_location" ADD CONSTRAINT "instance_location_owned_fk" FOREIGN KEY ("instance_id","character_id","item_id") REFERENCES "public"."campaign_character_item_instance"("id","character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_instance_location" ADD CONSTRAINT "instance_location_container_fk" FOREIGN KEY ("container_instance_id","character_id","container_item_id") REFERENCES "public"."campaign_character_item_instance"("id","character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stack_location" ADD CONSTRAINT "inventory_stack_location_container_item_id_container_profiles_item_id_fk" FOREIGN KEY ("container_item_id") REFERENCES "public"."container_profiles"("item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stack_location" ADD CONSTRAINT "stack_location_owned_fk" FOREIGN KEY ("character_id","item_id") REFERENCES "public"."campaign_character_item"("character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stack_location" ADD CONSTRAINT "stack_location_container_fk" FOREIGN KEY ("container_instance_id","character_id","container_item_id") REFERENCES "public"."campaign_character_item_instance"("id","character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instance_location_contents_idx" ON "inventory_instance_location" USING btree ("character_id","container_instance_id");--> statement-breakpoint
CREATE INDEX "stack_location_contents_idx" ON "inventory_stack_location" USING btree ("character_id","container_instance_id");
--> statement-breakpoint
-- A real row write serializes the whole Character graph, even under repeatable read
-- (a stale writer gets a serialization failure rather than accepting a stale graph).
CREATE FUNCTION lock_inventory_containment(owner_id integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE campaign_character SET updated_at = updated_at WHERE id = owner_id;
  -- Parent deletion may already have removed the root during an ordinary cascade.
  -- Ownership/location foreign keys and removal guards still protect contents.
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_inventory_location() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owned_quantity integer; allocated_quantity bigint; parent_id integer; visited integer[] := '{}';
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM lock_inventory_containment(OLD.character_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.character_id <> OLD.character_id OR NEW.item_id <> OLD.item_id) THEN
    RAISE EXCEPTION 'Location ownership cannot be transferred. Move contents to loose first.';
  END IF;
  PERFORM lock_inventory_containment(NEW.character_id);
  IF NOT EXISTS (
    SELECT 1 FROM campaign_character_item_instance c JOIN container_profiles p ON p.item_id=c.item_id
    WHERE c.id=NEW.container_instance_id AND c.character_id=NEW.character_id
      AND c.item_id=NEW.container_item_id AND c.retired_at IS NULL
  ) THEN RAISE EXCEPTION 'Choose an active, owned container copy belonging to this Character.'; END IF;

  IF TG_TABLE_NAME = 'inventory_instance_location' THEN
    IF TG_OP = 'UPDATE' AND NEW.instance_id <> OLD.instance_id THEN
      RAISE EXCEPTION 'An exact location cannot change its owned copy identity.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM campaign_character_item_instance WHERE id=NEW.instance_id
      AND character_id=NEW.character_id AND item_id=NEW.item_id AND retired_at IS NULL) THEN
      RAISE EXCEPTION 'Choose an active exact copy owned by this Character.';
    END IF;
    parent_id := NEW.container_instance_id;
    WHILE parent_id IS NOT NULL LOOP
      IF parent_id = NEW.instance_id OR parent_id = ANY(visited) THEN
        RAISE EXCEPTION 'Circular containment and self-containment are not allowed.';
      END IF;
      visited := array_append(visited, parent_id);
      -- Validate every ancestor, not just the destination, and fail closed.
      IF NOT EXISTS (SELECT 1 FROM campaign_character_item_instance c JOIN container_profiles p ON p.item_id=c.item_id
        WHERE c.id=parent_id AND c.character_id=NEW.character_id AND c.retired_at IS NULL) THEN
        RAISE EXCEPTION 'Invalid containment ancestry.';
      END IF;
      SELECT container_instance_id INTO parent_id FROM inventory_instance_location
        WHERE instance_id=parent_id AND character_id=NEW.character_id;
    END LOOP;
  ELSE
    IF NEW.quantity <= 0 THEN RAISE EXCEPTION 'Contained stack quantity must be positive.'; END IF;
    SELECT quantity INTO owned_quantity FROM campaign_character_item
      WHERE character_id=NEW.character_id AND item_id=NEW.item_id;
    IF owned_quantity IS NULL THEN RAISE EXCEPTION 'This Character does not own that stack.'; END IF;
    SELECT coalesce(sum(quantity),0) INTO allocated_quantity FROM inventory_stack_location
      WHERE character_id=NEW.character_id AND item_id=NEW.item_id
        AND (TG_OP = 'INSERT' OR container_instance_id <> OLD.container_instance_id);
    IF allocated_quantity + NEW.quantity > owned_quantity THEN
      RAISE EXCEPTION 'Contained quantity cannot exceed the Character''s owned stack quantity.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER inventory_instance_location_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_instance_location
  FOR EACH ROW EXECUTE FUNCTION guard_inventory_location();
--> statement-breakpoint
CREATE TRIGGER inventory_stack_location_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_stack_location
  FOR EACH ROW EXECUTE FUNCTION guard_inventory_location();
--> statement-breakpoint
-- Backstop every existing ownership writer: use, commerce, administrative removal,
-- magazines/firearms, Character/NPC saving, and direct SQL all preserve allocations.
CREATE FUNCTION guard_containment_stack_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocated_quantity bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM lock_inventory_containment(OLD.character_id);
    SELECT coalesce(sum(quantity),0) INTO allocated_quantity FROM inventory_stack_location
      WHERE character_id=OLD.character_id AND item_id=OLD.item_id;
    IF allocated_quantity > 0 AND (TG_OP = 'DELETE' OR NEW.character_id <> OLD.character_id
      OR NEW.item_id <> OLD.item_id OR NEW.quantity < allocated_quantity) THEN
      RAISE EXCEPTION 'Move the allocated stack quantity to loose before removing or consuming it.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'INSERT' OR NEW.character_id <> OLD.character_id OR NEW.item_id <> OLD.item_id THEN
    PERFORM lock_inventory_containment(NEW.character_id);
    -- Serializes catalog activation with new ownership, including stale snapshots.
    UPDATE items SET updated_at=updated_at WHERE id=NEW.item_id;
    IF EXISTS (SELECT 1 FROM container_profiles WHERE item_id=NEW.item_id) THEN
      RAISE EXCEPTION 'Containers require exact owned copies; they cannot be stack-owned.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER containment_stack_ownership_guard BEFORE INSERT OR UPDATE OR DELETE ON campaign_character_item
  FOR EACH ROW EXECUTE FUNCTION guard_containment_stack_ownership();
--> statement-breakpoint
CREATE FUNCTION guard_containment_instance_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE items SET updated_at=updated_at WHERE id=NEW.item_id;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR NEW.character_id <> OLD.character_id
    OR NEW.item_id <> OLD.item_id OR (OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL) THEN
    PERFORM lock_inventory_containment(OLD.character_id);
    IF EXISTS (SELECT 1 FROM inventory_instance_location WHERE container_instance_id=OLD.id)
      OR EXISTS (SELECT 1 FROM inventory_stack_location WHERE container_instance_id=OLD.id) THEN
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
CREATE TRIGGER containment_instance_ownership_guard BEFORE INSERT OR UPDATE OR DELETE ON campaign_character_item_instance
  FOR EACH ROW EXECUTE FUNCTION guard_containment_instance_ownership();
--> statement-breakpoint
CREATE FUNCTION guard_container_profile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE model_id integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'A container profile cannot change Item identity.'; END IF;
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
CREATE TRIGGER container_profile_guard BEFORE INSERT OR UPDATE OR DELETE ON container_profiles
  FOR EACH ROW EXECUTE FUNCTION guard_container_profile();
