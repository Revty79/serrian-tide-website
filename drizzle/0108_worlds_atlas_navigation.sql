CREATE TABLE "world_atlas_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"source_map_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"destination_map_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_atlas_connection_source_place_uq" UNIQUE("source_map_id","geography_id"),
	CONSTRAINT "world_atlas_connection_valid" CHECK ("world_atlas_connection"."source_map_id"<>"world_atlas_connection"."destination_map_id" AND "world_atlas_connection"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD COLUMN "geography_id" text;--> statement-breakpoint
ALTER TABLE "world_geography" ADD COLUMN "context" text DEFAULT 'place' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_atlas_connection" ADD CONSTRAINT "world_atlas_connection_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_connection" ADD CONSTRAINT "world_atlas_connection_source_world_fk" FOREIGN KEY ("source_map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_connection" ADD CONSTRAINT "world_atlas_connection_destination_world_fk" FOREIGN KEY ("destination_map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_connection" ADD CONSTRAINT "world_atlas_connection_geography_world_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_atlas_connection_world_idx" ON "world_atlas_connection" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_atlas_connection_destination_idx" ON "world_atlas_connection" USING btree ("destination_map_id");--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_map_geography_world_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_atlas_map_geography_idx" ON "world_atlas_map" USING btree ("geography_id");--> statement-breakpoint
ALTER TABLE "world_geography" ADD CONSTRAINT "world_geography_context_valid" CHECK ("world_geography"."context" IN ('place','region','local area','settlement','building site','interior') AND ("world_geography"."kind"='location' OR "world_geography"."context"='place'));