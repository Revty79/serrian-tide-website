ALTER TABLE "world_map_canvas" ADD CONSTRAINT "world_map_canvas_source_purpose_uq" UNIQUE("map_id","world_id","terrain_id","purpose");--> statement-breakpoint
CREATE TABLE "world_map_region" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"parent_map_id" text NOT NULL,
	"purpose" text DEFAULT 'regional' NOT NULL,
	"parent_purpose" text DEFAULT 'world' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"x_metres" double precision NOT NULL,
	"y_metres" double precision NOT NULL,
	"width_metres" double precision NOT NULL,
	"height_metres" double precision NOT NULL,
	"initial_source_state" text NOT NULL,
	"initial_source_revision" integer NOT NULL,
	"initial_parent_revision" integer NOT NULL,
	"creation_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_map_region_world_uq" UNIQUE("map_id","world_id"),
	CONSTRAINT "world_map_region_valid" CHECK ("world_map_region"."version"=1 AND "world_map_region"."revision"=1 AND "world_map_region"."purpose"='regional' AND "world_map_region"."parent_purpose"='world' AND "world_map_region"."map_id"<>"world_map_region"."parent_map_id" AND "world_map_region"."x_metres">=0 AND "world_map_region"."x_metres"<1000000000 AND "world_map_region"."y_metres">=0 AND "world_map_region"."y_metres"<1000000000 AND "world_map_region"."width_metres" BETWEEN 1 AND 1000000000 AND "world_map_region"."height_metres" BETWEEN 1 AND 1000000000 AND "world_map_region"."initial_source_revision">0 AND "world_map_region"."initial_parent_revision">0 AND "world_map_region"."creation_hash" ~ '^[a-f0-9]{64}$' AND length("world_map_region"."initial_source_state") BETWEEN 2 AND 8192)
);
--> statement-breakpoint
ALTER TABLE "world_map_canvas" DROP CONSTRAINT "world_map_canvas_valid";--> statement-breakpoint
ALTER TABLE "world_map_region" ADD CONSTRAINT "world_map_region_canvas_fk" FOREIGN KEY ("map_id","world_id","terrain_id","purpose") REFERENCES "public"."world_map_canvas"("map_id","world_id","terrain_id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_region" ADD CONSTRAINT "world_map_region_parent_fk" FOREIGN KEY ("parent_map_id","world_id","terrain_id","parent_purpose") REFERENCES "public"."world_map_canvas"("map_id","world_id","terrain_id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_region" ADD CONSTRAINT "world_map_region_source_fk" FOREIGN KEY ("terrain_id","world_id","initial_source_revision") REFERENCES "public"."world_terrain_version"("terrain_id","world_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_region" ADD CONSTRAINT "world_map_region_author_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_map_region_parent_idx" ON "world_map_region" USING btree ("parent_map_id","world_id");--> statement-breakpoint
ALTER TABLE "world_map_canvas" ADD CONSTRAINT "world_map_canvas_valid" CHECK ("world_map_canvas"."topology"='plane' AND "world_map_canvas"."purpose" IN ('world','regional') AND "world_map_canvas"."rendering"='{"version":1,"style":"elevation-relief"}'::jsonb);
--> statement-breakpoint
CREATE FUNCTION world_map_region_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source world_terrain%ROWTYPE; parent world_atlas_map%ROWTYPE; child world_atlas_map%ROWTYPE;
BEGIN
 SELECT * INTO source FROM world_terrain WHERE id=NEW.terrain_id AND world_id=NEW.world_id;
 SELECT * INTO parent FROM world_atlas_map WHERE id=NEW.parent_map_id AND world_id=NEW.world_id;
 SELECT * INTO child FROM world_atlas_map WHERE id=NEW.map_id AND world_id=NEW.world_id;
 IF source.id IS NULL OR parent.id IS NULL OR child.id IS NULL OR parent.archived_at IS NOT NULL OR child.archived_at IS NOT NULL
    OR parent.scope<>'world' OR parent.map_kind<>'generic' OR child.scope<>'regional' OR child.map_kind<>'generic'
    OR NEW.initial_source_revision<>source.revision OR NEW.initial_parent_revision<>parent.revision
    OR NEW.x_metres>=source.width_metres OR NEW.width_metres>source.width_metres
    OR NEW.y_metres+NEW.height_metres>source.height_metres
    OR (NOT source.wrap_east_west AND NEW.x_metres+NEW.width_metres>source.width_metres) THEN
  RAISE EXCEPTION 'Regional maps require an active same-World parent, accepted source revisions and physical bounds inside its fixed edges.';
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_map_region_validate BEFORE INSERT ON world_map_region FOR EACH ROW EXECUTE FUNCTION world_map_region_validate();
--> statement-breakpoint
CREATE TRIGGER world_map_region_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_map_region FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_map_region_canvas_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.purpose='regional' AND NOT EXISTS (SELECT 1 FROM world_map_region WHERE map_id=NEW.map_id AND world_id=NEW.world_id AND terrain_id=NEW.terrain_id) THEN
  RAISE EXCEPTION 'A regional canvas must commit together with its immutable geographic relationship.';
 END IF;
 RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_map_region_complete AFTER INSERT OR UPDATE ON world_map_canvas DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_map_region_canvas_complete();
--> statement-breakpoint
CREATE FUNCTION world_map_region_map_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.scope,NEW.map_kind) IS DISTINCT FROM (OLD.scope,OLD.map_kind)
    AND EXISTS (SELECT 1 FROM world_map_region WHERE map_id=OLD.id OR parent_map_id=OLD.id) THEN
  RAISE EXCEPTION 'Linked map scope and kind are fixed; archive or restore the map without changing its geographic identity.';
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_map_region_map_identity BEFORE UPDATE ON world_atlas_map FOR EACH ROW EXECUTE FUNCTION world_map_region_map_identity_guard();
