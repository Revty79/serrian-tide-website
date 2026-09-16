CREATE TABLE "item_power_resources" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"maximum_charges" integer NOT NULL,
	"recharge_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_power_resources_maximum_charges_valid" CHECK ("item_power_resources"."maximum_charges" > 0)
);
--> statement-breakpoint
ALTER TABLE "item_power_resources" ADD CONSTRAINT "item_power_resources_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_power_sources" DROP COLUMN "fixed_power_level";
--> statement-breakpoint
INSERT INTO "item_power_resources" ("item_id", "maximum_charges", "recharge_notes")
SELECT "item_id", "maximum_charges", "recharge_notes"
FROM "item_runtime_profiles"
WHERE "use_mode" = 'charges'
	AND "maximum_charges" IS NOT NULL
ON CONFLICT ("item_id") DO NOTHING;