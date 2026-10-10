-- Forward-only integrity correction. Preserve published 0102 unchanged.
-- Reject invalid rows; never repair by silently dropping authored geography.
CREATE FUNCTION world_atlas_geometry_valid(g jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  points jsonb; p jsonb; xs numeric[] := ARRAY[]::numeric[]; ys numeric[] := ARRAY[]::numeric[];
  ids text[] := ARRAY[]::text[]; x numeric; y numeric; n integer; i integer; j integer; area numeric := 0;
BEGIN
  IF jsonb_typeof(g)<>'object' OR g->>'version'<>'1' THEN RETURN false; END IF;
  IF g->>'type'='point' THEN
    IF g - ARRAY['version','type','point'] <> '{}'::jsonb THEN RETURN false; END IF;
    points := jsonb_build_array(g->'point');
  ELSIF g->>'type'='polygon' THEN
    IF g - ARRAY['version','type','points'] <> '{}'::jsonb OR jsonb_typeof(g->'points')<>'array' THEN RETURN false; END IF;
    points := g->'points';
    IF jsonb_array_length(points) NOT BETWEEN 3 AND 256 THEN RETURN false; END IF;
  ELSE RETURN false; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(points) LOOP
    IF jsonb_typeof(p)<>'object' OR jsonb_typeof(p->'x')<>'number' OR jsonb_typeof(p->'y')<>'number' THEN RETURN false; END IF;
    x := (p->>'x')::numeric; y := (p->>'y')::numeric;
    IF x IS NULL OR y IS NULL OR x NOT BETWEEN 0 AND 2000 OR y NOT BETWEEN 0 AND 1200 OR x<>round(x,2) OR y<>round(y,2) THEN RETURN false; END IF;
    IF g->>'type'='polygon' THEN
      IF p - ARRAY['id','x','y'] <> '{}'::jsonb OR coalesce(p->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR p->>'id'=ANY(ids) THEN RETURN false; END IF;
      FOR i IN 1..coalesce(array_length(xs,1),0) LOOP IF xs[i]=x AND ys[i]=y THEN RETURN false; END IF; END LOOP;
      ids := array_append(ids,p->>'id');
    ELSIF p - ARRAY['x','y'] <> '{}'::jsonb THEN RETURN false; END IF;
    xs := array_append(xs,x); ys := array_append(ys,y);
  END LOOP;
  n := coalesce(array_length(xs,1),0);
  IF g->>'type'='point' THEN RETURN n=1; END IF;
  FOR i IN 1..n LOOP j:=i % n + 1; area:=area+xs[i]*ys[j]-xs[j]*ys[i]; END LOOP;
  RETURN abs(area)>=2;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
ALTER TABLE "world_atlas_feature" ADD CONSTRAINT "world_atlas_geometry_coordinates_valid" CHECK (world_atlas_geometry_valid("world_atlas_feature"."geometry"));