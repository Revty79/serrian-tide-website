CREATE TABLE world_terrain_relief_group (
 id text PRIMARY KEY,
 world_id text NOT NULL,
 terrain_id text NOT NULL,
 map_id text NOT NULL,
 map_purpose text NOT NULL DEFAULT 'world' CHECK (map_purpose='world'),
 action text NOT NULL CHECK (action IN ('apply','undo','redo')),
 target_id text,
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 context_pin text NOT NULL CHECK (context_pin ~ '^[a-f0-9]{64}$'),
 preview_hash text NOT NULL CHECK (preview_hash ~ '^[a-f0-9]{64}$'),
 sea_level integer NOT NULL CHECK (sea_level BETWEEN -30000 AND 30000),
 operation jsonb NOT NULL CHECK (jsonb_typeof(operation)='object' AND coalesce(operation->>'kind','')='landform-profile'),
 work_area jsonb NOT NULL CHECK (jsonb_typeof(work_area)='object'),
 before_state jsonb NOT NULL CHECK (jsonb_typeof(before_state)='array' AND jsonb_array_length(before_state) BETWEEN 1 AND 129),
 after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state)='array' AND jsonb_array_length(after_state) BETWEEN 1 AND 129),
 effects jsonb NOT NULL CHECK (jsonb_typeof(effects)='array'),
 author_id text NOT NULL,
 created_at timestamp NOT NULL DEFAULT now(),
 CONSTRAINT world_relief_group_world_identity UNIQUE(id,terrain_id,world_id),
 CONSTRAINT world_terrain_relief_group_author_id_user_id_fk FOREIGN KEY(author_id) REFERENCES public."user"(id) ON DELETE RESTRICT,
 CONSTRAINT world_relief_group_root_fk FOREIGN KEY(terrain_id,world_id) REFERENCES world_terrain(id,world_id) ON DELETE RESTRICT,
 CONSTRAINT world_relief_group_map_fk FOREIGN KEY(map_id,world_id,terrain_id,map_purpose) REFERENCES world_map_canvas(map_id,world_id,terrain_id,purpose) ON DELETE RESTRICT,
 CONSTRAINT world_relief_group_target_fk FOREIGN KEY(target_id,terrain_id,world_id) REFERENCES world_terrain_relief_group(id,terrain_id,world_id) ON DELETE RESTRICT,
 CONSTRAINT world_relief_group_action_target CHECK ((action='apply' AND target_id IS NULL) OR (action IN ('undo','redo') AND target_id IS NOT NULL)),
 CONSTRAINT world_relief_group_metadata_bound CHECK (octet_length(operation::text)+octet_length(work_area::text)+octet_length(before_state::text)+octet_length(after_state::text)+octet_length(effects::text)<=250000)
);
--> statement-breakpoint
CREATE INDEX world_relief_group_history_idx ON world_terrain_relief_group(terrain_id,created_at DESC NULLS LAST,id);
--> statement-breakpoint
CREATE TRIGGER world_relief_group_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_terrain_relief_group FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_relief_state_matches(state jsonb,terrain text,world_identity text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE item jsonb; root world_terrain%ROWTYPE; detail world_terrain_refinement%ROWTYPE; accepted_hash text; total integer;
BEGIN
 SELECT * INTO root FROM world_terrain WHERE id=terrain AND world_id=world_identity;
 IF NOT FOUND OR jsonb_typeof(state) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 SELECT count(*)+1 INTO total FROM world_terrain_refinement WHERE terrain_id=terrain AND world_id=world_identity;
 IF jsonb_array_length(state)<>total OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(state))<>total THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state) e WHERE e->>'id'=terrain) THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(state) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['id','revision','parentId','parentRevision','level','frame','columns','rows','contentHash'])
   OR jsonb_typeof(item->'revision') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'level') IS DISTINCT FROM 'number'
   OR jsonb_typeof(item->'columns') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'rows') IS DISTINCT FROM 'number'
   OR NOT coalesce((item->>'contentHash') ~ '^[a-f0-9]{64}$',false) OR jsonb_typeof(item->'frame') IS DISTINCT FROM 'object'
   OR NOT ((item->'frame') ?& ARRAY['x','y','width','height'])
   OR jsonb_typeof(item#>'{frame,x}') IS DISTINCT FROM 'number' OR jsonb_typeof(item#>'{frame,y}') IS DISTINCT FROM 'number'
   OR jsonb_typeof(item#>'{frame,width}') IS DISTINCT FROM 'number' OR jsonb_typeof(item#>'{frame,height}') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  IF item->>'id'=terrain THEN
   SELECT content_hash INTO accepted_hash FROM world_terrain_version WHERE terrain_id=terrain AND world_id=world_identity AND revision=root.revision;
   IF (item->>'revision')::integer<>root.revision OR item->>'parentId' IS NOT NULL OR item->>'parentRevision' IS NOT NULL OR (item->>'level')::integer<>0
    OR (item->>'columns')::integer<>root.grid_width OR (item->>'rows')::integer<>root.grid_height OR (item->>'contentHash') IS DISTINCT FROM accepted_hash
    OR (item#>>'{frame,x}')::double precision<>0 OR (item#>>'{frame,y}')::double precision<>0
    OR (item#>>'{frame,width}')::double precision<>root.width_metres OR (item#>>'{frame,height}')::double precision<>root.height_metres THEN RETURN false; END IF;
  ELSE
   IF jsonb_typeof(item->'parentRevision') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
   SELECT * INTO detail FROM world_terrain_refinement WHERE id=item->>'id' AND terrain_id=terrain AND world_id=world_identity;
   IF NOT FOUND THEN RETURN false; END IF;
   SELECT content_hash INTO accepted_hash FROM world_terrain_refinement_version WHERE refinement_id=detail.id AND world_id=world_identity AND revision=detail.revision;
   IF (item->>'revision')::integer<>detail.revision OR (item->>'parentId') IS DISTINCT FROM detail.parent_id OR (item->>'parentRevision')::integer<>detail.parent_revision OR (item->>'level')::integer<>detail.detail_level
    OR (item->>'columns')::integer<>detail.grid_width OR (item->>'rows')::integer<>detail.grid_height OR (item->>'contentHash') IS DISTINCT FROM accepted_hash
    OR (item#>>'{frame,x}')::double precision<>detail.x_metres OR (item#>>'{frame,y}')::double precision<>detail.y_metres
    OR (item#>>'{frame,width}')::double precision<>detail.width_metres OR (item#>>'{frame,height}')::double precision<>detail.height_metres THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
END; $$;
--> statement-breakpoint
CREATE FUNCTION world_relief_group_insert_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root world_terrain%ROWTYPE;
BEGIN
 IF current_setting('serrian.shared_relief_group',true) IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'Shared relief requires its checked atomic writer'; END IF;
 SELECT * INTO root FROM world_terrain WHERE id=NEW.terrain_id AND world_id=NEW.world_id FOR UPDATE;
 IF NOT FOUND OR root.sea_level<>NEW.sea_level OR NOT world_relief_state_matches(NEW.before_state,NEW.terrain_id,NEW.world_id) THEN RAISE EXCEPTION 'Shared relief must retain the complete current accepted source vector'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_relief_group_insert BEFORE INSERT ON world_terrain_relief_group FOR EACH ROW EXECUTE FUNCTION world_relief_group_insert_valid();
--> statement-breakpoint
CREATE FUNCTION world_relief_group_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior jsonb; accepted jsonb; recorded jsonb; parent_revision integer; root world_terrain%ROWTYPE; target world_terrain_relief_group%ROWTYPE;
BEGIN
 SELECT * INTO root FROM world_terrain WHERE id=NEW.terrain_id AND world_id=NEW.world_id;
 IF NOT FOUND OR root.sea_level<>NEW.sea_level OR NOT world_relief_state_matches(NEW.after_state,NEW.terrain_id,NEW.world_id) THEN RAISE EXCEPTION 'Shared relief cannot publish a partial source vector'; END IF;
 IF NEW.action<>'apply' THEN
  SELECT * INTO target FROM world_terrain_relief_group WHERE id=NEW.target_id AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id AND map_id=NEW.map_id;
  IF NOT FOUND OR target.after_state IS DISTINCT FROM NEW.before_state OR (NEW.action='undo' AND target.action NOT IN ('apply','redo')) OR (NEW.action='redo' AND target.action<>'undo') THEN RAISE EXCEPTION 'Shared relief history must invert the exact last accepted group'; END IF;
 END IF;
 FOR prior IN SELECT value FROM jsonb_array_elements(NEW.before_state) LOOP
  SELECT value INTO accepted FROM jsonb_array_elements(NEW.after_state) WHERE value->>'id'=prior->>'id';
  IF accepted IS NULL THEN RAISE EXCEPTION 'Shared relief must preserve every existing source identity'; END IF;
  IF (accepted->>'revision')::integer=(prior->>'revision')::integer THEN
   IF accepted IS DISTINCT FROM prior OR prior->>'id'=NEW.terrain_id THEN RAISE EXCEPTION 'Unchanged relief sources must retain their exact accepted state'; END IF;
   CONTINUE;
  END IF;
  IF (accepted->>'revision')::integer<>(prior->>'revision')::integer+1 OR (accepted->'frame',accepted->'columns',accepted->'rows',accepted->'parentId',accepted->'level') IS DISTINCT FROM (prior->'frame',prior->'columns',prior->'rows',prior->'parentId',prior->'level') THEN RAISE EXCEPTION 'Shared relief advances heads without replacing coverage or native resolution'; END IF;
  IF prior->>'id'=NEW.terrain_id THEN
   SELECT source INTO recorded FROM world_terrain_version WHERE terrain_id=NEW.terrain_id AND world_id=NEW.world_id AND revision=root.revision AND request_id=NEW.id AND author_id=NEW.author_id;
  ELSE
   SELECT source INTO recorded FROM world_terrain_refinement_version WHERE refinement_id=prior->>'id' AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id AND revision=(accepted->>'revision')::integer AND author_id=NEW.author_id;
   IF NEW.action='apply' THEN
    IF accepted->>'parentId' IS NULL THEN parent_revision:=root.revision; ELSE SELECT revision INTO parent_revision FROM world_terrain_refinement WHERE id=accepted->>'parentId' AND terrain_id=NEW.terrain_id AND world_id=NEW.world_id; END IF;
   ELSE
    SELECT (value->>'parentRevision')::integer INTO parent_revision FROM jsonb_array_elements(target.before_state) WHERE value->>'id'=prior->>'id';
   END IF;
   IF (accepted->>'parentRevision')::integer IS DISTINCT FROM parent_revision THEN RAISE EXCEPTION 'A shared relief revision must pin its accepted parent context'; END IF;
  END IF;
  IF recorded IS NULL OR recorded->>'kind'<>'manual' OR recorded#>>'{sharedRelief,groupId}' IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'Every advanced shared head needs its matching immutable native group receipt'; END IF;
 END LOOP;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_relief_group_atomic AFTER INSERT ON world_terrain_relief_group DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_relief_group_complete();
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
 IF (NEW.x_metres,NEW.y_metres,NEW.width_metres,NEW.height_metres,NEW.grid_width,NEW.grid_height)
  IS NOT DISTINCT FROM (OLD.x_metres,OLD.y_metres,OLD.width_metres,OLD.height_metres,OLD.grid_width,OLD.grid_height) THEN
  IF NOT EXISTS(SELECT 1 FROM world_terrain_relief_group g CROSS JOIN LATERAL jsonb_array_elements(g.after_state) e
   WHERE g.id=current_setting('serrian.shared_relief_group',true) AND g.terrain_id=NEW.terrain_id AND g.world_id=NEW.world_id
    AND e->>'id'=NEW.id AND (e->>'revision')::integer=NEW.revision AND (e->>'parentRevision')::integer=NEW.parent_revision
    AND e->'frame'=jsonb_build_object('x',NEW.x_metres,'y',NEW.y_metres,'width',NEW.width_metres,'height',NEW.height_metres)
    AND (e->>'columns')::integer=NEW.grid_width AND (e->>'rows')::integer=NEW.grid_height)
   THEN RAISE EXCEPTION 'Same-frame context changes require the complete checked shared relief group'; END IF;
  RETURN NEW;
 END IF;
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

--> statement-breakpoint
CREATE FUNCTION world_native_shared_relief_schema() RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true';
