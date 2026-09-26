CREATE TABLE "creature_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"form_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"mechanics_json" jsonb NOT NULL,
	"transformation_json" jsonb,
	CONSTRAINT "creature_form_owner_key" UNIQUE("creature_id","form_key"),
	CONSTRAINT "creature_form_identity" CHECK (length(trim("creature_forms"."form_key")) > 0 AND length(trim("creature_forms"."name")) > 0 AND "creature_forms"."sort_order" >= 0),
	CONSTRAINT "creature_form_mechanics_shape" CHECK (coalesce(jsonb_typeof("creature_forms"."mechanics_json") = 'object' AND "creature_forms"."mechanics_json"->>'schemaVersion' = '1', false)),
	CONSTRAINT "creature_form_transformation_shape" CHECK ("creature_forms"."transformation_json" IS NULL OR coalesce(jsonb_typeof("creature_forms"."transformation_json") = 'object' AND "creature_forms"."transformation_json"->>'schemaVersion' = '1', false))
);
--> statement-breakpoint
CREATE TABLE "creature_form_skill_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"rank" text,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "creature_form_skill_unique" UNIQUE("form_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "creature_forms" ADD CONSTRAINT "creature_forms_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_form_skill_links" ADD CONSTRAINT "creature_form_skill_links_form_id_creature_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."creature_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_form_skill_links" ADD CONSTRAINT "creature_form_skill_links_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creature_form_owner_order" ON "creature_forms" USING btree ("creature_id","sort_order");