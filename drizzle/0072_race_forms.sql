CREATE TABLE "race_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "race_form_text_valid" CHECK (length(trim("race_forms"."key")) > 0 AND length(trim("race_forms"."name")) > 0),
	CONSTRAINT "race_form_order_valid" CHECK ("race_forms"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "race_forms" ADD CONSTRAINT "race_forms_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "race_form_key_uq" ON "race_forms" USING btree ("race_id","key");