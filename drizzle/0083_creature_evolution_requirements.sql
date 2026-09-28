CREATE TABLE "creature_evolution_requirements" (
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
	"creature_ability_canonical_id" text,
	"creature_form_key" text,
	"condition_name" text,
	"manual_category" text,
	"notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "creature_evolution_requirement_key" UNIQUE("path_id","requirement_key"),
	CONSTRAINT "creature_evolution_requirement_identity" CHECK (length(trim("creature_evolution_requirements"."requirement_key")) > 0 AND "creature_evolution_requirements"."group_number" >= 0 AND "creature_evolution_requirements"."sort_order" >= 0),
	CONSTRAINT "creature_evolution_requirement_type" CHECK ("creature_evolution_requirements"."requirement_type" IN ('age','current-experience','total-experience','skill','creature-ability','item','condition','form-access','manual')),
	CONSTRAINT "creature_evolution_requirement_value" CHECK ("creature_evolution_requirements"."required_value" IS NULL OR ("creature_evolution_requirements"."required_value" >= 0 AND "creature_evolution_requirements"."required_value" < 'Infinity'::float8)),
	CONSTRAINT "creature_evolution_requirement_shape" CHECK (coalesce(
    ("creature_evolution_requirements"."requirement_type" IN ('age','current-experience','total-experience') AND "creature_evolution_requirements"."operator" IN ('gte','gt','lte','lt','eq','neq') AND "creature_evolution_requirements"."required_value" IS NOT NULL)
    OR ("creature_evolution_requirements"."requirement_type" = 'skill' AND "creature_evolution_requirements"."skill_id" IS NOT NULL AND "creature_evolution_requirements"."operator" IN ('possessed','not-possessed') AND "creature_evolution_requirements"."required_value" IS NULL)
    OR ("creature_evolution_requirements"."requirement_type" = 'creature-ability' AND length(trim("creature_evolution_requirements"."creature_ability_canonical_id")) > 0 AND "creature_evolution_requirements"."operator" IN ('possessed','not-possessed') AND "creature_evolution_requirements"."required_value" IS NULL)
    OR ("creature_evolution_requirements"."requirement_type" = 'item' AND "creature_evolution_requirements"."item_id" IS NOT NULL AND "creature_evolution_requirements"."item_holder" IN ('creature','owner') AND "creature_evolution_requirements"."operator" = 'possessed' AND "creature_evolution_requirements"."required_value" IS NULL)
    OR ("creature_evolution_requirements"."requirement_type" = 'condition' AND length(trim("creature_evolution_requirements"."condition_name")) > 0 AND "creature_evolution_requirements"."operator" IN ('possessed','not-possessed') AND "creature_evolution_requirements"."required_value" IS NULL)
    OR ("creature_evolution_requirements"."requirement_type" = 'form-access' AND length(trim("creature_evolution_requirements"."creature_form_key")) > 0 AND "creature_evolution_requirements"."operator" = 'possessed' AND "creature_evolution_requirements"."required_value" IS NULL)
    OR ("creature_evolution_requirements"."requirement_type" = 'manual' AND "creature_evolution_requirements"."manual_category" IN ('god-approval','story-event','milestone','environment','current-form','custom') AND length(trim("creature_evolution_requirements"."notes")) > 0 AND "creature_evolution_requirements"."operator" IS NULL AND "creature_evolution_requirements"."required_value" IS NULL), false))
);
--> statement-breakpoint
ALTER TABLE "creature_evolution_paths" ADD COLUMN "requirement_mode" text DEFAULT 'unrestricted' NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_evolution_requirements" ADD CONSTRAINT "creature_evolution_requirements_path_id_creature_evolution_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."creature_evolution_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_evolution_requirements" ADD CONSTRAINT "creature_evolution_requirements_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_evolution_requirements" ADD CONSTRAINT "creature_evolution_requirements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creature_evolution_requirement_order" ON "creature_evolution_requirements" USING btree ("path_id","group_number","sort_order");--> statement-breakpoint
CREATE INDEX "creature_evolution_requirement_skill" ON "creature_evolution_requirements" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "creature_evolution_requirement_item" ON "creature_evolution_requirements" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "creature_evolution_paths" ADD CONSTRAINT "creature_evolution_requirement_mode" CHECK ("creature_evolution_paths"."requirement_mode" IN ('unrestricted','requirements'));