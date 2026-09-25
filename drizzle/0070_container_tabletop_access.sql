CREATE TABLE "inventory_container_access" (
	"instance_id" integer PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"state" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "container_access_state_valid" CHECK ("inventory_container_access"."state" in ('open','closed','locked','sealed'))
);
--> statement-breakpoint
CREATE TABLE "inventory_custody_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"instance_id" integer,
	"quantity" integer NOT NULL,
	"operation" text NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"request_key" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"session_id" integer,
	"scene_id" integer,
	"context_label" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_instance_custody" (
	"instance_id" integer PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"status" text NOT NULL,
	"session_id" integer,
	"scene_id" integer,
	"context_label" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "instance_custody_status_valid" CHECK ("inventory_instance_custody"."status" in ('dropped','stolen','lost'))
);
--> statement-breakpoint
CREATE TABLE "inventory_stack_custody" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"status" text NOT NULL,
	"session_id" integer,
	"scene_id" integer,
	"context_label" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stack_custody_quantity_valid" CHECK ("inventory_stack_custody"."quantity" > 0),
	CONSTRAINT "stack_custody_status_valid" CHECK ("inventory_stack_custody"."status" in ('dropped','stolen','lost'))
);
--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "closure_mode" text DEFAULT 'always-accessible' NOT NULL;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "retrieve_initiative_cost" double precision;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "stow_initiative_cost" double precision;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "open_initiative_cost" double precision;--> statement-breakpoint
ALTER TABLE "container_profiles" ADD COLUMN "close_initiative_cost" double precision;--> statement-breakpoint
ALTER TABLE "inventory_container_access" ADD CONSTRAINT "inventory_container_access_item_id_container_profiles_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."container_profiles"("item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_container_access" ADD CONSTRAINT "container_access_owned_fk" FOREIGN KEY ("instance_id","character_id","item_id") REFERENCES "public"."campaign_character_item_instance"("id","character_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_event" ADD CONSTRAINT "inventory_custody_event_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_event" ADD CONSTRAINT "inventory_custody_event_session_id_campaign_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."campaign_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_event" ADD CONSTRAINT "inventory_custody_event_scene_id_campaign_session_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."campaign_session_scene"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_instance_custody" ADD CONSTRAINT "inventory_instance_custody_session_id_campaign_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."campaign_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_instance_custody" ADD CONSTRAINT "inventory_instance_custody_scene_id_campaign_session_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."campaign_session_scene"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_instance_custody" ADD CONSTRAINT "instance_custody_owned_fk" FOREIGN KEY ("instance_id","character_id","item_id") REFERENCES "public"."campaign_character_item_instance"("id","character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stack_custody" ADD CONSTRAINT "inventory_stack_custody_session_id_campaign_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."campaign_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stack_custody" ADD CONSTRAINT "inventory_stack_custody_scene_id_campaign_session_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."campaign_session_scene"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stack_custody" ADD CONSTRAINT "stack_custody_owned_fk" FOREIGN KEY ("character_id","item_id") REFERENCES "public"."campaign_character_item"("character_id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "container_access_character_idx" ON "inventory_container_access" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custody_event_request_uq" ON "inventory_custody_event" USING btree ("character_id","request_key");--> statement-breakpoint
CREATE INDEX "custody_event_character_idx" ON "inventory_custody_event" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "instance_custody_character_idx" ON "inventory_instance_custody" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "stack_custody_character_idx" ON "inventory_stack_custody" USING btree ("character_id");--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_closure_mode_valid" CHECK ("container_profiles"."closure_mode" in ('always-accessible','open-close'));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_access_cost_0_valid" CHECK ("container_profiles"."retrieve_initiative_cost" is null or ("container_profiles"."retrieve_initiative_cost" >= 0 and "container_profiles"."retrieve_initiative_cost" < 'Infinity'::float8));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_access_cost_1_valid" CHECK ("container_profiles"."stow_initiative_cost" is null or ("container_profiles"."stow_initiative_cost" >= 0 and "container_profiles"."stow_initiative_cost" < 'Infinity'::float8));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_access_cost_2_valid" CHECK ("container_profiles"."open_initiative_cost" is null or ("container_profiles"."open_initiative_cost" >= 0 and "container_profiles"."open_initiative_cost" < 'Infinity'::float8));--> statement-breakpoint
ALTER TABLE "container_profiles" ADD CONSTRAINT "container_access_cost_3_valid" CHECK ("container_profiles"."close_initiative_cost" is null or ("container_profiles"."close_initiative_cost" >= 0 and "container_profiles"."close_initiative_cost" < 'Infinity'::float8));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_containment_stack_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocated_quantity bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM lock_inventory_containment(OLD.character_id);
    SELECT coalesce(sum(quantity),0) INTO allocated_quantity FROM inventory_stack_location
      WHERE character_id=OLD.character_id AND item_id=OLD.item_id;
    SELECT allocated_quantity + coalesce(sum(quantity),0) INTO allocated_quantity FROM inventory_stack_custody WHERE character_id=OLD.character_id AND item_id=OLD.item_id;
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
CREATE OR REPLACE FUNCTION guard_inventory_location() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF EXISTS (SELECT 1 FROM inventory_instance_custody WHERE instance_id=NEW.instance_id) THEN RAISE EXCEPTION 'Recover this root before containing it.'; END IF;
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
    SELECT allocated_quantity + coalesce(sum(quantity),0) INTO allocated_quantity FROM inventory_stack_custody WHERE character_id=NEW.character_id AND item_id=NEW.item_id;
    IF allocated_quantity + NEW.quantity > owned_quantity THEN
      RAISE EXCEPTION 'Contained quantity cannot exceed the Character''s owned stack quantity.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

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
    IF EXISTS (SELECT 1 FROM inventory_instance_custody WHERE instance_id=OLD.id) THEN RAISE EXCEPTION 'Recover unavailable inventory before removing or retiring it.'; END IF;
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
CREATE OR REPLACE FUNCTION guard_containment_equipment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_inventory_containment(NEW.character_id);
  IF EXISTS (SELECT 1 FROM inventory_instance_custody c JOIN campaign_character_item_instance i ON i.id=c.instance_id WHERE c.character_id=NEW.character_id AND i.equipment_state IN ('worn','wielded')) THEN RAISE EXCEPTION 'Recover this Item before marking it Worn or Wielded.'; END IF;
  IF EXISTS (SELECT 1 FROM inventory_instance_location l JOIN campaign_character_item_instance i ON i.id=l.instance_id
    WHERE l.character_id=NEW.character_id AND i.equipment_state IN ('worn','wielded')) THEN
    RAISE EXCEPTION 'Move this Item to loose before marking it Worn or Wielded; change Worn or Wielded Items to Equipped or Inactive before storing them.';
  END IF;
  IF EXISTS (SELECT 1 FROM campaign_character_item o WHERE o.character_id=NEW.character_id AND o.quantity <
    coalesce((SELECT sum(l.quantity) FROM inventory_stack_location l WHERE l.character_id=o.character_id AND l.item_id=o.item_id),0) +
    coalesce((SELECT sum(c.quantity) FROM inventory_stack_custody c WHERE c.character_id=o.character_id AND c.item_id=o.item_id),0) +
    coalesce((SELECT sum(e.quantity) FROM campaign_character_item_equipment_state e WHERE e.character_id=o.character_id AND e.item_id=o.item_id AND e.state IN ('worn','wielded')),0)) THEN
    RAISE EXCEPTION 'Worn and Wielded stack copies must stay loose. Reduce those equipment quantities before storing more copies.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_inventory_custody() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocated bigint; owned integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM lock_inventory_containment(OLD.character_id);
    IF TG_OP='UPDATE' AND (NEW.character_id<>OLD.character_id OR NEW.item_id<>OLD.item_id) THEN RAISE EXCEPTION 'Custody cannot change ownership identity.'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  PERFORM lock_inventory_containment(NEW.character_id);
  IF TG_TABLE_NAME='inventory_instance_custody' THEN
    IF TG_OP='UPDATE' AND NEW.instance_id<>OLD.instance_id THEN RAISE EXCEPTION 'Custody cannot change copy identity.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM campaign_character_item_instance WHERE id=NEW.instance_id AND character_id=NEW.character_id AND item_id=NEW.item_id AND retired_at IS NULL) THEN RAISE EXCEPTION 'Choose an active owned root copy.'; END IF;
    IF EXISTS (SELECT 1 FROM inventory_instance_location WHERE instance_id=NEW.instance_id) OR EXISTS (SELECT 1 FROM firearm_magazine_attachment WHERE magazine_instance_id=NEW.instance_id) THEN RAISE EXCEPTION 'Only Loose root copies can receive custody.'; END IF;
  ELSE
    SELECT quantity INTO owned FROM campaign_character_item WHERE character_id=NEW.character_id AND item_id=NEW.item_id;
    SELECT coalesce(sum(quantity),0) INTO allocated FROM inventory_stack_location WHERE character_id=NEW.character_id AND item_id=NEW.item_id;
    SELECT allocated+coalesce(sum(quantity),0) INTO allocated FROM inventory_stack_custody WHERE character_id=NEW.character_id AND item_id=NEW.item_id AND (TG_OP='INSERT' OR id<>OLD.id);
    IF owned IS NULL OR allocated+NEW.quantity>owned THEN RAISE EXCEPTION 'Contained and unavailable quantities cannot exceed ownership.'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER inventory_instance_custody_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_instance_custody FOR EACH ROW EXECUTE FUNCTION guard_inventory_custody();
--> statement-breakpoint
CREATE TRIGGER inventory_stack_custody_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_stack_custody FOR EACH ROW EXECUTE FUNCTION guard_inventory_custody();
--> statement-breakpoint
CREATE TRIGGER custody_instance_equipment_guard AFTER INSERT OR UPDATE ON inventory_instance_custody FOR EACH ROW EXECUTE FUNCTION guard_containment_equipment();
--> statement-breakpoint
CREATE TRIGGER custody_stack_equipment_guard AFTER INSERT OR UPDATE ON inventory_stack_custody FOR EACH ROW EXECUTE FUNCTION guard_containment_equipment();
