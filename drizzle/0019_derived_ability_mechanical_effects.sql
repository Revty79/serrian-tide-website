CREATE TABLE "derived_ability_effect" (
	"id" serial PRIMARY KEY NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"effect_json" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_effect_schema_version_valid" CHECK ("derived_ability_effect"."schema_version" > 0),
	CONSTRAINT "derived_ability_effect_sort_order_valid" CHECK ("derived_ability_effect"."sort_order" >= 0),
	CONSTRAINT "derived_ability_effect_json_object" CHECK (jsonb_typeof("derived_ability_effect"."effect_json") = 'object')
);
--> statement-breakpoint
ALTER TABLE "derived_ability_effect" ADD CONSTRAINT "derived_ability_effect_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_effect_order_uq" ON "derived_ability_effect" USING btree ("derived_ability_id","sort_order");--> statement-breakpoint
CREATE INDEX "derived_ability_effect_ability_idx" ON "derived_ability_effect" USING btree ("derived_ability_id");