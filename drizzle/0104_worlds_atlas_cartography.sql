-- Additive Pass 3B: published 0102/0103 remain unchanged.
CREATE FUNCTION world_atlas_presentation_valid(p jsonb) RETURNS boolean
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
CREATE FUNCTION world_atlas_drawing_valid(d jsonb) RETURNS boolean
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
CREATE TABLE "world_atlas_drawing" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"geography_id" text,
	"content" jsonb NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_atlas_drawing_content_valid" CHECK (world_atlas_drawing_valid("world_atlas_drawing"."content") AND "world_atlas_drawing"."content"->>'id'="world_atlas_drawing"."id" AND ("world_atlas_drawing"."content"->>'geographyId') IS NOT DISTINCT FROM "world_atlas_drawing"."geography_id" AND "world_atlas_drawing"."content"->>'archived'=("world_atlas_drawing"."archived_at" IS NOT NULL)::text)
);
--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD COLUMN "presentation" jsonb DEFAULT '{"version":1,"style":"parchment","grid":false,"layers":{"land":{"visible":true,"locked":false},"terrain":{"visible":true,"locked":false},"waterways":{"visible":true,"locked":false},"paths":{"visible":true,"locked":false},"symbols":{"visible":true,"locked":false},"labels":{"visible":true,"locked":false}}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_atlas_drawing" ADD CONSTRAINT "world_atlas_drawing_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_drawing" ADD CONSTRAINT "world_atlas_drawing_map_world_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_drawing" ADD CONSTRAINT "world_atlas_drawing_geography_world_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_atlas_drawing_map_idx" ON "world_atlas_drawing" USING btree ("map_id");--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_presentation_valid" CHECK (world_atlas_presentation_valid("world_atlas_map"."presentation"));