-- Only appended to the new 0124 migration during development; prior migrations are frozen.
CREATE OR REPLACE FUNCTION world_map_state_payload_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; ids text[] := '{}'; points integer := 0;
BEGIN
 IF coalesce(jsonb_typeof(p->'name')='string' AND jsonb_typeof(p->'description')='string' AND jsonb_typeof(p->'scope')='string' AND jsonb_typeof(p->'features')='array' AND jsonb_typeof(p->'drawings')='array' AND jsonb_typeof(p->'geographies')='array',false) IS NOT TRUE THEN RETURN false; END IF;
 IF jsonb_typeof(p)<>'object' OR length(trim(p->>'name')) NOT BETWEEN 1 AND 160 OR length(p->>'description')>12000
 OR p->>'scope' NOT IN ('world','continent','regional','local') OR jsonb_typeof(p->'features')<>'array'
 OR jsonb_array_length(p->'features')>128 OR jsonb_typeof(p->'drawings')<>'array' OR jsonb_array_length(p->'drawings')>512
 OR jsonb_typeof(p->'geographies')<>'array' OR jsonb_array_length(p->'geographies')>4128
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
CREATE TABLE IF NOT EXISTS "world_map_state" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"origin_timeline_id" text NOT NULL,
	CONSTRAINT "map_state_identity_uq" UNIQUE("id","world_id","map_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_state_geography" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"geography_id" text NOT NULL,
	CONSTRAINT "world_map_state_geography_version_id_geography_id_pk" PRIMARY KEY("version_id","geography_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_state_head" (
	"timeline_id" text NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"state_id" text NOT NULL,
	"version_id" text NOT NULL,
	"revision" integer NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "world_map_state_head_timeline_id_state_id_pk" PRIMARY KEY("timeline_id","state_id"),
	CONSTRAINT "map_state_head_valid" CHECK ("world_map_state_head"."revision">0 AND "world_map_state_head"."mode" IN ('authored','retained','interpretation'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_state_object" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"kind" text NOT NULL,
	"geography_id" text,
	CONSTRAINT "map_state_object_valid" CHECK ("world_map_state_object"."kind" IN ('feature','terrain','path','symbol','label') AND ("world_map_state_object"."kind"<>'feature' OR "world_map_state_object"."geography_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_map_state_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"state_id" text,
	"timeline_id" text NOT NULL,
	"source_version_id" text,
	"previous_version_id" text,
	"baseline_revision" integer NOT NULL,
	"name" text NOT NULL,
	"start_year" bigint,
	"end_year" bigint,
	"account" text NOT NULL,
	"protected" boolean NOT NULL,
	"archived" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"generation" jsonb,
	"author_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "map_state_version_map_uq" UNIQUE("id","world_id","map_id"),
	CONSTRAINT "map_state_version_state_uq" UNIQUE("id","world_id","map_id","state_id"),
	CONSTRAINT "map_state_version_valid" CHECK (length(trim("world_map_state_version"."name")) BETWEEN 1 AND 160 AND length("world_map_state_version"."account")<=12000 AND length("world_map_state_version"."author_id")>0 AND "world_map_state_version"."baseline_revision">0 AND ("world_map_state_version"."source_version_id" IS NULL OR "world_map_state_version"."source_version_id"<>"world_map_state_version"."id") AND (("world_map_state_version"."state_id" IS NULL AND "world_map_state_version"."start_year" IS NULL AND "world_map_state_version"."end_year" IS NULL AND "world_map_state_version"."source_version_id" IS NULL AND NOT "world_map_state_version"."archived") OR ("world_map_state_version"."state_id" IS NOT NULL AND "world_map_state_version"."start_year" IS NOT NULL AND "world_map_state_version"."end_year" IS NOT NULL AND abs("world_map_state_version"."start_year")<=1000000000000 AND abs("world_map_state_version"."end_year")<=1000000000000 AND "world_map_state_version"."start_year"<="world_map_state_version"."end_year" AND "world_map_state_version"."source_version_id" IS NOT NULL))),
	CONSTRAINT "map_state_payload_valid" CHECK (world_map_state_payload_valid("world_map_state_version"."payload") IS TRUE)
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_map_fk' AND conrelid='world_map_state'::regclass) THEN ALTER TABLE "world_map_state" ADD CONSTRAINT "map_state_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_origin_fk' AND conrelid='world_map_state'::regclass) THEN ALTER TABLE "world_map_state" ADD CONSTRAINT "map_state_origin_fk" FOREIGN KEY ("origin_timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_geography_version_fk' AND conrelid='world_map_state_geography'::regclass) THEN ALTER TABLE "world_map_state_geography" ADD CONSTRAINT "map_state_geography_version_fk" FOREIGN KEY ("version_id","world_id","map_id") REFERENCES "public"."world_map_state_version"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_geography_place_fk' AND conrelid='world_map_state_geography'::regclass) THEN ALTER TABLE "world_map_state_geography" ADD CONSTRAINT "map_state_geography_place_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_head_timeline_fk' AND conrelid='world_map_state_head'::regclass) THEN ALTER TABLE "world_map_state_head" ADD CONSTRAINT "map_state_head_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_head_version_fk' AND conrelid='world_map_state_head'::regclass) THEN ALTER TABLE "world_map_state_head" ADD CONSTRAINT "map_state_head_version_fk" FOREIGN KEY ("version_id","world_id","map_id","state_id") REFERENCES "public"."world_map_state_version"("id","world_id","map_id","state_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_object_map_fk' AND conrelid='world_map_state_object'::regclass) THEN ALTER TABLE "world_map_state_object" ADD CONSTRAINT "map_state_object_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_object_geography_fk' AND conrelid='world_map_state_object'::regclass) THEN ALTER TABLE "world_map_state_object" ADD CONSTRAINT "map_state_object_geography_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_version_map_fk' AND conrelid='world_map_state_version'::regclass) THEN ALTER TABLE "world_map_state_version" ADD CONSTRAINT "map_state_version_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_version_state_fk' AND conrelid='world_map_state_version'::regclass) THEN ALTER TABLE "world_map_state_version" ADD CONSTRAINT "map_state_version_state_fk" FOREIGN KEY ("state_id","world_id","map_id") REFERENCES "public"."world_map_state"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_version_timeline_fk' AND conrelid='world_map_state_version'::regclass) THEN ALTER TABLE "world_map_state_version" ADD CONSTRAINT "map_state_version_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_version_source_fk' AND conrelid='world_map_state_version'::regclass) THEN ALTER TABLE "world_map_state_version" ADD CONSTRAINT "map_state_version_source_fk" FOREIGN KEY ("source_version_id","world_id","map_id") REFERENCES "public"."world_map_state_version"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_state_head_map_idx" ON "world_map_state_head" USING btree ("world_id","timeline_id","map_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_state_version_state_idx" ON "world_map_state_version" USING btree ("world_id","map_id","state_id","created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical map identities and sources are immutable; append a revision.'; END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_map_state','world_map_state_version','world_map_state_geography','world_map_state_object'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION world_map_state_immutable()',t||'_immutable',t);
  END IF;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb; obj world_map_state_object; g world_geography; mid text;
BEGIN
 IF (SELECT map_kind FROM world_atlas_map WHERE id=NEW.map_id AND world_id=NEW.world_id)<>'generic' THEN RAISE EXCEPTION 'Historical map source requires a generic map'; END IF;
 IF NEW.previous_version_id=NEW.id OR (NEW.state_id IS NULL AND NEW.previous_version_id IS NOT NULL) THEN RAISE EXCEPTION 'Historical prior revision must be a separate source of the same appearance'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.payload->'features') UNION ALL SELECT value FROM jsonb_array_elements(NEW.payload->'drawings') LOOP
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
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='map_state_complete' AND tgrelid='world_map_state_version'::regclass) THEN
 CREATE CONSTRAINT TRIGGER map_state_complete AFTER INSERT ON world_map_state_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_map_state_complete(); END IF; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v world_map_state_version;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive historical map states instead of deleting their selections'; END IF;
 PERFORM 1 FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.timeline_id<>OLD.timeline_id OR NEW.world_id<>OLD.world_id OR NEW.map_id<>OLD.map_id OR NEW.state_id<>OLD.state_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Historical map selection identity or revision mismatch'; END IF;
 SELECT * INTO v FROM world_map_state_version WHERE id=NEW.version_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NEW.mode<>'retained' AND v.timeline_id<>NEW.timeline_id THEN RAISE EXCEPTION 'Authored map revision must belong to the selected timeline'; END IF;
 IF NOT v.archived AND EXISTS (SELECT 1 FROM world_map_state_head h JOIN world_map_state_version other ON other.id=h.version_id WHERE h.world_id=NEW.world_id AND h.map_id=NEW.map_id AND h.timeline_id=NEW.timeline_id AND h.state_id<>NEW.state_id AND NOT other.archived AND other.start_year<=v.end_year AND other.end_year>=v.start_year) THEN RAISE EXCEPTION 'Historical map coverage overlaps'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='map_state_head_guard' AND tgrelid='world_map_state_head'::regclass) THEN
 CREATE TRIGGER map_state_head_guard BEFORE INSERT OR UPDATE OR DELETE ON world_map_state_head FOR EACH ROW EXECUTE FUNCTION world_map_state_head_guard(); END IF; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_is_ordinary(vid text,wid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH RECURSIVE hidden(id) AS (
  SELECT id FROM world_dungeon_entity WHERE world_id=wid AND visibility<>'ordinary'
  UNION SELECT g.id FROM world_geography g JOIN hidden p ON g.parent_id=p.id WHERE g.world_id=wid
 ), sources(id) AS (
  SELECT id FROM world_map_state_version WHERE id=vid AND world_id=wid
  UNION
  SELECT next.id FROM sources s JOIN world_map_state_version v ON v.id=s.id AND v.world_id=wid
  CROSS JOIN LATERAL (SELECT v.source_version_id AS id UNION SELECT h.version_id FROM world_map_state_head h WHERE h.world_id=wid AND h.state_id=v.state_id AND h.timeline_id=v.timeline_id) next WHERE next.id IS NOT NULL
 )
 SELECT EXISTS (SELECT 1 FROM world_map_state_version WHERE id=vid AND world_id=wid) AND NOT EXISTS (
  SELECT 1 FROM sources s JOIN world_map_state_version v ON v.id=s.id WHERE v.protected
  OR EXISTS (SELECT 1 FROM world_map_state_geography g JOIN hidden ON hidden.id=g.geography_id WHERE g.version_id=v.id AND g.world_id=wid)
 )
$$;

--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_state_version_previous_fk' AND conrelid='world_map_state_version'::regclass) THEN ALTER TABLE world_map_state_version ADD CONSTRAINT map_state_version_previous_fk FOREIGN KEY(previous_version_id,world_id,map_id,state_id) REFERENCES world_map_state_version(id,world_id,map_id,state_id) ON DELETE RESTRICT; END IF; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_object_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f world_atlas_feature; d world_atlas_drawing; o world_map_state_object; k text; gid text;
BEGIN
 IF TG_TABLE_NAME='world_map_state_object' THEN
  SELECT * INTO f FROM world_atlas_feature WHERE id=NEW.id;
  IF FOUND AND (f.world_id<>NEW.world_id OR f.map_id<>NEW.map_id OR NEW.kind<>'feature' OR f.geography_id IS DISTINCT FROM NEW.geography_id) THEN RAISE EXCEPTION 'Historical feature identity conflicts with shared source'; END IF;
  SELECT * INTO d FROM world_atlas_drawing WHERE id=NEW.id;
  IF FOUND AND (d.world_id<>NEW.world_id OR d.map_id<>NEW.map_id OR d.content->>'type'<>NEW.kind OR d.geography_id IS DISTINCT FROM NEW.geography_id) THEN RAISE EXCEPTION 'Historical drawing identity conflicts with shared source'; END IF;
 ELSE
  SELECT * INTO o FROM world_map_state_object WHERE id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='world_atlas_feature' THEN k:='feature'; ELSE k:=NEW.content->>'type'; END IF;
  IF o.world_id<>NEW.world_id OR o.map_id<>NEW.map_id OR o.kind<>k OR o.geography_id IS DISTINCT FROM NEW.geography_id THEN RAISE EXCEPTION 'Shared source conflicts with a retained historical object identity'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_map_state_object','world_atlas_feature','world_atlas_drawing'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=t||'_historical_identity' AND tgrelid=t::regclass) THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION world_map_state_object_guard()',t||'_historical_identity',t);
  END IF;
 END LOOP;
END $$;
