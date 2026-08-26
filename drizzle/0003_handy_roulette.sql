CREATE TABLE "skill" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"classification" text DEFAULT 'standard' NOT NULL,
	"tier" integer,
	"primary_attribute" text,
	"secondary_attribute" text,
	"definition" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"source_system" text,
	"source_external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_name_not_blank" CHECK (length(trim("skill"."name")) > 0),
	CONSTRAINT "skill_classification_not_blank" CHECK (length(trim("skill"."classification")) > 0),
	CONSTRAINT "skill_tier_positive" CHECK ("skill"."tier" IS NULL OR "skill"."tier" > 0)
);
--> statement-breakpoint
CREATE TABLE "skill_extension" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" integer NOT NULL,
	"extension_type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"data_json" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_extension_type_not_blank" CHECK (length(trim("skill_extension"."extension_type")) > 0),
	CONSTRAINT "skill_extension_schema_version_positive" CHECK ("skill_extension"."schema_version" > 0),
	CONSTRAINT "skill_extension_data_not_blank" CHECK (length(trim("skill_extension"."data_json")) > 0)
);
--> statement-breakpoint
CREATE TABLE "skill_relationship" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_id" integer NOT NULL,
	"related_skill_id" integer NOT NULL,
	"relationship_type" text DEFAULT 'parent' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_relationship_type_not_blank" CHECK (length(trim("skill_relationship"."relationship_type")) > 0),
	CONSTRAINT "skill_relationship_not_self" CHECK ("skill_relationship"."skill_id" <> "skill_relationship"."related_skill_id")
);
--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_extension" ADD CONSTRAINT "skill_extension_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_relationship" ADD CONSTRAINT "skill_relationship_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_relationship" ADD CONSTRAINT "skill_relationship_related_skill_id_skill_id_fk" FOREIGN KEY ("related_skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_classification_idx" ON "skill" USING btree ("classification","name","id");--> statement-breakpoint
CREATE INDEX "skill_created_by_user_idx" ON "skill" USING btree ("created_by_user_id","name","id");--> statement-breakpoint
CREATE INDEX "skill_name_idx" ON "skill" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "skill_primary_attribute_idx" ON "skill" USING btree ("primary_attribute","name","id");--> statement-breakpoint
CREATE INDEX "skill_secondary_attribute_idx" ON "skill" USING btree ("secondary_attribute","name","id");--> statement-breakpoint
CREATE INDEX "skill_tier_idx" ON "skill" USING btree ("tier","name","id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_source_identity_idx" ON "skill" USING btree ("source_system","source_external_id") WHERE 
          "skill"."source_system" IS NOT NULL
          AND "skill"."source_external_id" IS NOT NULL
        ;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_extension_unique_idx" ON "skill_extension" USING btree ("skill_id","extension_type");--> statement-breakpoint
CREATE INDEX "skill_extension_type_idx" ON "skill_extension" USING btree ("extension_type","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_relationship_unique_idx" ON "skill_relationship" USING btree ("skill_id","related_skill_id","relationship_type");--> statement-breakpoint
CREATE INDEX "skill_relationship_skill_idx" ON "skill_relationship" USING btree ("skill_id","relationship_type","sort_order","id");--> statement-breakpoint
CREATE INDEX "skill_relationship_related_idx" ON "skill_relationship" USING btree ("related_skill_id","relationship_type","sort_order","id");