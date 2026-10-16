-- Additive UX-0A: retain published v1 validation byte-for-byte in named helpers.
-- Apply only after backup/rehearsal in an explicitly authorized target.
CREATE FUNCTION world_atlas_presentation_v1_0132_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE l jsonb; k text;
BEGIN
  IF jsonb_typeof(p)<>'object' OR p - ARRAY['version','style','grid','layers']<>'{}'::jsonb OR p->'version'<>'1'::jsonb OR p->>'style' NOT IN ('parchment','illuminated','night') OR jsonb_typeof(p->'grid')<>'boolean' OR jsonb_typeof(p->'layers')<>'object' THEN RETURN false; END IF;
  IF (p->'layers') - ARRAY['land','terrain','waterways','paths','symbols','labels']<>'{}'::jsonb THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['land','terrain','waterways','paths','symbols','labels'] LOOP
    l:=p->'layers'->k;
    IF l IS NULL OR jsonb_typeof(l)<>'object' OR l - ARRAY['visible','locked']<>'{}'::jsonb OR coalesce(jsonb_typeof(l->'visible'),'')<>'boolean' OR coalesce(jsonb_typeof(l->'locked'),'')<>'boolean' THEN RETURN false; END IF;
  END LOOP;
  RETURN p ?& ARRAY['version','style','grid','layers'];
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION world_atlas_drawing_v1_0132_valid(d jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE kind text; allowed text[]; points jsonb; p jsonb; ids text[]:=ARRAY[]::text[]; x numeric; y numeric; previous_x numeric; previous_y numeric; first_x numeric; first_y numeric; length numeric:=0; n integer:=0; k text; v numeric;
BEGIN
  IF jsonb_typeof(d)<>'object' OR d->'version'<>'1'::jsonb OR coalesce(d->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(d->'name')<>'string' OR length(trim(d->>'name')) NOT BETWEEN 1 AND 160 OR jsonb_typeof(d->'archived')<>'boolean' OR NOT(d ? 'geographyId') THEN RETURN false; END IF;
  IF d->'geographyId'<>'null'::jsonb AND (jsonb_typeof(d->'geographyId')<>'string' OR d->>'geographyId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN false; END IF;
  kind:=d->>'type';allowed:=ARRAY['version','id','name','archived','geographyId','type'];
  IF kind='terrain' THEN
    allowed:=allowed||ARRAY['kind','points','radius','spacing','density','seed'];
    IF d->'geographyId'<>'null'::jsonb OR d->>'kind' NOT IN ('mountains','hills','valleys','forest','grassland','desert','wetland','snow','lake') THEN RETURN false; END IF;
    FOREACH k IN ARRAY ARRAY['radius','spacing','density','seed'] LOOP IF jsonb_typeof(d->k)<>'number' THEN RETURN false; END IF; END LOOP;
    IF (d->>'radius')::numeric NOT BETWEEN 12 AND 160 OR (d->>'spacing')::numeric NOT BETWEEN 12 AND 100 OR (d->>'density')::numeric NOT BETWEEN 1 AND 3 OR (d->>'density')::numeric<>trunc((d->>'density')::numeric) OR (d->>'seed')::numeric NOT BETWEEN 1 AND 2147483647 OR (d->>'seed')::numeric<>trunc((d->>'seed')::numeric) THEN RETURN false; END IF;
  ELSIF kind='path' THEN
    allowed:=allowed||ARRAY['kind','points','width','curve'];
    IF d->>'kind' NOT IN ('river','stream','road','trail') OR jsonb_typeof(d->'width')<>'number' OR jsonb_typeof(d->'curve')<>'number' OR (d->>'width')::numeric NOT BETWEEN 1 AND 24 OR (d->>'curve')::numeric NOT BETWEEN 0 AND 1 THEN RETURN false; END IF;
  ELSIF kind='symbol' THEN
    allowed:=allowed||ARRAY['kind','point','scale','rotation','style'];
    IF d->>'kind' NOT IN ('mountain','pine','village','city','castle','tower','ruin','port') OR d->>'style' NOT IN ('colored','ink') OR jsonb_typeof(d->'scale')<>'number' OR (d->>'scale')::numeric NOT BETWEEN 0.4 AND 4 THEN RETURN false; END IF;
    IF d->>'kind' IN ('village','city','castle','tower','ruin','port') AND d->'geographyId'='null'::jsonb THEN RETURN false; END IF;
  ELSIF kind='label' THEN
    allowed:=allowed||ARRAY['text','point','size','rotation','style'];
    IF jsonb_typeof(d->'text')<>'string' OR length(trim(d->>'text')) NOT BETWEEN 1 AND 160 OR d->>'style' NOT IN ('place','region','water') OR jsonb_typeof(d->'size')<>'number' OR (d->>'size')::numeric NOT BETWEEN 12 AND 80 THEN RETURN false; END IF;
  ELSE RETURN false; END IF;
  IF d-allowed<>'{}'::jsonb OR NOT(d ?& allowed) THEN RETURN false; END IF;
  IF kind IN ('symbol','label') THEN
    IF jsonb_typeof(d->'rotation')<>'number' OR (d->>'rotation')::numeric NOT BETWEEN -180 AND 180 THEN RETURN false; END IF;
    points:=jsonb_build_array(d->'point');
  ELSE
    points:=d->'points';IF jsonb_typeof(points)<>'array' OR jsonb_array_length(points) NOT BETWEEN (CASE WHEN kind='path' THEN 2 ELSE 1 END) AND 128 THEN RETURN false; END IF;
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(points) LOOP
    IF jsonb_typeof(p)<>'object' OR coalesce(jsonb_typeof(p->'x'),'')<>'number' OR coalesce(jsonb_typeof(p->'y'),'')<>'number' THEN RETURN false; END IF;
    x:=(p->>'x')::numeric;y:=(p->>'y')::numeric;
    IF x NOT BETWEEN 0 AND 2000 OR y NOT BETWEEN 0 AND 1200 OR x<>round(x,2) OR y<>round(y,2) THEN RETURN false; END IF;
    IF kind IN ('terrain','path') THEN
      IF p-ARRAY['id','x','y']<>'{}'::jsonb OR coalesce(p->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR p->>'id'=ANY(ids) OR (x=previous_x AND y=previous_y) THEN RETURN false; END IF;
      ids:=array_append(ids,p->>'id');
    ELSIF p-ARRAY['x','y']<>'{}'::jsonb THEN RETURN false; END IF;
    IF n>0 THEN length:=length+sqrt((x-previous_x)^2+(y-previous_y)^2); ELSE first_x:=x;first_y:=y;END IF;
    previous_x:=x;previous_y:=y;n:=n+1;
  END LOOP;
  IF kind='path' AND sqrt((x-first_x)^2+(y-first_y)^2)<1 THEN RETURN false; END IF;
  IF kind='terrain' AND (1+floor(length/(d->>'spacing')::numeric))*(d->>'density')::numeric>600 THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint

-- Structural references are extensible; the server checks the exact shipped catalog.
CREATE FUNCTION world_atlas_asset_ref_valid(p jsonb, style_ref boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE keys text[]; k text; v numeric;
BEGIN
  keys:=CASE WHEN style_ref THEN ARRAY['id','revision'] ELSE ARRAY['libraryId','libraryRevision','assetId','assetRevision'] END;
  IF jsonb_typeof(p)<>'object' OR p-keys<>'{}'::jsonb OR NOT(p ?& keys) THEN RETURN false; END IF;
  FOREACH k IN ARRAY keys LOOP
    IF k IN ('id','libraryId','assetId') THEN
      IF jsonb_typeof(p->k)<>'string' OR length(p->>k) NOT BETWEEN 1 AND 80 OR p->>k !~ '^[a-z][a-z0-9-]*$' THEN RETURN false; END IF;
    ELSE
      IF jsonb_typeof(p->k)<>'number' THEN RETURN false; END IF;
      v:=(p->>k)::numeric;
      IF v NOT BETWEEN 1 AND 2147483647 OR v<>trunc(v) THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_atlas_presentation_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF p->'version'='1'::jsonb THEN RETURN world_atlas_presentation_v1_0132_valid(p); END IF;
  IF jsonb_typeof(p)<>'object' OR p->'version' IS DISTINCT FROM '2'::jsonb OR world_atlas_asset_ref_valid(p->'styleRef',true) IS NOT TRUE THEN RETURN false; END IF;
  RETURN world_atlas_presentation_v1_0132_valid((p-'styleRef')||'{}'::jsonb||jsonb_build_object('version',1)) IS TRUE;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_atlas_drawing_valid(d jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE item jsonb; seen text[]:=ARRAY[]::text[]; legacy jsonb;
BEGIN
  IF d->'version'='1'::jsonb THEN RETURN world_atlas_drawing_v1_0132_valid(d); END IF;
  IF jsonb_typeof(d)<>'object' OR d->'version' IS DISTINCT FROM '2'::jsonb THEN RETURN false; END IF;
  IF d->>'type'='symbol' THEN
    IF jsonb_typeof(d->'role') IS DISTINCT FROM 'string' OR d->>'role' NOT IN ('decoration','place') OR d->>'style' IS DISTINCT FROM 'colored'
      OR world_atlas_asset_ref_valid(d->'assetRef') IS NOT TRUE
      OR (d->>'role'='place' AND (d->'geographyId' IS NULL OR d->'geographyId'='null'::jsonb)) THEN RETURN false; END IF;
    legacy:=d-ARRAY['assetRef','role'];
  ELSIF d->>'type'='terrain' THEN
    IF jsonb_typeof(d->'assetRefs') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'assetRefs') NOT BETWEEN 1 AND 4 THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(d->'assetRefs') LOOP
      IF world_atlas_asset_ref_valid(item) IS NOT TRUE OR item::text=ANY(seen) THEN RETURN false; END IF;
      seen:=array_append(seen,item::text);
    END LOOP;
    legacy:=d-'assetRefs';
  ELSE RETURN false; END IF;
  RETURN world_atlas_drawing_v1_0132_valid(legacy||jsonb_build_object('version',1)) IS TRUE;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
-- CREATE OR REPLACE keeps each original function OID and all delegating history
-- wrappers. Recreate and validate affected CHECKs over every populated old row.
-- No stored content, source/history identity, default or index is rewritten.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT c.conrelid::regclass relation,c.conname,pg_get_constraintdef(c.oid) definition
    FROM pg_constraint c WHERE c.contype='c' AND
      ((c.conrelid='world_atlas_map'::regclass AND c.conname='world_atlas_presentation_valid') OR
       (c.conrelid='world_atlas_drawing'::regclass AND c.conname='world_atlas_drawing_content_valid') OR
       (c.conrelid='world_map_state_version'::regclass AND c.conname='map_state_payload_valid'))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.relation,item.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s NOT VALID',item.relation,item.conname,item.definition);
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',item.relation,item.conname);
  END LOOP;
END;
$$;
