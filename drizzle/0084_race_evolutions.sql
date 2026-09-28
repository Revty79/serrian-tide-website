CREATE TABLE "race_evolution_paths" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_race_id" integer NOT NULL,
	"destination_race_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"requirement_mode" text DEFAULT 'unrestricted' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "race_evolution_not_self" CHECK ("race_evolution_paths"."source_race_id" <> "race_evolution_paths"."destination_race_id"),
	CONSTRAINT "race_evolution_name" CHECK (length(trim("race_evolution_paths"."name")) > 0),
	CONSTRAINT "race_evolution_order" CHECK ("race_evolution_paths"."sort_order" >= 0),
	CONSTRAINT "race_evolution_version" CHECK ("race_evolution_paths"."version" > 0),
	CONSTRAINT "race_evolution_requirement_mode" CHECK ("race_evolution_paths"."requirement_mode" IN ('unrestricted','requirements'))
);
--> statement-breakpoint
CREATE TABLE "race_evolution_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"path_id" integer NOT NULL,
	"requirement_key" text NOT NULL,
	"group_number" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"requirement_type" text NOT NULL,
	"operator" text,
	"required_value" double precision,
	"skill_id" integer,
	"item_id" integer,
	"item_holder" text,
	"derived_ability_id" integer,
	"race_form_key" text,
	"condition_name" text,
	"manual_category" text,
	"notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "race_evolution_requirement_key" UNIQUE("path_id","requirement_key"),
	CONSTRAINT "race_evolution_requirement_identity" CHECK (length(trim("race_evolution_requirements"."requirement_key")) > 0 AND "race_evolution_requirements"."group_number" >= 0 AND "race_evolution_requirements"."sort_order" >= 0),
	CONSTRAINT "race_evolution_requirement_type" CHECK ("race_evolution_requirements"."requirement_type" IN ('age','current-experience','total-experience','skill','derived-ability','item','condition','form-access','manual')),
	CONSTRAINT "race_evolution_requirement_value" CHECK ("race_evolution_requirements"."required_value" IS NULL OR ("race_evolution_requirements"."required_value" >= 0 AND "race_evolution_requirements"."required_value" < 'Infinity'::float8)),
	CONSTRAINT "race_evolution_requirement_shape" CHECK (coalesce(
    ("race_evolution_requirements"."requirement_type" IN ('age','current-experience','total-experience') AND "race_evolution_requirements"."operator" IN ('gte','gt','lte','lt','eq','neq') AND "race_evolution_requirements"."required_value" IS NOT NULL)
    OR ("race_evolution_requirements"."requirement_type" = 'skill' AND "race_evolution_requirements"."skill_id" IS NOT NULL AND (("race_evolution_requirements"."operator" IN ('possessed','not-possessed') AND "race_evolution_requirements"."required_value" IS NULL) OR ("race_evolution_requirements"."operator" IN ('gte','gt','lte','lt','eq','neq') AND "race_evolution_requirements"."required_value" IS NOT NULL)))
    OR ("race_evolution_requirements"."requirement_type" = 'derived-ability' AND "race_evolution_requirements"."derived_ability_id" IS NOT NULL AND "race_evolution_requirements"."operator" IN ('possessed','not-possessed') AND "race_evolution_requirements"."required_value" IS NULL)
    OR ("race_evolution_requirements"."requirement_type" = 'item' AND "race_evolution_requirements"."item_id" IS NOT NULL AND "race_evolution_requirements"."item_holder" = 'character' AND "race_evolution_requirements"."operator" = 'possessed' AND "race_evolution_requirements"."required_value" IS NULL)
    OR ("race_evolution_requirements"."requirement_type" = 'condition' AND length(trim("race_evolution_requirements"."condition_name")) > 0 AND "race_evolution_requirements"."operator" IN ('possessed','not-possessed') AND "race_evolution_requirements"."required_value" IS NULL)
    OR ("race_evolution_requirements"."requirement_type" = 'form-access' AND length(trim("race_evolution_requirements"."race_form_key")) > 0 AND "race_evolution_requirements"."operator" = 'possessed' AND "race_evolution_requirements"."required_value" IS NULL)
    OR ("race_evolution_requirements"."requirement_type" = 'manual' AND "race_evolution_requirements"."manual_category" IN ('god-approval','story-event','milestone','environment','current-form','custom') AND length(trim("race_evolution_requirements"."notes")) > 0 AND "race_evolution_requirements"."operator" IS NULL AND "race_evolution_requirements"."required_value" IS NULL), false))
);
--> statement-breakpoint
ALTER TABLE "race_evolution_paths" ADD CONSTRAINT "race_evolution_paths_source_race_id_races_id_fk" FOREIGN KEY ("source_race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_paths" ADD CONSTRAINT "race_evolution_paths_destination_race_id_races_id_fk" FOREIGN KEY ("destination_race_id") REFERENCES "public"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_requirements" ADD CONSTRAINT "race_evolution_requirements_path_id_race_evolution_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."race_evolution_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_requirements" ADD CONSTRAINT "race_evolution_requirements_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_requirements" ADD CONSTRAINT "race_evolution_requirements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_evolution_requirements" ADD CONSTRAINT "race_evolution_requirements_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "race_evolution_source_order" ON "race_evolution_paths" USING btree ("source_race_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "race_evolution_destination" ON "race_evolution_paths" USING btree ("destination_race_id");--> statement-breakpoint
CREATE INDEX "race_evolution_requirement_order" ON "race_evolution_requirements" USING btree ("path_id","group_number","sort_order");--> statement-breakpoint
CREATE INDEX "race_evolution_requirement_skill" ON "race_evolution_requirements" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "race_evolution_requirement_item" ON "race_evolution_requirements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "race_evolution_requirement_ability" ON "race_evolution_requirements" USING btree ("derived_ability_id");