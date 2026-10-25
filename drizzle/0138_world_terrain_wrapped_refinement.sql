-- A full-width wrapped parent contains seam-crossing physical coverage.
-- Preserve published 0137 and correct only its insertion validator.
CREATE OR REPLACE FUNCTION world_terrain_refinement_frame_valid() RETURNS trigger LANGUAGE plpgsql AS $$
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
    OR (NOT (root.wrap_east_west AND parent_width>=root.width_metres) AND (local_x<0 OR local_x+NEW.width_metres>parent_width+0.000001)) OR NEW.y_metres<parent_y OR NEW.y_metres+NEW.height_metres>parent_y+parent_height+0.000001
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
