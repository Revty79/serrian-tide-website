-- Private generation provenance, bounded versioned recipes and same-World source references.
CREATE FUNCTION world_atlas_generation_valid(g jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE s jsonb; p jsonb; recipe jsonb; item jsonb; k text; n numeric;
BEGIN
  IF jsonb_typeof(g) IS DISTINCT FROM 'object' OR NOT (g ?& ARRAY['version','kind','requestId','requestHash','createdBy','createdAt','sourceMapId','sourceRevision','spec']) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(g) x WHERE x NOT IN ('version','kind','requestId','requestHash','createdBy','createdAt','sourceMapId','sourceRevision','spec')) THEN RETURN false; END IF;
  IF g->'version' <> '1'::jsonb OR jsonb_typeof(g->'kind') IS DISTINCT FROM 'string' OR g->>'kind' NOT IN ('generated','duplicate') THEN RETURN false; END IF;
  IF jsonb_typeof(g->'requestId') IS DISTINCT FROM 'string' OR g->>'requestId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  IF jsonb_typeof(g->'requestHash') IS DISTINCT FROM 'string' OR g->>'requestHash' !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  IF jsonb_typeof(g->'createdBy') IS DISTINCT FROM 'string' OR length(g->>'createdBy') NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  IF jsonb_typeof(g->'createdAt') IS DISTINCT FROM 'string' OR g->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$' THEN RETURN false; END IF;
  PERFORM (g->>'createdAt')::timestamptz;
  IF (g->'sourceMapId'='null'::jsonb) IS DISTINCT FROM (g->'sourceRevision'='null'::jsonb) THEN RETURN false; END IF;
  IF g->'sourceMapId'<>'null'::jsonb THEN
    IF jsonb_typeof(g->'sourceMapId') IS DISTINCT FROM 'string' OR g->>'sourceMapId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR jsonb_typeof(g->'sourceRevision') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    n=(g->>'sourceRevision')::numeric; IF n<1 OR n<>trunc(n) THEN RETURN false; END IF;
  ELSIF g->>'kind'='duplicate' THEN RETURN false;
  END IF;
  recipe=g->'spec';
  IF recipe='null'::jsonb THEN RETURN g->>'kind'='duplicate'; END IF;
  IF jsonb_typeof(recipe) IS DISTINCT FROM 'object' OR NOT(recipe ?& ARRAY['version','algorithm','seed','settings','plan','description','interpretation']) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(recipe) x WHERE x NOT IN ('version','algorithm','seed','settings','plan','description','interpretation')) THEN RETURN false; END IF;
  IF recipe->'version'<>'1'::jsonb OR recipe->>'algorithm' IS DISTINCT FROM 'serrian-atlas-v1' OR jsonb_typeof(recipe->'seed') IS DISTINCT FROM 'string' OR length(trim(recipe->>'seed')) NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
  s=recipe->'settings';p=recipe->'plan';
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR NOT(s ?& ARRAY['mapType','continents','landCoverage','islands','ruggedness','size','shape','mountains','forest','rivers','lakes','biome','style']) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(s) x WHERE x NOT IN ('mapType','continents','landCoverage','islands','ruggedness','size','shape','mountains','forest','rivers','lakes','biome','style')) THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['continents','landCoverage','islands','ruggedness','mountains','forest','rivers','lakes'] LOOP
    IF jsonb_typeof(s->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    n=(s->>k)::numeric;
    IF n<>trunc(n) OR n<(CASE WHEN k='landCoverage' THEN 10 ELSE 0 END) OR n>(CASE WHEN k='continents' THEN 6 WHEN k='landCoverage' THEN 55 WHEN k='islands' THEN 32 WHEN k='rivers' THEN 12 WHEN k='lakes' THEN 10 ELSE 100 END) THEN RETURN false; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['mapType','size','shape','biome','style'] LOOP IF jsonb_typeof(s->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF; END LOOP;
  IF s->>'mapType' NOT IN ('world','continent') OR s->>'size' NOT IN ('small','medium','large','varied') OR s->>'shape' NOT IN ('balanced','elongated','crescent','varied') OR s->>'biome' NOT IN ('temperate','northern','arid','tropical','mixed') OR s->>'style' NOT IN ('parchment','illuminated','night') THEN RETURN false; END IF;
  IF s->>'mapType'='continent' AND s->'continents'<>'1'::jsonb OR s->'continents'='0'::jsonb AND s->'islands'='0'::jsonb THEN RETURN false; END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT(p ?& ARRAY['landPosition','islandPosition','ruggedCoast','baySide','additionalBaySide','bays','bayDepth','mountainRegion','mountainOrientation','mountainRanges','forestRegion','riverDirection','lakeRegion','desertRegion','grasslandRegion','wetlandRegion','snowRegion','extraTerrain']) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) x WHERE x NOT IN ('landPosition','islandPosition','ruggedCoast','baySide','additionalBaySide','bays','bayDepth','mountainRegion','mountainOrientation','mountainRanges','forestRegion','riverDirection','lakeRegion','desertRegion','grasslandRegion','wetlandRegion','snowRegion','extraTerrain')) THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['landPosition','mountainRegion','forestRegion','lakeRegion','desertRegion','grasslandRegion','wetlandRegion','snowRegion','islandPosition'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR p->>k NOT IN ('center','north','south','east','west','northeast','northwest','southeast','southwest','automatic','scattered') THEN RETURN false; END IF;
    IF p->>k='scattered' AND k<>'islandPosition' OR p->>k='automatic' AND k IN ('landPosition','mountainRegion','islandPosition') THEN RETURN false; END IF;
  END LOOP;
  IF s->'continents'<>'1'::jsonb AND p->>'landPosition'<>'center' THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['additionalBaySide','ruggedCoast','baySide','riverDirection','mountainOrientation'] LOOP IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF; END LOOP;
  IF p->>'additionalBaySide' NOT IN ('none','north','south','east','west') THEN RETURN false; END IF;
  IF p->>'ruggedCoast' NOT IN ('all','north','south','east','west') OR p->>'baySide' NOT IN ('all','north','south','east','west') OR p->>'riverDirection' NOT IN ('automatic','north','south','east','west') OR p->>'mountainOrientation' NOT IN ('north-south','east-west','northeast-southwest','northwest-southeast','varied') THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['bays','bayDepth','mountainRanges'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    n=(p->>k)::numeric;IF n<>trunc(n) OR n<(CASE WHEN k='bays' THEN 0 ELSE 1 END) OR n>(CASE WHEN k='bays' THEN 4 ELSE 3 END) THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(p->'extraTerrain') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'extraTerrain')>6 THEN RETURN false; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p->'extraTerrain') LOOP IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR item#>>'{}' NOT IN ('hills','valleys','desert','grassland','wetland','snow') THEN RETURN false; END IF; END LOOP;
  IF (recipe->'description'='null'::jsonb) IS DISTINCT FROM (recipe->'interpretation'='null'::jsonb) THEN RETURN false; END IF;
  IF recipe->'description'<>'null'::jsonb THEN
    IF jsonb_typeof(recipe->'description') IS DISTINCT FROM 'string' OR length(trim(recipe->>'description')) NOT BETWEEN 1 AND 4000 THEN RETURN false; END IF;
    item=recipe->'interpretation';
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT(item ?& ARRAY['version','understood','warnings']) OR item->'version'<>'1'::jsonb THEN RETURN false; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(item) x WHERE x NOT IN ('version','understood','warnings')) THEN RETURN false; END IF;
    FOREACH k IN ARRAY ARRAY['understood','warnings'] LOOP
      IF jsonb_typeof(item->k) IS DISTINCT FROM 'array' OR jsonb_array_length(item->k)>48 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->k) v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}')>(CASE WHEN k='warnings' THEN 500 ELSE 300 END)) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD COLUMN "generation" jsonb;--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD COLUMN "source_map_id" text;--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_map_source_world_fk" FOREIGN KEY ("source_map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_generation_valid" CHECK (("world_atlas_map"."generation" IS NULL AND "world_atlas_map"."source_map_id" IS NULL) OR ("world_atlas_map"."generation" IS NOT NULL AND world_atlas_generation_valid("world_atlas_map"."generation") IS TRUE AND "world_atlas_map"."generation"->>'requestId'="world_atlas_map"."id" AND ("world_atlas_map"."generation"->>'sourceMapId') IS NOT DISTINCT FROM "world_atlas_map"."source_map_id" AND ("world_atlas_map"."source_map_id" IS NULL OR "world_atlas_map"."source_map_id"<>"world_atlas_map"."id")));