CREATE OR REPLACE FUNCTION world_atlas_dungeon_state_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; g jsonb;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'object' OR NOT (v ?& ARRAY['version','flooring','layers','grid']) OR (SELECT count(*) FROM jsonb_object_keys(v))<>4 OR jsonb_typeof(v->'layers')<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v->'layers'))<>16 THEN RETURN false; END IF;
 IF world_atlas_interior_state_valid(jsonb_build_object('version',v->'version','flooring',v->'flooring','layers',jsonb_build_object('flooring',v->'layers'->'flooring','room',v->'layers'->'room','wall',v->'layers'->'wall','opening',v->'layers'->'opening','window',v->'layers'->'window','transition',v->'layers'->'transition','furnishing',v->'layers'->'furnishing','landmark',v->'layers'->'landmark','labels',v->'layers'->'labels'))) IS NOT TRUE THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['flooring','room','cavern','corridor','wall','opening','window','transition','furnishing','landmark','terrain','trap','hazard','annotation','labels','grid'] LOOP
 IF jsonb_typeof(v->'layers'->k)<>'object' OR NOT (v->'layers'->k ?& ARRAY['visible','locked']) OR (SELECT count(*) FROM jsonb_object_keys(v->'layers'->k))<>2 OR jsonb_typeof(v->'layers'->k->'visible')<>'boolean' OR jsonb_typeof(v->'layers'->k->'locked')<>'boolean' THEN RETURN false; END IF; END LOOP;
 g=v->'grid'; IF jsonb_typeof(g)<>'object' OR NOT(g ?& ARRAY['kind','visible','size','offsetX','offsetY','orientation','snap','opacity','scale']) OR (SELECT count(*) FROM jsonb_object_keys(g))<>9 THEN RETURN false; END IF;
 RETURN coalesce(g->>'kind' IN ('none','square','hex') AND jsonb_typeof(g->'visible')='boolean' AND jsonb_typeof(g->'snap')='boolean' AND jsonb_typeof(g->'size')='number' AND (g->>'size')::numeric BETWEEN 12 AND 240 AND jsonb_typeof(g->'offsetX')='number' AND (g->>'offsetX')::numeric BETWEEN -2000 AND 2000 AND jsonb_typeof(g->'offsetY')='number' AND (g->>'offsetY')::numeric BETWEEN -1200 AND 1200 AND jsonb_typeof(g->'opacity')='number' AND (g->>'opacity')::numeric BETWEEN .05 AND .8 AND g->>'orientation' IN ('pointy','flat') AND jsonb_typeof(g->'scale')='string' AND length(g->>'scale')<=160,false);
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_atlas_dungeon_shape_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF v->>'variant'<>'passage' THEN RETURN world_atlas_interior_shape_valid(v); END IF;
 IF jsonb_typeof(v)<>'object' OR NOT(v ?& ARRAY['version','id','entityId','archived','variant','points','width','appearance']) OR (SELECT count(*) FROM jsonb_object_keys(v))<>8 THEN RETURN false; END IF;
 RETURN coalesce(v->>'appearance' IN ('constructed','natural','water','chasm','rubble','cliff','surface') AND jsonb_typeof(v->'width')='number' AND (v->>'width')::numeric BETWEEN 4 AND 500 AND world_atlas_interior_shape_valid((v-'appearance')||jsonb_build_object('variant','wall','width',least((v->>'width')::numeric,100))) IS TRUE,false);
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE TABLE "world_atlas_dungeon_shape" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"level_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "world_atlas_dungeon_shape_valid" CHECK (world_atlas_dungeon_shape_valid("world_atlas_dungeon_shape"."content") IS TRUE AND "world_atlas_dungeon_shape"."content"->>'id'="world_atlas_dungeon_shape"."id" AND "world_atlas_dungeon_shape"."content"->>'entityId'="world_atlas_dungeon_shape"."entity_id" AND "world_atlas_dungeon_shape"."sort_order" BETWEEN 0 AND 3999)
);
--> statement-breakpoint
CREATE TABLE "world_dungeon_entity" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"level_id" text NOT NULL,
	"geography_id" text,
	"kind" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'ordinary' NOT NULL,
	"private_notes" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "world_dungeon_entity_level_uq" UNIQUE("id","world_id","level_id"),
	CONSTRAINT "world_dungeon_entity_valid" CHECK ("world_dungeon_entity"."kind" IN ('room','cavern','corridor','wall','opening','window','transition','furnishing','landmark','terrain','trap','hazard','annotation') AND "world_dungeon_entity"."visibility" IN ('ordinary','secret','god-only') AND length("world_dungeon_entity"."name")<=160 AND length("world_dungeon_entity"."description")<=12000 AND length("world_dungeon_entity"."private_notes")<=12000 AND length("world_dungeon_entity"."classification")<=160 AND "world_dungeon_entity"."revision">0 AND (CASE WHEN "world_dungeon_entity"."kind" IN ('room','cavern','corridor','transition','landmark','trap','hazard') THEN "world_dungeon_entity"."geography_id" IS NOT NULL AND "world_dungeon_entity"."geography_id"="world_dungeon_entity"."id" ELSE "world_dungeon_entity"."geography_id" IS NULL END))
);
--> statement-breakpoint
CREATE TABLE "world_dungeon_level" (
	"geography_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"site_id" text NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"display_order" integer,
	"elevation" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_dungeon_level_world_uq" UNIQUE("geography_id","world_id"),
	CONSTRAINT "world_dungeon_level_valid" CHECK ("world_dungeon_level"."geography_id"<>"world_dungeon_level"."site_id" AND length("world_dungeon_level"."classification")<=160 AND length("world_dungeon_level"."label")<=80 AND length("world_dungeon_level"."elevation")<=80 AND ("world_dungeon_level"."display_order" IS NULL OR "world_dungeon_level"."display_order" BETWEEN -100000 AND 100000) AND "world_dungeon_level"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "world_dungeon_site" (
	"geography_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_dungeon_site_world_uq" UNIQUE("geography_id","world_id"),
	CONSTRAINT "world_dungeon_site_valid" CHECK (length("world_dungeon_site"."classification")<=160 AND "world_dungeon_site"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "world_atlas_map" DROP CONSTRAINT "world_atlas_map_kind_valid";--> statement-breakpoint
ALTER TABLE "world_geography" DROP CONSTRAINT "world_geography_context_valid";--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD COLUMN "dungeon_state" jsonb DEFAULT '{"version":1,"flooring":"plain","layers":{"flooring":{"visible":true,"locked":false},"room":{"visible":true,"locked":false},"cavern":{"visible":true,"locked":false},"corridor":{"visible":true,"locked":false},"wall":{"visible":true,"locked":false},"opening":{"visible":true,"locked":false},"window":{"visible":true,"locked":false},"transition":{"visible":true,"locked":false},"furnishing":{"visible":true,"locked":false},"landmark":{"visible":true,"locked":false},"terrain":{"visible":true,"locked":false},"trap":{"visible":true,"locked":false},"hazard":{"visible":true,"locked":false},"annotation":{"visible":true,"locked":false},"labels":{"visible":true,"locked":false},"grid":{"visible":true,"locked":false}},"grid":{"kind":"none","visible":true,"size":60,"offsetX":0,"offsetY":0,"orientation":"pointy","snap":false,"opacity":0.3,"scale":""}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_atlas_dungeon_shape" ADD CONSTRAINT "world_atlas_dungeon_shape_map_fk" FOREIGN KEY ("map_id","world_id","level_id") REFERENCES "public"."world_atlas_map"("id","world_id","geography_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_dungeon_shape" ADD CONSTRAINT "world_atlas_dungeon_shape_entity_fk" FOREIGN KEY ("entity_id","world_id","level_id") REFERENCES "public"."world_dungeon_entity"("id","world_id","level_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_dungeon_entity" ADD CONSTRAINT "world_dungeon_entity_level_fk" FOREIGN KEY ("level_id","world_id") REFERENCES "public"."world_dungeon_level"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_dungeon_entity" ADD CONSTRAINT "world_dungeon_entity_geography_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_dungeon_level" ADD CONSTRAINT "world_dungeon_level_geography_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_dungeon_level" ADD CONSTRAINT "world_dungeon_level_site_fk" FOREIGN KEY ("site_id","world_id") REFERENCES "public"."world_dungeon_site"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_dungeon_site" ADD CONSTRAINT "world_dungeon_site_geography_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_atlas_dungeon_shape_map_idx" ON "world_atlas_dungeon_shape" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "world_dungeon_entity_level_idx" ON "world_dungeon_entity" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "world_dungeon_level_site_idx" ON "world_dungeon_level" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "world_dungeon_site_world_idx" ON "world_dungeon_site" USING btree ("world_id");--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_dungeon_state_valid" CHECK (world_atlas_dungeon_state_valid("world_atlas_map"."dungeon_state") IS TRUE);--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_map_kind_valid" CHECK ("world_atlas_map"."map_kind" IN ('generic','settlement','interior','dungeon') AND ("world_atlas_map"."map_kind"='generic' OR "world_atlas_map"."geography_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "world_geography" ADD CONSTRAINT "world_geography_context_valid" CHECK ("world_geography"."context" IN ('place','region','local area','settlement','building site','interior','dungeon','dungeon level') AND ("world_geography"."kind"='location' OR "world_geography"."context"='place'));