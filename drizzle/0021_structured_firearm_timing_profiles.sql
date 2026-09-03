CREATE TABLE "weapon_firing_modes" (
	"id" serial PRIMARY KEY NOT NULL,
	"weapon_profile_id" integer NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"base_cycling_initiative_cost" integer,
	"base_recoil_reset_initiative_cost" integer,
	"delivery_cadence" text,
	"rounds_per_cadence" integer,
	"mechanics_review_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weapon_firing_modes_name_nonblank" CHECK (length(trim("weapon_firing_modes"."name")) > 0),
	CONSTRAINT "weapon_firing_modes_normalized_name_valid" CHECK ("weapon_firing_modes"."normalized_name" = lower(trim("weapon_firing_modes"."name")) AND length("weapon_firing_modes"."normalized_name") > 0),
	CONSTRAINT "weapon_firing_modes_sort_order_valid" CHECK ("weapon_firing_modes"."sort_order" >= 0),
	CONSTRAINT "weapon_firing_modes_cycling_cost_valid" CHECK ("weapon_firing_modes"."base_cycling_initiative_cost" IS NULL OR "weapon_firing_modes"."base_cycling_initiative_cost" >= 0),
	CONSTRAINT "weapon_firing_modes_recoil_cost_valid" CHECK ("weapon_firing_modes"."base_recoil_reset_initiative_cost" IS NULL OR "weapon_firing_modes"."base_recoil_reset_initiative_cost" >= 0),
	CONSTRAINT "weapon_firing_modes_delivery_cadence_valid" CHECK ("weapon_firing_modes"."delivery_cadence" IS NULL OR "weapon_firing_modes"."delivery_cadence" IN ('per-trigger', 'sustained-per-initiative')),
	CONSTRAINT "weapon_firing_modes_rounds_per_cadence_valid" CHECK ("weapon_firing_modes"."rounds_per_cadence" IS NULL OR "weapon_firing_modes"."rounds_per_cadence" > 0),
	CONSTRAINT "weapon_firing_modes_review_state_valid" CHECK (("weapon_firing_modes"."mechanics_review_required" AND "weapon_firing_modes"."base_cycling_initiative_cost" IS NULL AND "weapon_firing_modes"."base_recoil_reset_initiative_cost" IS NULL AND "weapon_firing_modes"."delivery_cadence" IS NULL AND "weapon_firing_modes"."rounds_per_cadence" IS NULL) OR (NOT "weapon_firing_modes"."mechanics_review_required" AND "weapon_firing_modes"."base_cycling_initiative_cost" IS NOT NULL AND "weapon_firing_modes"."base_recoil_reset_initiative_cost" IS NOT NULL AND "weapon_firing_modes"."delivery_cadence" IS NOT NULL AND "weapon_firing_modes"."rounds_per_cadence" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "ammunition_cycling_initiative_modifier" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "ammunition_recoil_reset_initiative_modifier" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "weapon_firing_modes" ADD CONSTRAINT "weapon_firing_modes_weapon_profile_id_weapon_profiles_id_fk" FOREIGN KEY ("weapon_profile_id") REFERENCES "public"."weapon_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_firing_modes_profile_name_uq" ON "weapon_firing_modes" USING btree ("weapon_profile_id","normalized_name");--> statement-breakpoint
CREATE INDEX "weapon_firing_modes_profile_order_idx" ON "weapon_firing_modes" USING btree ("weapon_profile_id","sort_order","id");--> statement-breakpoint
WITH "expanded_modes" AS (
	SELECT
		"weapon_profiles"."id" AS "weapon_profile_id",
		btrim("legacy_mode"."value") AS "name",
		lower(btrim("legacy_mode"."value")) AS "normalized_name",
		"legacy_mode"."ordinality" AS "legacy_order",
		row_number() OVER (
			PARTITION BY "weapon_profiles"."id", lower(btrim("legacy_mode"."value"))
			ORDER BY "legacy_mode"."ordinality"
		) AS "duplicate_rank"
	FROM "weapon_profiles"
	CROSS JOIN LATERAL jsonb_array_elements_text("weapon_profiles"."fire_modes"::jsonb)
		WITH ORDINALITY AS "legacy_mode"("value", "ordinality")
),
"ordered_modes" AS (
	SELECT
		"weapon_profile_id",
		"name",
		"normalized_name",
		row_number() OVER (
			PARTITION BY "weapon_profile_id"
			ORDER BY "legacy_order"
		) - 1 AS "sort_order"
	FROM "expanded_modes"
	WHERE "name" <> '' AND "duplicate_rank" = 1
)
INSERT INTO "weapon_firing_modes" (
	"weapon_profile_id",
	"name",
	"normalized_name",
	"sort_order",
	"base_cycling_initiative_cost",
	"base_recoil_reset_initiative_cost",
	"delivery_cadence",
	"rounds_per_cadence",
	"mechanics_review_required"
)
SELECT
	"weapon_profile_id",
	"name",
	"normalized_name",
	"sort_order",
	NULL,
	NULL,
	NULL,
	NULL,
	true
FROM "ordered_modes"
ORDER BY "weapon_profile_id", "sort_order";
