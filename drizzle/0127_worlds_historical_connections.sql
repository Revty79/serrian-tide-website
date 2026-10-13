CREATE OR REPLACE FUNCTION world_map_connection_payload_valid(d jsonb,s jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE b jsonb;
BEGIN
 IF jsonb_typeof(d)<>'object' OR NOT d ?& ARRAY['name','startYear','endYear','status','destinationMapId','destinationGeographyId','account','accountYear','originalNotation','protected'] OR d-ARRAY['name','startYear','endYear','status','destinationMapId','destinationGeographyId','account','accountYear','originalNotation','protected']<>'{}'::jsonb THEN RETURN false; END IF;
 IF coalesce(jsonb_typeof(d->'name')='string' AND length(trim(d->>'name')) BETWEEN 1 AND 160 AND jsonb_typeof(d->'account')='string' AND length(trim(d->>'account')) BETWEEN 1 AND 12000 AND jsonb_typeof(d->'originalNotation')='string' AND length(d->>'originalNotation')<=4000 AND jsonb_typeof(d->'protected')='boolean' AND d->>'status' IN ('available','unavailable','obsolete','unknown') AND jsonb_typeof(d->'startYear')='number' AND jsonb_typeof(d->'endYear')='number',false) IS NOT TRUE THEN RETURN false; END IF;
 IF abs((d->>'startYear')::numeric)>1000000000000 OR abs((d->>'endYear')::numeric)>1000000000000 OR (d->>'startYear')::numeric<>trunc((d->>'startYear')::numeric) OR (d->>'endYear')::numeric<>trunc((d->>'endYear')::numeric) OR (d->>'endYear')::numeric<(d->>'startYear')::numeric THEN RETURN false; END IF;
 IF d->'accountYear'<>'null'::jsonb AND (jsonb_typeof(d->'accountYear')<>'number' OR abs((d->>'accountYear')::numeric)>1000000000000 OR (d->>'accountYear')::numeric<>trunc((d->>'accountYear')::numeric)) THEN RETURN false; END IF;
 IF d->>'status'='available' THEN IF coalesce(d->>'destinationMapId' ~ '^[0-9a-fA-F-]{36}$',false) IS NOT TRUE THEN RETURN false; END IF;
 ELSE IF d->'destinationMapId'<>'null'::jsonb OR d->'destinationGeographyId'<>'null'::jsonb THEN RETURN false; END IF; END IF;
 IF d->'destinationGeographyId'<>'null'::jsonb AND coalesce(d->>'destinationGeographyId' ~ '^[0-9a-fA-F-]{36}$',false) IS NOT TRUE THEN RETURN false; END IF;
 IF jsonb_typeof(s)<>'object' OR NOT s ?& ARRAY['placeName','destinationName','arrivalName','baseline','ordinary'] OR s-ARRAY['placeName','destinationName','arrivalName','baseline','ordinary']<>'{}'::jsonb OR coalesce(jsonb_typeof(s->'placeName')='string' AND length(trim(s->>'placeName')) BETWEEN 1 AND 160 AND jsonb_typeof(s->'ordinary')='boolean',false) IS NOT TRUE THEN RETURN false; END IF;
 IF (d->'destinationMapId'='null'::jsonb)<>(s->'destinationName'='null'::jsonb) OR (s->'destinationName'<>'null'::jsonb AND (jsonb_typeof(s->'destinationName')<>'string' OR length(trim(s->>'destinationName')) NOT BETWEEN 1 AND 160)) OR (d->'destinationGeographyId'='null'::jsonb)<>(s->'arrivalName'='null'::jsonb) OR (s->'arrivalName'<>'null'::jsonb AND (jsonb_typeof(s->'arrivalName')<>'string' OR length(trim(s->>'arrivalName')) NOT BETWEEN 1 AND 160)) THEN RETURN false; END IF;
 b:=s->'baseline';IF b<>'null'::jsonb THEN
  IF jsonb_typeof(b)<>'object' OR NOT b ?& ARRAY['id','revision','sourceMapId','geographyId','destinationMapId','destinationGeographyId'] OR b-ARRAY['id','revision','sourceMapId','geographyId','destinationMapId','destinationGeographyId']<>'{}'::jsonb OR coalesce(b->>'id' ~ '^[0-9a-fA-F-]{36}$' AND b->>'sourceMapId' ~ '^[0-9a-fA-F-]{36}$' AND b->>'geographyId' ~ '^[0-9a-fA-F-]{36}$' AND b->>'destinationMapId' ~ '^[0-9a-fA-F-]{36}$' AND jsonb_typeof(b->'revision')='number' AND (b->>'revision')::numeric>0 AND (b->>'revision')::numeric=trunc((b->>'revision')::numeric),false) IS NOT TRUE OR (b->'destinationGeographyId'<>'null'::jsonb AND coalesce(b->>'destinationGeographyId' ~ '^[0-9a-fA-F-]{36}$',false) IS NOT TRUE) THEN RETURN false; END IF;
 END IF;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_connection_head" (
	"timeline_id" text NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"version_id" text NOT NULL,
	"revision" integer NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "world_map_connection_head_timeline_id_connection_id_pk" PRIMARY KEY("timeline_id","connection_id"),
	CONSTRAINT "map_connection_head_valid" CHECK ("world_map_connection_head"."revision">0 AND "world_map_connection_head"."mode" IN ('authored','retained','interpretation'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_connection_history" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"origin_timeline_id" text NOT NULL,
	CONSTRAINT "map_connection_identity_uq" UNIQUE("id","world_id","map_id","geography_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_connection_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"timeline_id" text NOT NULL,
	"source_version_id" text,
	"previous_version_id" text,
	"destination_map_id" text,
	"destination_geography_id" text,
	"baseline_destination_map_id" text,
	"baseline_arrival_id" text,
	"start_year" bigint NOT NULL,
	"end_year" bigint NOT NULL,
	"archived" boolean NOT NULL,
	"draft" jsonb NOT NULL,
	"source" jsonb NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "map_connection_version_subject_uq" UNIQUE("id","world_id","map_id","geography_id"),
	CONSTRAINT "map_connection_version_identity_uq" UNIQUE("id","world_id","map_id","geography_id","connection_id"),
	CONSTRAINT "map_connection_version_valid" CHECK (abs("world_map_connection_version"."start_year")<=1000000000000 AND abs("world_map_connection_version"."end_year")<=1000000000000 AND "world_map_connection_version"."start_year"<="world_map_connection_version"."end_year" AND length("world_map_connection_version"."author_id")>0 AND ("world_map_connection_version"."source_version_id" IS NULL OR "world_map_connection_version"."source_version_id"<>"world_map_connection_version"."id") AND ("world_map_connection_version"."previous_version_id" IS NULL OR "world_map_connection_version"."previous_version_id"<>"world_map_connection_version"."id") AND ("world_map_connection_version"."destination_map_id" IS NULL OR "world_map_connection_version"."destination_map_id"<>"world_map_connection_version"."map_id") AND world_map_connection_payload_valid("world_map_connection_version"."draft","world_map_connection_version"."source") IS TRUE AND ("world_map_connection_version"."draft"->>'startYear')::bigint="world_map_connection_version"."start_year" AND ("world_map_connection_version"."draft"->>'endYear')::bigint="world_map_connection_version"."end_year" AND ("world_map_connection_version"."draft"->>'destinationMapId') IS NOT DISTINCT FROM "world_map_connection_version"."destination_map_id" AND ("world_map_connection_version"."draft"->>'destinationGeographyId') IS NOT DISTINCT FROM "world_map_connection_version"."destination_geography_id" AND ("world_map_connection_version"."source"->'baseline'->>'destinationMapId') IS NOT DISTINCT FROM "world_map_connection_version"."baseline_destination_map_id" AND ("world_map_connection_version"."source"->'baseline'->>'destinationGeographyId') IS NOT DISTINCT FROM "world_map_connection_version"."baseline_arrival_id")
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_head_timeline_fk' AND conrelid='world_map_connection_head'::regclass) THEN ALTER TABLE "world_map_connection_head" ADD CONSTRAINT "map_connection_head_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_head_version_fk' AND conrelid='world_map_connection_head'::regclass) THEN ALTER TABLE "world_map_connection_head" ADD CONSTRAINT "map_connection_head_version_fk" FOREIGN KEY ("version_id","world_id","map_id","geography_id","connection_id") REFERENCES "public"."world_map_connection_version"("id","world_id","map_id","geography_id","connection_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_map_fk' AND conrelid='world_map_connection_history'::regclass) THEN ALTER TABLE "world_map_connection_history" ADD CONSTRAINT "map_connection_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_place_fk' AND conrelid='world_map_connection_history'::regclass) THEN ALTER TABLE "world_map_connection_history" ADD CONSTRAINT "map_connection_place_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_origin_fk' AND conrelid='world_map_connection_history'::regclass) THEN ALTER TABLE "world_map_connection_history" ADD CONSTRAINT "map_connection_origin_fk" FOREIGN KEY ("origin_timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_version_identity_fk' AND conrelid='world_map_connection_version'::regclass) THEN ALTER TABLE "world_map_connection_version" ADD CONSTRAINT "map_connection_version_identity_fk" FOREIGN KEY ("connection_id","world_id","map_id","geography_id") REFERENCES "public"."world_map_connection_history"("id","world_id","map_id","geography_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_version_timeline_fk' AND conrelid='world_map_connection_version'::regclass) THEN ALTER TABLE "world_map_connection_version" ADD CONSTRAINT "map_connection_version_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_version_source_fk' AND conrelid='world_map_connection_version'::regclass) THEN ALTER TABLE "world_map_connection_version" ADD CONSTRAINT "map_connection_version_source_fk" FOREIGN KEY ("source_version_id","world_id","map_id","geography_id") REFERENCES "public"."world_map_connection_version"("id","world_id","map_id","geography_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_version_previous_fk' AND conrelid='world_map_connection_version'::regclass) THEN ALTER TABLE "world_map_connection_version" ADD CONSTRAINT "map_connection_version_previous_fk" FOREIGN KEY ("previous_version_id","world_id","map_id","geography_id","connection_id") REFERENCES "public"."world_map_connection_version"("id","world_id","map_id","geography_id","connection_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_destination_fk' AND conrelid='world_map_connection_version'::regclass) THEN ALTER TABLE "world_map_connection_version" ADD CONSTRAINT "map_connection_destination_fk" FOREIGN KEY ("destination_map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_arrival_fk' AND conrelid='world_map_connection_version'::regclass) THEN ALTER TABLE "world_map_connection_version" ADD CONSTRAINT "map_connection_arrival_fk" FOREIGN KEY ("destination_geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_baseline_destination_fk' AND conrelid='world_map_connection_version'::regclass) THEN ALTER TABLE "world_map_connection_version" ADD CONSTRAINT "map_connection_baseline_destination_fk" FOREIGN KEY ("baseline_destination_map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_connection_baseline_arrival_fk' AND conrelid='world_map_connection_version'::regclass) THEN ALTER TABLE "world_map_connection_version" ADD CONSTRAINT "map_connection_baseline_arrival_fk" FOREIGN KEY ("baseline_arrival_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_connection_head_year_idx" ON "world_map_connection_head" USING btree ("world_id","timeline_id","map_id","geography_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_connection_version_source_idx" ON "world_map_connection_version" USING btree ("world_id","map_id","connection_id","created_at");

--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_connection_place_ordinary(w text,p text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM world_geography WHERE id=p AND world_id=w) AND NOT EXISTS(WITH RECURSIVE hidden(id) AS (
  SELECT geography_id FROM world_dungeon_entity WHERE world_id=w AND visibility<>'ordinary' AND geography_id IS NOT NULL
  UNION SELECT g.id FROM world_geography g JOIN hidden h ON g.parent_id=h.id WHERE g.world_id=w
 ) SELECT 1 FROM hidden WHERE id=p)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_connection_map_ordinary(w text,m text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM world_atlas_map WHERE id=m AND world_id=w AND (geography_id IS NULL OR world_map_connection_place_ordinary(w,geography_id)))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_connection_arrival_valid(m text,w text,p text) RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM world_geography WHERE id=p AND world_id=w UNION SELECT g.id,g.parent_id FROM world_geography g JOIN ancestors a ON a.parent_id=g.id WHERE g.world_id=w)
 SELECT EXISTS(SELECT 1 FROM world_atlas_map a WHERE a.id=m AND a.world_id=w AND a.geography_id IN (SELECT id FROM ancestors))
 OR EXISTS(SELECT 1 FROM world_atlas_feature WHERE world_id=w AND map_id=m AND geography_id IN(SELECT id FROM ancestors))
 OR EXISTS(SELECT 1 FROM world_atlas_drawing WHERE world_id=w AND map_id=m AND geography_id IN(SELECT id FROM ancestors))
 OR EXISTS(SELECT 1 FROM world_settlement_entity e JOIN world_atlas_map a ON a.geography_id=e.settlement_id WHERE e.world_id=w AND a.world_id=w AND a.id=m AND e.geography_id IN(SELECT id FROM ancestors))
 OR EXISTS(SELECT 1 FROM world_map_state_geography WHERE world_id=w AND map_id=m AND geography_id IN(SELECT id FROM ancestors))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_connection_is_ordinary(v_id text,w text) RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH RECURSIVE sources(id) AS (SELECT id FROM world_map_connection_version WHERE id=v_id AND world_id=w UNION SELECT n.id FROM sources s JOIN world_map_connection_version v ON v.id=s.id CROSS JOIN LATERAL(SELECT v.source_version_id AS id UNION SELECT h.version_id FROM world_map_connection_head h WHERE h.world_id=w AND h.timeline_id=v.timeline_id AND h.connection_id=v.connection_id) n WHERE n.id IS NOT NULL AND v.world_id=w)
 SELECT EXISTS(SELECT 1 FROM sources) AND NOT EXISTS(SELECT 1 FROM sources s JOIN world_map_connection_version v ON v.id=s.id WHERE (v.draft->>'protected')::boolean OR NOT (v.source->>'ordinary')::boolean
  OR NOT world_map_connection_map_ordinary(w,v.map_id) OR NOT world_map_connection_place_ordinary(w,v.geography_id)
  OR (v.destination_map_id IS NOT NULL AND NOT world_map_connection_map_ordinary(w,v.destination_map_id)) OR (v.destination_geography_id IS NOT NULL AND NOT world_map_connection_place_ordinary(w,v.destination_geography_id))
  OR (v.baseline_destination_map_id IS NOT NULL AND NOT world_map_connection_map_ordinary(w,v.baseline_destination_map_id)) OR (v.baseline_arrival_id IS NOT NULL AND NOT world_map_connection_place_ordinary(w,v.baseline_arrival_id)))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_connection_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior world_map_connection_version; b jsonb; label text; owner text; selected_id text;
BEGIN
 SELECT owner_id INTO owner FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF owner IS DISTINCT FROM NEW.author_id THEN RAISE EXCEPTION 'Historical connection authorship belongs to the World owner'; END IF;
 IF NEW.previous_version_id IS NOT NULL THEN
  SELECT * INTO prior FROM world_map_connection_version WHERE id=NEW.previous_version_id;
  SELECT version_id INTO selected_id FROM world_map_connection_head WHERE world_id=NEW.world_id AND timeline_id=NEW.timeline_id AND connection_id=NEW.connection_id;
  IF selected_id IS DISTINCT FROM prior.id THEN RAISE EXCEPTION 'Historical connection previous source must be its selected head'; END IF;
  IF NEW.source_version_id IS DISTINCT FROM (CASE WHEN prior.timeline_id=NEW.timeline_id THEN prior.source_version_id ELSE prior.id END) THEN RAISE EXCEPTION 'Retain the exact historical connection source chain'; END IF;
 ELSIF NEW.source_version_id IS NOT NULL THEN
  SELECT * INTO prior FROM world_map_connection_version WHERE id=NEW.source_version_id;
  IF NOT EXISTS(WITH RECURSIVE sources(id) AS (SELECT version_id FROM world_map_connection_head WHERE world_id=NEW.world_id AND timeline_id=NEW.timeline_id AND map_id=NEW.map_id UNION SELECT n.id FROM sources s JOIN world_map_connection_version v ON v.id=s.id CROSS JOIN LATERAL(SELECT v.previous_version_id AS id UNION SELECT v.source_version_id) n WHERE n.id IS NOT NULL) SELECT 1 FROM sources WHERE id=NEW.source_version_id) THEN RAISE EXCEPTION 'Choose an exact connection source retained by this timeline'; END IF;
 END IF;
 SELECT name INTO label FROM world_geography WHERE id=NEW.geography_id AND world_id=NEW.world_id;
 IF NEW.source->>'placeName' IS DISTINCT FROM coalesce(prior.source->>'placeName',label) THEN RAISE EXCEPTION 'Historical connection place source mismatch'; END IF;
 IF prior.id IS NOT NULL THEN IF NEW.source->'baseline' IS DISTINCT FROM prior.source->'baseline' OR (NOT (prior.source->>'ordinary')::boolean AND (NEW.source->>'ordinary')::boolean) THEN RAISE EXCEPTION 'Retain the original shared connection source and protection'; END IF;
 ELSE
  b:=NEW.source->'baseline';
  IF EXISTS(SELECT 1 FROM world_atlas_connection WHERE world_id=NEW.world_id AND source_map_id=NEW.map_id AND geography_id=NEW.geography_id) AND b='null'::jsonb THEN RAISE EXCEPTION 'Capture the shared connection source explicitly'; END IF;
  IF b<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM world_atlas_connection WHERE id=b->>'id' AND world_id=NEW.world_id AND source_map_id=NEW.map_id AND geography_id=NEW.geography_id AND revision=(b->>'revision')::integer AND destination_map_id=NEW.baseline_destination_map_id AND destination_geography_id IS NOT DISTINCT FROM NEW.baseline_arrival_id) THEN RAISE EXCEPTION 'Exact shared connection source mismatch'; END IF;
 END IF;
 IF NEW.destination_map_id IS NOT NULL THEN
  SELECT name INTO label FROM world_atlas_map WHERE id=NEW.destination_map_id AND world_id=NEW.world_id;
  IF NEW.previous_version_id IS NULL OR NEW.destination_map_id IS DISTINCT FROM prior.destination_map_id OR NEW.source->>'destinationName' IS DISTINCT FROM prior.source->>'destinationName' THEN IF NEW.source->>'destinationName' IS DISTINCT FROM label THEN RAISE EXCEPTION 'Historical destination source mismatch'; END IF; END IF;
 END IF;
 IF NEW.destination_geography_id IS NOT NULL THEN
  SELECT name INTO label FROM world_geography WHERE id=NEW.destination_geography_id AND world_id=NEW.world_id;
  IF NEW.previous_version_id IS NULL OR NEW.destination_geography_id IS DISTINCT FROM prior.destination_geography_id OR NEW.source->>'arrivalName' IS DISTINCT FROM prior.source->>'arrivalName' THEN IF NEW.source->>'arrivalName' IS DISTINCT FROM label THEN RAISE EXCEPTION 'Historical arrival source mismatch'; END IF; END IF;
  IF NOT world_map_connection_arrival_valid(NEW.destination_map_id,NEW.world_id,NEW.destination_geography_id) THEN RAISE EXCEPTION 'Historical arrival belongs to its destination representation'; END IF;
 END IF;
 IF (NEW.source->>'ordinary')::boolean AND (NOT world_map_connection_place_ordinary(NEW.world_id,NEW.geography_id) OR (NEW.destination_map_id IS NOT NULL AND NOT world_map_connection_map_ordinary(NEW.world_id,NEW.destination_map_id)) OR (NEW.destination_geography_id IS NOT NULL AND NOT world_map_connection_place_ordinary(NEW.world_id,NEW.destination_geography_id)) OR (NEW.baseline_destination_map_id IS NOT NULL AND NOT world_map_connection_map_ordinary(NEW.world_id,NEW.baseline_destination_map_id)) OR (NEW.baseline_arrival_id IS NOT NULL AND NOT world_map_connection_place_ordinary(NEW.world_id,NEW.baseline_arrival_id))) THEN RAISE EXCEPTION 'Retain captured protected connection subjects'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_connection_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v world_map_connection_version; parent text;
BEGIN
 PERFORM 1 FROM world WHERE id=NEW.world_id FOR UPDATE;
 SELECT * INTO v FROM world_map_connection_version WHERE id=NEW.version_id;
 SELECT parent_id INTO parent FROM world_timeline WHERE id=NEW.timeline_id AND world_id=NEW.world_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Historical connection timeline must be active'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.timeline_id<>OLD.timeline_id OR NEW.world_id<>OLD.world_id OR NEW.map_id<>OLD.map_id OR NEW.geography_id<>OLD.geography_id OR NEW.connection_id<>OLD.connection_id OR NEW.revision<>OLD.revision+1 OR v.previous_version_id IS DISTINCT FROM OLD.version_id OR v.timeline_id<>NEW.timeline_id OR NEW.mode<>(CASE WHEN OLD.mode IN ('retained','interpretation') THEN 'interpretation' ELSE 'authored' END) THEN RAISE EXCEPTION 'Historical connection head must advance its exact selected source'; END IF;
 ELSE
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'Historical connection starts at revision one'; END IF;
  IF NEW.mode='retained' THEN
   IF parent IS NULL OR v.archived OR NOT EXISTS(SELECT 1 FROM world_map_connection_head WHERE world_id=NEW.world_id AND map_id=NEW.map_id AND timeline_id=parent AND connection_id=NEW.connection_id AND version_id=NEW.version_id) THEN RAISE EXCEPTION 'Retain an exact selected direct-parent connection source'; END IF;
  ELSIF NEW.mode<>'authored' OR v.timeline_id<>NEW.timeline_id OR NOT EXISTS(SELECT 1 FROM world_map_connection_history WHERE id=NEW.connection_id AND origin_timeline_id=NEW.timeline_id) THEN RAISE EXCEPTION 'Author the connection in its selected origin timeline'; END IF;
 END IF;
 IF NOT v.archived AND EXISTS(SELECT 1 FROM world_map_connection_head h JOIN world_map_connection_version other ON other.id=h.version_id WHERE h.world_id=NEW.world_id AND h.timeline_id=NEW.timeline_id AND h.map_id=NEW.map_id AND h.geography_id=NEW.geography_id AND h.connection_id<>NEW.connection_id AND NOT other.archived AND other.start_year<=v.end_year AND v.start_year<=other.end_year) THEN RAISE EXCEPTION 'Historical connection periods overlap'; END IF;
 IF TG_OP='INSERT' AND (SELECT count(*) FROM world_map_connection_head WHERE world_id=NEW.world_id AND timeline_id=NEW.timeline_id AND map_id=NEW.map_id)>=128 THEN RAISE EXCEPTION 'Historical connections support 128 accounts per map and timeline'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_connection_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM world_atlas_connection WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM world_atlas_map WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM world_geography WHERE id=NEW.id) THEN RAISE EXCEPTION 'Historical connection identities are separate from shared map and place identities'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_map_connection_history','world_map_connection_version'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION world_map_state_immutable()',t||'_immutable',t); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='map_connection_version_guard' AND tgrelid='world_map_connection_version'::regclass) THEN CREATE TRIGGER map_connection_version_guard BEFORE INSERT ON world_map_connection_version FOR EACH ROW EXECUTE FUNCTION world_map_connection_version_guard(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='map_connection_head_guard' AND tgrelid='world_map_connection_head'::regclass) THEN CREATE TRIGGER map_connection_head_guard BEFORE INSERT OR UPDATE ON world_map_connection_head FOR EACH ROW EXECUTE FUNCTION world_map_connection_head_guard(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='map_connection_head_keep' AND tgrelid='world_map_connection_head'::regclass) THEN CREATE TRIGGER map_connection_head_keep BEFORE DELETE ON world_map_connection_head FOR EACH ROW EXECUTE FUNCTION world_map_state_immutable(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='map_connection_identity_guard' AND tgrelid='world_map_connection_history'::regclass) THEN CREATE TRIGGER map_connection_identity_guard BEFORE INSERT ON world_map_connection_history FOR EACH ROW EXECUTE FUNCTION world_map_connection_identity_guard(); END IF;
END $$;
--> statement-breakpoint
