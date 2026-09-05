CREATE TABLE "shop" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location_notes" text DEFAULT '' NOT NULL,
	"balance_credits" double precision DEFAULT 0 NOT NULL,
	"storefront_state" text DEFAULT 'closed' NOT NULL,
	"character_purchase_mode" text DEFAULT 'god-approval-required' NOT NULL,
	"sold_item_handling" text DEFAULT 'add-to-shop-stock' NOT NULL,
	"changed_sale_confirmation_mode" text DEFAULT 'character-owner-accepts' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	"archived_by_user_id" text,
	"archive_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "shop_id_campaign_uq" UNIQUE("id","campaign_id"),
	CONSTRAINT "shop_name_nonblank" CHECK (length(trim("shop"."name")) > 0),
	CONSTRAINT "shop_name_length_valid" CHECK (length("shop"."name") <= 120),
	CONSTRAINT "shop_category_nonblank" CHECK (length(trim("shop"."category")) > 0),
	CONSTRAINT "shop_category_length_valid" CHECK (length("shop"."category") <= 120),
	CONSTRAINT "shop_description_length_valid" CHECK (length("shop"."description") <= 5000),
	CONSTRAINT "shop_location_notes_length_valid" CHECK (length("shop"."location_notes") <= 1000),
	CONSTRAINT "shop_balance_valid" CHECK ("shop"."balance_credits" >= 0),
	CONSTRAINT "shop_storefront_state_valid" CHECK ("shop"."storefront_state" IN ('open','closed')),
	CONSTRAINT "shop_character_purchase_mode_valid" CHECK ("shop"."character_purchase_mode" IN ('immediate','god-approval-required')),
	CONSTRAINT "shop_sold_item_handling_valid" CHECK ("shop"."sold_item_handling" IN ('add-to-shop-stock','remove-from-active-play')),
	CONSTRAINT "shop_changed_sale_confirmation_mode_valid" CHECK ("shop"."changed_sale_confirmation_mode" IN ('character-owner-accepts','god-approval-finalizes')),
	CONSTRAINT "shop_archive_state_valid" CHECK ((
        ("shop"."archived_at" IS NULL AND "shop"."archived_by_user_id" IS NULL AND "shop"."archive_reason" = '')
        OR "shop"."archived_at" IS NOT NULL
      )),
	CONSTRAINT "shop_archive_reason_length_valid" CHECK (length("shop"."archive_reason") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "shop_offering" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"fulfillment_kind" text DEFAULT 'inventory-transfer' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"unlimited_stock" boolean DEFAULT true NOT NULL,
	"limited_quantity" integer,
	"selling_price_override_credits" double precision,
	"buying_price_override_credits" double precision,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"shop_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_offering_shop_item_uq" UNIQUE("shop_id","item_id"),
	CONSTRAINT "shop_offering_fulfillment_kind_valid" CHECK ("shop_offering"."fulfillment_kind" IN ('inventory-transfer','service-narrative')),
	CONSTRAINT "shop_offering_stock_valid" CHECK ((
        ("shop_offering"."unlimited_stock" = true AND "shop_offering"."limited_quantity" IS NULL)
        OR ("shop_offering"."unlimited_stock" = false AND "shop_offering"."limited_quantity" >= 0)
      )),
	CONSTRAINT "shop_offering_selling_price_valid" CHECK ("shop_offering"."selling_price_override_credits" IS NULL OR "shop_offering"."selling_price_override_credits" >= 0),
	CONSTRAINT "shop_offering_buying_price_valid" CHECK ("shop_offering"."buying_price_override_credits" IS NULL OR "shop_offering"."buying_price_override_credits" >= 0),
	CONSTRAINT "shop_offering_sort_order_valid" CHECK ("shop_offering"."sort_order" >= 0),
	CONSTRAINT "shop_offering_note_length_valid" CHECK (length("shop_offering"."shop_note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "shop_staff_assignment" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"npc_character_id" integer NOT NULL,
	"responsibility_label" text DEFAULT '' NOT NULL,
	"is_primary_contact" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_staff_assignment_shop_npc_uq" UNIQUE("shop_id","npc_character_id"),
	CONSTRAINT "shop_staff_assignment_responsibility_length_valid" CHECK (length("shop_staff_assignment"."responsibility_label") <= 160),
	CONSTRAINT "shop_staff_assignment_sort_order_valid" CHECK ("shop_staff_assignment"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lifecycle_audit_event" DROP CONSTRAINT "lifecycle_audit_event_entity_kind_valid";--> statement-breakpoint
ALTER TABLE "shop" ADD CONSTRAINT "shop_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop" ADD CONSTRAINT "shop_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_offering" ADD CONSTRAINT "shop_offering_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_offering" ADD CONSTRAINT "shop_offering_shop_campaign_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_staff_assignment" ADD CONSTRAINT "shop_staff_assignment_shop_campaign_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_staff_assignment" ADD CONSTRAINT "shop_staff_assignment_npc_campaign_fk" FOREIGN KEY ("npc_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_campaign_archive_idx" ON "shop" USING btree ("campaign_id","archived_at","name","id");--> statement-breakpoint
CREATE INDEX "shop_archived_by_user_id_idx" ON "shop" USING btree ("archived_by_user_id");--> statement-breakpoint
CREATE INDEX "shop_offering_shop_order_idx" ON "shop_offering" USING btree ("shop_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "shop_offering_item_idx" ON "shop_offering" USING btree ("item_id","shop_id");--> statement-breakpoint
CREATE INDEX "shop_offering_campaign_enabled_idx" ON "shop_offering" USING btree ("campaign_id","item_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_staff_assignment_one_primary_uq" ON "shop_staff_assignment" USING btree ("shop_id") WHERE "shop_staff_assignment"."is_primary_contact" = true;--> statement-breakpoint
CREATE INDEX "shop_staff_assignment_shop_order_idx" ON "shop_staff_assignment" USING btree ("shop_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "shop_staff_assignment_npc_idx" ON "shop_staff_assignment" USING btree ("npc_character_id","shop_id");--> statement-breakpoint
ALTER TABLE "lifecycle_audit_event" ADD CONSTRAINT "lifecycle_audit_event_entity_kind_valid" CHECK ("lifecycle_audit_event"."entity_kind" IN (
        'campaign',
        'player-character',
        'race-npc',
        'creature-npc',
        'race',
        'creature',
        'skill',
        'item',
        'derived-ability',
        'campaign-session',
        'scene',
        'encounter',
        'campaign-player',
        'user-account',
        'shop'
      ));--> statement-breakpoint
CREATE OR REPLACE FUNCTION "shop_assert_staff_npc_eligible"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "campaign_character" AS "candidate"
    WHERE "candidate"."id" = NEW."npc_character_id"
      AND "candidate"."campaign_id" = NEW."campaign_id"
      AND "candidate"."is_npc" = true
      AND "candidate"."npc_kind" IN ('race', 'creature')
      AND "candidate"."npc_build_mode" IN ('simple', 'detailed')
      AND "candidate"."archived_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Shop staff must be an active persistent Race or Creature NPC from the same Campaign.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "shop_staff_assignment_npc_eligibility_guard"
BEFORE INSERT OR UPDATE OF "npc_character_id", "campaign_id"
ON "shop_staff_assignment"
FOR EACH ROW
EXECUTE FUNCTION "shop_assert_staff_npc_eligible"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "shop_assert_offering_item_eligible"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  "must_validate" boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    "must_validate" := true;
  ELSE
    "must_validate" := NEW."item_id" IS DISTINCT FROM OLD."item_id"
      OR NEW."campaign_id" IS DISTINCT FROM OLD."campaign_id"
      OR (NEW."enabled" = true AND OLD."enabled" = false);
  END IF;

  IF "must_validate" AND NOT EXISTS (
    SELECT 1
    FROM "campaign_inventory_item" AS "authorization"
    INNER JOIN "items" AS "catalog_item"
      ON "catalog_item"."id" = "authorization"."item_id"
    WHERE "authorization"."campaign_id" = NEW."campaign_id"
      AND "authorization"."item_id" = NEW."item_id"
      AND "catalog_item"."archived_at" IS NULL
      AND "catalog_item"."catalog_scope" IN ('equipment', 'inventory')
  ) THEN
    RAISE EXCEPTION 'Shop offerings must use an active Equipment or Inventory Item authorized by the same Campaign.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "shop_offering_item_eligibility_guard"
BEFORE INSERT OR UPDATE OF "item_id", "campaign_id", "enabled"
ON "shop_offering"
FOR EACH ROW
EXECUTE FUNCTION "shop_assert_offering_item_eligible"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "campaign_inventory_item_shop_dependency_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "shop_offering" AS "offering"
    INNER JOIN "shop" AS "owning_shop" ON "owning_shop"."id" = "offering"."shop_id"
    WHERE "offering"."campaign_id" = OLD."campaign_id"
      AND "offering"."item_id" = OLD."item_id"
      AND "offering"."enabled" = true
      AND "owning_shop"."archived_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Campaign Item authorization cannot be removed while the Item is enabled in an active Shop. Disable or remove the Shop offering first.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "campaign_inventory_item_shop_dependency_guard"
BEFORE DELETE
ON "campaign_inventory_item"
FOR EACH ROW
EXECUTE FUNCTION "campaign_inventory_item_shop_dependency_guard"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "shop_restore_offering_eligibility_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."archived_at" IS NOT NULL AND NEW."archived_at" IS NULL AND EXISTS (
    SELECT 1
    FROM "shop_offering" AS "offering"
    LEFT JOIN "campaign_inventory_item" AS "authorization"
      ON "authorization"."campaign_id" = NEW."campaign_id"
      AND "authorization"."item_id" = "offering"."item_id"
    INNER JOIN "items" AS "catalog_item" ON "catalog_item"."id" = "offering"."item_id"
    WHERE "offering"."shop_id" = NEW."id"
      AND "offering"."enabled" = true
      AND ("authorization"."item_id" IS NULL OR "catalog_item"."archived_at" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'This Shop cannot be restored until every enabled offering is active and Campaign-authorized.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "shop_restore_offering_eligibility_guard"
BEFORE UPDATE OF "archived_at"
ON "shop"
FOR EACH ROW
EXECUTE FUNCTION "shop_restore_offering_eligibility_guard"();
