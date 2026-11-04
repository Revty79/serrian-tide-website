CREATE TABLE "world_craft" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"classification" text NOT NULL,
	"frame" jsonb NOT NULL,
	"draft" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_craft_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_craft_valid" CHECK ("world_craft"."revision" BETWEEN 1 AND 512 AND jsonb_typeof("world_craft"."draft")='object' AND octet_length("world_craft"."draft"::text)<=5000000)
);
--> statement-breakpoint
CREATE TABLE "world_craft_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"craft_id" text NOT NULL,
	"revision" integer NOT NULL,
	"source" text NOT NULL,
	"source_feature_id" text NOT NULL,
	"source_point" jsonb NOT NULL,
	"destination" text NOT NULL,
	"arrival_feature_id" text NOT NULL,
	"arrival_point" jsonb NOT NULL,
	"kind" text NOT NULL,
	"two_way" boolean NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"request_id" text NOT NULL,
	CONSTRAINT "world_craft_connection_valid" CHECK ("world_craft_connection"."revision" BETWEEN 1 AND 512 AND "world_craft_connection"."source"<>"world_craft_connection"."destination" AND "world_craft_connection"."kind" IN ('stairs','hatch','ladder','lift','ramp'))
);
--> statement-breakpoint
CREATE TABLE "world_craft_connection_version" (
	"connection_id" text NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"request_id" text NOT NULL,
	CONSTRAINT "world_craft_connection_version_connection_id_revision_pk" PRIMARY KEY("connection_id","revision")
);
--> statement-breakpoint
CREATE TABLE "world_craft_deck" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"craft_id" text NOT NULL,
	"name" text NOT NULL,
	"deck_order" integer NOT NULL,
	"height" double precision,
	"frame" jsonb NOT NULL,
	"draft" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "world_craft_deck_craft_uq" UNIQUE("id","craft_id","world_id"),
	CONSTRAINT "world_craft_deck_valid" CHECK ("world_craft_deck"."revision" BETWEEN 1 AND 512 AND jsonb_typeof("world_craft_deck"."draft")='object' AND octet_length("world_craft_deck"."draft"::text)<=5000000)
);
--> statement-breakpoint
CREATE TABLE "world_craft_deck_version" (
	"deck_id" text NOT NULL,
	"craft_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"draft" jsonb NOT NULL,
	"archived" boolean NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_craft_deck_version_deck_id_revision_pk" PRIMARY KEY("deck_id","revision")
);
--> statement-breakpoint
CREATE TABLE "world_craft_operation" (
	"request_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"author_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_craft_operation_valid" CHECK ("world_craft_operation"."input_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "world_craft_placement" (
	"craft_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"source_map_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"rotation" double precision NOT NULL,
	"revision" integer NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"request_id" text NOT NULL,
	CONSTRAINT "world_craft_placement_valid" CHECK ("world_craft_placement"."revision" BETWEEN 1 AND 10000 AND "world_craft_placement"."x">=0 AND "world_craft_placement"."x"<1e12 AND "world_craft_placement"."y">=0 AND "world_craft_placement"."y"<1e12 AND "world_craft_placement"."rotation" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "world_craft_version" (
	"craft_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"draft" jsonb NOT NULL,
	"archived" boolean NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_craft_version_craft_id_revision_pk" PRIMARY KEY("craft_id","revision")
);
--> statement-breakpoint
ALTER TABLE "atlas_composition" DROP CONSTRAINT "atlas_composition_valid";--> statement-breakpoint
ALTER TABLE "world_craft" ADD CONSTRAINT "world_craft_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_connection" ADD CONSTRAINT "world_craft_connection_request_id_world_craft_operation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_craft_operation"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_connection" ADD CONSTRAINT "world_craft_connection_craft_id_world_id_world_craft_id_world_id_fk" FOREIGN KEY ("craft_id","world_id") REFERENCES "public"."world_craft"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_connection_version" ADD CONSTRAINT "world_craft_connection_version_connection_id_world_craft_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."world_craft_connection"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_connection_version" ADD CONSTRAINT "world_craft_connection_version_request_id_world_craft_operation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_craft_operation"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_deck" ADD CONSTRAINT "world_craft_deck_craft_id_world_id_world_craft_id_world_id_fk" FOREIGN KEY ("craft_id","world_id") REFERENCES "public"."world_craft"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_deck_version" ADD CONSTRAINT "world_craft_deck_version_request_id_world_craft_operation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_craft_operation"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_deck_version" ADD CONSTRAINT "world_craft_deck_version_deck_id_craft_id_world_id_world_craft_deck_id_craft_id_world_id_fk" FOREIGN KEY ("deck_id","craft_id","world_id") REFERENCES "public"."world_craft_deck"("id","craft_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_operation" ADD CONSTRAINT "world_craft_operation_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_operation" ADD CONSTRAINT "world_craft_operation_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_placement" ADD CONSTRAINT "world_craft_placement_request_id_world_craft_operation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_craft_operation"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_placement" ADD CONSTRAINT "world_craft_placement_craft_id_world_id_world_craft_id_world_id_fk" FOREIGN KEY ("craft_id","world_id") REFERENCES "public"."world_craft"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_version" ADD CONSTRAINT "world_craft_version_request_id_world_craft_operation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_craft_operation"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_craft_version" ADD CONSTRAINT "world_craft_version_craft_id_world_id_world_craft_id_world_id_fk" FOREIGN KEY ("craft_id","world_id") REFERENCES "public"."world_craft"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_craft_world_idx" ON "world_craft" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_craft_connection_craft_idx" ON "world_craft_connection" USING btree ("craft_id");--> statement-breakpoint
CREATE INDEX "world_craft_deck_craft_idx" ON "world_craft_deck" USING btree ("craft_id");--> statement-breakpoint
CREATE INDEX "world_craft_placement_terrain_idx" ON "world_craft_placement" USING btree ("world_id","terrain_id");--> statement-breakpoint
ALTER TABLE "atlas_composition" ADD CONSTRAINT "atlas_composition_valid" CHECK ("atlas_composition"."kind" IN ('terrain','town','floor','underground','craft','craft-deck') AND "atlas_composition"."revision">0 AND "atlas_composition"."layer"->>'version'='1' AND jsonb_typeof("atlas_composition"."layer"->'placements')='array' AND jsonb_array_length("atlas_composition"."layer"->'placements')<=256);
--> statement-breakpoint
ALTER TABLE world_craft_placement ADD CONSTRAINT world_craft_placement_map_world_fk FOREIGN KEY(source_map_id,world_id) REFERENCES world_atlas_map(id,world_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE world_craft_placement ADD CONSTRAINT world_craft_placement_terrain_world_fk FOREIGN KEY(terrain_id,world_id) REFERENCES world_terrain(id,world_id) ON DELETE RESTRICT;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conrelid::regclass t,conname FROM pg_constraint WHERE contype='f' AND confrelid='world_craft_operation'::regclass LOOP
  EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED',r.t,r.conname);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION world_craft_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Craft accepted history is immutable; retain it and archive current records instead'; END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_craft_version','world_craft_deck_version','world_craft_connection_version','world_craft_operation'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION world_craft_immutable()',t||'_immutable',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['world_craft','world_craft_deck','world_craft_connection','world_craft_placement'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION world_craft_immutable()',t||'_retain',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION world_craft_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Craft revision must advance exactly once'; END IF;
 IF TG_TABLE_NAME IN ('world_craft','world_craft_deck') THEN IF NEW.id<>OLD.id THEN RAISE EXCEPTION 'Craft and deck identities are permanent'; END IF; END IF;
 IF NEW.world_id<>OLD.world_id THEN RAISE EXCEPTION 'Craft records cannot change Worlds'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_craft','world_craft_deck','world_craft_connection','world_craft_placement'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION world_craft_revision_guard()',t||'_revision',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION world_craft_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE c world_craft; d world_craft_deck; p world_craft_placement; l world_craft_connection; s jsonb; a jsonb; v jsonb; BEGIN
 IF TG_TABLE_NAME='world_craft' THEN
  SELECT * INTO c FROM world_craft WHERE id=NEW.id;
  IF c.name<>c.draft->>'name' OR c.classification<>c.draft->>'classification' OR c.frame<>c.draft->'frame' OR NOT EXISTS(SELECT 1 FROM world_craft_version WHERE craft_id=c.id AND world_id=c.world_id AND revision=c.revision AND draft=c.draft AND archived=c.archived) THEN RAISE EXCEPTION 'Craft head requires its exact immutable version'; END IF;
 ELSIF TG_TABLE_NAME='world_craft_deck' THEN
  SELECT * INTO d FROM world_craft_deck WHERE id=NEW.id;
  IF d.name<>d.draft->>'name' OR d.deck_order<>(d.draft->>'order')::int OR d.height IS DISTINCT FROM (d.draft->>'height')::double precision OR d.frame<>d.draft->'frame' OR NOT EXISTS(SELECT 1 FROM world_craft_deck_version WHERE deck_id=d.id AND craft_id=d.craft_id AND world_id=d.world_id AND revision=d.revision AND draft=d.draft AND archived=d.archived) THEN RAISE EXCEPTION 'Craft deck head requires its exact immutable version'; END IF;
 ELSIF TG_TABLE_NAME='world_craft_placement' THEN
  SELECT * INTO p FROM world_craft_placement WHERE craft_id=NEW.craft_id;
  IF NOT EXISTS(SELECT 1 FROM world_craft_operation WHERE request_id=p.request_id AND world_id=p.world_id AND result->>'craftId'=p.craft_id AND (result->>'placementRevision')::int=p.revision) THEN RAISE EXCEPTION 'Craft position requires its exact request receipt'; END IF;
 ELSE
  SELECT * INTO l FROM world_craft_connection WHERE id=NEW.id;
  SELECT draft->'surface'->'plan'->'features' INTO s FROM world_craft WHERE l.source='exterior' AND id=l.craft_id AND world_id=l.world_id;
  IF l.source<>'exterior' THEN SELECT draft->'surface'->'plan'->'features' INTO s FROM world_craft_deck WHERE id=l.source AND craft_id=l.craft_id AND world_id=l.world_id; END IF;
  SELECT draft->'surface'->'plan'->'features' INTO a FROM world_craft WHERE l.destination='exterior' AND id=l.craft_id AND world_id=l.world_id;
  IF l.destination<>'exterior' THEN SELECT draft->'surface'->'plan'->'features' INTO a FROM world_craft_deck WHERE id=l.destination AND craft_id=l.craft_id AND world_id=l.world_id; END IF;
  SELECT snapshot INTO v FROM world_craft_connection_version WHERE connection_id=l.id AND revision=l.revision;
  IF s IS NULL OR a IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s) f WHERE f->>'id'=l.source_feature_id) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a) f WHERE f->>'id'=l.arrival_feature_id) OR v IS NULL OR v->>'craftId'<>l.craft_id OR v->>'source'<>l.source OR v->>'destination'<>l.destination OR v->>'sourceFeatureId'<>l.source_feature_id OR v->>'arrivalFeatureId'<>l.arrival_feature_id OR v->'sourcePoint'<>l.source_point OR v->'arrivalPoint'<>l.arrival_point OR (v->>'twoWay')::boolean<>l.two_way OR (v->>'archived')::boolean<>l.archived OR v->>'kind'<>l.kind THEN RAISE EXCEPTION 'Craft connection requires retained endpoints and its exact immutable version'; END IF;
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['world_craft','world_craft_deck','world_craft_connection','world_craft_placement'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_craft_head_guard()',t||'_head',t);
 END LOOP;
END $$;

--> statement-breakpoint
CREATE INDEX "world_craft_operation_world_idx" ON "world_craft_operation" USING btree ("world_id");

--> statement-breakpoint
CREATE INDEX "world_craft_version_world_idx" ON "world_craft_version" USING btree ("world_id");

--> statement-breakpoint
CREATE INDEX "world_craft_deck_version_world_idx" ON "world_craft_deck_version" USING btree ("world_id");

--> statement-breakpoint
CREATE INDEX "world_craft_connection_world_idx" ON "world_craft_connection" USING btree ("world_id");
