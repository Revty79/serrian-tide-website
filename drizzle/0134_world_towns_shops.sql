CREATE TABLE "world_map_place" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"x_metres" double precision NOT NULL,
	"y_metres" double precision NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_map_place_identity_uq" UNIQUE("map_id","geography_id"),
	CONSTRAINT "world_map_place_valid" CHECK ("world_map_place"."revision">0 AND "world_map_place"."x_metres" BETWEEN 0 AND 1000000000 AND "world_map_place"."y_metres" BETWEEN 0 AND 1000000000)
);
--> statement-breakpoint
CREATE TABLE "world_place_operation" (
	"request_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"map_id" text,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_place_operation_valid" CHECK ("world_place_operation"."kind" IN ('save','archive','restore','place','place-new','remove') AND "world_place_operation"."input_hash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("world_place_operation"."result")='object' AND jsonb_typeof("world_place_operation"."snapshot")='object')
);
--> statement-breakpoint
CREATE TABLE "world_settlement_history" (
	"geography_id" text NOT NULL,
	"world_id" text NOT NULL,
	"entry_id" text NOT NULL,
	CONSTRAINT "world_settlement_history_geography_id_entry_id_pk" PRIMARY KEY("geography_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "world_settlement_profile" (
	"geography_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"category" text DEFAULT 'settlement' NOT NULL,
	"background" text DEFAULT '' NOT NULL,
	"population" text DEFAULT '' NOT NULL,
	"god_notes" text DEFAULT '' NOT NULL,
	"culture_id" text,
	"culture_family" text DEFAULT 'culture' NOT NULL,
	"government_id" text,
	"government_family" text DEFAULT 'government' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"location_notes" text DEFAULT '' NOT NULL,
	"archive_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "world_settlement_profile_world_uq" UNIQUE("geography_id","world_id"),
	CONSTRAINT "world_settlement_profile_valid" CHECK (length("world_settlement_profile"."category")<=120 AND length("world_settlement_profile"."background")<=12000 AND length("world_settlement_profile"."population")<=1200 AND length("world_settlement_profile"."god_notes")<=12000 AND "world_settlement_profile"."culture_family"='culture' AND "world_settlement_profile"."government_family"='government' AND "world_settlement_profile"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "world_creation_operation" (
	"request_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"author_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_creation_operation_valid" CHECK ("world_creation_operation"."input_hash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("world_creation_operation"."result")='object')
);
--> statement-breakpoint
CREATE TABLE "world_place_person" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"resident_id" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"primary_contact" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "world_place_person_uq" UNIQUE("geography_id","resident_id"),
	CONSTRAINT "world_place_person_valid" CHECK ("world_place_person"."revision">0 AND "world_place_person"."sort_order">=0 AND length("world_place_person"."role")<=160 AND length("world_place_person"."note")<=1000)
);
--> statement-breakpoint
CREATE TABLE "world_shop" (
	"geography_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"definition" jsonb NOT NULL,
	"god_notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archive_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "world_shop_world_uq" UNIQUE("geography_id","world_id"),
	CONSTRAINT "world_shop_valid" CHECK ("world_shop"."revision">0 AND "world_shop"."sort_order">=0 AND length("world_shop"."god_notes")<=12000 AND length("world_shop"."archive_reason")<=1000 AND jsonb_typeof("world_shop"."definition")='object' AND coalesce(("world_shop"."definition"->>'balanceCredits')::numeric>=0,false) AND "world_shop"."definition"->>'storefrontState' IN ('open','closed') AND "world_shop"."definition"->>'characterPurchaseMode' IN ('immediate','god-approval-required') AND "world_shop"."definition"->>'soldItemHandling' IN ('add-to-shop-stock','remove-from-active-play') AND "world_shop"."definition"->>'changedSaleConfirmationMode' IN ('character-owner-accepts','god-approval-finalizes'))
);
--> statement-breakpoint
CREATE TABLE "world_shop_location" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"town_id" text NOT NULL,
	"place_id" text,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "world_shop_location_town_uq" UNIQUE("shop_id","town_id"),
	CONSTRAINT "world_shop_location_valid" CHECK ("world_shop_location"."revision">0 AND "world_shop_location"."sort_order">=0 AND length("world_shop_location"."note")<=1000)
);
--> statement-breakpoint
CREATE TABLE "world_shop_offering" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"item_id" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "world_shop_offering_item_uq" UNIQUE("shop_id","item_id"),
	CONSTRAINT "world_shop_offering_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_shop_offering_valid" CHECK ("world_shop_offering"."revision">0 AND "world_shop_offering"."sort_order">=0 AND jsonb_typeof("world_shop_offering"."definition")='object' AND "world_shop_offering"."definition"->>'fulfillmentKind' IN ('inventory-transfer','service-narrative') AND jsonb_typeof("world_shop_offering"."definition"->'enabled')='boolean' AND jsonb_typeof("world_shop_offering"."definition"->'unlimitedStock')='boolean' AND coalesce((("world_shop_offering"."definition"->>'unlimitedStock')::boolean AND "world_shop_offering"."definition"->'limitedQuantity'='null'::jsonb) OR (NOT ("world_shop_offering"."definition"->>'unlimitedStock')::boolean AND ("world_shop_offering"."definition"->>'limitedQuantity')::numeric>=0 AND trunc(("world_shop_offering"."definition"->>'limitedQuantity')::numeric)=("world_shop_offering"."definition"->>'limitedQuantity')::numeric),false))
);
--> statement-breakpoint
CREATE TABLE "world_town_place" (
	"geography_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"town_id" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"location_notes" text DEFAULT '' NOT NULL,
	"god_notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archive_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "world_town_place_world_uq" UNIQUE("geography_id","world_id"),
	CONSTRAINT "world_town_place_town_uq" UNIQUE("geography_id","world_id","town_id"),
	CONSTRAINT "world_town_place_valid" CHECK ("world_town_place"."revision">0 AND "world_town_place"."sort_order">=0 AND length("world_town_place"."category")<=120 AND length("world_town_place"."location_notes")<=1000 AND length("world_town_place"."god_notes")<=12000 AND length("world_town_place"."archive_reason")<=1000)
);
--> statement-breakpoint
CREATE TABLE "world_town_resident" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"lore_id" text,
	"lore_family" text DEFAULT 'individual' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"god_notes" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "world_town_resident_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_town_resident_valid" CHECK ("world_town_resident"."revision">0 AND length(trim("world_town_resident"."name")) BETWEEN 1 AND 160 AND length("world_town_resident"."description")<=12000 AND length("world_town_resident"."god_notes")<=12000 AND "world_town_resident"."lore_family"='individual')
);
--> statement-breakpoint
ALTER TABLE "world_map_place" ADD CONSTRAINT "world_map_place_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_canvas"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_place" ADD CONSTRAINT "world_map_place_town_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_settlement_profile"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_place_operation" ADD CONSTRAINT "world_place_operation_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_place_operation" ADD CONSTRAINT "world_place_operation_town_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_settlement_profile"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_place_operation" ADD CONSTRAINT "world_place_operation_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_canvas"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_history" ADD CONSTRAINT "world_settlement_history_town_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_settlement_profile"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_history" ADD CONSTRAINT "world_settlement_history_entry_fk" FOREIGN KEY ("entry_id","world_id") REFERENCES "public"."world_historical_entry"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_profile" ADD CONSTRAINT "world_settlement_profile_place_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_profile" ADD CONSTRAINT "world_settlement_profile_culture_fk" FOREIGN KEY ("culture_id","world_id","culture_family") REFERENCES "public"."world_lore_identity"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_profile" ADD CONSTRAINT "world_settlement_profile_government_fk" FOREIGN KEY ("government_id","world_id","government_family") REFERENCES "public"."world_lore_identity"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_creation_operation" ADD CONSTRAINT "world_creation_operation_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_creation_operation" ADD CONSTRAINT "world_creation_operation_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_place_person" ADD CONSTRAINT "world_place_person_geography_id_world_id_world_geography_id_world_id_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_place_person" ADD CONSTRAINT "world_place_person_resident_id_world_id_world_town_resident_id_world_id_fk" FOREIGN KEY ("resident_id","world_id") REFERENCES "public"."world_town_resident"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_shop" ADD CONSTRAINT "world_shop_geography_id_world_id_world_geography_id_world_id_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_shop_location" ADD CONSTRAINT "world_shop_location_shop_fk" FOREIGN KEY ("shop_id","world_id") REFERENCES "public"."world_shop"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_shop_location" ADD CONSTRAINT "world_shop_location_town_fk" FOREIGN KEY ("town_id","world_id") REFERENCES "public"."world_settlement_profile"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_shop_location" ADD CONSTRAINT "world_shop_location_place_fk" FOREIGN KEY ("place_id","world_id","town_id") REFERENCES "public"."world_town_place"("geography_id","world_id","town_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_shop_offering" ADD CONSTRAINT "world_shop_offering_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_shop_offering" ADD CONSTRAINT "world_shop_offering_shop_id_world_id_world_shop_geography_id_world_id_fk" FOREIGN KEY ("shop_id","world_id") REFERENCES "public"."world_shop"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_place" ADD CONSTRAINT "world_town_place_geography_id_world_id_world_geography_id_world_id_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_place" ADD CONSTRAINT "world_town_place_town_id_world_id_world_settlement_profile_geography_id_world_id_fk" FOREIGN KEY ("town_id","world_id") REFERENCES "public"."world_settlement_profile"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_resident" ADD CONSTRAINT "world_town_resident_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_resident" ADD CONSTRAINT "world_town_resident_lore_id_world_id_lore_family_world_lore_identity_id_world_id_family_fk" FOREIGN KEY ("lore_id","world_id","lore_family") REFERENCES "public"."world_lore_identity"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_map_place_world_idx" ON "world_map_place" USING btree ("world_id","map_id");--> statement-breakpoint
CREATE INDEX "world_place_operation_town_idx" ON "world_place_operation" USING btree ("world_id","geography_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "world_place_person_primary_uq" ON "world_place_person" USING btree ("geography_id") WHERE "world_place_person"."primary_contact";
--> statement-breakpoint
CREATE FUNCTION world_map_place_bounds_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM world_map_canvas c JOIN world_terrain t ON t.id=c.terrain_id AND t.world_id=c.world_id
    WHERE c.map_id=NEW.map_id AND c.world_id=NEW.world_id AND NEW.x_metres>=0 AND NEW.y_metres>=0 AND NEW.y_metres<=t.height_metres
      AND ((NOT t.wrap_east_west AND NEW.x_metres<=t.width_metres) OR (t.wrap_east_west AND NEW.x_metres<t.width_metres)))
    THEN RAISE EXCEPTION 'Map appearance coordinates must belong to the saved terrain frame'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW.world_id,NEW.map_id,NEW.geography_id) IS DISTINCT FROM (OLD.id,OLD.world_id,OLD.map_id,OLD.geography_id)
    THEN RAISE EXCEPTION 'Map appearance identity is stable'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_map_place_bounds BEFORE INSERT OR UPDATE ON world_map_place FOR EACH ROW EXECUTE FUNCTION world_map_place_bounds_valid();
--> statement-breakpoint
CREATE FUNCTION world_settlement_profile_identity_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM world_geography g WHERE g.id=NEW.geography_id AND g.world_id=NEW.world_id AND g.kind='location' AND g.context='settlement')
    THEN RAISE EXCEPTION 'A settlement profile requires its World-owned settlement place identity'; END IF;
  IF TG_OP='UPDATE' AND (NEW.geography_id,NEW.world_id) IS DISTINCT FROM (OLD.geography_id,OLD.world_id)
    THEN RAISE EXCEPTION 'Settlement identity is stable'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_settlement_profile_identity BEFORE INSERT OR UPDATE ON world_settlement_profile FOR EACH ROW EXECUTE FUNCTION world_settlement_profile_identity_valid();
--> statement-breakpoint
CREATE FUNCTION world_place_operation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Accepted settlement and appearance operations are immutable'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_place_operation_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_place_operation FOR EACH STATEMENT EXECUTE FUNCTION world_place_operation_immutable();
--> statement-breakpoint

CREATE TRIGGER world_creation_operation_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_creation_operation FOR EACH STATEMENT EXECUTE FUNCTION world_place_operation_immutable();
