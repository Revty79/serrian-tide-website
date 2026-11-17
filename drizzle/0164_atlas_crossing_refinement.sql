-- Explicit, pinned World-base inheritance across existing finer coverage.
-- No source, history row, numerical tile, capacity or table definition changes.
CREATE FUNCTION world_refinement_crossing_schema() RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true';
--> statement-breakpoint
-- A full-width wrapped parent contains seam-crossing physical coverage.
-- Preserve published 0137 and correct only its insertion validator.
CREATE OR REPLACE FUNCTION world_terrain_refinement_frame_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root world_terrain%ROWTYPE; parent world_terrain_refinement%ROWTYPE;
  local_x double precision; parent_x double precision:=0; parent_y double precision:=0;
  crossing boolean; overlap_level integer;
  parent_width double precision; parent_height double precision; parent_columns integer; parent_rows integer;
BEGIN
  SELECT * INTO root FROM world_terrain WHERE id=NEW.terrain_id AND world_id=NEW.world_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refinement root is unavailable'; END IF;
  parent_width:=root.width_metres; parent_height:=root.height_metres; parent_columns:=root.grid_width; parent_rows:=root.grid_height;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM world_terrain_refinement WHERE id=NEW.parent_id AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id;
    IF NOT FOUND OR NEW.detail_level<>parent.detail_level+1 OR NEW.parent_revision<>parent.revision THEN RAISE EXCEPTION 'Refinement must pin its current parent'; END IF;
    parent_x:=parent.x_metres; parent_y:=parent.y_metres; parent_width:=parent.width_metres; parent_height:=parent.height_metres; parent_columns:=parent.grid_width; parent_rows:=parent.grid_height;
  ELSE
    IF NEW.parent_revision<>root.revision THEN RAISE EXCEPTION 'Refinement must pin its current root revision'; END IF;
    crossing:=NEW.detail_level>1;
    IF crossing AND current_setting('serrian.refinement_crossing',true) IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'Crossing coverage requires the checked visible writer'; END IF;
    IF NOT crossing AND NEW.detail_level<>1 THEN RAISE EXCEPTION 'Root detail must begin at level one'; END IF;
  END IF;
  local_x:=NEW.x_metres-parent_x;
  IF root.wrap_east_west THEN local_x:=local_x-floor(local_x/root.width_metres)*root.width_metres; END IF;
  IF NEW.x_metres>=root.width_metres OR NEW.y_metres+NEW.height_metres>root.height_metres OR NEW.width_metres>root.width_metres OR (NOT root.wrap_east_west AND NEW.x_metres+NEW.width_metres>root.width_metres)
    OR (NOT (root.wrap_east_west AND parent_width>=root.width_metres) AND (local_x<0 OR local_x+NEW.width_metres>parent_width+0.000001)) OR NEW.y_metres<parent_y OR NEW.y_metres+NEW.height_metres>parent_y+parent_height+0.000001
    OR NEW.width_metres/NEW.grid_width>parent_width/parent_columns/2 OR NEW.height_metres/NEW.grid_height>parent_height/parent_rows/2
    THEN RAISE EXCEPTION 'Refinement needs contained bounds and genuinely finer samples on both axes'; END IF;
  IF (SELECT count(*) FROM world_terrain_refinement WHERE terrain_id=NEW.terrain_id)>=128 THEN RAISE EXCEPTION 'Terrain refinement limit reached'; END IF;
  IF EXISTS (SELECT 1 FROM world_terrain_refinement s CROSS JOIN generate_series(-1,1) shift
    WHERE s.terrain_id=NEW.terrain_id AND (CASE WHEN crossing IS TRUE THEN s.detail_level>=NEW.detail_level ELSE s.parent_id IS NOT DISTINCT FROM NEW.parent_id OR s.detail_level>=NEW.detail_level END)
    AND NEW.y_metres<s.y_metres+s.height_metres AND s.y_metres<NEW.y_metres+NEW.height_metres
    AND (root.wrap_east_west OR shift=0)
    AND NEW.x_metres<s.x_metres+shift*root.width_metres+s.width_metres AND s.x_metres+shift*root.width_metres<NEW.x_metres+NEW.width_metres)
    THEN RAISE EXCEPTION 'Sibling refinement coverage cannot overlap; adjacent boundaries are allowed'; END IF;
  IF crossing IS TRUE THEN
    SELECT max(s.detail_level) INTO overlap_level FROM world_terrain_refinement s CROSS JOIN generate_series(-1,1) shift
      WHERE s.terrain_id=NEW.terrain_id AND NEW.y_metres<s.y_metres+s.height_metres AND s.y_metres<NEW.y_metres+NEW.height_metres
      AND (root.wrap_east_west OR shift=0) AND NEW.x_metres<s.x_metres+shift*root.width_metres+s.width_metres AND s.x_metres+shift*root.width_metres<NEW.x_metres+NEW.width_metres;
    IF overlap_level IS NULL OR NEW.detail_level<>overlap_level+1 THEN RAISE EXCEPTION 'Crossing coverage must immediately refine its overlapping areas'; END IF;
    IF EXISTS (SELECT 1 FROM world_terrain_refinement s CROSS JOIN generate_series(-1,1) shift
      WHERE s.terrain_id=NEW.terrain_id AND NEW.y_metres<s.y_metres+s.height_metres AND s.y_metres<NEW.y_metres+NEW.height_metres
      AND (root.wrap_east_west OR shift=0) AND NEW.x_metres<s.x_metres+shift*root.width_metres+s.width_metres AND s.x_metres+shift*root.width_metres<NEW.x_metres+NEW.width_metres
      AND (NEW.width_metres/NEW.grid_width>s.width_metres/s.grid_width/2 OR NEW.height_metres/NEW.grid_height>s.height_metres/s.grid_height/2))
      THEN RAISE EXCEPTION 'Crossing coverage must be genuinely finer on both axes'; END IF;
  END IF;
  RETURN NEW;
END; $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_refinement_expand_valid() RETURNS trigger LANGUAGE plpgsql AS $$
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
  WHERE s.terrain_id=NEW.terrain_id AND s.id<>NEW.id AND (CASE WHEN NEW.parent_id IS NULL AND NEW.detail_level>1 THEN s.detail_level=NEW.detail_level ELSE s.parent_id IS NOT DISTINCT FROM NEW.parent_id OR s.detail_level=NEW.detail_level END)
  AND NEW.y_metres<s.y_metres+s.height_metres AND s.y_metres<NEW.y_metres+NEW.height_metres AND (root.wrap_east_west OR shift=0)
  AND NEW.x_metres<s.x_metres+shift*root.width_metres+s.width_metres AND s.x_metres+shift*root.width_metres<NEW.x_metres+NEW.width_metres)
  THEN RAISE EXCEPTION 'Sibling refinement coverage cannot overlap'; END IF;
 RETURN NEW;
END; $$;
