CREATE TABLE "creature_evolution_paths" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_creature_id" integer NOT NULL,
	"destination_creature_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creature_evolution_not_self" CHECK ("creature_evolution_paths"."source_creature_id" <> "creature_evolution_paths"."destination_creature_id"),
	CONSTRAINT "creature_evolution_name" CHECK (length(trim("creature_evolution_paths"."name")) > 0),
	CONSTRAINT "creature_evolution_order" CHECK ("creature_evolution_paths"."sort_order" >= 0),
	CONSTRAINT "creature_evolution_version" CHECK ("creature_evolution_paths"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "creature_evolution_paths" ADD CONSTRAINT "creature_evolution_paths_source_creature_id_creatures_id_fk" FOREIGN KEY ("source_creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creature_evolution_paths" ADD CONSTRAINT "creature_evolution_paths_destination_creature_id_creatures_id_fk" FOREIGN KEY ("destination_creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creature_evolution_source_order" ON "creature_evolution_paths" USING btree ("source_creature_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "creature_evolution_destination" ON "creature_evolution_paths" USING btree ("destination_creature_id");