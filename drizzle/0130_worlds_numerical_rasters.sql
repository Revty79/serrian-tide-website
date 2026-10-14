ALTER TABLE "world_geo_view" ADD CONSTRAINT "geo_view_context_uq" UNIQUE("map_id","world_id","surface_id");
--> statement-breakpoint
CREATE TABLE "world_raster_asset" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"source_id" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" bigint NOT NULL,
	CONSTRAINT "world_raster_asset_version_id_key_pk" PRIMARY KEY("version_id","key"),
	CONSTRAINT "raster_asset_valid" CHECK ("world_raster_asset"."sha256"~'^[a-f0-9]{64}$' and "world_raster_asset"."bytes">0 and "world_raster_asset"."bytes"<=1073741824 and "world_raster_asset"."kind" in ('source','numerical','shaded','tint') and length("world_raster_asset"."key") between 1 and 200 and "world_raster_asset"."key" !~ '(^|/)\.\.(/|$)')
);
--> statement-breakpoint
CREATE TABLE "world_raster_head" (
	"source_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"version_id" text NOT NULL,
	"revision" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_raster_source" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"surface_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "raster_source_context_uq" UNIQUE("id","world_id","surface_id"),
	CONSTRAINT "raster_source_identity_uq" UNIQUE("world_id","surface_id","external_id"),
	CONSTRAINT "raster_source_valid" CHECK (length("world_raster_source"."name") between 1 and 160 and length("world_raster_source"."external_id") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "world_raster_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"source_id" text NOT NULL,
	"surface_id" text NOT NULL,
	"previous_id" text,
	"author_id" text NOT NULL,
	"request_id" text NOT NULL,
	"revision" integer NOT NULL,
	"bundle" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"note" text NOT NULL,
	"protected" boolean NOT NULL,
	"archived" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "raster_version_source_uq" UNIQUE("id","world_id","source_id"),
	CONSTRAINT "raster_version_head_uq" UNIQUE("id","world_id","source_id","revision"),
	CONSTRAINT "raster_version_revision_uq" UNIQUE("source_id","revision"),
	CONSTRAINT "raster_version_request_uq" UNIQUE("world_id","request_id"),
	CONSTRAINT "raster_version_valid" CHECK ("world_raster_version"."revision">0 and "world_raster_version"."bundle"~'^[a-f0-9]{64}$' and length("world_raster_version"."note") between 1 and 4000 and jsonb_typeof("world_raster_version"."manifest")='object' and octet_length("world_raster_version"."manifest"::text)<=8000000)
);
--> statement-breakpoint
CREATE TABLE "world_raster_view" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"surface_id" text NOT NULL,
	"source_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"preferences" jsonb NOT NULL,
	CONSTRAINT "raster_view_valid" CHECK ("world_raster_view"."revision">0 and jsonb_typeof("world_raster_view"."preferences")='object')
);
--> statement-breakpoint
ALTER TABLE "world_raster_asset" ADD CONSTRAINT "raster_asset_version_fk" FOREIGN KEY ("version_id","world_id","source_id") REFERENCES "public"."world_raster_version"("id","world_id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_raster_head" ADD CONSTRAINT "raster_head_version_fk" FOREIGN KEY ("version_id","world_id","source_id","revision") REFERENCES "public"."world_raster_version"("id","world_id","source_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_raster_source" ADD CONSTRAINT "raster_source_surface_fk" FOREIGN KEY ("surface_id","world_id") REFERENCES "public"."world_geo_surface"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_raster_version" ADD CONSTRAINT "world_raster_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_raster_version" ADD CONSTRAINT "raster_version_source_fk" FOREIGN KEY ("source_id","world_id","surface_id") REFERENCES "public"."world_raster_source"("id","world_id","surface_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_raster_version" ADD CONSTRAINT "raster_version_previous_fk" FOREIGN KEY ("previous_id","world_id","source_id") REFERENCES "public"."world_raster_version"("id","world_id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_raster_view" ADD CONSTRAINT "raster_view_map_fk" FOREIGN KEY ("map_id","world_id","surface_id") REFERENCES "public"."world_geo_view"("map_id","world_id","surface_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_raster_view" ADD CONSTRAINT "raster_view_source_fk" FOREIGN KEY ("source_id","world_id","surface_id") REFERENCES "public"."world_raster_source"("id","world_id","surface_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raster_view_world_idx" ON "world_raster_view" USING btree ("world_id");--> statement-breakpoint

--> statement-breakpoint
CREATE TRIGGER world_raster_source_immutable BEFORE UPDATE OR DELETE ON world_raster_source FOR EACH ROW EXECUTE FUNCTION world_geo_immutable_source();
--> statement-breakpoint
CREATE TRIGGER world_raster_version_immutable BEFORE UPDATE OR DELETE ON world_raster_version FOR EACH ROW EXECUTE FUNCTION world_geo_immutable_source();
--> statement-breakpoint
CREATE TRIGGER world_raster_asset_immutable BEFORE UPDATE OR DELETE ON world_raster_asset FOR EACH ROW EXECUTE FUNCTION world_geo_immutable_source();
