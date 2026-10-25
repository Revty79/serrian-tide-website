CREATE TABLE "world_map_canvas" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"topology" text DEFAULT 'plane' NOT NULL,
	"purpose" text DEFAULT 'world' NOT NULL,
	"rendering" jsonb DEFAULT '{"version":1,"style":"elevation-relief"}'::jsonb NOT NULL,
	CONSTRAINT "world_map_canvas_world_uq" UNIQUE("map_id","world_id"),
	CONSTRAINT "world_map_canvas_valid" CHECK ("world_map_canvas"."topology"='plane' AND "world_map_canvas"."purpose"='world' AND "world_map_canvas"."rendering"='{"version":1,"style":"elevation-relief"}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "world_terrain" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"format" integer DEFAULT 1 NOT NULL,
	"grid_width" integer NOT NULL,
	"grid_height" integer NOT NULL,
	"tile_size" integer DEFAULT 32 NOT NULL,
	"width_metres" double precision NOT NULL,
	"height_metres" double precision NOT NULL,
	"coordinate_reference" text DEFAULT 'LOCAL:METRES' NOT NULL,
	"wrap_east_west" boolean DEFAULT false NOT NULL,
	"min_elevation" integer NOT NULL,
	"max_elevation" integer NOT NULL,
	"base_elevation" integer NOT NULL,
	"sea_level" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"creation_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_terrain_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_terrain_valid" CHECK ("world_terrain"."format"=1 AND "world_terrain"."grid_width" BETWEEN 32 AND 1024 AND "world_terrain"."grid_height" BETWEEN 32 AND 1024 AND "world_terrain"."grid_width"%32=0 AND "world_terrain"."grid_height"%32=0 AND "world_terrain"."tile_size"=32 AND "world_terrain"."width_metres" BETWEEN 100 AND 1000000000 AND "world_terrain"."height_metres" BETWEEN 100 AND 1000000000 AND "world_terrain"."coordinate_reference"='LOCAL:METRES' AND "world_terrain"."min_elevation" BETWEEN -30000 AND -1 AND "world_terrain"."max_elevation" BETWEEN 1 AND 30000 AND "world_terrain"."base_elevation" BETWEEN "world_terrain"."min_elevation" AND "world_terrain"."max_elevation" AND "world_terrain"."sea_level" BETWEEN "world_terrain"."min_elevation" AND "world_terrain"."max_elevation" AND "world_terrain"."revision">0 AND "world_terrain"."creation_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "world_terrain_tile" (
	"terrain_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"detail_level" integer DEFAULT 0 NOT NULL,
	"tile_x" integer NOT NULL,
	"tile_y" integer NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"encoding" text DEFAULT 'i16le-v1' NOT NULL,
	CONSTRAINT "world_terrain_tile_terrain_id_detail_level_tile_x_tile_y_revision_pk" PRIMARY KEY("terrain_id","detail_level","tile_x","tile_y","revision"),
	CONSTRAINT "world_terrain_tile_valid" CHECK ("world_terrain_tile"."detail_level"=0 AND "world_terrain_tile"."tile_x" BETWEEN 0 AND 31 AND "world_terrain_tile"."tile_y" BETWEEN 0 AND 31 AND "world_terrain_tile"."sha256" ~ '^[a-f0-9]{64}$' AND "world_terrain_tile"."bytes"=2048 AND "world_terrain_tile"."encoding"='i16le-v1')
);
--> statement-breakpoint
CREATE TABLE "world_terrain_version" (
	"terrain_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"previous_revision" integer,
	"request_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"sea_level" integer NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_terrain_version_terrain_id_revision_pk" PRIMARY KEY("terrain_id","revision"),
	CONSTRAINT "world_terrain_version_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "world_terrain_version_world_uq" UNIQUE("terrain_id","world_id","revision"),
	CONSTRAINT "world_terrain_version_valid" CHECK ("world_terrain_version"."revision">0 AND (("world_terrain_version"."revision"=1 AND "world_terrain_version"."previous_revision" IS NULL) OR ("world_terrain_version"."previous_revision" IS NOT NULL AND "world_terrain_version"."previous_revision"="world_terrain_version"."revision"-1)) AND "world_terrain_version"."sea_level" BETWEEN -30000 AND 30000 AND "world_terrain_version"."content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "world_map_canvas" ADD CONSTRAINT "world_map_canvas_identity_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_canvas" ADD CONSTRAINT "world_map_canvas_terrain_fk" FOREIGN KEY ("terrain_id","world_id") REFERENCES "public"."world_terrain"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain" ADD CONSTRAINT "world_terrain_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_tile" ADD CONSTRAINT "world_terrain_tile_version_fk" FOREIGN KEY ("terrain_id","world_id","revision") REFERENCES "public"."world_terrain_version"("terrain_id","world_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_version" ADD CONSTRAINT "world_terrain_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_version" ADD CONSTRAINT "world_terrain_version_terrain_fk" FOREIGN KEY ("terrain_id","world_id") REFERENCES "public"."world_terrain"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_version" ADD CONSTRAINT "world_terrain_version_parent_fk" FOREIGN KEY ("terrain_id","world_id","previous_revision") REFERENCES "public"."world_terrain_version"("terrain_id","world_id","revision") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION world_terrain_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Accepted terrain history is immutable'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_version_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_terrain_version FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE TRIGGER world_terrain_tile_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_terrain_tile FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_terrain_head_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id,NEW.world_id,NEW.format,NEW.grid_width,NEW.grid_height,NEW.tile_size,NEW.width_metres,NEW.height_metres,NEW.coordinate_reference,NEW.wrap_east_west,NEW.min_elevation,NEW.max_elevation,NEW.base_elevation,NEW.creation_hash)
    IS DISTINCT FROM (OLD.id,OLD.world_id,OLD.format,OLD.grid_width,OLD.grid_height,OLD.tile_size,OLD.width_metres,OLD.height_metres,OLD.coordinate_reference,OLD.wrap_east_west,OLD.min_elevation,OLD.max_elevation,OLD.base_elevation,OLD.creation_hash)
    THEN RAISE EXCEPTION 'Terrain identity and coordinate frame are stable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM world_terrain_version v WHERE v.terrain_id=NEW.id AND v.world_id=NEW.world_id AND v.revision=NEW.revision AND v.sea_level=NEW.sea_level)
    THEN RAISE EXCEPTION 'Terrain head must reference a complete accepted revision'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_terrain_complete_head AFTER INSERT OR UPDATE ON world_terrain DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_terrain_head_valid();
--> statement-breakpoint
CREATE FUNCTION world_terrain_tile_bounds_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM world_terrain t WHERE t.id=NEW.terrain_id AND t.world_id=NEW.world_id AND NEW.tile_x<t.grid_width/t.tile_size AND NEW.tile_y<t.grid_height/t.tile_size)
    THEN RAISE EXCEPTION 'Tile is outside the terrain grid'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_tile_bounds BEFORE INSERT ON world_terrain_tile FOR EACH ROW EXECUTE FUNCTION world_terrain_tile_bounds_valid();
