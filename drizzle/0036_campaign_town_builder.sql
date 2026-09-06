CREATE TABLE "town" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"overview" text DEFAULT '' NOT NULL,
	"location_notes" text DEFAULT '' NOT NULL,
	"god_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	"archived_by_user_id" text,
	"archive_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "town_id_campaign_uq" UNIQUE("id","campaign_id"),
	CONSTRAINT "town_name_nonblank" CHECK (length(trim("town"."name")) > 0),
	CONSTRAINT "town_name_length_valid" CHECK (length("town"."name") <= 120),
	CONSTRAINT "town_category_nonblank" CHECK (length(trim("town"."category")) > 0),
	CONSTRAINT "town_category_length_valid" CHECK (length("town"."category") <= 120),
	CONSTRAINT "town_overview_length_valid" CHECK (length("town"."overview") <= 5000),
	CONSTRAINT "town_location_notes_length_valid" CHECK (length("town"."location_notes") <= 1000),
	CONSTRAINT "town_god_notes_length_valid" CHECK (length("town"."god_notes") <= 5000),
	CONSTRAINT "town_archive_state_valid" CHECK ((
        ("town"."archived_at" IS NULL AND "town"."archived_by_user_id" IS NULL AND "town"."archive_reason" = '')
        OR "town"."archived_at" IS NOT NULL
      )),
	CONSTRAINT "town_archive_reason_length_valid" CHECK (length("town"."archive_reason") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "town_npc_association" (
	"id" serial PRIMARY KEY NOT NULL,
	"town_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"npc_character_id" integer NOT NULL,
	"relationship_label" text DEFAULT '' NOT NULL,
	"town_note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "town_npc_association_town_npc_uq" UNIQUE("town_id","npc_character_id"),
	CONSTRAINT "town_npc_association_relationship_length_valid" CHECK (length("town_npc_association"."relationship_label") <= 160),
	CONSTRAINT "town_npc_association_note_length_valid" CHECK (length("town_npc_association"."town_note") <= 1000),
	CONSTRAINT "town_npc_association_sort_order_valid" CHECK ("town_npc_association"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "town_place" (
	"id" serial PRIMARY KEY NOT NULL,
	"town_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location_notes" text DEFAULT '' NOT NULL,
	"god_notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	"archived_by_user_id" text,
	"archive_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "town_place_name_nonblank" CHECK (length(trim("town_place"."name")) > 0),
	CONSTRAINT "town_place_name_length_valid" CHECK (length("town_place"."name") <= 120),
	CONSTRAINT "town_place_category_length_valid" CHECK (length("town_place"."category") <= 120),
	CONSTRAINT "town_place_description_length_valid" CHECK (length("town_place"."description") <= 5000),
	CONSTRAINT "town_place_location_notes_length_valid" CHECK (length("town_place"."location_notes") <= 1000),
	CONSTRAINT "town_place_god_notes_length_valid" CHECK (length("town_place"."god_notes") <= 5000),
	CONSTRAINT "town_place_sort_order_valid" CHECK ("town_place"."sort_order" >= 0),
	CONSTRAINT "town_place_archive_state_valid" CHECK ((
        ("town_place"."archived_at" IS NULL AND "town_place"."archived_by_user_id" IS NULL AND "town_place"."archive_reason" = '')
        OR "town_place"."archived_at" IS NOT NULL
      )),
	CONSTRAINT "town_place_archive_reason_length_valid" CHECK (length("town_place"."archive_reason") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "town_shop_membership" (
	"id" serial PRIMARY KEY NOT NULL,
	"town_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "town_shop_membership_town_shop_uq" UNIQUE("town_id","shop_id"),
	CONSTRAINT "town_shop_membership_shop_uq" UNIQUE("shop_id"),
	CONSTRAINT "town_shop_membership_sort_order_valid" CHECK ("town_shop_membership"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lifecycle_audit_event" DROP CONSTRAINT "lifecycle_audit_event_entity_kind_valid";--> statement-breakpoint
ALTER TABLE "town" ADD CONSTRAINT "town_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town" ADD CONSTRAINT "town_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_npc_association" ADD CONSTRAINT "town_npc_association_town_campaign_fk" FOREIGN KEY ("town_id","campaign_id") REFERENCES "public"."town"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_npc_association" ADD CONSTRAINT "town_npc_association_npc_campaign_fk" FOREIGN KEY ("npc_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_place" ADD CONSTRAINT "town_place_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_place" ADD CONSTRAINT "town_place_town_campaign_fk" FOREIGN KEY ("town_id","campaign_id") REFERENCES "public"."town"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_shop_membership" ADD CONSTRAINT "town_shop_membership_town_campaign_fk" FOREIGN KEY ("town_id","campaign_id") REFERENCES "public"."town"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town_shop_membership" ADD CONSTRAINT "town_shop_membership_shop_campaign_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "town_campaign_archive_idx" ON "town" USING btree ("campaign_id","archived_at","name","id");--> statement-breakpoint
CREATE INDEX "town_archived_by_user_id_idx" ON "town" USING btree ("archived_by_user_id");--> statement-breakpoint
CREATE INDEX "town_npc_association_town_order_idx" ON "town_npc_association" USING btree ("town_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "town_npc_association_npc_idx" ON "town_npc_association" USING btree ("npc_character_id","town_id");--> statement-breakpoint
CREATE INDEX "town_place_town_archive_order_idx" ON "town_place" USING btree ("town_id","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "town_place_campaign_idx" ON "town_place" USING btree ("campaign_id","town_id");--> statement-breakpoint
CREATE INDEX "town_place_archived_by_user_id_idx" ON "town_place" USING btree ("archived_by_user_id");--> statement-breakpoint
CREATE INDEX "town_shop_membership_town_order_idx" ON "town_shop_membership" USING btree ("town_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "town_shop_membership_campaign_idx" ON "town_shop_membership" USING btree ("campaign_id","shop_id");--> statement-breakpoint
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
        'shop',
        'town',
        'town-place'
      ));--> statement-breakpoint
CREATE OR REPLACE FUNCTION "town_assert_shop_membership_eligible"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "town" AS "candidate_town"
    INNER JOIN "shop" AS "candidate_shop"
      ON "candidate_shop"."id" = NEW."shop_id"
      AND "candidate_shop"."campaign_id" = NEW."campaign_id"
    WHERE "candidate_town"."id" = NEW."town_id"
      AND "candidate_town"."campaign_id" = NEW."campaign_id"
      AND "candidate_town"."archived_at" IS NULL
      AND "candidate_shop"."archived_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Town Shop membership requires an active Town and active Shop from the same Campaign.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "town_shop_membership_eligibility_guard"
BEFORE INSERT OR UPDATE OF "town_id", "shop_id", "campaign_id"
ON "town_shop_membership"
FOR EACH ROW
EXECUTE FUNCTION "town_assert_shop_membership_eligible"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "town_assert_npc_association_eligible"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "town" AS "candidate_town"
    INNER JOIN "campaign_character" AS "candidate_npc"
      ON "candidate_npc"."id" = NEW."npc_character_id"
      AND "candidate_npc"."campaign_id" = NEW."campaign_id"
    WHERE "candidate_town"."id" = NEW."town_id"
      AND "candidate_town"."campaign_id" = NEW."campaign_id"
      AND "candidate_town"."archived_at" IS NULL
      AND "candidate_npc"."is_npc" = true
      AND "candidate_npc"."npc_kind" IN ('race', 'creature')
      AND "candidate_npc"."npc_build_mode" IN ('simple', 'detailed')
      AND "candidate_npc"."archived_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Town NPC associations require an active persistent Race or Creature NPC from the same Campaign.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "town_npc_association_eligibility_guard"
BEFORE INSERT OR UPDATE OF "town_id", "npc_character_id", "campaign_id"
ON "town_npc_association"
FOR EACH ROW
EXECUTE FUNCTION "town_assert_npc_association_eligible"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "town_assert_place_parent_editable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "town" AS "candidate_town"
    WHERE "candidate_town"."id" = NEW."town_id"
      AND "candidate_town"."campaign_id" = NEW."campaign_id"
      AND "candidate_town"."archived_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Town places require an active parent Town in the same Campaign.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "town_place_parent_eligibility_guard"
BEFORE INSERT OR UPDATE OF "town_id", "campaign_id"
ON "town_place"
FOR EACH ROW
EXECUTE FUNCTION "town_assert_place_parent_editable"();
