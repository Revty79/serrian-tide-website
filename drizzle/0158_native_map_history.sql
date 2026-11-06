CREATE TABLE "world_map_state_asset_pin" (
	"component_id" text NOT NULL,
	"world_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"asset_version" integer NOT NULL,
	CONSTRAINT "world_map_state_asset_pin_component_id_asset_id_asset_version_pk" PRIMARY KEY("component_id","asset_id","asset_version"),
	CONSTRAINT "map_state_asset_pin_version_valid" CHECK ("world_map_state_asset_pin"."asset_version">0)
);
--> statement-breakpoint
CREATE TABLE "world_map_state_component" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"kind" text NOT NULL,
	"content_hash" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "map_state_component_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "map_state_component_content_uq" UNIQUE("world_id","kind","content_hash"),
	CONSTRAINT "map_state_component_revision_valid" CHECK ("world_map_state_component"."revision">=0),
	CONSTRAINT "map_state_component_valid" CHECK ("world_map_state_component"."content_hash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("world_map_state_component"."payload")='object' AND octet_length("world_map_state_component"."payload"::text)<=12582912 AND "world_map_state_component"."kind" IN ('terrain','refinement','materials','hydrology','environment','appearance','artwork','labels','town','floor','underground','craft','deck','placement','composition','connections','conditions','places'))
);
--> statement-breakpoint
CREATE TABLE "world_map_state_component_ref" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"key" text NOT NULL,
	"component_id" text NOT NULL,
	CONSTRAINT "world_map_state_component_ref_version_id_key_pk" PRIMARY KEY("version_id","key"),
	CONSTRAINT "map_state_component_ref_key_valid" CHECK (length("world_map_state_component_ref"."key") BETWEEN 1 AND 160 AND "world_map_state_component_ref"."key" ~ '^[a-z0-9:-]+$')
);
--> statement-breakpoint
CREATE TABLE "world_map_state_native_dependency" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"source_version_id" text NOT NULL,
	"source_map_id" text NOT NULL,
	CONSTRAINT "world_map_state_native_dependency_version_id_source_version_id_pk" PRIMARY KEY("version_id","source_version_id"),
	CONSTRAINT "map_state_native_dependency_distinct" CHECK ("world_map_state_native_dependency"."version_id"<>"world_map_state_native_dependency"."source_version_id")
);
--> statement-breakpoint
CREATE TABLE "world_map_state_native_request" (
	"request_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"timeline_id" text NOT NULL,
	"target_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"author_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"original_scope" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "map_state_native_request_valid" CHECK ("world_map_state_native_request"."input_hash" ~ '^[a-f0-9]{64}$' AND "world_map_state_native_request"."target_key" ~ '^(terrain|town|floor|underground|craft|deck):[a-f0-9-]{36}$' AND jsonb_typeof("world_map_state_native_request"."result")='object' AND octet_length("world_map_state_native_request"."result"::text)<=8192),
	CONSTRAINT "map_state_native_request_scope_valid" CHECK ("world_map_state_native_request"."original_scope" IS NULL OR coalesce(jsonb_typeof("world_map_state_native_request"."original_scope")='object' AND octet_length("world_map_state_native_request"."original_scope"::text)<=4096 AND "world_map_state_native_request"."original_scope"->>'timelineId'="world_map_state_native_request"."timeline_id" AND concat("world_map_state_native_request"."original_scope"->'target'->>'kind',':',"world_map_state_native_request"."original_scope"->'target'->>'id')="world_map_state_native_request"."target_key" AND "world_map_state_native_request"."original_scope"->>'stateId' ~ '^[a-f0-9-]{36}$' AND jsonb_typeof("world_map_state_native_request"."original_scope"->'year')='number' AND abs(("world_map_state_native_request"."original_scope"->>'year')::numeric)<=1000000000000 AND trunc(("world_map_state_native_request"."original_scope"->>'year')::numeric)=("world_map_state_native_request"."original_scope"->>'year')::numeric AND "world_map_state_native_request"."original_scope"->>'edit'='true' AND NOT ("world_map_state_native_request"."original_scope" ?| ARRAY['versionId','geographyVersionId','connectionSourceVersionId','connectionSourceId']),false))
);
--> statement-breakpoint
ALTER TABLE "world_craft" ADD COLUMN "native_origin_version_id" text;--> statement-breakpoint
ALTER TABLE "world_craft_deck" ADD COLUMN "native_origin_version_id" text;--> statement-breakpoint
ALTER TABLE "world_underground_level" ADD COLUMN "native_origin_version_id" text;--> statement-breakpoint
ALTER TABLE "world_building_floor" ADD COLUMN "native_origin_version_id" text;--> statement-breakpoint
ALTER TABLE "world_town_map" ADD COLUMN "native_origin_version_id" text;--> statement-breakpoint
ALTER TABLE "world_map_state_asset_pin" ADD CONSTRAINT "map_state_asset_pin_component_fk" FOREIGN KEY ("component_id","world_id") REFERENCES "public"."world_map_state_component"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_asset_pin" ADD CONSTRAINT "map_state_asset_pin_version_fk" FOREIGN KEY ("asset_id","asset_version") REFERENCES "public"."atlas_asset_version"("asset_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_component" ADD CONSTRAINT "world_map_state_component_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_component" ADD CONSTRAINT "world_map_state_component_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_component_ref" ADD CONSTRAINT "map_state_component_ref_version_fk" FOREIGN KEY ("version_id","world_id","map_id") REFERENCES "public"."world_map_state_version"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_component_ref" ADD CONSTRAINT "map_state_component_ref_content_fk" FOREIGN KEY ("component_id","world_id") REFERENCES "public"."world_map_state_component"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_native_dependency" ADD CONSTRAINT "map_state_native_dependency_target_fk" FOREIGN KEY ("version_id","world_id","map_id") REFERENCES "public"."world_map_state_version"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_native_dependency" ADD CONSTRAINT "map_state_native_dependency_source_fk" FOREIGN KEY ("source_version_id","world_id","source_map_id") REFERENCES "public"."world_map_state_version"("id","world_id","map_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_native_request" ADD CONSTRAINT "world_map_state_native_request_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_native_request" ADD CONSTRAINT "world_map_state_native_request_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_state_native_request" ADD CONSTRAINT "map_state_native_request_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_state_asset_pin_asset_idx" ON "world_map_state_asset_pin" USING btree ("asset_id","asset_version");--> statement-breakpoint
CREATE INDEX "map_state_component_ref_content_idx" ON "world_map_state_component_ref" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "map_state_native_dependency_source_idx" ON "world_map_state_native_dependency" USING btree ("source_version_id");--> statement-breakpoint
CREATE INDEX "map_state_native_request_target_idx" ON "world_map_state_native_request" USING btree ("world_id","timeline_id","target_key","created_at");--> statement-breakpoint
ALTER TABLE "world_craft" ADD CONSTRAINT "world_craft_native_origin_fk" FOREIGN KEY ("native_origin_version_id") REFERENCES "public"."world_map_state_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_deck" ADD CONSTRAINT "world_craft_deck_native_origin_fk" FOREIGN KEY ("native_origin_version_id") REFERENCES "public"."world_map_state_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_underground_level" ADD CONSTRAINT "world_underground_level_native_origin_fk" FOREIGN KEY ("native_origin_version_id") REFERENCES "public"."world_map_state_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_floor" ADD CONSTRAINT "world_building_floor_native_origin_fk" FOREIGN KEY ("native_origin_version_id") REFERENCES "public"."world_map_state_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_map" ADD CONSTRAINT "world_town_map_native_origin_fk" FOREIGN KEY ("native_origin_version_id") REFERENCES "public"."world_map_state_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_state_native_target_idx" ON "world_map_state_version" USING btree ("world_id",("payload"->'nativeAtlas'->'target'->>'kind'),("payload"->'nativeAtlas'->'target'->>'id'),"timeline_id","created_at" DESC NULLS LAST) WHERE "world_map_state_version"."payload" ? 'nativeAtlas';
--> statement-breakpoint
-- Extend the existing immutable appearance envelope; old payload validation is retained.
DO $$ BEGIN
 IF to_regprocedure('world_map_state_pre_s7a_payload_valid(jsonb)') IS NULL THEN
  ALTER FUNCTION world_map_state_payload_valid(jsonb) RENAME TO world_map_state_pre_s7a_payload_valid;
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_native_map_manifest_valid(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; keys text[] := '{}'; targets text[] := '{}';
BEGIN
 IF jsonb_typeof(p)<>'object' OR NOT(p ?& ARRAY['version','target','resources','dependencies']) OR p-ARRAY['version','target','resources','dependencies']<>'{}'::jsonb
 OR jsonb_typeof(p->'version')<>'number' OR p->>'version'<>'1' OR jsonb_typeof(p->'target')<>'object' OR NOT(p->'target' ?& ARRAY['kind','id'])
 OR (p->'target')-ARRAY['kind','id']<>'{}'::jsonb
 OR p->'target'->>'kind' NOT IN ('terrain','town','floor','underground','craft','deck')
 OR NOT (p->'target'->>'id' ~ '^[a-f0-9-]{36}$')
 OR jsonb_typeof(p->'resources')<>'array' OR jsonb_array_length(p->'resources') NOT BETWEEN 1 AND 512
 OR jsonb_typeof(p->'dependencies')<>'array' OR jsonb_array_length(p->'dependencies')>128
 OR octet_length(p::text)>98304 THEN RETURN false; END IF;
 PERFORM (p->'target'->>'id')::uuid;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'resources') LOOP
  IF jsonb_typeof(item)<>'object' OR NOT(item ?& ARRAY['key','kind','componentId']) OR item-ARRAY['key','kind','componentId']<>'{}'::jsonb
  OR jsonb_typeof(item->'key')<>'string' OR jsonb_typeof(item->'kind')<>'string' OR jsonb_typeof(item->'componentId')<>'string'
  OR NOT (item->>'key' ~ '^[a-z0-9:-]{1,160}$') OR item->>'key'=ANY(keys)
  OR item->>'kind' NOT IN ('terrain','refinement','materials','hydrology','environment','appearance','artwork','labels','town','floor','underground','craft','deck','placement','composition','connections','conditions','places')
  OR item->>'componentId' IS NULL THEN RETURN false; END IF;
  PERFORM (item->>'componentId')::uuid;
  keys:=array_append(keys,item->>'key');
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'dependencies') LOOP
  IF jsonb_typeof(item)<>'object' OR NOT(item ?& ARRAY['target','versionId']) OR item-ARRAY['target','versionId']<>'{}'::jsonb
  OR jsonb_typeof(item->'target')<>'object' OR NOT(item->'target' ?& ARRAY['kind','id'])
  OR (item->'target')-ARRAY['kind','id']<>'{}'::jsonb
  OR item->'target'->>'kind' NOT IN ('terrain','town','floor','underground','craft','deck')
  OR item->>'versionId' IS NULL OR item->'target'->>'id' IS NULL
  OR ((item->'target'->>'kind')||':'||(item->'target'->>'id'))=ANY(targets) THEN RETURN false; END IF;
  PERFORM (item->>'versionId')::uuid; PERFORM (item->'target'->>'id')::uuid;
  targets:=array_append(targets,(item->'target'->>'kind')||':'||(item->'target'->>'id'));
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_payload_valid(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT world_map_state_pre_s7a_payload_valid(p-'nativeAtlas') IS TRUE
 AND (NOT p ? 'nativeAtlas' OR world_native_map_manifest_valid(p->'nativeAtlas') IS TRUE)
$$;
--> statement-breakpoint
ALTER TABLE world_map_state_version DROP CONSTRAINT IF EXISTS map_state_payload_valid;
--> statement-breakpoint
ALTER TABLE world_map_state_version ADD CONSTRAINT map_state_payload_valid CHECK(world_map_state_payload_valid(payload) IS TRUE);
--> statement-breakpoint
-- Preserve the original head contract, separating distinct native targets on the
-- same established geographic map anchor. Legacy appearances use their old slot.
CREATE OR REPLACE FUNCTION world_map_state_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v world_map_state_version; target_key text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive historical map states instead of deleting their selections'; END IF;
 PERFORM 1 FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.timeline_id<>OLD.timeline_id OR NEW.world_id<>OLD.world_id OR NEW.map_id<>OLD.map_id OR NEW.state_id<>OLD.state_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Historical map selection identity or revision mismatch'; END IF;
 SELECT * INTO v FROM world_map_state_version WHERE id=NEW.version_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NEW.mode<>'retained' AND v.timeline_id<>NEW.timeline_id THEN RAISE EXCEPTION 'Authored map revision must belong to the selected timeline'; END IF;
 target_key:=coalesce((v.payload->'nativeAtlas'->'target'->>'kind')||':'||(v.payload->'nativeAtlas'->'target'->>'id'),'legacy');
 IF NOT v.archived AND EXISTS (
  SELECT 1 FROM world_map_state_head h JOIN world_map_state_version other ON other.id=h.version_id
  WHERE h.world_id=NEW.world_id AND h.map_id=NEW.map_id AND h.timeline_id=NEW.timeline_id AND h.state_id<>NEW.state_id
  AND coalesce((other.payload->'nativeAtlas'->'target'->>'kind')||':'||(other.payload->'nativeAtlas'->'target'->>'id'),'legacy')=target_key
  AND NOT other.archived AND other.start_year<=v.end_year AND other.end_year>=v.start_year
 ) THEN RAISE EXCEPTION 'Historical map coverage overlaps'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_native_map_state_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE manifest jsonb; source jsonb; resource jsonb; dependency jsonb; kind text; target_id text;
BEGIN
 manifest:=NEW.payload->'nativeAtlas';
 IF NEW.state_id IS NOT NULL AND EXISTS(SELECT 1 FROM world_map_state_version prior WHERE prior.world_id=NEW.world_id AND prior.state_id=NEW.state_id AND prior.id<>NEW.id AND (prior.payload->'nativeAtlas'->'target') IS DISTINCT FROM (manifest->'target')) THEN RAISE EXCEPTION 'A historical appearance retains its original native or legacy map identity'; END IF;
 SELECT payload->'nativeAtlas' INTO source FROM world_map_state_version WHERE id=NEW.source_version_id;
 IF manifest IS NULL THEN
  IF source IS NOT NULL THEN RAISE EXCEPTION 'Retain the native historical source binding'; END IF;
  RETURN NEW;
 END IF;
 IF source IS NOT NULL AND source->'target'<>manifest->'target' THEN RAISE EXCEPTION 'Native historical sources must retain the same map identity'; END IF;
 IF NEW.source_version_id IS NOT NULL AND source IS NULL THEN RAISE EXCEPTION 'A native appearance requires a compatible native source'; END IF;
 IF NOT EXISTS(SELECT 1 FROM world WHERE id=NEW.world_id AND owner_id=NEW.author_id) THEN RAISE EXCEPTION 'Native historical authoring belongs to the World owner'; END IF;
 kind:=manifest->'target'->>'kind'; target_id:=manifest->'target'->>'id';
 IF kind='terrain' AND NOT EXISTS(SELECT 1 FROM world_map_canvas c WHERE c.map_id=target_id AND c.world_id=NEW.world_id AND (c.map_id=NEW.map_id OR EXISTS(SELECT 1 FROM world_map_region r WHERE r.map_id=c.map_id AND r.world_id=c.world_id AND r.parent_map_id=NEW.map_id)))
 OR kind='town' AND NOT EXISTS(SELECT 1 FROM world_town_map t WHERE t.id=target_id AND t.world_id=NEW.world_id AND t.source_map_id=NEW.map_id)
 OR kind='floor' AND NOT EXISTS(SELECT 1 FROM world_building_floor f JOIN world_building_interior_source b ON b.building_id=f.building_id AND b.world_id=f.world_id JOIN world_town_map t ON t.id=b.town_map_id AND t.world_id=b.world_id WHERE f.id=target_id AND f.world_id=NEW.world_id AND t.source_map_id=NEW.map_id)
 OR kind='underground' AND NOT EXISTS(SELECT 1 FROM world_underground_level l WHERE l.id=target_id AND l.world_id=NEW.world_id)
 OR kind='craft' AND NOT EXISTS(SELECT 1 FROM world_craft c WHERE c.id=target_id AND c.world_id=NEW.world_id)
 OR kind='deck' AND NOT EXISTS(SELECT 1 FROM world_craft_deck d WHERE d.id=target_id AND d.world_id=NEW.world_id)
 THEN RAISE EXCEPTION 'Native historical target belongs to another World or geographic source'; END IF;
 IF (SELECT count(*) FROM world_map_state_component_ref WHERE version_id=NEW.id)<>jsonb_array_length(manifest->'resources') THEN RAISE EXCEPTION 'Historical component references are incomplete'; END IF;
 FOR resource IN SELECT value FROM jsonb_array_elements(manifest->'resources') LOOP
  IF NOT EXISTS(SELECT 1 FROM world_map_state_component_ref r JOIN world_map_state_component c ON c.id=r.component_id AND c.world_id=r.world_id WHERE r.version_id=NEW.id AND r.world_id=NEW.world_id AND r.map_id=NEW.map_id AND r.key=resource->>'key' AND c.id=resource->>'componentId' AND c.kind=resource->>'kind') THEN RAISE EXCEPTION 'Historical component source mismatch'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM world_map_state_native_dependency WHERE version_id=NEW.id)<>jsonb_array_length(manifest->'dependencies') THEN RAISE EXCEPTION 'Historical dependency references are incomplete'; END IF;
 FOR dependency IN SELECT value FROM jsonb_array_elements(manifest->'dependencies') LOOP
  IF NOT EXISTS(SELECT 1 FROM world_map_state_native_dependency d JOIN world_map_state_version s ON s.id=d.source_version_id AND s.world_id=d.world_id AND s.map_id=d.source_map_id WHERE d.version_id=NEW.id AND d.world_id=NEW.world_id AND d.source_version_id=dependency->>'versionId' AND s.payload->'nativeAtlas'->'target'=dependency->'target') THEN RAISE EXCEPTION 'Historical dependency source mismatch'; END IF;
 END LOOP;
 IF EXISTS(WITH RECURSIVE dependencies(id) AS (SELECT source_version_id FROM world_map_state_native_dependency WHERE version_id=NEW.id UNION SELECT d.source_version_id FROM dependencies p JOIN world_map_state_native_dependency d ON d.version_id=p.id) SELECT 1 FROM dependencies WHERE id=NEW.id) THEN RAISE EXCEPTION 'Historical source dependencies cannot cycle'; END IF;
 IF EXISTS(WITH RECURSIVE sources(id) AS (
  SELECT NEW.source_version_id WHERE NEW.source_version_id IS NOT NULL UNION SELECT NEW.previous_version_id WHERE NEW.previous_version_id IS NOT NULL
  UNION SELECT n.id FROM sources s JOIN world_map_state_version v ON v.id=s.id CROSS JOIN LATERAL(SELECT v.source_version_id id UNION SELECT v.previous_version_id) n WHERE n.id IS NOT NULL
 ) SELECT 1 FROM sources WHERE id=NEW.id) THEN RAISE EXCEPTION 'Historical native sources cannot cycle'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_map_state_component','world_map_state_component_ref','world_map_state_native_dependency','world_map_state_native_request','world_map_state_asset_pin'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=t::regclass) THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION world_map_state_immutable()',t||'_immutable',t);
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='native_map_state_complete' AND tgrelid='world_map_state_version'::regclass) THEN
  CREATE CONSTRAINT TRIGGER native_map_state_complete AFTER INSERT ON world_map_state_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_native_map_state_complete();
 END IF;
END $$;
--> statement-breakpoint
-- Active native maps remain creator material, just like their baseline services.
-- No ordinary reader can obtain components through the older appearance API.
DO $$ BEGIN
 IF to_regprocedure('world_map_state_pre_s7a_is_ordinary(text,text)') IS NULL THEN
  ALTER FUNCTION world_map_state_is_ordinary(text,text) RENAME TO world_map_state_pre_s7a_is_ordinary;
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_state_is_ordinary(vid text,wid text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM world_map_state_version WHERE id=vid AND world_id=wid AND payload ? 'nativeAtlas')
 AND world_map_state_pre_s7a_is_ordinary(vid,wid)
$$;

-- Native identities introduced by a dated map do not establish a current baseline.
CREATE OR REPLACE FUNCTION world_native_map_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.native_origin_version_id IS DISTINCT FROM OLD.native_origin_version_id THEN
  RAISE EXCEPTION 'Native historical identity origins are immutable';
 END IF;
 IF NEW.native_origin_version_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM world_map_state_version v WHERE v.id=NEW.native_origin_version_id AND v.world_id=NEW.world_id AND v.state_id IS NOT NULL AND v.start_year IS NOT NULL AND v.end_year IS NOT NULL AND v.payload ? 'nativeAtlas'
 ) THEN RAISE EXCEPTION 'A native identity origin requires an exact retained native source in the same World'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER world_town_map_native_origin_guard BEFORE INSERT OR UPDATE OF native_origin_version_id,world_id ON world_town_map FOR EACH ROW EXECUTE FUNCTION world_native_map_origin_guard();
CREATE TRIGGER world_building_floor_native_origin_guard BEFORE INSERT OR UPDATE OF native_origin_version_id,world_id ON world_building_floor FOR EACH ROW EXECUTE FUNCTION world_native_map_origin_guard();
CREATE TRIGGER world_underground_level_native_origin_guard BEFORE INSERT OR UPDATE OF native_origin_version_id,world_id ON world_underground_level FOR EACH ROW EXECUTE FUNCTION world_native_map_origin_guard();
CREATE TRIGGER world_craft_native_origin_guard BEFORE INSERT OR UPDATE OF native_origin_version_id,world_id ON world_craft FOR EACH ROW EXECUTE FUNCTION world_native_map_origin_guard();
CREATE TRIGGER world_craft_deck_native_origin_guard BEFORE INSERT OR UPDATE OF native_origin_version_id,world_id ON world_craft_deck FOR EACH ROW EXECUTE FUNCTION world_native_map_origin_guard();

--> statement-breakpoint
CREATE FUNCTION world_native_territory_geometry_valid(g jsonb,native_width numeric,native_height numeric) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  points jsonb; p jsonb; xs numeric[] := ARRAY[]::numeric[]; ys numeric[] := ARRAY[]::numeric[];
  ids text[] := ARRAY[]::text[]; x numeric; y numeric; n integer; i integer; j integer; area numeric := 0;
BEGIN
  IF native_width<=0 OR native_height<=0 OR native_width>1000000000000 OR native_height>1000000000000 THEN RETURN false; END IF;
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
    IF x IS NULL OR y IS NULL OR x NOT BETWEEN 0 AND native_width OR y NOT BETWEEN 0 AND native_height OR x<>round(x,2) OR y<>round(y,2) THEN RETURN false; END IF;
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
CREATE OR REPLACE FUNCTION world_native_map_territories_valid(p jsonb,native_width numeric,native_height numeric,native_wrap boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE t jsonb; b jsonb; r jsonb; h jsonb; ids text[]:='{}'; total integer:=0; vertices integer:=0;
BEGIN
 IF jsonb_typeof(p)<>'array' OR jsonb_array_length(p)>128 THEN RETURN false; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(p) LOOP
  IF NOT t ?& ARRAY['id','name','archived','protected','coordinateSpace','coverage','geographyIds','account','accountYear','originalNotation','boundaries','relationships','history'] OR t-ARRAY['id','name','archived','protected','coordinateSpace','coverage','geographyIds','account','accountYear','originalNotation','boundaries','relationships','history']<>'{}'::jsonb THEN RETURN false; END IF;
  IF coalesce(t->>'id' ~ '^[0-9a-fA-F-]{36}$' AND jsonb_typeof(t->'name')='string' AND length(trim(t->>'name')) BETWEEN 1 AND 160 AND jsonb_typeof(t->'archived')='boolean' AND jsonb_typeof(t->'protected')='boolean' AND t->>'coordinateSpace'='terrain-metres-v1' AND t->>'coverage' IN ('authored','contested','unclaimed','unknown') AND jsonb_typeof(t->'account')='string' AND length(t->>'account')<=12000 AND jsonb_typeof(t->'originalNotation')='string' AND length(t->>'originalNotation')<=4000 AND jsonb_typeof(t->'geographyIds')='array' AND jsonb_typeof(t->'boundaries')='array' AND jsonb_typeof(t->'relationships')='array' AND jsonb_typeof(t->'history')='array',false) IS NOT TRUE THEN RETURN false; END IF;
  IF t->>'id'=ANY(ids) OR jsonb_array_length(t->'geographyIds')>20 OR jsonb_array_length(t->'relationships')>20 OR jsonb_array_length(t->'history')>20 OR (t->'accountYear'<>'null'::jsonb AND (jsonb_typeof(t->'accountYear')<>'number' OR abs((t->>'accountYear')::numeric)>1000000000000 OR (t->>'accountYear')::numeric<>trunc((t->>'accountYear')::numeric))) THEN RETURN false; END IF;
  IF length(trim(t->>'account'))=0 THEN RETURN false; END IF;
  ids:=array_append(ids,t->>'id');
  IF t->>'coverage' IN ('unclaimed','unknown') AND jsonb_array_length(t->'relationships')>0 THEN RETURN false; END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(t->'boundaries') LOOP
   IF NOT b ?& ARRAY['id','parentId','archived','points'] OR b-ARRAY['id','parentId','archived','points']<>'{}'::jsonb OR coalesce(b->>'id' ~ '^[0-9a-fA-F-]{36}$' AND jsonb_typeof(b->'archived')='boolean',false) IS NOT TRUE OR b->>'id'=ANY(ids) OR world_native_territory_geometry_valid(jsonb_build_object('version',1,'type','polygon','points',b->'points'),native_width,native_height) IS NOT TRUE THEN RETURN false; END IF;
   IF b->'parentId'<>'null'::jsonb AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'boundaries') outer_ring WHERE outer_ring->>'id'=b->>'parentId' AND outer_ring->'parentId'='null'::jsonb AND (NOT (outer_ring->>'archived')::boolean OR (b->>'archived')::boolean)) THEN RETURN false; END IF;
   IF b->>'parentId' IS NOT NULL AND NOT (b->>'archived')::boolean AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'boundaries') outer_ring WHERE outer_ring->>'id'=b->>'parentId' AND world_territory_ring_contains(outer_ring->'points',b->'points') IS TRUE) THEN RETURN false; END IF;
   IF b->>'parentId' IS NOT NULL AND NOT (b->>'archived')::boolean AND EXISTS (SELECT 1 FROM jsonb_array_elements(t->'boundaries') hole WHERE hole->>'id'<>b->>'id' AND hole->>'parentId'=b->>'parentId' AND NOT (hole->>'archived')::boolean AND world_territory_rings_overlap(b->'points',hole->'points')) THEN RETURN false; END IF;
       IF native_wrap AND EXISTS(SELECT 1 FROM jsonb_array_elements(b->'points') WITH ORDINALITY first_point(point,idx) WHERE abs((point->>'x')::numeric-((b->'points')->(idx::integer % jsonb_array_length(b->'points'))->>'x')::numeric)>native_width/2) THEN RETURN false; END IF;
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
-- Native metre-based political geometry reuses the existing canonical territory
-- identities and immutable political/History pin tables. Legacy guards below
-- remain exact for versions without nativeAtlas.
CREATE FUNCTION world_native_territory_component_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src world_map_state_version; previous jsonb; t jsonb; r jsonb; h jsonb; root_doc jsonb; row_version world_lore_version; label text; p jsonb;
BEGIN
 IF NEW.kind<>'places' OR NOT NEW.payload ? 'territories' THEN RETURN NEW; END IF;
 p:=NEW.payload;
 IF p-ARRAY['version','revision','source','territories']<>'{}'::jsonb OR jsonb_typeof(p->'version')<>'number' OR p->>'version'<>'1' OR jsonb_typeof(p->'revision')<>'number' OR (p->>'revision')::integer<1 OR NOT p ?& ARRAY['version','revision','source','territories'] THEN RAISE EXCEPTION 'Invalid native political component'; END IF;
 IF jsonb_typeof(p->'source')<>'object' OR NOT (p->'source') ?& ARRAY['mapId','mapVersionId','timelineId','year','terrainId','fingerprint','width','height','wrap'] OR (p->'source')-ARRAY['mapId','mapVersionId','timelineId','year','terrainId','fingerprint','width','height','wrap']<>'{}'::jsonb OR jsonb_typeof(p->'source'->'year')<>'number' OR abs((p->'source'->>'year')::numeric)>1000000000000 OR trunc((p->'source'->>'year')::numeric)<>(p->'source'->>'year')::numeric OR jsonb_typeof(p->'source'->'fingerprint')<>'string' OR (p->'source'->>'fingerprint') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p->'source'->'width')<>'number' OR jsonb_typeof(p->'source'->'height')<>'number' OR jsonb_typeof(p->'source'->'wrap')<>'boolean' THEN RAISE EXCEPTION 'Invalid reviewed native political source'; END IF;
 SELECT * INTO src FROM world_map_state_version WHERE id=p->'source'->>'mapVersionId' AND world_id=NEW.world_id AND map_id=p->'source'->>'mapId';
 IF src.id IS NULL OR src.state_id IS NULL OR src.archived OR src.payload->'nativeAtlas'->'target'->>'kind'<>'terrain' OR src.payload->'nativeAtlas'->'target'->>'id'<>src.map_id OR (p->'source'->>'year')::numeric NOT BETWEEN src.start_year AND src.end_year THEN RAISE EXCEPTION 'Political component requires an exact dated World source'; END IF;
 IF NOT EXISTS(SELECT 1 FROM world WHERE id=NEW.world_id AND owner_id=NEW.author_id) OR NOT EXISTS(SELECT 1 FROM world_timeline WHERE id=p->'source'->>'timelineId' AND world_id=NEW.world_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Native political authorship belongs to the World owner and selected timeline'; END IF;
 IF NOT EXISTS(SELECT 1 FROM world_map_state_head head JOIN world_map_state_version v ON v.id=head.version_id AND v.world_id=head.world_id WHERE head.world_id=NEW.world_id AND head.timeline_id=p->'source'->>'timelineId' AND head.state_id=src.state_id AND (v.id=src.id OR v.previous_version_id=src.id)) THEN RAISE EXCEPTION 'Review the actual selected World source before political authoring'; END IF;
 SELECT c.payload#>'{bundle,document}' INTO root_doc FROM world_map_state_component_ref ref JOIN world_map_state_component c ON c.id=ref.component_id AND c.world_id=ref.world_id WHERE ref.version_id=src.id AND ref.world_id=NEW.world_id AND ref.key='terrain';
 IF root_doc->>'terrainId' IS DISTINCT FROM p->'source'->>'terrainId' OR (root_doc#>>'{settings,widthKm}')::float8*1000 IS DISTINCT FROM (p->'source'->>'width')::float8 OR (root_doc#>>'{settings,heightKm}')::float8*1000 IS DISTINCT FROM (p->'source'->>'height')::float8 OR (root_doc#>>'{settings,wrap}')::boolean IS DISTINCT FROM (p->'source'->>'wrap')::boolean THEN RAISE EXCEPTION 'Native political extent must retain its real World terrain identity'; END IF;
 IF world_native_map_territories_valid(p->'territories',(p->'source'->>'width')::numeric,(p->'source'->>'height')::numeric,(p->'source'->>'wrap')::boolean) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid native political geometry or account'; END IF;
 SELECT c.payload INTO previous FROM world_map_state_component_ref ref JOIN world_map_state_component c ON c.id=ref.component_id AND c.world_id=ref.world_id WHERE ref.version_id=src.id AND ref.world_id=NEW.world_id AND ref.key='territories';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(previous->'territories','[]'::jsonb)) prior_territory WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'territories') current WHERE current->>'id'=prior_territory->>'id')) THEN RAISE EXCEPTION 'Retain native historical territory identities'; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(p->'territories') LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(previous->'territories','[]'::jsonb)) prior_territory CROSS JOIN LATERAL jsonb_array_elements(prior_territory->'boundaries') ring WHERE prior_territory->>'id'=t->>'id' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t->'boundaries') current WHERE current->>'id'=ring->>'id')) THEN RAISE EXCEPTION 'Retain native historical boundary identities'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(t->'relationships') LOOP
   IF (r->>'startYear')::numeric<src.start_year OR (r->>'endYear')::numeric>src.end_year THEN RAISE EXCEPTION 'New political accounts must fit their reviewed source appearance period'; END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(previous->'territories','[]'::jsonb)) prior_territory CROSS JOIN LATERAL jsonb_array_elements(prior_territory->'relationships') pin WHERE prior_territory->>'id'=t->>'id' AND pin->>'id'=r->>'id' AND pin->>'entityId'=r->>'entityId' AND pin->>'versionId'=r->>'versionId' AND pin->>'revision'=r->>'revision' AND pin->>'entityName'=r->>'entityName' AND pin->>'family'=r->>'family') AND NOT EXISTS(SELECT 1 FROM world_lore_head selected JOIN world_lore_version v ON v.id=selected.version_id AND v.world_id=selected.world_id JOIN world_lore_display display ON display.version_id=v.id WHERE selected.world_id=NEW.world_id AND selected.timeline_id=p->'source'->>'timelineId' AND selected.entity_id=r->>'entityId' AND selected.version_id=r->>'versionId' AND selected.revision=(r->>'revision')::integer AND selected.mode IN('authored','inherited','interpretation') AND NOT v.archived AND display.name=r->>'entityName' AND v.family=r->>'family') THEN RAISE EXCEPTION 'Political source is not selected or retained in this timeline'; END IF;
  END LOOP;
  FOR h IN SELECT value FROM jsonb_array_elements(t->'history') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(previous->'territories','[]'::jsonb)) prior_territory CROSS JOIN LATERAL jsonb_array_elements(prior_territory->'history') pin WHERE prior_territory->>'id'=t->>'id' AND pin->>'entityId'=h->>'entityId' AND pin->>'versionId'=h->>'versionId' AND pin->>'name'=h->>'name') AND NOT EXISTS(SELECT 1 FROM world_history_head selected JOIN world_history_version v ON v.id=selected.version_id AND v.world_id=selected.world_id WHERE selected.world_id=NEW.world_id AND selected.timeline_id=p->'source'->>'timelineId' AND selected.entity_id=h->>'entityId' AND selected.version_id=h->>'versionId' AND selected.mode IN('authored','inherited','partial','interpretation') AND coalesce(v.payload->>'title',v.payload->>'name')=h->>'name' AND NOT coalesce((v.payload->>'archived')::boolean,false)) THEN RAISE EXCEPTION 'History citation is not selected or retained in this timeline'; END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER native_territory_component_source AFTER INSERT ON world_map_state_component DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_native_territory_component_source_guard();
--> statement-breakpoint
CREATE FUNCTION world_native_map_territory_complete(appearance world_map_state_version) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p jsonb; t jsonb; b jsonb; r jsonb; h jsonb; row_version world_lore_version; label text; expected integer:=0; expected_history integer:=0;
BEGIN
 IF jsonb_array_length(coalesce(appearance.payload->'territories','[]'::jsonb))>0 THEN RAISE EXCEPTION 'Legacy political coordinates cannot become native geography implicitly'; END IF;
 SELECT c.payload INTO p FROM world_map_state_component_ref ref JOIN world_map_state_component c ON c.id=ref.component_id AND c.world_id=ref.world_id WHERE ref.version_id=appearance.id AND ref.world_id=appearance.world_id AND ref.key='territories' AND c.kind='places';
 IF p IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(appearance.payload->'nativeAtlas'->'resources') resource WHERE resource->>'key'='territories') THEN RAISE EXCEPTION 'Native political component retains its geographic family'; END IF;
 IF p IS NOT NULL THEN
  IF appearance.state_id IS NULL OR appearance.payload->'nativeAtlas'->'target'->>'kind'<>'terrain' OR p->'source'->>'mapId'<>appearance.map_id THEN RAISE EXCEPTION 'Political geography belongs to its dated World source'; END IF;
  IF world_native_map_territories_valid(p->'territories',(p->'source'->>'width')::numeric,(p->'source'->>'height')::numeric,(p->'source'->>'wrap')::boolean) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid retained native political component'; END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(p->'territories') LOOP
   IF NOT EXISTS(SELECT 1 FROM world_map_territory WHERE id=t->>'id' AND world_id=appearance.world_id AND map_id=appearance.map_id) THEN RAISE EXCEPTION 'Native territory retains its canonical World map identity'; END IF;
   FOR b IN SELECT value FROM jsonb_array_elements(t->'boundaries') LOOP
    IF NOT EXISTS(SELECT 1 FROM world_map_territory_boundary WHERE id=b->>'id' AND world_id=appearance.world_id AND map_id=appearance.map_id AND territory_id=t->>'id' AND parent_id IS NOT DISTINCT FROM b->>'parentId') THEN RAISE EXCEPTION 'Native political boundary identity mismatch'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(t->'geographyIds') g WHERE NOT EXISTS(SELECT 1 FROM world_geography WHERE id=g.value AND world_id=appearance.world_id)) THEN RAISE EXCEPTION 'Native territorial place belongs to another World'; END IF;
   FOR r IN SELECT value FROM jsonb_array_elements(t->'relationships') LOOP
    expected:=expected+1;
    SELECT * INTO row_version FROM world_lore_version WHERE id=r->>'versionId' AND entity_id=r->>'entityId' AND world_id=appearance.world_id;
    SELECT name INTO label FROM world_lore_display WHERE version_id=row_version.id;
    IF row_version.id IS NULL OR row_version.family<>r->>'family' OR label IS DISTINCT FROM r->>'entityName' OR NOT EXISTS(SELECT 1 FROM world_map_territory_lore WHERE version_id=appearance.id AND territory_id=t->>'id' AND id=r->>'id' AND entity_id=r->>'entityId' AND lore_version_id=r->>'versionId') THEN RAISE EXCEPTION 'Exact native political source mismatch'; END IF;
    IF EXISTS(SELECT 1 FROM world_map_territory_lore WHERE id=r->>'id' AND (territory_id<>t->>'id' OR entity_id<>r->>'entityId')) THEN RAISE EXCEPTION 'Political relationship identity cannot be reassigned'; END IF;
   END LOOP;
   FOR h IN SELECT value FROM jsonb_array_elements(t->'history') LOOP
    expected_history:=expected_history+1;
    IF NOT EXISTS(SELECT 1 FROM world_map_territory_history pin JOIN world_history_version source ON source.id=pin.history_version_id WHERE pin.version_id=appearance.id AND pin.territory_id=t->>'id' AND pin.entity_id=h->>'entityId' AND pin.history_version_id=h->>'versionId' AND coalesce(source.payload->>'title',source.payload->>'name')=h->>'name') THEN RAISE EXCEPTION 'Exact native territorial History source mismatch'; END IF;
   END LOOP;
  END LOOP;
 END IF;
 IF expected<>(SELECT count(*) FROM world_map_territory_lore WHERE version_id=appearance.id) OR expected_history<>(SELECT count(*) FROM world_map_territory_history WHERE version_id=appearance.id) THEN RAISE EXCEPTION 'Native political references are incomplete'; END IF;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_territory_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM world_map_state_version WHERE id=NEW.version_id AND world_id=NEW.world_id AND payload ? 'nativeAtlas') THEN
  IF TG_TABLE_NAME='world_map_territory_lore' THEN
   IF NOT EXISTS(SELECT 1 FROM world_map_state_component_ref ref JOIN world_map_state_component c ON c.id=ref.component_id AND c.world_id=ref.world_id CROSS JOIN LATERAL jsonb_array_elements(c.payload->'territories') t CROSS JOIN LATERAL jsonb_array_elements(t->'relationships') r WHERE ref.version_id=NEW.version_id AND ref.world_id=NEW.world_id AND ref.key='territories' AND c.kind='places' AND t->>'id'=NEW.territory_id AND r->>'id'=NEW.id AND r->>'entityId'=NEW.entity_id AND r->>'versionId'=NEW.lore_version_id) THEN RAISE EXCEPTION 'Political pin is not in its immutable native appearance'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM world_map_state_component_ref ref JOIN world_map_state_component c ON c.id=ref.component_id AND c.world_id=ref.world_id CROSS JOIN LATERAL jsonb_array_elements(c.payload->'territories') t CROSS JOIN LATERAL jsonb_array_elements(t->'history') h WHERE ref.version_id=NEW.version_id AND ref.world_id=NEW.world_id AND ref.key='territories' AND c.kind='places' AND t->>'id'=NEW.territory_id AND h->>'entityId'=NEW.entity_id AND h->>'versionId'=NEW.history_version_id) THEN RAISE EXCEPTION 'History pin is not in its immutable native appearance'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='world_map_territory_lore' THEN
  IF NOT EXISTS (SELECT 1 FROM world_map_state_version v CROSS JOIN LATERAL jsonb_array_elements(coalesce(v.payload->'territories','[]'::jsonb)) t CROSS JOIN LATERAL jsonb_array_elements(t->'relationships') r WHERE v.id=NEW.version_id AND t->>'id'=NEW.territory_id AND r->>'id'=NEW.id AND r->>'entityId'=NEW.entity_id AND r->>'versionId'=NEW.lore_version_id) THEN RAISE EXCEPTION 'Political pin is not in its immutable appearance'; END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM world_map_state_version v CROSS JOIN LATERAL jsonb_array_elements(coalesce(v.payload->'territories','[]'::jsonb)) t CROSS JOIN LATERAL jsonb_array_elements(t->'history') h WHERE v.id=NEW.version_id AND t->>'id'=NEW.territory_id AND h->>'entityId'=NEW.entity_id AND h->>'versionId'=NEW.history_version_id) THEN RAISE EXCEPTION 'History pin is not in its immutable appearance'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_map_territory_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t jsonb; b jsonb; r jsonb; h jsonb; old jsonb; v world_lore_version; label text; expected integer:=0; expected_history integer:=0;
BEGIN
 IF NEW.payload ? 'nativeAtlas' THEN PERFORM world_native_map_territory_complete(NEW); RETURN NEW; END IF;
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
CREATE OR REPLACE FUNCTION world_building_interior_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b world_building_interior; m world_town_map;
BEGIN
 SELECT * INTO b FROM world_building_interior WHERE id=NEW.building_id AND world_id=NEW.world_id;
 SELECT * INTO m FROM world_town_map WHERE id=NEW.town_map_id AND world_id=NEW.world_id;
 -- Native-only identity binding. A building added in a dated appearance
 -- need not exist in the current Town drawing. Require an accepted native head
 -- and its actual Town/World/Place identity; no draft or current substitute.
 IF b.id IS NOT NULL AND m.id IS NOT NULL AND b.town_id=m.town_id
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.design->'features') f WHERE f->>'id'=NEW.feature_id AND f->>'kind'='building')
 AND EXISTS(
  SELECT 1 FROM world_map_state_head h
  JOIN world_map_state_version v ON v.id=h.version_id AND v.world_id=h.world_id AND v.map_id=h.map_id
  JOIN world_map_state_component_ref r ON r.version_id=v.id AND r.world_id=h.world_id AND r.key='town'
  JOIN world_map_state_component c ON c.id=r.component_id AND c.world_id=h.world_id AND c.kind='town'
  CROSS JOIN LATERAL jsonb_array_elements(c.payload#>'{bundle,document,design,features}') f
  WHERE h.world_id=NEW.world_id AND h.map_id=m.source_map_id
   AND v.state_id=h.state_id AND v.start_year IS NOT NULL AND v.end_year IS NOT NULL AND NOT v.archived
   AND h.mode IN ('authored','interpretation')
   AND v.payload#>>'{nativeAtlas,target,kind}'='town' AND v.payload#>>'{nativeAtlas,target,id}'=m.id
   AND c.payload#>>'{bundle,document,id}'=m.id AND c.payload#>>'{bundle,document,townId}'=b.town_id
   AND c.payload#>>'{bundle,document,worldId}'=NEW.world_id AND c.payload#>>'{bundle,document,archived}'='false'
   AND f->>'id'=NEW.feature_id AND f->>'kind'='building' AND f->>'archived'='false'
   AND coalesce(f->>'placeId','')=coalesce(b.place_id,'')
 ) THEN RETURN NEW; END IF;
 IF b.id IS NULL OR m.id IS NULL OR b.town_id<>m.town_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.design->'features') f WHERE f->>'id'=NEW.feature_id AND f->>'kind'='building') THEN RAISE EXCEPTION 'Interior sources must reference a saved building in the same Town and World'; END IF;
 RETURN NEW;
END $$;
