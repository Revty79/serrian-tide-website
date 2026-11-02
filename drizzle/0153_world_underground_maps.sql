CREATE TABLE "world_underground_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"source" jsonb NOT NULL,
	"destination" jsonb NOT NULL,
	"two_way" boolean NOT NULL,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_underground_connection_valid" CHECK ("world_underground_connection"."revision">0 AND length(trim("world_underground_connection"."name")) BETWEEN 1 AND 160 AND jsonb_typeof("world_underground_connection"."source")='object' AND jsonb_typeof("world_underground_connection"."destination")='object' AND "world_underground_connection"."source"->'map'<>"world_underground_connection"."destination"->'map')
);
--> statement-breakpoint
CREATE TABLE "world_underground_level" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"level_order" integer NOT NULL,
	"depth" text NOT NULL,
	"design" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_underground_level_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_underground_level_valid" CHECK ("world_underground_level"."revision">0 AND length(trim("world_underground_level"."name")) BETWEEN 1 AND 160 AND "world_underground_level"."level_order" BETWEEN -1000 AND 1000 AND length("world_underground_level"."depth")<=160 AND "world_underground_level"."design"->>'version'='1' AND jsonb_typeof("world_underground_level"."design"->'features')='array' AND jsonb_array_length("world_underground_level"."design"->'features')<=2000 AND octet_length("world_underground_level"."design"::text)<=5000000)
);
--> statement-breakpoint
CREATE TABLE "world_underground_operation" (
	"request_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"author_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_underground_operation_valid" CHECK ("world_underground_operation"."input_hash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("world_underground_operation"."result")='object')
);
--> statement-breakpoint
CREATE TABLE "world_underground_site" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"place_id" text,
	"frame" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_underground_site_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_underground_site_valid" CHECK ("world_underground_site"."revision">0 AND length(trim("world_underground_site"."name")) BETWEEN 1 AND 160 AND jsonb_typeof("world_underground_site"."frame")='object')
);
--> statement-breakpoint
CREATE TABLE "world_underground_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"kind" text NOT NULL,
	"record_id" text NOT NULL,
	"revision" integer NOT NULL,
	"request_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_underground_version_revision_uq" UNIQUE("kind","record_id","revision"),
	CONSTRAINT "world_underground_version_valid" CHECK ("world_underground_version"."revision">0 AND "world_underground_version"."kind" IN ('site','level','connection') AND jsonb_typeof("world_underground_version"."snapshot")='object')
);
--> statement-breakpoint
ALTER TABLE "world_underground_connection" ADD CONSTRAINT "world_underground_connection_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_underground_level" ADD CONSTRAINT "world_underground_level_site_fk" FOREIGN KEY ("site_id","world_id") REFERENCES "public"."world_underground_site"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_underground_operation" ADD CONSTRAINT "world_underground_operation_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_underground_operation" ADD CONSTRAINT "world_underground_operation_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_underground_site" ADD CONSTRAINT "world_underground_site_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_underground_site" ADD CONSTRAINT "world_underground_site_place_fk" FOREIGN KEY ("place_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_underground_version" ADD CONSTRAINT "world_underground_version_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_underground_version" ADD CONSTRAINT "world_underground_version_request_id_world_underground_operation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_underground_operation"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_underground_connection_world_idx" ON "world_underground_connection" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_underground_level_site_idx" ON "world_underground_level" USING btree ("site_id","level_order","id");

--> statement-breakpoint
CREATE FUNCTION world_underground_snapshot(kind text, j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('id',j->'id','worldId',j->'world_id','name',j->'name','revision',j->'revision','archived',j->'archived') || CASE kind
 WHEN 'site' THEN jsonb_build_object('placeId',j->'place_id','frame',j->'frame')
 WHEN 'level' THEN jsonb_build_object('siteId',j->'site_id','order',j->'level_order','depth',j->'depth','design',j->'design')
 ELSE jsonb_build_object('source',j->'source','destination',j->'destination','twoWay',j->'two_way') END
$$;
--> statement-breakpoint
CREATE FUNCTION world_underground_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Accepted underground operations and revisions are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER world_underground_operation_immutable BEFORE UPDATE OR DELETE ON world_underground_operation FOR EACH ROW EXECUTE FUNCTION world_underground_immutable();
--> statement-breakpoint
CREATE TRIGGER world_underground_version_immutable BEFORE UPDATE OR DELETE ON world_underground_version FOR EACH ROW EXECUTE FUNCTION world_underground_immutable();
--> statement-breakpoint
CREATE FUNCTION world_underground_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer; p integer; j jsonb; oldj jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive underground records; retain source and history'; END IF;
 PERFORM 1 FROM world WHERE id=NEW.world_id FOR UPDATE;
 j=to_jsonb(NEW);
 IF TG_OP='INSERT' AND NEW.revision<>1 THEN RAISE EXCEPTION 'New underground records start at revision one'; END IF;
 IF TG_OP='UPDATE' THEN
  oldj=to_jsonb(OLD);
  IF NEW.id<>OLD.id OR NEW.world_id<>OLD.world_id OR NEW.revision<>OLD.revision+1 OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Underground identity and revision are retained'; END IF;
  IF TG_TABLE_NAME='world_underground_site' AND (j->'place_id',j->'frame') IS DISTINCT FROM (oldj->'place_id',oldj->'frame') THEN RAISE EXCEPTION 'Site identity and physical alignment are retained'; END IF;
  IF TG_TABLE_NAME='world_underground_level' AND j->'site_id' IS DISTINCT FROM oldj->'site_id' THEN RAISE EXCEPTION 'Levels retain their site identity'; END IF;
  IF TG_TABLE_NAME='world_underground_connection' AND (j->'source',j->'destination',j->'two_way') IS DISTINCT FROM (oldj->'source',oldj->'destination',oldj->'two_way') THEN RAISE EXCEPTION 'Archive an old connection before creating a new route'; END IF;
 END IF;
 IF TG_TABLE_NAME='world_underground_site' THEN
  SELECT count(*) INTO n FROM world_underground_site WHERE world_id=NEW.world_id AND id<>NEW.id;
  IF n>=256 THEN RAISE EXCEPTION 'World supports 256 retained underground sites'; END IF;
 ELSIF TG_TABLE_NAME='world_underground_level' THEN
  SELECT count(*) INTO n FROM world_underground_level WHERE site_id=j->>'site_id' AND id<>NEW.id;
  IF n>=64 THEN RAISE EXCEPTION 'Site supports 64 retained levels'; END IF;
  SELECT count(*),coalesce(sum(CASE WHEN jsonb_typeof(f->'points')='array' THEN jsonb_array_length(f->'points') ELSE 1 END),0) INTO n,p FROM jsonb_array_elements(j->'design'->'features') f;
  IF p>32000 OR n<>(SELECT count(DISTINCT f->>'id') FROM jsonb_array_elements(j->'design'->'features') f) THEN RAISE EXCEPTION 'Underground point and independent identity limits exceeded'; END IF;
 ELSE
  SELECT count(*) INTO n FROM world_underground_connection WHERE world_id=NEW.world_id AND id<>NEW.id;
  IF n>=4096 THEN RAISE EXCEPTION 'World supports 4096 retained underground connections'; END IF;
  SELECT count(*) INTO n FROM world_underground_connection WHERE world_id=NEW.world_id AND id<>NEW.id AND (source->'map'=j->'source'->'map' OR destination->'map'=j->'source'->'map');
  IF n>=128 THEN RAISE EXCEPTION 'A map supports 128 retained underground connections'; END IF;
  SELECT count(*) INTO n FROM world_underground_connection WHERE world_id=NEW.world_id AND id<>NEW.id AND (source->'map'=j->'destination'->'map' OR destination->'map'=j->'destination'->'map');
  IF n>=128 THEN RAISE EXCEPTION 'A map supports 128 retained underground connections'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_underground_site_guard BEFORE INSERT OR UPDATE OR DELETE ON world_underground_site FOR EACH ROW EXECUTE FUNCTION world_underground_head_guard();
--> statement-breakpoint
CREATE TRIGGER world_underground_level_guard BEFORE INSERT OR UPDATE OR DELETE ON world_underground_level FOR EACH ROW EXECUTE FUNCTION world_underground_head_guard();
--> statement-breakpoint
CREATE TRIGGER world_underground_connection_guard BEFORE INSERT OR UPDATE OR DELETE ON world_underground_connection FOR EACH ROW EXECUTE FUNCTION world_underground_head_guard();
--> statement-breakpoint
CREATE FUNCTION world_underground_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text; rid text; wid text; head jsonb; v world_underground_version; op world_underground_operation;
BEGIN
 IF TG_TABLE_NAME='world_underground_version' THEN k=NEW.kind; rid=NEW.record_id; wid=NEW.world_id;
 ELSE k=replace(TG_TABLE_NAME,'world_underground_',''); rid=NEW.id; wid=NEW.world_id; END IF;
 IF k NOT IN ('site','level','connection') THEN RAISE EXCEPTION 'Unknown underground record kind'; END IF;
 EXECUTE format('SELECT to_jsonb(h) FROM world_underground_%I h WHERE id=$1 AND world_id=$2',k) INTO head USING rid,wid;
 IF head IS NULL THEN RAISE EXCEPTION 'Underground history requires its retained head'; END IF;
 SELECT * INTO v FROM world_underground_version WHERE kind=k AND record_id=rid AND revision=(head->>'revision')::integer;
 IF v.id IS NULL OR v.world_id<>wid OR v.snapshot<>world_underground_snapshot(k,head) THEN RAISE EXCEPTION 'Every underground head requires its exact immutable receipt'; END IF;
 IF TG_TABLE_NAME='world_underground_version' THEN v=NEW; END IF;
 SELECT * INTO op FROM world_underground_operation WHERE request_id=v.request_id;
 IF op.request_id IS NULL OR op.world_id<>wid OR v.revision>(head->>'revision')::integer OR v.snapshot->>'id'<>rid OR v.snapshot->>'worldId'<>wid OR (v.snapshot->>'revision')::integer<>v.revision THEN RAISE EXCEPTION 'Underground history must match its accepted World operation'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_underground_site_audit AFTER INSERT OR UPDATE ON world_underground_site DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_underground_audit_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_underground_level_audit AFTER INSERT OR UPDATE ON world_underground_level DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_underground_audit_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_underground_connection_audit AFTER INSERT OR UPDATE ON world_underground_connection DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_underground_audit_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_underground_version_audit AFTER INSERT ON world_underground_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_underground_audit_guard();
