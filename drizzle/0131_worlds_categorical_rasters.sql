CREATE TABLE "world_categorical_raster_view" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"surface_id" text NOT NULL,
	"source_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"preferences" jsonb NOT NULL,
	CONSTRAINT "categorical_view_valid" CHECK ("world_categorical_raster_view"."revision">0 and jsonb_typeof("world_categorical_raster_view"."preferences")='object')
);
--> statement-breakpoint
ALTER TABLE "world_raster_asset" DROP CONSTRAINT "raster_asset_valid";--> statement-breakpoint
ALTER TABLE "world_categorical_raster_view" ADD CONSTRAINT "categorical_view_map_fk" FOREIGN KEY ("map_id","world_id","surface_id") REFERENCES "public"."world_geo_view"("map_id","world_id","surface_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_categorical_raster_view" ADD CONSTRAINT "categorical_view_source_fk" FOREIGN KEY ("source_id","world_id","surface_id") REFERENCES "public"."world_raster_source"("id","world_id","surface_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorical_view_world_idx" ON "world_categorical_raster_view" USING btree ("world_id");--> statement-breakpoint
ALTER TABLE "world_raster_asset" ADD CONSTRAINT "raster_asset_valid" CHECK ("world_raster_asset"."sha256"~'^[a-f0-9]{64}$' and "world_raster_asset"."bytes">0 and "world_raster_asset"."bytes"<=1073741824 and "world_raster_asset"."kind" in ('source','numerical','shaded','tint','classification') and length("world_raster_asset"."key") between 1 and 200 and "world_raster_asset"."key" !~ '(^|/)\.\.(/|$)');