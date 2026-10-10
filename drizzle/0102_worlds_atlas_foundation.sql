CREATE TABLE "world_atlas_feature" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_atlas_geometry_shape_valid" CHECK (jsonb_typeof("world_atlas_feature"."geometry")='object' AND coalesce("world_atlas_feature"."geometry"->>'version'='1' AND (("world_atlas_feature"."geometry"->>'type'='polygon' AND jsonb_typeof("world_atlas_feature"."geometry"->'points')='array' AND jsonb_array_length("world_atlas_feature"."geometry"->'points') BETWEEN 3 AND 256) OR ("world_atlas_feature"."geometry"->>'type'='point' AND jsonb_typeof("world_atlas_feature"."geometry"->'point')='object')),false))
);
--> statement-breakpoint
CREATE TABLE "world_atlas_map" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT 'world' NOT NULL,
	"width" integer DEFAULT 2000 NOT NULL,
	"height" integer DEFAULT 1200 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_atlas_map_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_atlas_map_valid" CHECK (length(trim("world_atlas_map"."name")) BETWEEN 1 AND 160 AND length("world_atlas_map"."description") <= 12000 AND "world_atlas_map"."scope" IN ('world','continent','regional','local') AND "world_atlas_map"."width"=2000 AND "world_atlas_map"."height"=1200 AND "world_atlas_map"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "world_geography" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_geography_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_geography_valid" CHECK (length(trim("world_geography"."name")) BETWEEN 1 AND 160 AND length("world_geography"."description") <= 12000 AND "world_geography"."kind" IN ('continent','island','location') AND "world_geography"."revision" > 0 AND ("world_geography"."parent_id" IS NULL OR "world_geography"."parent_id" <> "world_geography"."id"))
);
--> statement-breakpoint
ALTER TABLE "world_atlas_feature" ADD CONSTRAINT "world_atlas_feature_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_feature" ADD CONSTRAINT "world_atlas_feature_map_world_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_feature" ADD CONSTRAINT "world_atlas_feature_geography_world_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_map_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geography" ADD CONSTRAINT "world_geography_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_geography" ADD CONSTRAINT "world_geography_parent_world_fk" FOREIGN KEY ("parent_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_atlas_feature_map_idx" ON "world_atlas_feature" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "world_atlas_map_world_idx" ON "world_atlas_map" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_geography_world_idx" ON "world_geography" USING btree ("world_id");
--> statement-breakpoint
-- World-root serialization is also used by application writes. The trigger protects
-- acyclic same-World hierarchies during direct maintenance and future imports.
CREATE FUNCTION world_geography_acyclic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM world WHERE id=NEW.world_id FOR UPDATE;
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM world_geography WHERE id=NEW.parent_id AND world_id=NEW.world_id
      UNION
      SELECT g.id,g.parent_id FROM world_geography g JOIN ancestors a ON g.id=a.parent_id WHERE g.world_id=NEW.world_id
    ) SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN RAISE EXCEPTION 'Geography parent cycle is not allowed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_geography_parent_acyclic BEFORE INSERT OR UPDATE OF parent_id,world_id ON world_geography FOR EACH ROW EXECUTE FUNCTION world_geography_acyclic();
