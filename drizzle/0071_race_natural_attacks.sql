CREATE TABLE "race_natural_attacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
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
	CONSTRAINT "race_natural_attack_text_valid" CHECK (length(trim("race_natural_attacks"."key")) > 0 AND length(trim("race_natural_attacks"."attack_name")) > 0),
	CONSTRAINT "race_natural_attack_order_valid" CHECK ("race_natural_attacks"."sort_order" >= 0),
	CONSTRAINT "race_natural_attack_authoring_shape" CHECK (jsonb_typeof("race_natural_attacks"."authoring_json") = 'object' AND "race_natural_attacks"."authoring_json"->>'schemaVersion' IS NOT DISTINCT FROM '1'),
	CONSTRAINT "race_natural_attack_anatomy_shape" CHECK (jsonb_typeof("race_natural_attacks"."anatomy_requirement_json") = 'object' AND jsonb_typeof("race_natural_attacks"."anatomy_requirement_json"->'hpPoolIds') IS NOT DISTINCT FROM 'array' AND jsonb_typeof("race_natural_attacks"."anatomy_requirement_json"->'hitLocationNumbers') IS NOT DISTINCT FROM 'array' AND jsonb_typeof("race_natural_attacks"."anatomy_requirement_json"->'notes') IS NOT DISTINCT FROM 'string')
);
--> statement-breakpoint
ALTER TABLE "race_natural_attacks" ADD CONSTRAINT "race_natural_attacks_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_natural_attacks" ADD CONSTRAINT "race_natural_attacks_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "race_natural_attack_key_uq" ON "race_natural_attacks" USING btree ("race_id","key");--> statement-breakpoint
CREATE INDEX "race_natural_attack_skill_idx" ON "race_natural_attacks" USING btree ("skill_id");