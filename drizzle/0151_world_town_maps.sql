CREATE TABLE "world_town_map" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"town_id" text NOT NULL,
	"source_map_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"source_purpose" text DEFAULT 'world' NOT NULL,
	"context_map_id" text NOT NULL,
	"placement_id" text,
	"placement_revision" integer,
	"anchor_x" double precision NOT NULL,
	"anchor_y" double precision NOT NULL,
	"frame" jsonb NOT NULL,
	"name" text NOT NULL,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"design" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_town_map_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_town_map_valid" CHECK ("world_town_map"."source_purpose"='world' AND "world_town_map"."revision">0 AND length(trim("world_town_map"."name")) BETWEEN 1 AND 160 AND "world_town_map"."anchor_x" BETWEEN 0 AND 1000000000 AND "world_town_map"."anchor_y" BETWEEN 0 AND 1000000000 AND (("world_town_map"."placement_id" IS NULL AND "world_town_map"."placement_revision" IS NULL) OR ("world_town_map"."placement_id" IS NOT NULL AND "world_town_map"."placement_revision">0)) AND jsonb_typeof("world_town_map"."frame")='object' AND jsonb_typeof("world_town_map"."design")='object')
);
--> statement-breakpoint
CREATE TABLE "world_town_map_version" (
	"request_id" text PRIMARY KEY NOT NULL,
	"map_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"author_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"name" text NOT NULL,
	"archived" boolean NOT NULL,
	"design" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_town_map_version_revision_uq" UNIQUE("map_id","revision"),
	CONSTRAINT "world_town_map_version_valid" CHECK ("world_town_map_version"."revision">0 AND "world_town_map_version"."input_hash" ~ '^[a-f0-9]{64}$' AND length(trim("world_town_map_version"."name")) BETWEEN 1 AND 160 AND jsonb_typeof("world_town_map_version"."design")='object')
);
--> statement-breakpoint
ALTER TABLE "world_town_map" ADD CONSTRAINT "world_town_map_town_fk" FOREIGN KEY ("town_id","world_id") REFERENCES "public"."world_settlement_profile"("geography_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_map" ADD CONSTRAINT "world_town_map_source_fk" FOREIGN KEY ("source_map_id","world_id","terrain_id","source_purpose") REFERENCES "public"."world_map_canvas"("map_id","world_id","terrain_id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_map" ADD CONSTRAINT "world_town_map_context_fk" FOREIGN KEY ("context_map_id","world_id") REFERENCES "public"."world_map_canvas"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_map" ADD CONSTRAINT "world_town_map_placement_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."world_map_place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_map_version" ADD CONSTRAINT "world_town_map_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_town_map_version" ADD CONSTRAINT "world_town_map_version_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_town_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_town_map_inventory_idx" ON "world_town_map" USING btree ("world_id","name","id");--> statement-breakpoint
CREATE INDEX "world_town_map_town_idx" ON "world_town_map" USING btree ("world_id","town_id");
--> statement-breakpoint
CREATE FUNCTION world_town_map_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source world_terrain; context_source text; placement world_map_place;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive Town Maps; retain their identities and history'; END IF;
 PERFORM 1 FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.world_id,NEW.town_id,NEW.source_map_id,NEW.terrain_id,NEW.source_purpose,NEW.context_map_id,NEW.placement_id,NEW.placement_revision,NEW.anchor_x,NEW.anchor_y,NEW.frame,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.world_id,OLD.town_id,OLD.source_map_id,OLD.terrain_id,OLD.source_purpose,OLD.context_map_id,OLD.placement_id,OLD.placement_revision,OLD.anchor_x,OLD.anchor_y,OLD.frame,OLD.created_at) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Town Map source identities are immutable and revisions are sequential'; END IF;
 ELSE
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'Start a Town Map at revision one'; END IF;
  SELECT * INTO source FROM world_terrain WHERE id=NEW.terrain_id AND world_id=NEW.world_id;
  SELECT CASE WHEN c.purpose='world' THEN c.map_id ELSE r.parent_map_id END INTO context_source FROM world_map_canvas c LEFT JOIN world_map_region r ON r.map_id=c.map_id AND r.world_id=c.world_id WHERE c.map_id=NEW.context_map_id AND c.world_id=NEW.world_id AND c.terrain_id=NEW.terrain_id;
  IF context_source IS DISTINCT FROM NEW.source_map_id THEN RAISE EXCEPTION 'Town Map context must share its original geographic source'; END IF;
  IF NEW.placement_id IS NOT NULL THEN
   SELECT * INTO placement FROM world_map_place WHERE id=NEW.placement_id;
   IF placement.id IS NULL OR (placement.world_id,placement.map_id,placement.geography_id,placement.revision,placement.x_metres,placement.y_metres) IS DISTINCT FROM (NEW.world_id,NEW.source_map_id,NEW.town_id,NEW.placement_revision,NEW.anchor_x,NEW.anchor_y) OR placement.removed_at IS NOT NULL THEN RAISE EXCEPTION 'Town Map placement must match its saved Town anchor'; END IF;
  END IF;
 END IF;
 IF jsonb_typeof(NEW.design->'features') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.design->'features')>4000 OR octet_length(NEW.design::text)>8388608 OR NEW.design->>'version'<>'1' OR (NEW.frame->>'width')::numeric NOT BETWEEN 100 AND 20000 OR (NEW.frame->>'height')::numeric NOT BETWEEN 100 AND 20000 OR (NEW.frame->>'rotation')::numeric NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Invalid or oversized Town Map design'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_town_map_guard BEFORE INSERT OR UPDATE OR DELETE ON world_town_map FOR EACH ROW EXECUTE FUNCTION world_town_map_guard();
--> statement-breakpoint
CREATE FUNCTION world_town_map_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Town Map accepted receipts are immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER world_town_map_receipt_immutable BEFORE UPDATE OR DELETE ON world_town_map_version FOR EACH ROW EXECUTE FUNCTION world_town_map_receipt_guard();
--> statement-breakpoint
CREATE FUNCTION world_town_map_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head world_town_map; receipt world_town_map_version;
BEGIN
 IF TG_TABLE_NAME='world_town_map' THEN head:=NEW; SELECT * INTO receipt FROM world_town_map_version WHERE map_id=NEW.id AND world_id=NEW.world_id AND revision=NEW.revision;
 ELSE receipt:=NEW; SELECT * INTO head FROM world_town_map WHERE id=NEW.map_id AND world_id=NEW.world_id; END IF;
 IF receipt.request_id IS NULL OR head.id IS NULL OR head.revision<receipt.revision OR (head.revision=receipt.revision AND (head.name,head.archived,head.design) IS DISTINCT FROM (receipt.name,receipt.archived,receipt.design)) THEN RAISE EXCEPTION 'Town Map revision requires its exact immutable receipt'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_town_map_audit AFTER INSERT OR UPDATE ON world_town_map DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_town_map_audit_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_town_map_receipt_head AFTER INSERT ON world_town_map_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_town_map_audit_guard();
