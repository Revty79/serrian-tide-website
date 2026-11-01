-- Stage 5B additive interior documents. No retired Atlas route or legacy floor is reactivated.
CREATE TABLE "world_building_floor" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"building_id" text NOT NULL,
	"name" text NOT NULL,
	"floor_order" integer NOT NULL,
	"elevation_metres" double precision,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"design" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_building_floor_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_building_floor_valid" CHECK ("world_building_floor"."revision">0 AND length(trim("world_building_floor"."name")) BETWEEN 1 AND 160 AND "world_building_floor"."floor_order" BETWEEN -1000 AND 1000 AND ("world_building_floor"."elevation_metres" IS NULL OR "world_building_floor"."elevation_metres" BETWEEN -20000 AND 20000) AND jsonb_typeof("world_building_floor"."design")='object' AND "world_building_floor"."design"->>'version'='1' AND jsonb_typeof("world_building_floor"."design"->'features')='array' AND jsonb_array_length("world_building_floor"."design"->'features')<=2000 AND octet_length("world_building_floor"."design"::text)<=5000000)
);
--> statement-breakpoint
CREATE TABLE "world_building_floor_operation" (
	"request_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"building_id" text NOT NULL,
	"author_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_building_floor_operation_valid" CHECK ("world_building_floor_operation"."input_hash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("world_building_floor_operation"."result")='object')
);
--> statement-breakpoint
CREATE TABLE "world_building_floor_version" (
	"id" text PRIMARY KEY NOT NULL,
	"floor_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"request_id" text NOT NULL,
	"name" text NOT NULL,
	"floor_order" integer NOT NULL,
	"elevation_metres" double precision,
	"archived" boolean NOT NULL,
	"design" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_building_floor_version_revision_uq" UNIQUE("floor_id","revision"),
	CONSTRAINT "world_building_floor_version_valid" CHECK ("world_building_floor_version"."revision">0 AND jsonb_typeof("world_building_floor_version"."design")='object')
);
--> statement-breakpoint
CREATE TABLE "world_building_interior" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"town_id" text NOT NULL,
	"place_id" text,
	"name" text NOT NULL,
	"frame" jsonb NOT NULL,
	"footprint" jsonb NOT NULL,
	"town_frame" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_building_interior_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_building_interior_valid" CHECK (length(trim("world_building_interior"."name")) BETWEEN 1 AND 160 AND jsonb_typeof("world_building_interior"."frame")='object' AND jsonb_typeof("world_building_interior"."footprint")='array' AND jsonb_array_length("world_building_interior"."footprint") BETWEEN 3 AND 256)
);
--> statement-breakpoint
CREATE TABLE "world_building_interior_source" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"building_id" text NOT NULL,
	"town_map_id" text NOT NULL,
	"feature_id" text NOT NULL,
	CONSTRAINT "world_building_interior_source_feature_uq" UNIQUE("town_map_id","feature_id")
);
--> statement-breakpoint
ALTER TABLE "world_building_floor" ADD CONSTRAINT "world_building_floor_building_fk" FOREIGN KEY ("building_id","world_id") REFERENCES "public"."world_building_interior"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_floor_operation" ADD CONSTRAINT "world_building_floor_operation_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_floor_operation" ADD CONSTRAINT "world_building_floor_operation_building_fk" FOREIGN KEY ("building_id","world_id") REFERENCES "public"."world_building_interior"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_floor_version" ADD CONSTRAINT "world_building_floor_version_request_id_world_building_floor_operation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_building_floor_operation"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_floor_version" ADD CONSTRAINT "world_building_floor_version_floor_fk" FOREIGN KEY ("floor_id","world_id") REFERENCES "public"."world_building_floor"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_interior" ADD CONSTRAINT "world_building_interior_town_fk" FOREIGN KEY ("town_id","world_id") REFERENCES "public"."world_settlement_profile"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_interior" ADD CONSTRAINT "world_building_interior_place_fk" FOREIGN KEY ("place_id","world_id","town_id") REFERENCES "public"."world_town_place"("geography_id","world_id","town_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_interior_source" ADD CONSTRAINT "world_building_interior_source_building_fk" FOREIGN KEY ("building_id","world_id") REFERENCES "public"."world_building_interior"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_building_interior_source" ADD CONSTRAINT "world_building_interior_source_map_fk" FOREIGN KEY ("town_map_id","world_id") REFERENCES "public"."world_town_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_building_floor_building_idx" ON "world_building_floor" USING btree ("building_id","floor_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "world_building_interior_place_uq" ON "world_building_interior" USING btree ("world_id","place_id") WHERE "world_building_interior"."place_id" IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION world_building_floor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive floors; retain their identities and saved revisions'; END IF;
 PERFORM 1 FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.world_id,NEW.building_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.world_id,OLD.building_id,OLD.created_at) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'A floor retains its building, World and sequential revision'; END IF;
 ELSE
  SELECT count(*) INTO n FROM world_building_floor WHERE building_id=NEW.building_id;
  IF n>=64 OR NEW.revision<>1 THEN RAISE EXCEPTION 'A building supports 64 retained floors, starting at revision one'; END IF;
 END IF;
 SELECT coalesce(sum(CASE WHEN jsonb_typeof(f->'points')='array' THEN jsonb_array_length(f->'points') ELSE 1 END),0) INTO n FROM jsonb_array_elements(NEW.design->'features') f;
 IF n>32000 THEN RAISE EXCEPTION 'A floor supports 32000 retained source points'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_building_floor_guard BEFORE INSERT OR UPDATE OR DELETE ON world_building_floor FOR EACH ROW EXECUTE FUNCTION world_building_floor_guard();
--> statement-breakpoint
CREATE FUNCTION world_building_floor_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Accepted interior receipts and exterior bindings are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER world_building_floor_operation_immutable BEFORE UPDATE OR DELETE ON world_building_floor_operation FOR EACH ROW EXECUTE FUNCTION world_building_floor_immutable();
--> statement-breakpoint
CREATE TRIGGER world_building_floor_version_immutable BEFORE UPDATE OR DELETE ON world_building_floor_version FOR EACH ROW EXECUTE FUNCTION world_building_floor_immutable();
--> statement-breakpoint
CREATE TRIGGER world_building_interior_source_immutable BEFORE UPDATE OR DELETE ON world_building_interior_source FOR EACH ROW EXECUTE FUNCTION world_building_floor_immutable();
--> statement-breakpoint
CREATE FUNCTION world_building_interior_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain building interiors and their floors'; END IF;
 PERFORM 1 FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF TG_OP='UPDATE' AND ((NEW.id,NEW.world_id,NEW.town_id,NEW.name,NEW.frame,NEW.footprint,NEW.town_frame,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.world_id,OLD.town_id,OLD.name,OLD.frame,OLD.footprint,OLD.town_frame,OLD.created_at) OR OLD.place_id IS NOT NULL AND NEW.place_id IS DISTINCT FROM OLD.place_id) THEN RAISE EXCEPTION 'Interior physical alignment and permanent building identity are retained'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_building_interior_guard BEFORE INSERT OR UPDATE OR DELETE ON world_building_interior FOR EACH ROW EXECUTE FUNCTION world_building_interior_guard();
--> statement-breakpoint
CREATE FUNCTION world_building_interior_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b world_building_interior; m world_town_map;
BEGIN
 SELECT * INTO b FROM world_building_interior WHERE id=NEW.building_id AND world_id=NEW.world_id;
 SELECT * INTO m FROM world_town_map WHERE id=NEW.town_map_id AND world_id=NEW.world_id;
 IF b.id IS NULL OR m.id IS NULL OR b.town_id<>m.town_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.design->'features') f WHERE f->>'id'=NEW.feature_id AND f->>'kind'='building') THEN RAISE EXCEPTION 'Interior sources must reference a saved building in the same Town and World'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_building_interior_source_guard BEFORE INSERT ON world_building_interior_source FOR EACH ROW EXECUTE FUNCTION world_building_interior_source_guard();
--> statement-breakpoint
CREATE FUNCTION world_building_floor_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h world_building_floor; v world_building_floor_version; op world_building_floor_operation; item jsonb; target world_building_floor;
BEGIN
 IF TG_TABLE_NAME='world_building_floor' THEN
  SELECT * INTO h FROM world_building_floor WHERE id=NEW.id;
  SELECT * INTO v FROM world_building_floor_version WHERE floor_id=h.id AND revision=h.revision;
  IF v.id IS NULL OR (h.world_id,h.name,h.floor_order,h.elevation_metres,h.archived,h.design) IS DISTINCT FROM (v.world_id,v.name,v.floor_order,v.elevation_metres,v.archived,v.design) THEN RAISE EXCEPTION 'Every accepted floor head requires its exact immutable receipt'; END IF;
  IF NOT h.archived THEN
   FOR item IN SELECT f FROM jsonb_array_elements(h.design->'features') f WHERE f->>'kind'='transition' AND f->>'archived'='false' AND jsonb_typeof(f->'destination')='object' LOOP
    SELECT * INTO target FROM world_building_floor WHERE id=item->'destination'->>'floorId';
    IF target.id IS NULL OR target.id=h.id OR target.building_id<>h.building_id OR target.world_id<>h.world_id OR target.archived THEN RAISE EXCEPTION 'Floor transitions need an active destination in the same building and World'; END IF;
   END LOOP;
  ELSE
   IF EXISTS(SELECT 1 FROM world_building_floor f CROSS JOIN LATERAL jsonb_array_elements(f.design->'features') s WHERE f.building_id=h.building_id AND f.id<>h.id AND NOT f.archived AND s->>'kind'='transition' AND s->>'archived'='false' AND s->'destination'->>'floorId'=h.id) THEN RAISE EXCEPTION 'Disconnect incoming stairs before archiving a floor'; END IF;
  END IF;
 ELSE
  v=NEW;
  SELECT * INTO h FROM world_building_floor WHERE id=v.floor_id;
 END IF;
 SELECT * INTO op FROM world_building_floor_operation WHERE request_id=v.request_id;
 IF op.request_id IS NULL OR op.world_id<>h.world_id OR op.building_id<>h.building_id OR v.world_id<>h.world_id OR v.revision>h.revision THEN RAISE EXCEPTION 'Floor history must match its accepted operation, World and building'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_building_floor_audit AFTER INSERT OR UPDATE ON world_building_floor DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_building_floor_audit_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_building_floor_version_audit AFTER INSERT ON world_building_floor_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_building_floor_audit_guard();
