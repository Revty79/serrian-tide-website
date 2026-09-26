CREATE TABLE "race_form_movement_modes" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"key" text NOT NULL,
	"movement_mode" text NOT NULL,
	"base_value" double precision NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "race_form_movement_valid" CHECK (length(trim("race_form_movement_modes"."key")) > 0 AND length(trim("race_form_movement_modes"."movement_mode")) > 0 AND "race_form_movement_modes"."base_value" > '-Infinity'::float8 AND "race_form_movement_modes"."base_value" < 'Infinity'::float8 AND "race_form_movement_modes"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "race_form_natural_attacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"key" text NOT NULL,
	"attack_name" text NOT NULL,
	"damage" text,
	"damage_type" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"authoring_json" jsonb NOT NULL,
	"skill_id" integer,
	"basis_notes" text DEFAULT '' NOT NULL,
	"anatomy_requirement_json" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "race_form_attack_text_valid" CHECK (length(trim("race_form_natural_attacks"."key")) > 0 AND length(trim("race_form_natural_attacks"."attack_name")) > 0 AND "race_form_natural_attacks"."sort_order" >= 0),
	CONSTRAINT "race_form_attack_authoring_shape" CHECK (jsonb_typeof("race_form_natural_attacks"."authoring_json") = 'object' AND "race_form_natural_attacks"."authoring_json"->>'schemaVersion' IS NOT DISTINCT FROM '1'),
	CONSTRAINT "race_form_attack_anatomy_shape" CHECK (jsonb_typeof("race_form_natural_attacks"."anatomy_requirement_json") = 'object' AND jsonb_typeof("race_form_natural_attacks"."anatomy_requirement_json"->'hpPoolIds') IS NOT DISTINCT FROM 'array' AND jsonb_typeof("race_form_natural_attacks"."anatomy_requirement_json"->'hitLocationNumbers') IS NOT DISTINCT FROM 'array' AND jsonb_typeof("race_form_natural_attacks"."anatomy_requirement_json"->'notes') IS NOT DISTINCT FROM 'string')
);
--> statement-breakpoint
CREATE TABLE "race_form_natural_protections" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"natural_soak" double precision NOT NULL,
	"coverage_kind" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "race_form_protection_valid" CHECK (length(trim("race_form_natural_protections"."key")) > 0 AND length(trim("race_form_natural_protections"."name")) > 0 AND "race_form_natural_protections"."natural_soak" >= 0 AND "race_form_natural_protections"."natural_soak" < 'Infinity'::float8 AND "race_form_natural_protections"."coverage_kind" IN ('all','locations') AND "race_form_natural_protections"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "race_form_natural_protection_locations" (
	"protection_id" integer NOT NULL,
	"location_key" text NOT NULL,
	CONSTRAINT "race_form_natural_protection_locations_protection_id_location_key_pk" PRIMARY KEY("protection_id","location_key"),
	CONSTRAINT "race_form_protection_location_valid" CHECK ("race_form_natural_protection_locations"."location_key" IN ('0','1','2','3','4','5','6','7','8','9'))
);
--> statement-breakpoint
CREATE TABLE "race_form_skill_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"link_type" text NOT NULL,
	"value" double precision,
	"sort_order" integer NOT NULL,
	CONSTRAINT "race_form_skill_valid" CHECK ("race_form_skill_links"."link_type" IN ('Skill','Granted') AND "race_form_skill_links"."sort_order" >= 0 AND ("race_form_skill_links"."value" IS NULL OR ("race_form_skill_links"."value" > '-Infinity'::float8 AND "race_form_skill_links"."value" < 'Infinity'::float8)))
);
--> statement-breakpoint
ALTER TABLE "race_forms" ADD COLUMN "mechanics_json" jsonb;--> statement-breakpoint
ALTER TABLE "race_form_movement_modes" ADD CONSTRAINT "race_form_movement_modes_form_id_race_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."race_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_natural_attacks" ADD CONSTRAINT "race_form_natural_attacks_form_id_race_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."race_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_natural_attacks" ADD CONSTRAINT "race_form_natural_attacks_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_natural_protections" ADD CONSTRAINT "race_form_natural_protections_form_id_race_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."race_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_natural_protection_locations" ADD CONSTRAINT "race_form_natural_protection_locations_protection_id_race_form_natural_protections_id_fk" FOREIGN KEY ("protection_id") REFERENCES "public"."race_form_natural_protections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_skill_links" ADD CONSTRAINT "race_form_skill_links_form_id_race_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."race_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_skill_links" ADD CONSTRAINT "race_form_skill_links_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "race_form_movement_key_uq" ON "race_form_movement_modes" USING btree ("form_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "race_form_attack_key_uq" ON "race_form_natural_attacks" USING btree ("form_id","key");--> statement-breakpoint
CREATE INDEX "race_form_attack_skill_idx" ON "race_form_natural_attacks" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_form_protection_key_uq" ON "race_form_natural_protections" USING btree ("form_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "race_form_skill_link_uq" ON "race_form_skill_links" USING btree ("form_id","skill_id","link_type");--> statement-breakpoint
CREATE INDEX "race_form_skill_idx" ON "race_form_skill_links" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "race_forms" ADD CONSTRAINT "race_form_mechanics_shape" CHECK ("race_forms"."mechanics_json" IS NULL OR coalesce((jsonb_typeof("race_forms"."mechanics_json") = 'object' AND "race_forms"."mechanics_json"->>'schemaVersion' = '1' AND "race_forms"."mechanics_json"->>'anatomyMode' IN ('race','override') AND "race_forms"."mechanics_json"->>'movementMode' IN ('race','override') AND "race_forms"."mechanics_json"->>'protectionMode' IN ('race','override') AND "race_forms"."mechanics_json"->>'attacksMode' IN ('race','override') AND "race_forms"."mechanics_json"->>'skillsMode' IN ('race','add') AND "race_forms"."mechanics_json"->>'interactionMode' IN ('race','add','replace')), false));