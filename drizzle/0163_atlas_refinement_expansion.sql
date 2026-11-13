CREATE TABLE "world_terrain_refinement_geometry" (
	"refinement_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"world_id" text NOT NULL,
	"from_revision" integer NOT NULL,
	"parent_revision" integer NOT NULL,
	"x_metres" double precision NOT NULL,
	"y_metres" double precision NOT NULL,
	"width_metres" double precision NOT NULL,
	"height_metres" double precision NOT NULL,
	"grid_width" integer NOT NULL,
	"grid_height" integer NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_terrain_refinement_geometry_refinement_id_from_revision_pk" PRIMARY KEY("refinement_id","from_revision"),
	CONSTRAINT "world_refinement_geometry_valid" CHECK ("world_terrain_refinement_geometry"."from_revision">0 AND "world_terrain_refinement_geometry"."parent_revision">0 AND "world_terrain_refinement_geometry"."x_metres">=0 AND "world_terrain_refinement_geometry"."x_metres"<1000000000 AND "world_terrain_refinement_geometry"."y_metres">=0 AND "world_terrain_refinement_geometry"."y_metres"<1000000000 AND "world_terrain_refinement_geometry"."width_metres" BETWEEN 100 AND 1000000000 AND "world_terrain_refinement_geometry"."height_metres" BETWEEN 100 AND 1000000000 AND "world_terrain_refinement_geometry"."grid_width" IN (32,64,128,256,512,1024,2048,4096) AND "world_terrain_refinement_geometry"."grid_height" IN (32,64,128,256,512,1024,2048,4096))
);
--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_geometry" ADD CONSTRAINT "world_refinement_geometry_version_fk" FOREIGN KEY ("refinement_id","from_revision","terrain_id","world_id") REFERENCES "public"."world_terrain_refinement_version"("refinement_id","revision","terrain_id","world_id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION world_refinement_geometry_insert_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE surface world_terrain_refinement%ROWTYPE;
BEGIN
 IF current_setting('serrian.refinement_expand',true) IS DISTINCT FROM NEW.refinement_id THEN RAISE EXCEPTION 'Geometry transitions require the checked coverage writer'; END IF;
 SELECT * INTO surface FROM world_terrain_refinement WHERE id=NEW.refinement_id AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Retained detail is unavailable'; END IF;
 IF NEW.from_revision=1 THEN
  IF (NEW.parent_revision,NEW.x_metres,NEW.y_metres,NEW.width_metres,NEW.height_metres,NEW.grid_width,NEW.grid_height)
   IS DISTINCT FROM (surface.parent_revision,surface.x_metres,surface.y_metres,surface.width_metres,surface.height_metres,surface.grid_width,surface.grid_height)
   THEN RAISE EXCEPTION 'The original geometry must match the accepted detail exactly'; END IF;
 ELSIF NEW.from_revision<>surface.revision+1 OR NOT EXISTS(SELECT 1 FROM world_terrain_refinement_geometry WHERE refinement_id=NEW.refinement_id AND from_revision=1) THEN
  RAISE EXCEPTION 'Geometry transitions advance the current detail and retain its original geometry';
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_refinement_geometry_insert BEFORE INSERT ON world_terrain_refinement_geometry FOR EACH ROW EXECUTE FUNCTION world_refinement_geometry_insert_valid();
--> statement-breakpoint
CREATE TRIGGER world_refinement_geometry_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_terrain_refinement_geometry FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_refinement_expand_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root world_terrain%ROWTYPE; parent world_terrain_refinement%ROWTYPE; retained world_terrain_refinement_geometry%ROWTYPE;
 parent_x double precision:=0; parent_y double precision:=0; parent_width double precision; parent_height double precision; parent_columns integer; parent_rows integer;
 dx double precision; dy double precision; offset_x double precision; offset_y double precision; local_x double precision;
BEGIN
 IF (NEW.parent_revision,NEW.x_metres,NEW.y_metres,NEW.width_metres,NEW.height_metres,NEW.grid_width,NEW.grid_height)
  IS NOT DISTINCT FROM (OLD.parent_revision,OLD.x_metres,OLD.y_metres,OLD.width_metres,OLD.height_metres,OLD.grid_width,OLD.grid_height) THEN RETURN NEW; END IF;
 IF current_setting('serrian.refinement_expand',true) IS DISTINCT FROM NEW.id OR NEW.revision<>OLD.revision+1
  OR (NEW.id,NEW.world_id,NEW.terrain_id,NEW.parent_id,NEW.detail_level,NEW.name,NEW.creation_hash,NEW.created_at)
  IS DISTINCT FROM (OLD.id,OLD.world_id,OLD.terrain_id,OLD.parent_id,OLD.detail_level,OLD.name,OLD.creation_hash,OLD.created_at)
  THEN RAISE EXCEPTION 'Immutable detail identity can only gain checked coverage'; END IF;
 SELECT * INTO retained FROM world_terrain_refinement_geometry WHERE refinement_id=OLD.id AND from_revision<=OLD.revision ORDER BY from_revision DESC LIMIT 1;
 IF NOT FOUND OR (retained.parent_revision,retained.x_metres,retained.y_metres,retained.width_metres,retained.height_metres,retained.grid_width,retained.grid_height)
  IS DISTINCT FROM (OLD.parent_revision,OLD.x_metres,OLD.y_metres,OLD.width_metres,OLD.height_metres,OLD.grid_width,OLD.grid_height)
  THEN RAISE EXCEPTION 'Retain the exact previous geometry before extending coverage'; END IF;
 IF NOT EXISTS(SELECT 1 FROM world_terrain_refinement_geometry g WHERE g.refinement_id=NEW.id AND g.from_revision=NEW.revision
  AND (g.parent_revision,g.x_metres,g.y_metres,g.width_metres,g.height_metres,g.grid_width,g.grid_height)
  IS NOT DISTINCT FROM (NEW.parent_revision,NEW.x_metres,NEW.y_metres,NEW.width_metres,NEW.height_metres,NEW.grid_width,NEW.grid_height))
  THEN RAISE EXCEPTION 'Coverage needs its exact immutable geometry transition'; END IF;
 IF NEW.grid_width<OLD.grid_width OR NEW.grid_height<OLD.grid_height OR (NEW.grid_width=OLD.grid_width AND NEW.grid_height=OLD.grid_height)
  THEN RAISE EXCEPTION 'Coverage must grow without reducing either existing axis'; END IF;
 dx:=OLD.width_metres/OLD.grid_width; dy:=OLD.height_metres/OLD.grid_height;
 IF abs(NEW.width_metres/NEW.grid_width-dx)>dx*0.0000000001 OR abs(NEW.height_metres/NEW.grid_height-dy)>dy*0.0000000001
  THEN RAISE EXCEPTION 'Coverage must retain the accepted numerical spacing'; END IF;
 SELECT * INTO root FROM world_terrain WHERE id=NEW.terrain_id AND world_id=NEW.world_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refinement root is unavailable'; END IF;
 offset_x:=OLD.x_metres-NEW.x_metres; IF root.wrap_east_west THEN offset_x:=offset_x-floor(offset_x/root.width_metres)*root.width_metres; END IF;
 offset_x:=offset_x/dx; offset_y:=(OLD.y_metres-NEW.y_metres)/dy;
 IF offset_x<0 OR offset_y<0 OR offset_x+OLD.grid_width>NEW.grid_width+0.000001 OR offset_y+OLD.grid_height>NEW.grid_height+0.000001
  OR abs(offset_x-round(offset_x))>0.000001 OR abs(offset_y-round(offset_y))>0.000001 OR mod(round(offset_x)::integer,32)<>0 OR mod(round(offset_y)::integer,32)<>0
  THEN RAISE EXCEPTION 'The complete accepted grid must remain aligned to its original samples'; END IF;
 parent_width:=root.width_metres; parent_height:=root.height_metres; parent_columns:=root.grid_width; parent_rows:=root.grid_height;
 IF NEW.parent_id IS NULL THEN
  IF NEW.parent_revision<>root.revision THEN RAISE EXCEPTION 'Extension must pin the current root'; END IF;
 ELSE
  SELECT * INTO parent FROM world_terrain_refinement WHERE id=NEW.parent_id AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id FOR UPDATE;
  IF NOT FOUND OR NEW.parent_revision<>parent.revision THEN RAISE EXCEPTION 'Extension must pin the current parent'; END IF;
  parent_x:=parent.x_metres; parent_y:=parent.y_metres; parent_width:=parent.width_metres; parent_height:=parent.height_metres; parent_columns:=parent.grid_width; parent_rows:=parent.grid_height;
 END IF;
 local_x:=NEW.x_metres-parent_x; IF root.wrap_east_west THEN local_x:=local_x-floor(local_x/root.width_metres)*root.width_metres; END IF;
 IF NEW.x_metres>=root.width_metres OR NEW.y_metres+NEW.height_metres>root.height_metres OR NEW.width_metres>root.width_metres OR (NOT root.wrap_east_west AND NEW.x_metres+NEW.width_metres>root.width_metres)
  OR (NOT (root.wrap_east_west AND parent_width>=root.width_metres) AND (local_x<0 OR local_x+NEW.width_metres>parent_width+0.000001)) OR NEW.y_metres<parent_y OR NEW.y_metres+NEW.height_metres>parent_y+parent_height+0.000001
  OR NEW.width_metres/NEW.grid_width>parent_width/parent_columns/2 OR NEW.height_metres/NEW.grid_height>parent_height/parent_rows/2
  THEN RAISE EXCEPTION 'Extended coverage needs contained bounds and genuinely finer samples'; END IF;
 IF EXISTS(SELECT 1 FROM world_terrain_refinement s CROSS JOIN generate_series(-1,1) shift
  WHERE s.terrain_id=NEW.terrain_id AND s.id<>NEW.id AND s.parent_id IS NOT DISTINCT FROM NEW.parent_id
  AND NEW.y_metres<s.y_metres+s.height_metres AND s.y_metres<NEW.y_metres+NEW.height_metres AND (root.wrap_east_west OR shift=0)
  AND NEW.x_metres<s.x_metres+shift*root.width_metres+s.width_metres AND s.x_metres+shift*root.width_metres<NEW.x_metres+NEW.width_metres)
  THEN RAISE EXCEPTION 'Sibling refinement coverage cannot overlap'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_refinement_expand BEFORE UPDATE ON world_terrain_refinement FOR EACH ROW EXECUTE FUNCTION world_refinement_expand_valid();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_terrain_refinement_head_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE level integer; levels integer; expected integer; actual integer;
BEGIN
 IF TG_OP='UPDATE' AND ((NEW.id,NEW.world_id,NEW.terrain_id,NEW.parent_id,NEW.detail_level,NEW.name,NEW.creation_hash,NEW.created_at)
  IS DISTINCT FROM (OLD.id,OLD.world_id,OLD.terrain_id,OLD.parent_id,OLD.detail_level,OLD.name,OLD.creation_hash,OLD.created_at) OR NEW.revision<>OLD.revision+1)
  THEN RAISE EXCEPTION 'Refinement identity is immutable; accepted heads advance one revision'; END IF;
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
