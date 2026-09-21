CREATE TABLE "race_natural_protections" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"natural_armor" double precision NOT NULL,
	"natural_soak" double precision NOT NULL,
	"coverage_kind" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "race_natural_protection_text_valid" CHECK (length(trim("race_natural_protections"."key")) > 0 AND length(trim("race_natural_protections"."name")) > 0),
	CONSTRAINT "race_natural_protection_amounts_valid" CHECK ("race_natural_protections"."natural_armor" >= 0 AND "race_natural_protections"."natural_armor" < 'Infinity'::float8 AND "race_natural_protections"."natural_soak" >= 0 AND "race_natural_protections"."natural_soak" < 'Infinity'::float8),
	CONSTRAINT "race_natural_protection_coverage_valid" CHECK ("race_natural_protections"."coverage_kind" IN ('all', 'locations')),
	CONSTRAINT "race_natural_protection_order_valid" CHECK ("race_natural_protections"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "race_natural_protection_locations" (
	"protection_id" integer NOT NULL,
	"location_key" text NOT NULL,
	CONSTRAINT "race_natural_protection_locations_protection_id_location_key_pk" PRIMARY KEY("protection_id","location_key"),
	CONSTRAINT "race_natural_protection_location_valid" CHECK ("race_natural_protection_locations"."location_key" IN ('0','1','2','3','4','5','6','7','8','9'))
);
--> statement-breakpoint
ALTER TABLE "race_natural_protections" ADD CONSTRAINT "race_natural_protections_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_natural_protection_locations" ADD CONSTRAINT "race_natural_protection_locations_protection_id_race_natural_protections_id_fk" FOREIGN KEY ("protection_id") REFERENCES "public"."race_natural_protections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "race_natural_protection_key_uq" ON "race_natural_protections" USING btree ("race_id","key");