CREATE TABLE "item_power_constructions" (
	"item_power_id" integer PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	"document_json" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_power_constructions_schema_valid" CHECK ("item_power_constructions"."schema_version" > 0),
	CONSTRAINT "item_power_constructions_document_nonblank" CHECK (length(trim("item_power_constructions"."document_json")) > 0)
);
--> statement-breakpoint
ALTER TABLE "item_power_constructions" ADD CONSTRAINT "item_power_constructions_item_power_id_item_powers_id_fk" FOREIGN KEY ("item_power_id") REFERENCES "public"."item_powers"("id") ON DELETE cascade ON UPDATE no action;