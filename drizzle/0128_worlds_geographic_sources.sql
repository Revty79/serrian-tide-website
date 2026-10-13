CREATE TABLE "world_geo_dataset" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"surface_id" text NOT NULL,
	"content_sha256" text NOT NULL,
	"namespace" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "geo_dataset_world_uq" UNIQUE("id","world_id","surface_id"),
	CONSTRAINT "geo_dataset_retry_uq" UNIQUE("world_id","surface_id","content_sha256"),
	CONSTRAINT "geo_dataset_digest_valid" CHECK ("world_geo_dataset"."content_sha256" ~ '^[a-f0-9]{64}$' and jsonb_typeof("world_geo_dataset"."provenance")='object')
);
--> statement-breakpoint
CREATE TABLE "world_geo_feature" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"surface_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"namespace" text NOT NULL,
	"external_id" text NOT NULL,
	"semantic" text NOT NULL,
	CONSTRAINT "geo_feature_world_uq" UNIQUE("id","world_id","surface_id"),
	CONSTRAINT "geo_feature_external_uq" UNIQUE("surface_id","namespace","external_id"),
	CONSTRAINT "geo_feature_kind_valid" CHECK ("world_geo_feature"."semantic" in ('physical-geography','administrative-boundary','authored-geography') and length("world_geo_feature"."external_id") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "world_geo_head" (
	"feature_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"version_id" text NOT NULL,
	"revision" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_geo_part" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"part" integer NOT NULL,
	"box" integer NOT NULL,
	"west" double precision NOT NULL,
	"south" double precision NOT NULL,
	"east" double precision NOT NULL,
	"north" double precision NOT NULL,
	"overview" jsonb NOT NULL,
	"regional" jsonb NOT NULL,
	"detail" jsonb NOT NULL,
	CONSTRAINT "world_geo_part_version_id_part_box_pk" PRIMARY KEY("version_id","part","box"),
	CONSTRAINT "geo_part_bounds_valid" CHECK ("world_geo_part"."part">=0 and "world_geo_part"."box" between 0 and 1 and "world_geo_part"."west"<="world_geo_part"."east" and "world_geo_part"."south"<="world_geo_part"."north" and "world_geo_part"."west" between -1e12 and 1e12 and "world_geo_part"."east" between -1e12 and 1e12 and "world_geo_part"."south" between -1e12 and 1e12 and "world_geo_part"."north" between -1e12 and 1e12)
);
--> statement-breakpoint
CREATE TABLE "world_geo_surface" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"request_id" text NOT NULL,
	"name" text NOT NULL,
	"reference" jsonb NOT NULL,
	"realm_id" text,
	"protected" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "geo_surface_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "geo_surface_request_uq" UNIQUE("world_id","request_id"),
	CONSTRAINT "geo_surface_valid" CHECK (length(trim("world_geo_surface"."name")) between 1 and 160 and "world_geo_surface"."reference"->>'version'='1' and "world_geo_surface"."reference"->>'kind' in ('sphere','plane'))
);
--> statement-breakpoint
CREATE TABLE "world_geo_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"surface_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"previous_id" text,
	"request_id" text NOT NULL,
	"revision" integer NOT NULL,
	"geometry" jsonb NOT NULL,
	"properties" jsonb NOT NULL,
	"note" text NOT NULL,
	"protected" boolean NOT NULL,
	"archived" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "geo_version_feature_uq" UNIQUE("id","world_id","feature_id"),
	CONSTRAINT "geo_version_revision_uq" UNIQUE("feature_id","revision"),
	CONSTRAINT "geo_version_head_uq" UNIQUE("id","world_id","feature_id","revision"),
	CONSTRAINT "geo_version_request_uq" UNIQUE("world_id","request_id"),
	CONSTRAINT "geo_version_valid" CHECK ("world_geo_version"."revision">0 and length("world_geo_version"."note") between 1 and 4000 and jsonb_typeof("world_geo_version"."properties")='object' and jsonb_typeof("world_geo_version"."geometry")='object' and "world_geo_version"."geometry"->>'type' in ('Point','LineString','MultiLineString','Polygon','MultiPolygon') and jsonb_typeof("world_geo_version"."geometry"->'coordinates')='array' and octet_length("world_geo_version"."geometry"::text)<=4000000)
);
--> statement-breakpoint
CREATE TABLE "world_geo_view" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"surface_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world_geo_dataset" ADD CONSTRAINT "geo_dataset_surface_fk" FOREIGN KEY ("surface_id","world_id") REFERENCES "public"."world_geo_surface"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_feature" ADD CONSTRAINT "geo_feature_surface_fk" FOREIGN KEY ("surface_id","world_id") REFERENCES "public"."world_geo_surface"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_feature" ADD CONSTRAINT "geo_feature_place_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_head" ADD CONSTRAINT "geo_head_version_fk" FOREIGN KEY ("version_id","world_id","feature_id","revision") REFERENCES "public"."world_geo_version"("id","world_id","feature_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_part" ADD CONSTRAINT "geo_part_version_fk" FOREIGN KEY ("version_id","world_id","feature_id") REFERENCES "public"."world_geo_version"("id","world_id","feature_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_surface" ADD CONSTRAINT "world_geo_surface_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_surface" ADD CONSTRAINT "geo_surface_realm_fk" FOREIGN KEY ("realm_id","world_id") REFERENCES "public"."world_lore_identity"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_version" ADD CONSTRAINT "geo_version_feature_fk" FOREIGN KEY ("feature_id","world_id","surface_id") REFERENCES "public"."world_geo_feature"("id","world_id","surface_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_version" ADD CONSTRAINT "geo_version_dataset_fk" FOREIGN KEY ("dataset_id","world_id","surface_id") REFERENCES "public"."world_geo_dataset"("id","world_id","surface_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_version" ADD CONSTRAINT "geo_version_previous_fk" FOREIGN KEY ("previous_id","world_id","feature_id") REFERENCES "public"."world_geo_version"("id","world_id","feature_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_view" ADD CONSTRAINT "geo_view_surface_fk" FOREIGN KEY ("surface_id","world_id") REFERENCES "public"."world_geo_surface"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_view" ADD CONSTRAINT "geo_view_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_feature_surface_idx" ON "world_geo_feature" USING btree ("world_id","surface_id");--> statement-breakpoint
CREATE INDEX "geo_part_world_idx" ON "world_geo_part" USING btree ("world_id","feature_id");--> statement-breakpoint
CREATE INDEX "geo_view_surface_idx" ON "world_geo_view" USING btree ("world_id","surface_id");
--> statement-breakpoint
CREATE FUNCTION world_geo_immutable_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Geographic source records are immutable; create a new authoritative version.'; END $$;
--> statement-breakpoint
CREATE TRIGGER world_geo_surface_immutable BEFORE UPDATE OR DELETE ON world_geo_surface FOR EACH ROW EXECUTE FUNCTION world_geo_immutable_source();
--> statement-breakpoint
CREATE TRIGGER world_geo_view_immutable BEFORE UPDATE OR DELETE ON world_geo_view FOR EACH ROW EXECUTE FUNCTION world_geo_immutable_source();
--> statement-breakpoint
CREATE TRIGGER world_geo_dataset_immutable BEFORE UPDATE OR DELETE ON world_geo_dataset FOR EACH ROW EXECUTE FUNCTION world_geo_immutable_source();
--> statement-breakpoint
CREATE TRIGGER world_geo_feature_immutable BEFORE UPDATE OR DELETE ON world_geo_feature FOR EACH ROW EXECUTE FUNCTION world_geo_immutable_source();
--> statement-breakpoint
CREATE TRIGGER world_geo_version_immutable BEFORE UPDATE OR DELETE ON world_geo_version FOR EACH ROW EXECUTE FUNCTION world_geo_immutable_source();
--> statement-breakpoint

ALTER TABLE "world_geo_part" ADD COLUMN "algorithm_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_geo_part" DROP CONSTRAINT "geo_part_bounds_valid";--> statement-breakpoint
ALTER TABLE "world_geo_part" DROP CONSTRAINT "world_geo_part_version_id_part_box_pk";--> statement-breakpoint
ALTER TABLE "world_geo_part" ADD CONSTRAINT "world_geo_part_version_id_part_box_algorithm_version_pk" PRIMARY KEY("version_id","part","box","algorithm_version");--> statement-breakpoint
ALTER TABLE "world_geo_dataset" ADD COLUMN "importer_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "world_geo_surface" ADD COLUMN "creator_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "world_geo_version" ADD COLUMN "author_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "world_geo_dataset" ADD CONSTRAINT "world_geo_dataset_importer_id_user_id_fk" FOREIGN KEY ("importer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_surface" ADD CONSTRAINT "world_geo_surface_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geo_version" ADD CONSTRAINT "world_geo_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_part_bbox_gist_idx" ON "world_geo_part" USING gist (box(point("west","south"),point("east","north")));--> statement-breakpoint
ALTER TABLE "world_geo_part" ADD CONSTRAINT "geo_part_bounds_valid" CHECK ("world_geo_part"."algorithm_version">0 and "world_geo_part"."part">=0 and "world_geo_part"."box" between 0 and 1 and "world_geo_part"."west"<="world_geo_part"."east" and "world_geo_part"."south"<="world_geo_part"."north" and "world_geo_part"."west" between -1e12 and 1e12 and "world_geo_part"."east" between -1e12 and 1e12 and "world_geo_part"."south" between -1e12 and 1e12 and "world_geo_part"."north" between -1e12 and 1e12);