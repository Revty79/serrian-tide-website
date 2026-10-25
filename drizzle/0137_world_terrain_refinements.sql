CREATE TABLE "world_terrain_refinement" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"parent_id" text,
	"parent_revision" integer NOT NULL,
	"detail_level" integer NOT NULL,
	"name" text NOT NULL,
	"x_metres" double precision NOT NULL,
	"y_metres" double precision NOT NULL,
	"width_metres" double precision NOT NULL,
	"height_metres" double precision NOT NULL,
	"grid_width" integer NOT NULL,
	"grid_height" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"creation_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_terrain_refinement_identity_uq" UNIQUE("id","terrain_id","world_id"),
	CONSTRAINT "world_terrain_refinement_valid" CHECK ("world_terrain_refinement"."detail_level" BETWEEN 1 AND 8 AND "world_terrain_refinement"."parent_revision">0 AND "world_terrain_refinement"."revision">0 AND length("world_terrain_refinement"."name") BETWEEN 1 AND 160 AND "world_terrain_refinement"."x_metres">=0 AND "world_terrain_refinement"."x_metres"<1000000000 AND "world_terrain_refinement"."y_metres">=0 AND "world_terrain_refinement"."y_metres"<1000000000 AND "world_terrain_refinement"."width_metres" BETWEEN 100 AND 1000000000 AND "world_terrain_refinement"."height_metres" BETWEEN 100 AND 1000000000 AND "world_terrain_refinement"."grid_width" IN (32,64,128,256,512,1024) AND "world_terrain_refinement"."grid_height" IN (32,64,128,256,512,1024) AND "world_terrain_refinement"."creation_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "world_terrain_refinement_tile" (
	"refinement_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"lod" integer DEFAULT 0 NOT NULL,
	"tile_x" integer NOT NULL,
	"tile_y" integer NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"encoding" text DEFAULT 'i16le-v1' NOT NULL,
	"manual_protection" text NOT NULL,
	CONSTRAINT "world_terrain_refinement_tile_pk" PRIMARY KEY("refinement_id","lod","tile_x","tile_y","revision"),
	CONSTRAINT "world_terrain_refinement_tile_valid" CHECK ("world_terrain_refinement_tile"."lod" BETWEEN 0 AND 5 AND "world_terrain_refinement_tile"."tile_x" BETWEEN 0 AND 31 AND "world_terrain_refinement_tile"."tile_y" BETWEEN 0 AND 31 AND "world_terrain_refinement_tile"."sha256" ~ '^[a-f0-9]{64}$' AND "world_terrain_refinement_tile"."bytes"=2048 AND "world_terrain_refinement_tile"."encoding"='i16le-v1' AND "world_terrain_refinement_tile"."manual_protection" ~ '^[a-f0-9]+$' AND length("world_terrain_refinement_tile"."manual_protection")=256)
);
--> statement-breakpoint
CREATE TABLE "world_terrain_refinement_version" (
	"refinement_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"previous_revision" integer,
	"parent_revision" integer NOT NULL,
	"root_revision" integer NOT NULL,
	"restored_from_revision" integer,
	"request_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"source" jsonb NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_terrain_refinement_version_refinement_id_revision_pk" PRIMARY KEY("refinement_id","revision"),
	CONSTRAINT "world_terrain_refinement_version_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "world_terrain_refinement_version_identity_uq" UNIQUE("refinement_id","terrain_id","world_id","revision"),
	CONSTRAINT "world_terrain_refinement_version_valid" CHECK ("world_terrain_refinement_version"."revision">0 AND "world_terrain_refinement_version"."parent_revision">0 AND (("world_terrain_refinement_version"."revision"=1 AND "world_terrain_refinement_version"."previous_revision" IS NULL) OR ("world_terrain_refinement_version"."revision">1 AND "world_terrain_refinement_version"."previous_revision" IS NOT NULL AND "world_terrain_refinement_version"."previous_revision"="world_terrain_refinement_version"."revision"-1)) AND "world_terrain_refinement_version"."content_hash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("world_terrain_refinement_version"."source")='object' AND coalesce("world_terrain_refinement_version"."source"->>'kind' IN ('manual','regenerated'),false))
);
--> statement-breakpoint
ALTER TABLE "world_terrain_refinement" ADD CONSTRAINT "world_terrain_refinement_root_fk" FOREIGN KEY ("terrain_id","world_id") REFERENCES "public"."world_terrain"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_refinement" ADD CONSTRAINT "world_terrain_refinement_parent_fk" FOREIGN KEY ("parent_id","terrain_id","world_id") REFERENCES "public"."world_terrain_refinement"("id","terrain_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_tile" ADD CONSTRAINT "world_terrain_refinement_tile_version_fk" FOREIGN KEY ("refinement_id","terrain_id","world_id","revision") REFERENCES "public"."world_terrain_refinement_version"("refinement_id","terrain_id","world_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_version" ADD CONSTRAINT "world_terrain_refinement_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_version" ADD CONSTRAINT "world_terrain_refinement_version_surface_fk" FOREIGN KEY ("refinement_id","terrain_id","world_id") REFERENCES "public"."world_terrain_refinement"("id","terrain_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_version" ADD CONSTRAINT "world_terrain_refinement_version_previous_fk" FOREIGN KEY ("refinement_id","previous_revision") REFERENCES "public"."world_terrain_refinement_version"("refinement_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_version" ADD CONSTRAINT "world_terrain_refinement_version_restored_fk" FOREIGN KEY ("refinement_id","restored_from_revision") REFERENCES "public"."world_terrain_refinement_version"("refinement_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_terrain_refinement_parent_idx" ON "world_terrain_refinement" USING btree ("terrain_id","parent_id");
--> statement-breakpoint
CREATE FUNCTION world_terrain_refinement_frame_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root world_terrain%ROWTYPE; parent world_terrain_refinement%ROWTYPE;
  local_x double precision; parent_x double precision:=0; parent_y double precision:=0;
  parent_width double precision; parent_height double precision; parent_columns integer; parent_rows integer;
BEGIN
  SELECT * INTO root FROM world_terrain WHERE id=NEW.terrain_id AND world_id=NEW.world_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refinement root is unavailable'; END IF;
  parent_width:=root.width_metres; parent_height:=root.height_metres; parent_columns:=root.grid_width; parent_rows:=root.grid_height;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM world_terrain_refinement WHERE id=NEW.parent_id AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id;
    IF NOT FOUND OR NEW.detail_level<>parent.detail_level+1 OR NEW.parent_revision<>parent.revision THEN RAISE EXCEPTION 'Refinement must pin its current parent'; END IF;
    parent_x:=parent.x_metres; parent_y:=parent.y_metres; parent_width:=parent.width_metres; parent_height:=parent.height_metres; parent_columns:=parent.grid_width; parent_rows:=parent.grid_height;
  ELSIF NEW.detail_level<>1 OR NEW.parent_revision<>root.revision THEN RAISE EXCEPTION 'Refinement must pin its current root revision';
  END IF;
  local_x:=NEW.x_metres-parent_x;
  IF root.wrap_east_west THEN local_x:=local_x-floor(local_x/root.width_metres)*root.width_metres; END IF;
  IF NEW.x_metres>=root.width_metres OR NEW.y_metres+NEW.height_metres>root.height_metres OR NEW.width_metres>root.width_metres OR (NOT root.wrap_east_west AND NEW.x_metres+NEW.width_metres>root.width_metres)
    OR local_x<0 OR local_x+NEW.width_metres>parent_width+0.000001 OR NEW.y_metres<parent_y OR NEW.y_metres+NEW.height_metres>parent_y+parent_height+0.000001
    OR NEW.width_metres/NEW.grid_width>parent_width/parent_columns/2 OR NEW.height_metres/NEW.grid_height>parent_height/parent_rows/2
    THEN RAISE EXCEPTION 'Refinement needs contained bounds and genuinely finer samples on both axes'; END IF;
  IF (SELECT count(*) FROM world_terrain_refinement WHERE terrain_id=NEW.terrain_id)>=128 THEN RAISE EXCEPTION 'Terrain refinement limit reached'; END IF;
  IF EXISTS (SELECT 1 FROM world_terrain_refinement s CROSS JOIN generate_series(-1,1) shift
    WHERE s.terrain_id=NEW.terrain_id AND s.parent_id IS NOT DISTINCT FROM NEW.parent_id
    AND NEW.y_metres<s.y_metres+s.height_metres AND s.y_metres<NEW.y_metres+NEW.height_metres
    AND (root.wrap_east_west OR shift=0)
    AND NEW.x_metres<s.x_metres+shift*root.width_metres+s.width_metres AND s.x_metres+shift*root.width_metres<NEW.x_metres+NEW.width_metres)
    THEN RAISE EXCEPTION 'Sibling refinement coverage cannot overlap; adjacent boundaries are allowed'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_refinement_frame BEFORE INSERT ON world_terrain_refinement FOR EACH ROW EXECUTE FUNCTION world_terrain_refinement_frame_valid();
--> statement-breakpoint
CREATE FUNCTION world_terrain_refinement_head_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE level integer; levels integer; expected integer; actual integer;
BEGIN
  IF TG_OP='UPDATE' AND ((NEW.id,NEW.world_id,NEW.terrain_id,NEW.parent_id,NEW.parent_revision,NEW.detail_level,NEW.name,NEW.x_metres,NEW.y_metres,NEW.width_metres,NEW.height_metres,NEW.grid_width,NEW.grid_height,NEW.creation_hash,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.world_id,OLD.terrain_id,OLD.parent_id,OLD.parent_revision,OLD.detail_level,OLD.name,OLD.x_metres,OLD.y_metres,OLD.width_metres,OLD.height_metres,OLD.grid_width,OLD.grid_height,OLD.creation_hash,OLD.created_at) OR NEW.revision<>OLD.revision+1)
    THEN RAISE EXCEPTION 'Refinement identity and coverage are immutable; accepted heads advance one revision'; END IF;
  IF NOT EXISTS(SELECT 1 FROM world_terrain_refinement_version WHERE refinement_id=NEW.id AND revision=NEW.revision AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id AND parent_revision=NEW.parent_revision)
    THEN RAISE EXCEPTION 'Refinement head needs a complete accepted version'; END IF;
  levels:=round(log(2,least(NEW.grid_width,NEW.grid_height)/32::numeric));
  FOR level IN 0..levels LOOP
    expected:=(NEW.grid_width/(2^level)::integer/32)*(NEW.grid_height/(2^level)::integer/32);
    SELECT count(*) INTO actual FROM (SELECT DISTINCT tile_x,tile_y FROM world_terrain_refinement_tile WHERE refinement_id=NEW.id AND lod=level AND revision<=NEW.revision) tiles;
    IF actual<>expected THEN RAISE EXCEPTION 'Refinement numerical pyramid is incomplete'; END IF;
  END LOOP;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_terrain_refinement_complete_head AFTER INSERT OR UPDATE ON world_terrain_refinement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_terrain_refinement_head_valid();
--> statement-breakpoint
CREATE FUNCTION world_terrain_refinement_version_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE surface world_terrain_refinement%ROWTYPE;
BEGIN
  SELECT * INTO surface FROM world_terrain_refinement WHERE id=NEW.refinement_id AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id;
  IF NOT FOUND OR NEW.parent_revision<>surface.parent_revision THEN RAISE EXCEPTION 'Refinement version must retain its exact pinned parent'; END IF;
  IF surface.parent_id IS NULL THEN
    IF NOT EXISTS(SELECT 1 FROM world_terrain_version WHERE terrain_id=surface.terrain_id AND world_id=surface.world_id AND revision=NEW.parent_revision) THEN RAISE EXCEPTION 'Missing root revision'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM world_terrain_refinement_version WHERE refinement_id=surface.parent_id AND terrain_id=surface.terrain_id AND world_id=surface.world_id AND revision=NEW.parent_revision) THEN RAISE EXCEPTION 'Missing refinement parent revision'; END IF;
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_refinement_version_parent BEFORE INSERT ON world_terrain_refinement_version FOR EACH ROW EXECUTE FUNCTION world_terrain_refinement_version_valid();
--> statement-breakpoint
CREATE FUNCTION world_terrain_refinement_tile_bounds_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM world_terrain_refinement r WHERE r.id=NEW.refinement_id AND r.terrain_id=NEW.terrain_id AND r.world_id=NEW.world_id
    AND NEW.lod<=round(log(2,least(r.grid_width,r.grid_height)/32::numeric)) AND NEW.tile_x<r.grid_width/(2^NEW.lod)::integer/32 AND NEW.tile_y<r.grid_height/(2^NEW.lod)::integer/32)
    THEN RAISE EXCEPTION 'Refinement tile is outside its numerical level'; END IF;
  IF current_setting('serrian.refinement_guard',true) IS DISTINCT FROM NEW.refinement_id AND EXISTS(SELECT 1 FROM world_terrain_refinement WHERE parent_id=NEW.refinement_id)
    THEN RAISE EXCEPTION 'A refinement with finer children requires the checked refinement writer'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_refinement_tile_bounds BEFORE INSERT ON world_terrain_refinement_tile FOR EACH ROW EXECUTE FUNCTION world_terrain_refinement_tile_bounds_valid();
--> statement-breakpoint
CREATE TRIGGER world_terrain_refinement_version_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_terrain_refinement_version FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE TRIGGER world_terrain_refinement_tile_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_terrain_refinement_tile FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_terrain_refinement_legacy_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('serrian.refinement_guard',true) IS DISTINCT FROM NEW.terrain_id AND EXISTS(SELECT 1 FROM world_terrain_refinement WHERE terrain_id=NEW.terrain_id)
    THEN RAISE EXCEPTION 'Terrain with refinements requires a checked multiresolution writer'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_refinement_parent_write_guard BEFORE INSERT ON world_terrain_tile FOR EACH ROW EXECUTE FUNCTION world_terrain_refinement_legacy_write_guard();

--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_version" ADD CONSTRAINT "world_terrain_refinement_version_root_fk" FOREIGN KEY ("terrain_id","world_id","root_revision") REFERENCES "public"."world_terrain_version"("terrain_id","world_id","revision") ON DELETE restrict ON UPDATE no action;
