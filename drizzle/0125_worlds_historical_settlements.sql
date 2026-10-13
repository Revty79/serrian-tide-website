ALTER TABLE "world_map_state_object" DROP CONSTRAINT IF EXISTS "map_state_object_valid";--> statement-breakpoint
ALTER TABLE "world_map_state_object" ADD CONSTRAINT "map_state_object_valid" CHECK ("world_map_state_object"."kind" IN ('feature','terrain','path','symbol','label','settlement-area','settlement-line','settlement-marker') AND ("world_map_state_object"."kind" NOT IN ('feature','settlement-area','settlement-line','settlement-marker') OR "world_map_state_object"."geography_id" IS NOT NULL));
--> statement-breakpoint
-- Preserve the published generic validator unchanged; this rename is safe on reapplication.
DO $$ BEGIN
 IF to_regprocedure('world_map_state_generic_payload_valid(jsonb)') IS NULL THEN
  ALTER FUNCTION world_map_state_payload_valid(jsonb) RENAME TO world_map_state_generic_payload_valid;
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_settlement_base_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; ids text[] := '{}'; points integer := 0;
BEGIN
 IF coalesce(jsonb_typeof(p->'name')='string' AND jsonb_typeof(p->'description')='string' AND jsonb_typeof(p->'scope')='string' AND jsonb_typeof(p->'features')='array' AND jsonb_typeof(p->'drawings')='array' AND jsonb_typeof(p->'geographies')='array',false) IS NOT TRUE THEN RETURN false; END IF;
 IF jsonb_typeof(p)<>'object' OR length(trim(p->>'name')) NOT BETWEEN 1 AND 160 OR length(p->>'description')>12000
 OR p->>'scope' NOT IN ('world','continent','regional','local') OR jsonb_typeof(p->'features')<>'array'
 OR jsonb_array_length(p->'features')>128 OR jsonb_typeof(p->'drawings')<>'array' OR jsonb_array_length(p->'drawings')>512
 OR jsonb_typeof(p->'geographies')<>'array' OR jsonb_array_length(p->'geographies')>4129
 OR world_atlas_presentation_valid(p->'presentation') IS NOT TRUE THEN RETURN false; END IF;
 IF NOT p ?& ARRAY['name','description','scope','features','drawings','geographies','presentation']
 OR p - ARRAY['name','description','scope','features','drawings','geographies','presentation'] <> '{}'::jsonb THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'features') LOOP
  IF item->>'id'=ANY(ids) OR world_atlas_geometry_valid(item->'geometry') IS NOT TRUE
  OR jsonb_typeof(item->'archived')<>'boolean' OR item->>'geographyId' IS NULL THEN RETURN false; END IF;
  ids:=array_append(ids,item->>'id');
  points:=points+CASE WHEN item->'geometry'->>'type'='polygon' THEN jsonb_array_length(item->'geometry'->'points') ELSE 1 END;
 END LOOP;
 IF points>8192 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'drawings') LOOP
  IF item->>'id'=ANY(ids) OR world_atlas_drawing_valid(item) IS NOT TRUE THEN RETURN false; END IF;
  ids:=array_append(ids,item->>'id');
 END LOOP;
 ids:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(p->'geographies') LOOP
  IF coalesce(jsonb_typeof(item->'id')='string' AND jsonb_typeof(item->'name')='string' AND jsonb_typeof(item->'description')='string' AND length(trim(item->>'name')) BETWEEN 1 AND 160 AND length(item->>'description')<=12000 AND item->>'kind' IN ('continent','island','location'),false) IS NOT TRUE OR item->>'id'=ANY(ids) THEN RETURN false; END IF;
  ids:=array_append(ids,item->>'id');
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_payload_valid(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; ids text[]:='{}'; points integer:=0;
BEGIN
 IF NOT (p ?| ARRAY['settlementShapes','settlementEntities','settlementState','historicalPlaces']) THEN RETURN world_map_state_generic_payload_valid(p); END IF;
 IF world_map_state_settlement_base_valid(p - ARRAY['settlementShapes','settlementEntities','settlementState','historicalPlaces']) IS NOT TRUE THEN RETURN false; END IF;
 IF NOT (p ?& ARRAY['settlementShapes','settlementEntities','settlementState','historicalPlaces'])
 OR jsonb_typeof(p->'settlementShapes')<>'array' OR jsonb_typeof(p->'settlementEntities')<>'array' OR jsonb_typeof(p->'historicalPlaces')<>'array'
 OR jsonb_array_length(p->'settlementShapes')>4000 OR jsonb_array_length(p->'settlementEntities')>4000 OR jsonb_array_length(p->'historicalPlaces')>4001
 OR world_atlas_settlement_state_valid(p->'settlementState') IS NOT TRUE OR octet_length(p::text)>12582912 THEN RETURN false; END IF;
 ids:=ARRAY(SELECT value->>'id' FROM jsonb_array_elements(p->'features') UNION ALL SELECT value->>'id' FROM jsonb_array_elements(p->'drawings'));
 FOR item IN SELECT value FROM jsonb_array_elements(p->'settlementShapes') LOOP
  IF world_atlas_settlement_shape_valid(item) IS NOT TRUE OR item->>'id'=ANY(ids) THEN RETURN false; END IF;
  ids:=array_append(ids,item->>'id');
  points:=points+CASE WHEN item->>'type'='marker' THEN 1 ELSE jsonb_array_length(item->'points') END;
 END LOOP;
 IF points>64000 THEN RETURN false; END IF;
 ids:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(p->'settlementEntities') LOOP
  PERFORM (item->>'geographyId')::uuid;
  IF NOT (item ?& ARRAY['geographyId','revision','kind','classification','districtIds']) OR (SELECT count(*) FROM jsonb_object_keys(item))<>5
  OR item->>'geographyId'=ANY(ids) OR coalesce(jsonb_typeof(item->'geographyId')='string' AND jsonb_typeof(item->'kind')='string' AND item->>'kind' IN ('street','district','building','wall','waterway','space','landmark'),false) IS NOT TRUE
  OR jsonb_typeof(item->'classification')<>'string' OR length(item->>'classification')>160 OR jsonb_typeof(item->'districtIds')<>'array' OR jsonb_array_length(item->'districtIds')>128
  OR jsonb_typeof(item->'revision')<>'number' OR (item->>'revision')::numeric<1 OR (item->>'revision')::numeric<>trunc((item->>'revision')::numeric)
  OR (SELECT count(*) FROM jsonb_array_elements_text(item->'districtIds'))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(item->'districtIds'))
  OR item->'districtIds' ? (item->>'geographyId') THEN RETURN false; END IF;
  ids:=array_append(ids,item->>'geographyId');
 END LOOP;
 ids:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(p->'historicalPlaces') LOOP
  PERFORM (item->>'geographyId')::uuid;
  IF NOT (item ?& ARRAY['geographyId','condition']) OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR item->>'geographyId'=ANY(ids)
  OR coalesce(jsonb_typeof(item->'geographyId')='string' AND jsonb_typeof(item->'condition')='string' AND item->>'condition' IN ('present','absent','not established','abandoned','ruined','destroyed','rebuilt','unknown'),false) IS NOT TRUE THEN RETURN false; END IF;
  ids:=array_append(ids,item->>'geographyId');
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
--> statement-breakpoint
ALTER TABLE world_map_state_version DROP CONSTRAINT IF EXISTS map_state_payload_valid;
--> statement-breakpoint
ALTER TABLE world_map_state_version ADD CONSTRAINT map_state_payload_valid CHECK (world_map_state_payload_valid(payload) IS TRUE);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb; obj world_map_state_object; g world_geography; mid text; mk text; e world_settlement_entity; prior jsonb;
BEGIN
 SELECT map_kind,geography_id INTO mk,mid FROM world_atlas_map WHERE id=NEW.map_id AND world_id=NEW.world_id;
 IF mk NOT IN ('generic','settlement') OR (mk='generic' AND NEW.payload ? 'settlementShapes') OR (mk='settlement' AND NOT (NEW.payload ? 'settlementShapes')) THEN RAISE EXCEPTION 'Historical source must match its map category'; END IF;
 IF NEW.previous_version_id=NEW.id OR (NEW.state_id IS NULL AND NEW.previous_version_id IS NOT NULL) THEN RAISE EXCEPTION 'Historical prior revision must be a separate source of the same appearance'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'features') UNION ALL SELECT value FROM jsonb_array_elements(NEW.payload->'drawings') UNION ALL SELECT value || jsonb_build_object('type','settlement-'||(value->>'type')) FROM jsonb_array_elements(coalesce(NEW.payload->'settlementShapes','[]'::jsonb)) LOOP
  SELECT * INTO obj FROM world_map_state_object WHERE id=item->>'id';
  IF NOT FOUND OR obj.map_id<>NEW.map_id OR obj.world_id<>NEW.world_id OR obj.kind<>coalesce(item->>'type','feature') OR obj.geography_id IS DISTINCT FROM item->>'geographyId' THEN RAISE EXCEPTION 'Historical object identity mismatch'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'geographies') LOOP
  SELECT * INTO g FROM world_geography WHERE id=item->>'id' AND world_id=NEW.world_id;
  IF NOT FOUND OR g.kind<>item->>'kind' OR NOT EXISTS (SELECT 1 FROM world_map_state_geography WHERE version_id=NEW.id AND geography_id=g.id AND world_id=NEW.world_id) THEN RAISE EXCEPTION 'Historical geography source mismatch'; END IF;
  IF item->>'parentId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM world_map_state_geography gp WHERE gp.version_id=NEW.id AND gp.geography_id=item->>'parentId' AND gp.world_id=NEW.world_id) THEN RAISE EXCEPTION 'Historical geographic parent source missing'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM world_map_state_object o WHERE o.id IN (SELECT value->>'id' FROM jsonb_array_elements(NEW.payload->'features') UNION ALL SELECT value->>'id' FROM jsonb_array_elements(NEW.payload->'drawings')) AND o.geography_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM world_map_state_geography gp WHERE gp.version_id=NEW.id AND gp.geography_id=o.geography_id)) THEN RAISE EXCEPTION 'Historical object geography missing'; END IF;
 SELECT geography_id INTO mid FROM world_atlas_map WHERE id=NEW.map_id;
 IF mid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM world_map_state_geography WHERE version_id=NEW.id AND geography_id=mid) THEN RAISE EXCEPTION 'Historical map geography missing'; END IF;
 IF mk='settlement' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'settlementEntities') LOOP
   SELECT * INTO e FROM world_settlement_entity WHERE geography_id=item->>'geographyId' AND world_id=NEW.world_id AND settlement_id=mid;
   IF NOT FOUND OR e.kind<>item->>'kind' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'geographies') jg WHERE jg->>'id'=e.geography_id AND jg->>'parentId'=mid AND jg->>'kind'='location') THEN RAISE EXCEPTION 'Historical settlement semantic identity mismatch'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(item->'districtIds') d WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'settlementEntities') target WHERE target->>'geographyId'=d.value AND target->>'kind'='district')) THEN RAISE EXCEPTION 'Historical district membership mismatch'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'settlementShapes') LOOP
   IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'settlementEntities') je WHERE je->>'geographyId'=item->>'geographyId' AND item->>'type'=CASE WHEN je->>'kind' IN ('building','district','space') THEN 'area' WHEN je->>'kind'='landmark' THEN 'marker' ELSE 'line' END) THEN RAISE EXCEPTION 'Historical settlement geometry category mismatch'; END IF;
  END LOOP;
  IF jsonb_array_length(NEW.payload->'historicalPlaces')<>jsonb_array_length(NEW.payload->'settlementEntities')+1 OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'geographies') jg WHERE jg->>'id'=mid AND jg->>'context'='settlement') THEN RAISE EXCEPTION 'Historical settlement conditions incomplete'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'historicalPlaces') LOOP
   IF NOT EXISTS (SELECT 1 FROM world_map_state_geography WHERE version_id=NEW.id AND geography_id=item->>'geographyId') OR (item->>'geographyId'<>mid AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'settlementEntities') je WHERE je->>'geographyId'=item->>'geographyId')) THEN RAISE EXCEPTION 'Historical place condition identity mismatch'; END IF;
  END LOOP;
  SELECT payload INTO prior FROM world_map_state_version WHERE id=NEW.previous_version_id OR id=NEW.source_version_id ORDER BY (id=NEW.previous_version_id) DESC LIMIT 1;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(prior->'settlementShapes','[]'::jsonb)) s WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'settlementShapes') n WHERE n->>'id'=s->>'id')) OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(prior->'settlementEntities','[]'::jsonb)) je WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'settlementEntities') n WHERE n->>'geographyId'=je->>'geographyId')) THEN RAISE EXCEPTION 'Retain historical settlement geometry and identities'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_object_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f world_atlas_feature; d world_atlas_drawing; o world_map_state_object; k text; gid text; ss world_atlas_settlement_shape;
BEGIN
 IF TG_TABLE_NAME='world_map_state_object' THEN
  SELECT * INTO f FROM world_atlas_feature WHERE id=NEW.id;
  IF FOUND AND (f.world_id<>NEW.world_id OR f.map_id<>NEW.map_id OR NEW.kind<>'feature' OR f.geography_id IS DISTINCT FROM NEW.geography_id) THEN RAISE EXCEPTION 'Historical feature identity conflicts with shared source'; END IF;
  SELECT * INTO d FROM world_atlas_drawing WHERE id=NEW.id;
  IF FOUND AND (d.world_id<>NEW.world_id OR d.map_id<>NEW.map_id OR d.content->>'type'<>NEW.kind OR d.geography_id IS DISTINCT FROM NEW.geography_id) THEN RAISE EXCEPTION 'Historical drawing identity conflicts with shared source'; END IF;
  SELECT * INTO ss FROM world_atlas_settlement_shape WHERE id=NEW.id;
  IF FOUND AND (ss.world_id<>NEW.world_id OR ss.map_id<>NEW.map_id OR NEW.kind<>'settlement-'||(ss.content->>'type') OR ss.geography_id IS DISTINCT FROM NEW.geography_id) THEN RAISE EXCEPTION 'Historical settlement shape identity conflicts with shared source'; END IF;
 ELSE
  SELECT * INTO o FROM world_map_state_object WHERE id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='world_atlas_feature' THEN k:='feature'; ELSIF TG_TABLE_NAME='world_atlas_settlement_shape' THEN k:='settlement-'||(NEW.content->>'type'); ELSE k:=NEW.content->>'type'; END IF;
  IF o.world_id<>NEW.world_id OR o.map_id<>NEW.map_id OR o.kind<>k OR o.geography_id IS DISTINCT FROM NEW.geography_id THEN RAISE EXCEPTION 'Shared source conflicts with a retained historical object identity'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='world_atlas_settlement_shape_historical_identity' AND tgrelid='world_atlas_settlement_shape'::regclass) THEN
 CREATE TRIGGER world_atlas_settlement_shape_historical_identity BEFORE INSERT OR UPDATE ON world_atlas_settlement_shape FOR EACH ROW EXECUTE FUNCTION world_map_state_object_guard();
END IF; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_historical_settlement_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='world_atlas_map' THEN
  IF (NEW.map_kind IS DISTINCT FROM OLD.map_kind OR NEW.geography_id IS DISTINCT FROM OLD.geography_id) AND EXISTS (SELECT 1 FROM world_map_state_version WHERE map_id=OLD.id) THEN RAISE EXCEPTION 'A historical map retains its category and subject identity'; END IF;
 ELSE
  IF (NEW.world_id<>OLD.world_id OR NEW.settlement_id<>OLD.settlement_id OR NEW.geography_id<>OLD.geography_id OR NEW.kind<>OLD.kind) AND EXISTS (SELECT 1 FROM world_map_state_geography WHERE geography_id=OLD.geography_id) THEN RAISE EXCEPTION 'A historical settlement place retains its semantic identity and category'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['world_atlas_map','world_settlement_entity'] LOOP
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=t||'_historical_semantics' AND tgrelid=t::regclass) THEN
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION world_historical_settlement_identity_guard()',t||'_historical_semantics',t);
 END IF;
END LOOP; END $$;
