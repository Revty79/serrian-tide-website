CREATE TABLE IF NOT EXISTS "world_map_territory" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"origin_timeline_id" text NOT NULL,
	CONSTRAINT "map_territory_map_uq" UNIQUE("id","world_id","map_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_territory_boundary" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"territory_id" text NOT NULL,
	"parent_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_territory_history" (
	"version_id" text NOT NULL,
	"territory_id" text NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"history_version_id" text NOT NULL,
	CONSTRAINT "world_map_territory_history_version_id_territory_id_entity_id_pk" PRIMARY KEY("version_id","territory_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_territory_lore" (
	"version_id" text NOT NULL,
	"territory_id" text NOT NULL,
	"id" text NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"lore_version_id" text NOT NULL,
	CONSTRAINT "world_map_territory_lore_version_id_id_pk" PRIMARY KEY("version_id","id")
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_territory_map_fk' AND conrelid='world_map_territory'::regclass) THEN ALTER TABLE "world_map_territory" ADD CONSTRAINT "map_territory_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_territory_origin_fk' AND conrelid='world_map_territory'::regclass) THEN ALTER TABLE "world_map_territory" ADD CONSTRAINT "map_territory_origin_fk" FOREIGN KEY ("origin_timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='territory_boundary_subject_fk' AND conrelid='world_map_territory_boundary'::regclass) THEN ALTER TABLE "world_map_territory_boundary" ADD CONSTRAINT "territory_boundary_subject_fk" FOREIGN KEY ("territory_id","world_id","map_id") REFERENCES "public"."world_map_territory"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='territory_history_appearance_fk' AND conrelid='world_map_territory_history'::regclass) THEN ALTER TABLE "world_map_territory_history" ADD CONSTRAINT "territory_history_appearance_fk" FOREIGN KEY ("version_id","world_id","map_id") REFERENCES "public"."world_map_state_version"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='territory_history_subject_fk' AND conrelid='world_map_territory_history'::regclass) THEN ALTER TABLE "world_map_territory_history" ADD CONSTRAINT "territory_history_subject_fk" FOREIGN KEY ("territory_id","world_id","map_id") REFERENCES "public"."world_map_territory"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='territory_history_pin_fk' AND conrelid='world_map_territory_history'::regclass) THEN ALTER TABLE "world_map_territory_history" ADD CONSTRAINT "territory_history_pin_fk" FOREIGN KEY ("history_version_id","world_id","entity_id") REFERENCES "public"."world_history_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='territory_lore_appearance_fk' AND conrelid='world_map_territory_lore'::regclass) THEN ALTER TABLE "world_map_territory_lore" ADD CONSTRAINT "territory_lore_appearance_fk" FOREIGN KEY ("version_id","world_id","map_id") REFERENCES "public"."world_map_state_version"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='territory_lore_subject_fk' AND conrelid='world_map_territory_lore'::regclass) THEN ALTER TABLE "world_map_territory_lore" ADD CONSTRAINT "territory_lore_subject_fk" FOREIGN KEY ("territory_id","world_id","map_id") REFERENCES "public"."world_map_territory"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='territory_lore_pin_fk' AND conrelid='world_map_territory_lore'::regclass) THEN ALTER TABLE "world_map_territory_lore" ADD CONSTRAINT "territory_lore_pin_fk" FOREIGN KEY ("lore_version_id","world_id","entity_id") REFERENCES "public"."world_lore_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "territory_lore_entity_idx" ON "world_map_territory_lore" USING btree ("world_id","entity_id","version_id");

--> statement-breakpoint
-- Preserve the approved 6B-B payload validator and rebind its CHECK to this extension.
DO $$ BEGIN IF to_regprocedure('world_map_state_6bb_payload_valid(jsonb)') IS NULL THEN
 ALTER FUNCTION world_map_state_payload_valid(jsonb) RENAME TO world_map_state_6bb_payload_valid;
END IF; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_territory_ring_contains(outer_points jsonb,inner_points jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE p jsonb; a jsonb; b jsonb; c jsonb; d jsonb; inside boolean; i integer; j integer; px numeric; py numeric; ax numeric; ay numeric; bx numeric; byy numeric; cx numeric; cy numeric; dx numeric; dy numeric; ab_c numeric; ab_d numeric; cd_a numeric; cd_b numeric;
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(inner_points) LOOP
  px:=(p->>'x')::numeric;py:=(p->>'y')::numeric;inside:=false;
  FOR i IN 0..jsonb_array_length(outer_points)-1 LOOP
   a:=outer_points->i;b:=outer_points->((i+1)%jsonb_array_length(outer_points));ax:=(a->>'x')::numeric;ay:=(a->>'y')::numeric;bx:=(b->>'x')::numeric;byy:=(b->>'y')::numeric;
   IF abs((bx-ax)*(py-ay)-(byy-ay)*(px-ax))<0.00000001 AND px BETWEEN least(ax,bx) AND greatest(ax,bx) AND py BETWEEN least(ay,byy) AND greatest(ay,byy) THEN RETURN false; END IF;
   IF (ay>py)<>(byy>py) THEN IF px<(bx-ax)*(py-ay)/(byy-ay)+ax THEN inside:=NOT inside; END IF; END IF;
  END LOOP;
  IF NOT inside THEN RETURN false; END IF;
 END LOOP;
 FOR i IN 0..jsonb_array_length(outer_points)-1 LOOP
  a:=outer_points->i;b:=outer_points->((i+1)%jsonb_array_length(outer_points));ax:=(a->>'x')::numeric;ay:=(a->>'y')::numeric;bx:=(b->>'x')::numeric;byy:=(b->>'y')::numeric;
  FOR j IN 0..jsonb_array_length(inner_points)-1 LOOP
   c:=inner_points->j;d:=inner_points->((j+1)%jsonb_array_length(inner_points));cx:=(c->>'x')::numeric;cy:=(c->>'y')::numeric;dx:=(d->>'x')::numeric;dy:=(d->>'y')::numeric;
   ab_c:=(bx-ax)*(cy-ay)-(byy-ay)*(cx-ax);ab_d:=(bx-ax)*(dy-ay)-(byy-ay)*(dx-ax);cd_a:=(dx-cx)*(ay-cy)-(dy-cy)*(ax-cx);cd_b:=(dx-cx)*(byy-cy)-(dy-cy)*(bx-cx);
   IF ab_c*ab_d<=0 AND cd_a*cd_b<=0 AND greatest(least(ax,bx),least(cx,dx))<=least(greatest(ax,bx),greatest(cx,dx)) AND greatest(least(ay,byy),least(cy,dy))<=least(greatest(ay,byy),greatest(cy,dy)) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_territory_rings_overlap(first_points jsonb,second_points jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a jsonb; b jsonb; c jsonb; d jsonb; i integer; j integer; ax numeric; ay numeric; bx numeric; byy numeric; cx numeric; cy numeric; dx numeric; dy numeric; ab_c numeric; ab_d numeric; cd_a numeric; cd_b numeric;
BEGIN
 IF world_territory_ring_contains(first_points,second_points) OR world_territory_ring_contains(second_points,first_points) THEN RETURN true; END IF;
 FOR i IN 0..jsonb_array_length(first_points)-1 LOOP
  a:=first_points->i;b:=first_points->((i+1)%jsonb_array_length(first_points));ax:=(a->>'x')::numeric;ay:=(a->>'y')::numeric;bx:=(b->>'x')::numeric;byy:=(b->>'y')::numeric;
  FOR j IN 0..jsonb_array_length(second_points)-1 LOOP
   c:=second_points->j;d:=second_points->((j+1)%jsonb_array_length(second_points));cx:=(c->>'x')::numeric;cy:=(c->>'y')::numeric;dx:=(d->>'x')::numeric;dy:=(d->>'y')::numeric;
   ab_c:=(bx-ax)*(cy-ay)-(byy-ay)*(cx-ax);ab_d:=(bx-ax)*(dy-ay)-(byy-ay)*(dx-ax);cd_a:=(dx-cx)*(ay-cy)-(dy-cy)*(ax-cx);cd_b:=(dx-cx)*(byy-cy)-(dy-cy)*(bx-cx);
   IF ab_c*ab_d<=0 AND cd_a*cd_b<=0 AND greatest(least(ax,bx),least(cx,dx))<=least(greatest(ax,bx),greatest(cx,dx)) AND greatest(least(ay,byy),least(cy,dy))<=least(greatest(ay,byy),greatest(cy,dy)) THEN RETURN true; END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_territories_valid(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE t jsonb; b jsonb; r jsonb; h jsonb; ids text[]:='{}'; total integer:=0; vertices integer:=0;
BEGIN
 IF jsonb_typeof(p)<>'array' OR jsonb_array_length(p)>128 THEN RETURN false; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(p) LOOP
  IF NOT t ?& ARRAY['id','name','archived','protected','coordinateSpace','coverage','geographyIds','account','accountYear','originalNotation','boundaries','relationships','history'] OR t-ARRAY['id','name','archived','protected','coordinateSpace','coverage','geographyIds','account','accountYear','originalNotation','boundaries','relationships','history']<>'{}'::jsonb THEN RETURN false; END IF;
  IF coalesce(t->>'id' ~ '^[0-9a-fA-F-]{36}$' AND jsonb_typeof(t->'name')='string' AND length(trim(t->>'name')) BETWEEN 1 AND 160 AND jsonb_typeof(t->'archived')='boolean' AND jsonb_typeof(t->'protected')='boolean' AND t->>'coordinateSpace'='atlas-v1' AND t->>'coverage' IN ('authored','contested','unclaimed','unknown') AND jsonb_typeof(t->'account')='string' AND length(t->>'account')<=12000 AND jsonb_typeof(t->'originalNotation')='string' AND length(t->>'originalNotation')<=4000 AND jsonb_typeof(t->'geographyIds')='array' AND jsonb_typeof(t->'boundaries')='array' AND jsonb_typeof(t->'relationships')='array' AND jsonb_typeof(t->'history')='array',false) IS NOT TRUE THEN RETURN false; END IF;
  IF t->>'id'=ANY(ids) OR jsonb_array_length(t->'geographyIds')>20 OR jsonb_array_length(t->'relationships')>20 OR jsonb_array_length(t->'history')>20 OR (t->'accountYear'<>'null'::jsonb AND (jsonb_typeof(t->'accountYear')<>'number' OR abs((t->>'accountYear')::numeric)>1000000000000 OR (t->>'accountYear')::numeric<>trunc((t->>'accountYear')::numeric))) THEN RETURN false; END IF;
  IF length(trim(t->>'account'))=0 THEN RETURN false; END IF;
  ids:=array_append(ids,t->>'id');
  IF t->>'coverage' IN ('unclaimed','unknown') AND jsonb_array_length(t->'relationships')>0 THEN RETURN false; END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(t->'boundaries') LOOP
   IF NOT b ?& ARRAY['id','parentId','archived','points'] OR b-ARRAY['id','parentId','archived','points']<>'{}'::jsonb OR coalesce(b->>'id' ~ '^[0-9a-fA-F-]{36}$' AND jsonb_typeof(b->'archived')='boolean',false) IS NOT TRUE OR b->>'id'=ANY(ids) OR world_atlas_geometry_valid(jsonb_build_object('version',1,'type','polygon','points',b->'points')) IS NOT TRUE THEN RETURN false; END IF;
   IF b->'parentId'<>'null'::jsonb AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'boundaries') outer_ring WHERE outer_ring->>'id'=b->>'parentId' AND outer_ring->'parentId'='null'::jsonb AND (NOT (outer_ring->>'archived')::boolean OR (b->>'archived')::boolean)) THEN RETURN false; END IF;
   IF b->>'parentId' IS NOT NULL AND NOT (b->>'archived')::boolean AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'boundaries') outer_ring WHERE outer_ring->>'id'=b->>'parentId' AND world_territory_ring_contains(outer_ring->'points',b->'points') IS TRUE) THEN RETURN false; END IF;
   IF b->>'parentId' IS NOT NULL AND NOT (b->>'archived')::boolean AND EXISTS (SELECT 1 FROM jsonb_array_elements(t->'boundaries') hole WHERE hole->>'id'<>b->>'id' AND hole->>'parentId'=b->>'parentId' AND NOT (hole->>'archived')::boolean AND world_territory_rings_overlap(b->'points',hole->'points')) THEN RETURN false; END IF;
   ids:=array_append(ids,b->>'id');total:=total+1;vertices:=vertices+jsonb_array_length(b->'points');
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(t->'relationships') LOOP
   IF NOT r ?& ARRAY['id','entityId','versionId','revision','entityName','family','role','roleLabel','startYear','endYear','account'] OR r-ARRAY['id','entityId','versionId','revision','entityName','family','role','roleLabel','startYear','endYear','account']<>'{}'::jsonb THEN RETURN false; END IF;
   IF coalesce(r->>'id' ~ '^[0-9a-fA-F-]{36}$' AND r->>'entityId' ~ '^[0-9a-fA-F-]{36}$' AND r->>'versionId' ~ '^[0-9a-fA-F-]{36}$' AND jsonb_typeof(r->'revision')='number' AND (r->>'revision')::numeric>0 AND (r->>'revision')::numeric=trunc((r->>'revision')::numeric) AND jsonb_typeof(r->'entityName')='string' AND length(trim(r->>'entityName')) BETWEEN 1 AND 160 AND r->>'family' IN ('polity','government','institution','claim','agreement','conflict','realm','civilization') AND r->>'role' IN ('control','claim','administration','occupation','other') AND jsonb_typeof(r->'roleLabel')='string' AND length(r->>'roleLabel')<=160 AND jsonb_typeof(r->'account')='string' AND length(r->>'account')<=12000 AND jsonb_typeof(r->'startYear')='number' AND jsonb_typeof(r->'endYear')='number' AND abs((r->>'startYear')::numeric)<=1000000000000 AND abs((r->>'endYear')::numeric)<=1000000000000 AND (r->>'startYear')::numeric=trunc((r->>'startYear')::numeric) AND (r->>'endYear')::numeric=trunc((r->>'endYear')::numeric) AND (r->>'startYear')::numeric<=(r->>'endYear')::numeric,false) IS NOT TRUE OR r->>'id'=ANY(ids) OR (r->>'role'='other' AND length(trim(r->>'roleLabel'))=0) THEN RETURN false; END IF;
   ids:=array_append(ids,r->>'id');
  END LOOP;
  FOR h IN SELECT value FROM jsonb_array_elements(t->'history') LOOP
   IF NOT h ?& ARRAY['entityId','versionId','name'] OR h-ARRAY['entityId','versionId','name']<>'{}'::jsonb OR coalesce(h->>'entityId' ~ '^[0-9a-fA-F-]{36}$' AND h->>'versionId' ~ '^[0-9a-fA-F-]{36}$' AND jsonb_typeof(h->'name')='string' AND length(trim(h->>'name')) BETWEEN 1 AND 160,false) IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value) FROM jsonb_array_elements(t->'geographyIds'))<>jsonb_array_length(t->'geographyIds') OR (SELECT count(DISTINCT value->>'entityId') FROM jsonb_array_elements(t->'history'))<>jsonb_array_length(t->'history') THEN RETURN false; END IF;
 END LOOP;
 RETURN total<=128 AND vertices<=8192;
EXCEPTION WHEN others THEN RETURN false;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_territory_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='world_map_territory_lore' THEN
  IF NOT EXISTS (SELECT 1 FROM world_map_state_version v CROSS JOIN LATERAL jsonb_array_elements(coalesce(v.payload->'territories','[]'::jsonb)) t CROSS JOIN LATERAL jsonb_array_elements(t->'relationships') r WHERE v.id=NEW.version_id AND t->>'id'=NEW.territory_id AND r->>'id'=NEW.id AND r->>'entityId'=NEW.entity_id AND r->>'versionId'=NEW.lore_version_id) THEN RAISE EXCEPTION 'Political pin is not in its immutable appearance'; END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM world_map_state_version v CROSS JOIN LATERAL jsonb_array_elements(coalesce(v.payload->'territories','[]'::jsonb)) t CROSS JOIN LATERAL jsonb_array_elements(t->'history') h WHERE v.id=NEW.version_id AND t->>'id'=NEW.territory_id AND h->>'entityId'=NEW.entity_id AND h->>'versionId'=NEW.history_version_id) THEN RAISE EXCEPTION 'History pin is not in its immutable appearance'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_territory_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='world_map_territory' THEN
  IF EXISTS(SELECT 1 FROM world_geography WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM world_lore_identity WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM world_atlas_map WHERE id=NEW.id) THEN RAISE EXCEPTION 'Territory identity is separate from existing place, map and political subjects'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM world_map_state_object WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM world_atlas_feature WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM world_atlas_drawing WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM world_atlas_settlement_shape WHERE id=NEW.id) THEN RAISE EXCEPTION 'Political boundary cannot reuse physical artwork identity'; END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM world_map_territory_boundary WHERE id=NEW.parent_id AND world_id=NEW.world_id AND map_id=NEW.map_id AND territory_id=NEW.territory_id AND parent_id IS NULL) THEN RAISE EXCEPTION 'A political hole belongs to its own territory outer ring'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_political_art_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM world_map_territory_boundary WHERE id=NEW.id) THEN RAISE EXCEPTION 'Physical artwork cannot reuse a retained political boundary identity'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_map_territory_lore','world_map_territory_history'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=t||'_reference' AND tgrelid=t::regclass) THEN EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_map_territory_reference_guard()',t||'_reference',t); END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['world_map_territory','world_map_territory_boundary'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=t||'_identity' AND tgrelid=t::regclass) THEN EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION world_map_territory_identity_guard()',t||'_identity',t); END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['world_map_state_object','world_atlas_feature','world_atlas_drawing','world_atlas_settlement_shape'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=t||'_political_identity' AND tgrelid=t::regclass) THEN EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION world_map_political_art_guard()',t||'_political_identity',t); END IF;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_payload_valid(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT world_map_state_6bb_payload_valid(p-'territories') IS TRUE AND (NOT p ? 'territories' OR world_map_territories_valid(p->'territories') IS TRUE)
$$;
--> statement-breakpoint
ALTER TABLE world_map_state_version DROP CONSTRAINT IF EXISTS map_state_payload_valid;
--> statement-breakpoint
ALTER TABLE world_map_state_version ADD CONSTRAINT map_state_payload_valid CHECK(world_map_state_payload_valid(payload) IS TRUE);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_territory_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t jsonb; b jsonb; r jsonb; h jsonb; old jsonb; v world_lore_version; label text; expected integer:=0; expected_history integer:=0;
BEGIN
 SELECT payload INTO old FROM world_map_state_version WHERE id=coalesce(NEW.previous_version_id,NEW.source_version_id);
 IF jsonb_array_length(coalesce(NEW.payload->'territories','[]'::jsonb))>0 AND NOT EXISTS (SELECT 1 FROM world WHERE id=NEW.world_id AND owner_id=NEW.author_id) THEN RAISE EXCEPTION 'Historical political authorship belongs to the World owner'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(old->'territories','[]'::jsonb)) prior WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(NEW.payload->'territories','[]'::jsonb)) current WHERE current->>'id'=prior->>'id')) THEN RAISE EXCEPTION 'Retain historical territory identities'; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(coalesce(NEW.payload->'territories','[]'::jsonb)) LOOP
  IF NEW.state_id IS NULL OR NOT EXISTS (SELECT 1 FROM world_map_territory WHERE id=t->>'id' AND world_id=NEW.world_id AND map_id=NEW.map_id) THEN RAISE EXCEPTION 'Territory belongs to a historical map appearance'; END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(t->'boundaries') LOOP
   IF NOT EXISTS (SELECT 1 FROM world_map_territory_boundary WHERE id=b->>'id' AND world_id=NEW.world_id AND map_id=NEW.map_id AND territory_id=t->>'id' AND parent_id IS NOT DISTINCT FROM b->>'parentId') THEN RAISE EXCEPTION 'Territory boundary identity mismatch'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(old->'territories','[]'::jsonb)) prior CROSS JOIN LATERAL jsonb_array_elements(prior->'boundaries') ring WHERE prior->>'id'=t->>'id' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'boundaries') current WHERE current->>'id'=ring->>'id')) THEN RAISE EXCEPTION 'Retain historical boundary identities'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(t->'geographyIds') g WHERE NOT EXISTS (SELECT 1 FROM world_map_state_geography WHERE version_id=NEW.id AND geography_id=g.value AND world_id=NEW.world_id) OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'geographies') local_geo WHERE local_geo->>'id'=g.value)) THEN RAISE EXCEPTION 'Territory geography mismatch'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(t->'relationships') LOOP
   expected:=expected+1;
   IF (r->>'startYear')::numeric<NEW.start_year OR (r->>'endYear')::numeric>NEW.end_year THEN RAISE EXCEPTION 'Political relationship dates must fit the authored appearance period'; END IF;
   SELECT * INTO v FROM world_lore_version WHERE id=r->>'versionId' AND entity_id=r->>'entityId' AND world_id=NEW.world_id;
   SELECT name INTO label FROM world_lore_display WHERE version_id=v.id;
   IF v.id IS NULL OR v.family<>r->>'family' OR label IS DISTINCT FROM r->>'entityName' OR NOT EXISTS (SELECT 1 FROM world_map_territory_lore WHERE version_id=NEW.id AND territory_id=t->>'id' AND id=r->>'id' AND entity_id=r->>'entityId' AND lore_version_id=r->>'versionId') THEN RAISE EXCEPTION 'Exact political source mismatch'; END IF;
   IF EXISTS (SELECT 1 FROM world_map_territory_lore WHERE id=r->>'id' AND (territory_id<>t->>'id' OR entity_id<>r->>'entityId')) THEN RAISE EXCEPTION 'Political relationship identity cannot be reassigned'; END IF;
   IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(old->'territories','[]'::jsonb)) prior CROSS JOIN LATERAL jsonb_array_elements(prior->'relationships') pin WHERE prior->>'id'=t->>'id' AND pin->>'id'=r->>'id' AND pin->>'versionId'=r->>'versionId' AND pin->>'revision'=r->>'revision') AND NOT EXISTS (SELECT 1 FROM world_lore_head selected JOIN world_lore_version current ON current.id=selected.version_id WHERE selected.world_id=NEW.world_id AND selected.timeline_id=NEW.timeline_id AND selected.entity_id=r->>'entityId' AND selected.version_id=r->>'versionId' AND selected.revision=(r->>'revision')::integer AND selected.mode IN ('authored','inherited','interpretation') AND NOT current.archived) THEN RAISE EXCEPTION 'Political source not selected in this timeline'; END IF;
  END LOOP;
  FOR h IN SELECT value FROM jsonb_array_elements(t->'history') LOOP
   expected_history:=expected_history+1;
   IF NOT EXISTS (SELECT 1 FROM world_map_territory_history pin JOIN world_history_version source ON source.id=pin.history_version_id WHERE pin.version_id=NEW.id AND pin.territory_id=t->>'id' AND pin.entity_id=h->>'entityId' AND pin.history_version_id=h->>'versionId' AND coalesce(source.payload->>'title',source.payload->>'name')=h->>'name') THEN RAISE EXCEPTION 'Exact History source mismatch'; END IF;
   IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(old->'territories','[]'::jsonb)) prior CROSS JOIN LATERAL jsonb_array_elements(prior->'history') pin WHERE prior->>'id'=t->>'id' AND pin->>'entityId'=h->>'entityId' AND pin->>'versionId'=h->>'versionId') AND NOT EXISTS (SELECT 1 FROM world_history_head WHERE world_id=NEW.world_id AND timeline_id=NEW.timeline_id AND entity_id=h->>'entityId' AND version_id=h->>'versionId' AND mode IN ('authored','inherited','partial','interpretation')) THEN RAISE EXCEPTION 'History source not selected in this timeline'; END IF;
  END LOOP;
 END LOOP;
 IF expected<>(SELECT count(*) FROM world_map_territory_lore WHERE version_id=NEW.id) OR expected_history<>(SELECT count(*) FROM world_map_territory_history WHERE version_id=NEW.id) THEN RAISE EXCEPTION 'Historical political references incomplete'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_map_territory','world_map_territory_boundary','world_map_territory_lore','world_map_territory_history'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION world_map_state_immutable()',t||'_immutable',t); END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='territory_source_complete' AND tgrelid='world_map_state_version'::regclass) THEN CREATE CONSTRAINT TRIGGER territory_source_complete AFTER INSERT ON world_map_state_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_map_territory_complete(); END IF;
END $$;
--> statement-breakpoint
