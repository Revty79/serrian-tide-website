CREATE TABLE "world_terrain_transfer" (
	"request_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"refinement_id" text,
	"input_hash" text NOT NULL,
	"command" jsonb NOT NULL,
	"tiles" jsonb NOT NULL,
	"tile_count" integer NOT NULL,
	"state" text DEFAULT 'receiving' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_terrain_transfer_valid" CHECK ("world_terrain_transfer"."input_hash" ~ '^[a-f0-9]{64}$' AND "world_terrain_transfer"."tile_count" BETWEEN 1 AND 16384 AND "world_terrain_transfer"."state" IN ('receiving','retained','accepted') AND jsonb_typeof("world_terrain_transfer"."command")='object' AND jsonb_typeof("world_terrain_transfer"."tiles")='array' AND jsonb_array_length("world_terrain_transfer"."tiles")="world_terrain_transfer"."tile_count" AND (("world_terrain_transfer"."state" IN ('receiving','retained') AND "world_terrain_transfer"."result" IS NULL) OR ("world_terrain_transfer"."state"='accepted' AND jsonb_typeof("world_terrain_transfer"."result")='object')))
);
--> statement-breakpoint
CREATE TABLE "world_terrain_transfer_tile" (
	"request_id" text NOT NULL,
	"tile_x" integer NOT NULL,
	"tile_y" integer NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"encoding" text NOT NULL,
	CONSTRAINT "world_terrain_transfer_tile_request_id_tile_x_tile_y_pk" PRIMARY KEY("request_id","tile_x","tile_y"),
	CONSTRAINT "world_terrain_transfer_tile_valid" CHECK ("world_terrain_transfer_tile"."tile_x" BETWEEN 0 AND 127 AND "world_terrain_transfer_tile"."tile_y" BETWEEN 0 AND 127 AND "world_terrain_transfer_tile"."sha256" ~ '^[a-f0-9]{64}$' AND "world_terrain_transfer_tile"."bytes"=2048 AND "world_terrain_transfer_tile"."encoding"='i16le-v1')
);
--> statement-breakpoint
ALTER TABLE "world_terrain" DROP CONSTRAINT "world_terrain_valid";--> statement-breakpoint
ALTER TABLE "world_terrain_tile" DROP CONSTRAINT "world_terrain_tile_valid";--> statement-breakpoint
ALTER TABLE "world_terrain_refinement" DROP CONSTRAINT "world_terrain_refinement_valid";--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_tile" DROP CONSTRAINT "world_terrain_refinement_tile_valid";--> statement-breakpoint
ALTER TABLE "world_terrain_transfer" ADD CONSTRAINT "world_terrain_transfer_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_transfer" ADD CONSTRAINT "world_terrain_transfer_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_transfer_tile" ADD CONSTRAINT "world_terrain_transfer_tile_request_id_world_terrain_transfer_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_terrain_transfer"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_terrain_transfer_actor_idx" ON "world_terrain_transfer" USING btree ("actor_id","state");--> statement-breakpoint
ALTER TABLE "world_terrain" ADD CONSTRAINT "world_terrain_valid" CHECK ("world_terrain"."format"=1 AND "world_terrain"."grid_width" BETWEEN 32 AND 2048 AND "world_terrain"."grid_height" BETWEEN 32 AND 2048 AND "world_terrain"."grid_width"%32=0 AND "world_terrain"."grid_height"%32=0 AND "world_terrain"."tile_size"=32 AND "world_terrain"."width_metres" BETWEEN 100 AND 1000000000 AND "world_terrain"."height_metres" BETWEEN 100 AND 1000000000 AND "world_terrain"."coordinate_reference"='LOCAL:METRES' AND "world_terrain"."min_elevation" BETWEEN -30000 AND -1 AND "world_terrain"."max_elevation" BETWEEN 1 AND 30000 AND "world_terrain"."base_elevation" BETWEEN "world_terrain"."min_elevation" AND "world_terrain"."max_elevation" AND "world_terrain"."sea_level" BETWEEN "world_terrain"."min_elevation" AND "world_terrain"."max_elevation" AND "world_terrain"."revision">0 AND "world_terrain"."creation_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "world_terrain_tile" ADD CONSTRAINT "world_terrain_tile_valid" CHECK ("world_terrain_tile"."detail_level"=0 AND "world_terrain_tile"."tile_x" BETWEEN 0 AND 63 AND "world_terrain_tile"."tile_y" BETWEEN 0 AND 63 AND "world_terrain_tile"."sha256" ~ '^[a-f0-9]{64}$' AND "world_terrain_tile"."bytes"=2048 AND "world_terrain_tile"."encoding"='i16le-v1');--> statement-breakpoint
ALTER TABLE "world_terrain_refinement" ADD CONSTRAINT "world_terrain_refinement_valid" CHECK ("world_terrain_refinement"."detail_level" BETWEEN 1 AND 8 AND "world_terrain_refinement"."parent_revision">0 AND "world_terrain_refinement"."revision">0 AND length("world_terrain_refinement"."name") BETWEEN 1 AND 160 AND "world_terrain_refinement"."x_metres">=0 AND "world_terrain_refinement"."x_metres"<1000000000 AND "world_terrain_refinement"."y_metres">=0 AND "world_terrain_refinement"."y_metres"<1000000000 AND "world_terrain_refinement"."width_metres" BETWEEN 100 AND 1000000000 AND "world_terrain_refinement"."height_metres" BETWEEN 100 AND 1000000000 AND "world_terrain_refinement"."grid_width" IN (32,64,128,256,512,1024,2048,4096) AND "world_terrain_refinement"."grid_height" IN (32,64,128,256,512,1024,2048,4096) AND "world_terrain_refinement"."creation_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "world_terrain_refinement_tile" ADD CONSTRAINT "world_terrain_refinement_tile_valid" CHECK ("world_terrain_refinement_tile"."lod" BETWEEN 0 AND 7 AND "world_terrain_refinement_tile"."tile_x" BETWEEN 0 AND 127 AND "world_terrain_refinement_tile"."tile_y" BETWEEN 0 AND 127 AND "world_terrain_refinement_tile"."sha256" ~ '^[a-f0-9]{64}$' AND "world_terrain_refinement_tile"."bytes"=2048 AND "world_terrain_refinement_tile"."encoding"='i16le-v1' AND "world_terrain_refinement_tile"."manual_protection" ~ '^[a-f0-9]+$' AND length("world_terrain_refinement_tile"."manual_protection")=256);
--> statement-breakpoint
CREATE FUNCTION world_terrain_transfer_identity_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.request_id,NEW.world_id,NEW.actor_id,NEW.refinement_id,NEW.input_hash,NEW.command,NEW.tiles,NEW.tile_count,NEW.created_at)
 IS DISTINCT FROM (OLD.request_id,OLD.world_id,OLD.actor_id,OLD.refinement_id,OLD.input_hash,OLD.command,OLD.tiles,OLD.tile_count,OLD.created_at)
 OR (OLD.state='accepted' AND (NEW.state,NEW.result) IS DISTINCT FROM (OLD.state,OLD.result))
 THEN RAISE EXCEPTION 'Original numerical transfer identity and accepted receipt are immutable'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_transfer_identity BEFORE UPDATE ON world_terrain_transfer FOR EACH ROW EXECUTE FUNCTION world_terrain_transfer_identity_valid();
--> statement-breakpoint
CREATE TRIGGER world_terrain_transfer_retained BEFORE DELETE OR TRUNCATE ON world_terrain_transfer FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE TRIGGER world_terrain_transfer_tile_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_terrain_transfer_tile FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_terrain_transfer_acceptance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE transfer world_terrain_transfer%ROWTYPE;
BEGIN
 SELECT * INTO transfer FROM world_terrain_transfer WHERE request_id=NEW.request_id;
 IF FOUND AND (transfer.world_id<>NEW.world_id OR transfer.actor_id<>NEW.author_id OR current_setting('serrian.terrain_transfer_request',true) IS DISTINCT FROM NEW.request_id)
 THEN RAISE EXCEPTION 'A reserved numerical request must use its original checked transfer'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_transfer_acceptance BEFORE INSERT ON world_terrain_version FOR EACH ROW EXECUTE FUNCTION world_terrain_transfer_acceptance_guard();
--> statement-breakpoint
CREATE TRIGGER world_refinement_transfer_acceptance BEFORE INSERT ON world_terrain_refinement_version FOR EACH ROW EXECUTE FUNCTION world_terrain_transfer_acceptance_guard();
--> statement-breakpoint
CREATE TRIGGER world_historical_transfer_acceptance BEFORE INSERT ON world_map_state_native_request FOR EACH ROW EXECUTE FUNCTION world_terrain_transfer_acceptance_guard();
