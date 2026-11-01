CREATE TABLE "world_region_hierarchy" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"source_world_map_id" text NOT NULL,
	"source_purpose" text DEFAULT 'world' NOT NULL,
	"organizing_parent_id" text,
	"revision" integer NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_region_hierarchy_valid" CHECK ("world_region_hierarchy"."revision">0 AND "world_region_hierarchy"."source_purpose"='world' AND "world_region_hierarchy"."map_id"<>"world_region_hierarchy"."source_world_map_id" AND "world_region_hierarchy"."map_id" IS DISTINCT FROM "world_region_hierarchy"."organizing_parent_id")
);
--> statement-breakpoint
CREATE TABLE "world_region_hierarchy_change" (
	"request_id" text PRIMARY KEY NOT NULL,
	"map_id" text NOT NULL,
	"world_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"source_world_map_id" text NOT NULL,
	"revision" integer NOT NULL,
	"previous_revision" integer NOT NULL,
	"previous_parent_id" text,
	"organizing_parent_id" text,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_region_hierarchy_change_revision_uq" UNIQUE("map_id","revision"),
	CONSTRAINT "world_region_hierarchy_change_valid" CHECK ("world_region_hierarchy_change"."revision"="world_region_hierarchy_change"."previous_revision"+1 AND "world_region_hierarchy_change"."previous_revision">=0 AND "world_region_hierarchy_change"."action" IN ('create','move') AND "world_region_hierarchy_change"."request_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "world_region_hierarchy" ADD CONSTRAINT "world_region_hierarchy_region_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_region"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_region_hierarchy" ADD CONSTRAINT "world_region_hierarchy_parent_fk" FOREIGN KEY ("organizing_parent_id","world_id") REFERENCES "public"."world_map_region"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_region_hierarchy" ADD CONSTRAINT "world_region_hierarchy_source_fk" FOREIGN KEY ("source_world_map_id","world_id","terrain_id","source_purpose") REFERENCES "public"."world_map_canvas"("map_id","world_id","terrain_id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_region_hierarchy" ADD CONSTRAINT "world_region_hierarchy_editor_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_region_hierarchy_change" ADD CONSTRAINT "world_region_hierarchy_change_region_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_region"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_region_hierarchy_change" ADD CONSTRAINT "world_region_hierarchy_change_parent_fk" FOREIGN KEY ("organizing_parent_id","world_id") REFERENCES "public"."world_map_region"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_region_hierarchy_change" ADD CONSTRAINT "world_region_hierarchy_change_previous_fk" FOREIGN KEY ("previous_parent_id","world_id") REFERENCES "public"."world_map_region"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_region_hierarchy_change" ADD CONSTRAINT "world_region_hierarchy_change_author_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_region_hierarchy_source_idx" ON "world_region_hierarchy" USING btree ("world_id","source_world_map_id");--> statement-breakpoint
CREATE INDEX "world_region_hierarchy_change_world_idx" ON "world_region_hierarchy_change" USING btree ("world_id","map_id");
--> statement-breakpoint
CREATE FUNCTION world_region_hierarchy_validate() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
DECLARE region_row record; parent_row record; owner_row record; has_cycle boolean; maximum_depth integer;
BEGIN
 SELECT * INTO owner_row FROM world WHERE id=NEW.world_id FOR UPDATE;
 IF NOT FOUND OR owner_row.archived_at IS NOT NULL OR owner_row.owner_id<>NEW.updated_by_user_id THEN RAISE EXCEPTION 'Only the active World owner may change region organization.'; END IF;
 SELECT * INTO region_row FROM world_map_region WHERE map_id=NEW.map_id AND world_id=NEW.world_id;
 IF NOT FOUND OR region_row.terrain_id<>NEW.terrain_id OR region_row.parent_map_id<>NEW.source_world_map_id THEN RAISE EXCEPTION 'Organization must retain the region source World and terrain.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM world_atlas_map WHERE id=NEW.map_id AND world_id=NEW.world_id AND archived_at IS NULL) OR NOT EXISTS(SELECT 1 FROM world_atlas_map WHERE id=NEW.source_world_map_id AND world_id=NEW.world_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Restore an archived map or its source before organizing it.'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'A hierarchy starts at revision one.'; END IF;
 ELSE
  IF (NEW.map_id,NEW.world_id,NEW.terrain_id,NEW.source_world_map_id,NEW.source_purpose,NEW.created_at) IS DISTINCT FROM (OLD.map_id,OLD.world_id,OLD.terrain_id,OLD.source_world_map_id,OLD.source_purpose,OLD.created_at) THEN RAISE EXCEPTION 'Hierarchy source identities are immutable.'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Hierarchy revision conflict.'; END IF;
 END IF;
 IF NEW.organizing_parent_id IS NOT NULL THEN
  SELECT pr.*,m.archived_at INTO parent_row FROM world_map_region pr JOIN world_atlas_map m ON m.id=pr.map_id AND m.world_id=pr.world_id WHERE pr.map_id=NEW.organizing_parent_id AND pr.world_id=NEW.world_id;
  IF NOT FOUND OR parent_row.archived_at IS NOT NULL OR parent_row.terrain_id<>NEW.terrain_id OR parent_row.parent_map_id<>NEW.source_world_map_id OR parent_row.map_id=NEW.map_id THEN RAISE EXCEPTION 'Choose another active region in the same source World and terrain.'; END IF;
 END IF;
 WITH RECURSIVE proposed AS (
  SELECT r.map_id,CASE WHEN r.map_id=NEW.map_id THEN NEW.organizing_parent_id ELSE h.organizing_parent_id END AS parent_id
  FROM world_map_region r LEFT JOIN world_region_hierarchy h ON h.map_id=r.map_id AND h.world_id=r.world_id
  WHERE r.world_id=NEW.world_id AND r.parent_map_id=NEW.source_world_map_id
 ), walk AS (
  SELECT map_id AS start_id,map_id,parent_id,ARRAY[map_id] AS path,1 AS depth,false AS cycle FROM proposed
  UNION ALL
  SELECT w.start_id,p.map_id,p.parent_id,w.path||p.map_id,w.depth+1,p.map_id=ANY(w.path)
  FROM walk w JOIN proposed p ON p.map_id=w.parent_id WHERE NOT w.cycle AND w.depth<=16
 ) SELECT coalesce(bool_or(cycle),false),coalesce(max(depth),0) INTO has_cycle,maximum_depth FROM walk;
 IF has_cycle THEN RAISE EXCEPTION 'Region organization cannot contain a cycle.'; END IF;
 IF maximum_depth>16 THEN RAISE EXCEPTION 'Keep the complete hierarchy within 16 regional levels.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_region_hierarchy_validate BEFORE INSERT OR UPDATE ON world_region_hierarchy FOR EACH ROW EXECUTE FUNCTION world_region_hierarchy_validate();
--> statement-breakpoint
CREATE TRIGGER world_region_hierarchy_no_delete BEFORE DELETE OR TRUNCATE ON world_region_hierarchy FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE TRIGGER world_region_hierarchy_change_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_region_hierarchy_change FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_region_hierarchy_require_audit() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
DECLARE a record; expected_revision integer; expected_parent text; creation record;
BEGIN
 expected_revision:=CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.revision END;
 expected_parent:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.organizing_parent_id END;
 SELECT * INTO a FROM world_region_hierarchy_change WHERE map_id=NEW.map_id AND world_id=NEW.world_id AND revision=NEW.revision;
 IF NOT FOUND OR a.previous_revision<>expected_revision OR a.previous_parent_id IS DISTINCT FROM expected_parent OR a.organizing_parent_id IS DISTINCT FROM NEW.organizing_parent_id OR a.created_by_user_id<>NEW.updated_by_user_id OR a.terrain_id<>NEW.terrain_id OR a.source_world_map_id<>NEW.source_world_map_id THEN RAISE EXCEPTION 'A hierarchy change requires its exact immutable audit record in the same transaction.'; END IF;
 IF a.action='create' THEN
  SELECT * INTO creation FROM world_map_region WHERE map_id=NEW.map_id AND world_id=NEW.world_id;
  IF a.previous_revision<>0 OR a.request_id<>NEW.map_id OR a.request_hash<>creation.creation_hash OR a.created_by_user_id<>creation.created_by_user_id THEN RAISE EXCEPTION 'Hierarchy creation must match the original region creation identity.'; END IF;
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_region_hierarchy_audit_required AFTER INSERT OR UPDATE ON world_region_hierarchy DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_region_hierarchy_require_audit();
--> statement-breakpoint
CREATE FUNCTION world_region_hierarchy_change_require_head() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM world_region_hierarchy h WHERE h.map_id=NEW.map_id AND h.world_id=NEW.world_id AND h.terrain_id=NEW.terrain_id AND h.source_world_map_id=NEW.source_world_map_id AND h.revision>=NEW.revision) THEN RAISE EXCEPTION 'A hierarchy audit requires its accepted head in the same transaction.'; END IF;
 IF NEW.previous_revision>0 AND NOT EXISTS(SELECT 1 FROM world_region_hierarchy_change a WHERE a.map_id=NEW.map_id AND a.world_id=NEW.world_id AND a.revision=NEW.previous_revision AND a.organizing_parent_id IS NOT DISTINCT FROM NEW.previous_parent_id) THEN RAISE EXCEPTION 'Hierarchy audit history must retain its exact predecessor.'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_region_hierarchy_change_head_required AFTER INSERT ON world_region_hierarchy_change DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_region_hierarchy_change_require_head();
