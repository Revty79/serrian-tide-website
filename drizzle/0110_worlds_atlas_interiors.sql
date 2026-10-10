CREATE OR REPLACE FUNCTION world_atlas_interior_state_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'object' OR NOT (v ?& ARRAY['version','flooring','layers']) OR (SELECT count(*) FROM jsonb_object_keys(v))<>3 OR jsonb_typeof(v->'version')<>'number' OR v->>'version'<>'1' OR v->>'flooring' NOT IN ('plain','boards','tiles') OR jsonb_typeof(v->'layers')<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v->'layers'))<>9 THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['flooring','room','wall','opening','window','transition','furnishing','landmark','labels'] LOOP
 IF NOT (v->'layers' ? k) OR jsonb_typeof(v->'layers'->k)<>'object' OR NOT (v->'layers'->k ?& ARRAY['visible','locked']) OR (SELECT count(*) FROM jsonb_object_keys(v->'layers'->k))<>2 OR jsonb_typeof(v->'layers'->k->'visible')<>'boolean' OR jsonb_typeof(v->'layers'->k->'locked')<>'boolean' THEN RETURN false; END IF;
 END LOOP; RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_atlas_interior_shape_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'object' OR NOT (v ?& ARRAY['version','id','entityId','archived','variant']) OR jsonb_typeof(v->'version')<>'number' OR v->>'version'<>'1' OR jsonb_typeof(v->'archived')<>'boolean' THEN RETURN false; END IF;
 PERFORM (v->>'id')::uuid; PERFORM (v->>'entityId')::uuid;
 IF v->>'variant'='area' THEN RETURN coalesce((SELECT count(*) FROM jsonb_object_keys(v))=6 AND world_atlas_geometry_valid(jsonb_build_object('version',1,'type','polygon','points',v->'points')) IS TRUE,false); END IF;
 IF v->>'variant'='wall' THEN RETURN coalesce((SELECT count(*) FROM jsonb_object_keys(v))=7 AND world_atlas_settlement_shape_valid(jsonb_build_object('version',1,'id',v->'id','geographyId',v->'entityId','type','line','variant','plain','archived',v->'archived','points',v->'points','width',v->'width','curve',0)) IS TRUE,false); END IF;
 IF v->>'variant'='opening' THEN
 IF NOT (v ?& ARRAY['wallId','startId','endId','at','width','style']) OR (SELECT count(*) FROM jsonb_object_keys(v))<>11 THEN RETURN false; END IF;
 PERFORM (v->>'wallId')::uuid; PERFORM (v->>'startId')::uuid; PERFORM (v->>'endId')::uuid;
 RETURN coalesce(jsonb_typeof(v->'at')='number' AND (v->>'at')::numeric BETWEEN 0 AND 1 AND jsonb_typeof(v->'width')='number' AND (v->>'width')::numeric BETWEEN 4 AND 240 AND v->>'style' IN ('door','double door','passage','entrance','gate','custom','window'),false);
 END IF;
 IF v->>'variant'='object' THEN RETURN coalesce((SELECT count(*) FROM jsonb_object_keys(v))=10 AND v ?& ARRAY['point','width','height','rotation','symbol'] AND world_atlas_geometry_valid(jsonb_build_object('version',1,'type','point','point',v->'point')) IS TRUE AND jsonb_typeof(v->'width')='number' AND (v->>'width')::numeric BETWEEN 4 AND 500 AND jsonb_typeof(v->'height')='number' AND (v->>'height')::numeric BETWEEN 4 AND 500 AND jsonb_typeof(v->'rotation')='number' AND (v->>'rotation')::numeric BETWEEN -180 AND 180 AND jsonb_typeof(v->'symbol')='string' AND length(v->>'symbol') BETWEEN 1 AND 80,false); END IF;
 RETURN false;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE TABLE "world_atlas_interior_shape" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"floor_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "world_atlas_interior_shape_valid" CHECK (world_atlas_interior_shape_valid("world_atlas_interior_shape"."content") IS TRUE AND "world_atlas_interior_shape"."content"->>'id'="world_atlas_interior_shape"."id" AND "world_atlas_interior_shape"."content"->>'entityId'="world_atlas_interior_shape"."entity_id" AND "world_atlas_interior_shape"."sort_order" BETWEEN 0 AND 3999)
);
--> statement-breakpoint
CREATE TABLE "world_interior_entity" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"floor_id" text NOT NULL,
	"geography_id" text,
	"kind" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "world_interior_entity_floor_uq" UNIQUE("id","world_id","floor_id"),
	CONSTRAINT "world_interior_entity_valid" CHECK ("world_interior_entity"."kind" IN ('room','wall','opening','window','transition','furnishing','landmark') AND length("world_interior_entity"."name")<=160 AND length("world_interior_entity"."description")<=12000 AND length("world_interior_entity"."classification")<=160 AND "world_interior_entity"."revision">0 AND (CASE WHEN "world_interior_entity"."kind" IN ('room','transition','landmark') THEN "world_interior_entity"."geography_id" IS NOT NULL AND "world_interior_entity"."geography_id"="world_interior_entity"."id" ELSE "world_interior_entity"."geography_id" IS NULL END))
);
--> statement-breakpoint
CREATE TABLE "world_interior_floor" (
	"geography_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"building_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"building_kind" text DEFAULT 'building' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"display_order" integer,
	"elevation" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_interior_floor_world_uq" UNIQUE("geography_id","world_id"),
	CONSTRAINT "world_interior_floor_valid" CHECK ("world_interior_floor"."building_kind"='building' AND "world_interior_floor"."geography_id"<>"world_interior_floor"."building_id" AND length("world_interior_floor"."classification")<=160 AND length("world_interior_floor"."label")<=80 AND length("world_interior_floor"."elevation")<=80 AND ("world_interior_floor"."display_order" IS NULL OR "world_interior_floor"."display_order" BETWEEN -100000 AND 100000) AND "world_interior_floor"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "world_atlas_map" DROP CONSTRAINT "world_atlas_map_kind_valid";--> statement-breakpoint
ALTER TABLE "world_atlas_connection" ADD COLUMN "destination_geography_id" text;--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD COLUMN "interior_state" jsonb DEFAULT '{"version":1,"flooring":"plain","layers":{"flooring":{"visible":true,"locked":false},"room":{"visible":true,"locked":false},"wall":{"visible":true,"locked":false},"opening":{"visible":true,"locked":false},"window":{"visible":true,"locked":false},"transition":{"visible":true,"locked":false},"furnishing":{"visible":true,"locked":false},"landmark":{"visible":true,"locked":false},"labels":{"visible":true,"locked":false}}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_atlas_interior_shape" ADD CONSTRAINT "world_atlas_interior_shape_map_fk" FOREIGN KEY ("map_id","world_id","floor_id") REFERENCES "public"."world_atlas_map"("id","world_id","geography_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_interior_shape" ADD CONSTRAINT "world_atlas_interior_shape_entity_fk" FOREIGN KEY ("entity_id","world_id","floor_id") REFERENCES "public"."world_interior_entity"("id","world_id","floor_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_interior_entity" ADD CONSTRAINT "world_interior_entity_floor_fk" FOREIGN KEY ("floor_id","world_id") REFERENCES "public"."world_interior_floor"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_interior_entity" ADD CONSTRAINT "world_interior_entity_geography_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_interior_floor" ADD CONSTRAINT "world_interior_floor_geography_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_interior_floor" ADD CONSTRAINT "world_interior_floor_building_fk" FOREIGN KEY ("building_id","world_id","settlement_id","building_kind") REFERENCES "public"."world_settlement_entity"("geography_id","world_id","settlement_id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_atlas_interior_shape_map_idx" ON "world_atlas_interior_shape" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "world_interior_entity_floor_idx" ON "world_interior_entity" USING btree ("floor_id");--> statement-breakpoint
CREATE INDEX "world_interior_floor_building_idx" ON "world_interior_floor" USING btree ("building_id");--> statement-breakpoint
ALTER TABLE "world_atlas_connection" ADD CONSTRAINT "world_atlas_connection_arrival_world_fk" FOREIGN KEY ("destination_geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_interior_state_valid" CHECK (world_atlas_interior_state_valid("world_atlas_map"."interior_state") IS TRUE);--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_map_kind_valid" CHECK ("world_atlas_map"."map_kind" IN ('generic','settlement','interior') AND ("world_atlas_map"."map_kind"='generic' OR "world_atlas_map"."geography_id" IS NOT NULL));