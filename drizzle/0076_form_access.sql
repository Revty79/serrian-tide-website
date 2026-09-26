CREATE TABLE "creature_form_access_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"requirement_key" text NOT NULL,
	"group_number" integer NOT NULL,
	"requirement_type" text NOT NULL,
	"attribute_key" text,
	"skill_id" integer,
	"required_derived_ability_id" integer,
	"required_creature_ability_canonical_id" text,
	"operator" text,
	"required_value" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "creature_form_access_key" UNIQUE("form_id","requirement_key"),
	CONSTRAINT "creature_form_access_position" UNIQUE("form_id","group_number","sort_order"),
	CONSTRAINT "creature_form_access_order" CHECK (length(trim("creature_form_access_requirements"."requirement_key")) > 0 AND "creature_form_access_requirements"."group_number" >= 0 AND "creature_form_access_requirements"."sort_order" >= 0),
	CONSTRAINT "creature_form_access_shape" CHECK (coalesce((
      ("creature_form_access_requirements"."requirement_type" = 'manual' AND "creature_form_access_requirements"."attribute_key" IS NULL AND "creature_form_access_requirements"."skill_id" IS NULL AND "creature_form_access_requirements"."required_derived_ability_id" IS NULL AND "creature_form_access_requirements"."required_creature_ability_canonical_id" IS NULL AND "creature_form_access_requirements"."operator" IS NULL AND "creature_form_access_requirements"."required_value" IS NULL AND length(trim("creature_form_access_requirements"."notes")) > 0)
      OR ("creature_form_access_requirements"."requirement_type" = 'attribute' AND "creature_form_access_requirements"."attribute_key" IN ('STR','DEX','CON','INT','WIS','CHR') AND "creature_form_access_requirements"."skill_id" IS NULL AND "creature_form_access_requirements"."required_derived_ability_id" IS NULL AND "creature_form_access_requirements"."required_creature_ability_canonical_id" IS NULL AND "creature_form_access_requirements"."operator" IN ('gte','gt','lte','lt','eq','neq') AND "creature_form_access_requirements"."required_value" IS NOT NULL)
      OR ("creature_form_access_requirements"."requirement_type" = 'skill' AND "creature_form_access_requirements"."attribute_key" IS NULL AND "creature_form_access_requirements"."skill_id" IS NOT NULL AND "creature_form_access_requirements"."required_derived_ability_id" IS NULL AND "creature_form_access_requirements"."required_creature_ability_canonical_id" IS NULL AND (("creature_form_access_requirements"."operator" IN ('possessed','not-possessed') AND "creature_form_access_requirements"."required_value" IS NULL) OR (false AND "creature_form_access_requirements"."operator" IN ('gte','gt','lte','lt','eq','neq') AND "creature_form_access_requirements"."required_value" IS NOT NULL)))
      OR (false AND "creature_form_access_requirements"."requirement_type" = 'derived-ability' AND "creature_form_access_requirements"."attribute_key" IS NULL AND "creature_form_access_requirements"."skill_id" IS NULL AND "creature_form_access_requirements"."required_derived_ability_id" IS NOT NULL AND "creature_form_access_requirements"."required_creature_ability_canonical_id" IS NULL AND "creature_form_access_requirements"."operator" IN ('possessed','not-possessed') AND "creature_form_access_requirements"."required_value" IS NULL)
      OR (true AND "creature_form_access_requirements"."requirement_type" = 'creature-ability' AND "creature_form_access_requirements"."attribute_key" IS NULL AND "creature_form_access_requirements"."skill_id" IS NULL AND "creature_form_access_requirements"."required_derived_ability_id" IS NULL AND length(trim("creature_form_access_requirements"."required_creature_ability_canonical_id")) > 0 AND "creature_form_access_requirements"."operator" IN ('possessed','not-possessed') AND "creature_form_access_requirements"."required_value" IS NULL)
    ) AND ("creature_form_access_requirements"."required_value" IS NULL OR ("creature_form_access_requirements"."required_value" > '-Infinity'::float8 AND "creature_form_access_requirements"."required_value" < 'Infinity'::float8)), false))
);
--> statement-breakpoint
CREATE TABLE "race_form_access_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"requirement_key" text NOT NULL,
	"group_number" integer NOT NULL,
	"requirement_type" text NOT NULL,
	"attribute_key" text,
	"skill_id" integer,
	"required_derived_ability_id" integer,
	"required_creature_ability_canonical_id" text,
	"operator" text,
	"required_value" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "race_form_access_key" UNIQUE("form_id","requirement_key"),
	CONSTRAINT "race_form_access_position" UNIQUE("form_id","group_number","sort_order"),
	CONSTRAINT "race_form_access_order" CHECK (length(trim("race_form_access_requirements"."requirement_key")) > 0 AND "race_form_access_requirements"."group_number" >= 0 AND "race_form_access_requirements"."sort_order" >= 0),
	CONSTRAINT "race_form_access_shape" CHECK (coalesce((
      ("race_form_access_requirements"."requirement_type" = 'manual' AND "race_form_access_requirements"."attribute_key" IS NULL AND "race_form_access_requirements"."skill_id" IS NULL AND "race_form_access_requirements"."required_derived_ability_id" IS NULL AND "race_form_access_requirements"."required_creature_ability_canonical_id" IS NULL AND "race_form_access_requirements"."operator" IS NULL AND "race_form_access_requirements"."required_value" IS NULL AND length(trim("race_form_access_requirements"."notes")) > 0)
      OR ("race_form_access_requirements"."requirement_type" = 'attribute' AND "race_form_access_requirements"."attribute_key" IN ('STR','DEX','CON','INT','WIS','CHR') AND "race_form_access_requirements"."skill_id" IS NULL AND "race_form_access_requirements"."required_derived_ability_id" IS NULL AND "race_form_access_requirements"."required_creature_ability_canonical_id" IS NULL AND "race_form_access_requirements"."operator" IN ('gte','gt','lte','lt','eq','neq') AND "race_form_access_requirements"."required_value" IS NOT NULL)
      OR ("race_form_access_requirements"."requirement_type" = 'skill' AND "race_form_access_requirements"."attribute_key" IS NULL AND "race_form_access_requirements"."skill_id" IS NOT NULL AND "race_form_access_requirements"."required_derived_ability_id" IS NULL AND "race_form_access_requirements"."required_creature_ability_canonical_id" IS NULL AND (("race_form_access_requirements"."operator" IN ('possessed','not-possessed') AND "race_form_access_requirements"."required_value" IS NULL) OR (true AND "race_form_access_requirements"."operator" IN ('gte','gt','lte','lt','eq','neq') AND "race_form_access_requirements"."required_value" IS NOT NULL)))
      OR (true AND "race_form_access_requirements"."requirement_type" = 'derived-ability' AND "race_form_access_requirements"."attribute_key" IS NULL AND "race_form_access_requirements"."skill_id" IS NULL AND "race_form_access_requirements"."required_derived_ability_id" IS NOT NULL AND "race_form_access_requirements"."required_creature_ability_canonical_id" IS NULL AND "race_form_access_requirements"."operator" IN ('possessed','not-possessed') AND "race_form_access_requirements"."required_value" IS NULL)
      OR (false AND "race_form_access_requirements"."requirement_type" = 'creature-ability' AND "race_form_access_requirements"."attribute_key" IS NULL AND "race_form_access_requirements"."skill_id" IS NULL AND "race_form_access_requirements"."required_derived_ability_id" IS NULL AND length(trim("race_form_access_requirements"."required_creature_ability_canonical_id")) > 0 AND "race_form_access_requirements"."operator" IN ('possessed','not-possessed') AND "race_form_access_requirements"."required_value" IS NULL)
    ) AND ("race_form_access_requirements"."required_value" IS NULL OR ("race_form_access_requirements"."required_value" > '-Infinity'::float8 AND "race_form_access_requirements"."required_value" < 'Infinity'::float8)), false))
);
--> statement-breakpoint
ALTER TABLE "race_forms" ADD COLUMN "access_mode" text DEFAULT 'unrestricted' NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_forms" ADD COLUMN "access_mode" text DEFAULT 'unrestricted' NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_form_access_requirements" ADD CONSTRAINT "creature_form_access_requirements_form_id_creature_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."creature_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_form_access_requirements" ADD CONSTRAINT "creature_form_access_requirements_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_form_access_requirements" ADD CONSTRAINT "creature_form_access_requirements_required_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("required_derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_access_requirements" ADD CONSTRAINT "race_form_access_requirements_form_id_race_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."race_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_access_requirements" ADD CONSTRAINT "race_form_access_requirements_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_form_access_requirements" ADD CONSTRAINT "race_form_access_requirements_required_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("required_derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creature_form_access_skill" ON "creature_form_access_requirements" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "creature_form_access_derived_ability" ON "creature_form_access_requirements" USING btree ("required_derived_ability_id");--> statement-breakpoint
CREATE INDEX "race_form_access_skill" ON "race_form_access_requirements" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "race_form_access_derived_ability" ON "race_form_access_requirements" USING btree ("required_derived_ability_id");--> statement-breakpoint
ALTER TABLE "race_forms" ADD CONSTRAINT "race_form_access_mode" CHECK ("race_forms"."access_mode" IN ('unrestricted','requirements'));--> statement-breakpoint
ALTER TABLE "creature_forms" ADD CONSTRAINT "creature_form_access_mode" CHECK ("creature_forms"."access_mode" IN ('unrestricted','requirements'));