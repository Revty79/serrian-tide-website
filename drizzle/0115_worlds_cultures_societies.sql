CREATE TABLE "world_belief_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'belief' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"claims" text DEFAULT '' NOT NULL,
	"interpretations" text DEFAULT '' NOT NULL,
	"perspective" text DEFAULT '' NOT NULL,
	"origins" text DEFAULT '' NOT NULL,
	"expression" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_belief_valid" CHECK ("world_belief_version"."family"='belief' and length(trim("world_belief_version"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_civilization_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'civilization' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"foundations" text DEFAULT '' NOT NULL,
	"institutions" text DEFAULT '' NOT NULL,
	"knowledge" text DEFAULT '' NOT NULL,
	"achievements" text DEFAULT '' NOT NULL,
	"economy" text DEFAULT '' NOT NULL,
	"interactions" text DEFAULT '' NOT NULL,
	"transformations" text DEFAULT '' NOT NULL,
	"decline" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_civilization_valid" CHECK ("world_civilization_version"."family"='civilization' and length(trim("world_civilization_version"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_culture_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'culture' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"identity" text DEFAULT '' NOT NULL,
	"values" text DEFAULT '' NOT NULL,
	"customs" text DEFAULT '' NOT NULL,
	"social" text DEFAULT '' NOT NULL,
	"arts" text DEFAULT '' NOT NULL,
	"knowledge" text DEFAULT '' NOT NULL,
	"extraordinary" text DEFAULT '' NOT NULL,
	"perspectives" text DEFAULT '' NOT NULL,
	"exchange" text DEFAULT '' NOT NULL,
	"transformations" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_culture_valid" CHECK ("world_culture_version"."family"='culture' and length(trim("world_culture_version"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_language_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'language' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"representation" text DEFAULT '' NOT NULL,
	"origins" text DEFAULT '' NOT NULL,
	"dialects" text DEFAULT '' NOT NULL,
	"influences" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"revival" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_language_valid" CHECK ("world_language_version"."family"='language' and length(trim("world_language_version"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_lore_geography" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"geography_id" text NOT NULL,
	"destination_id" text,
	"relationship_type" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"historical_time" jsonb NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	CONSTRAINT "world_lore_geography_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "lore_geography_valid" CHECK ("world_lore_geography"."position" between 0 and 99 and length(trim("world_lore_geography"."relationship_type")) between 1 and 160 and world_lore_time_valid("world_lore_geography"."historical_time"))
);
--> statement-breakpoint
CREATE TABLE "world_population_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'population' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"identity" text DEFAULT '' NOT NULL,
	"habitat" text DEFAULT '' NOT NULL,
	"estimates" text DEFAULT '' NOT NULL,
	"demographics" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"movement" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_population_valid" CHECK ("world_population_version"."family"='population' and length(trim("world_population_version"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_tradition_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'tradition' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"practice" text DEFAULT '' NOT NULL,
	"meaning" text DEFAULT '' NOT NULL,
	"transmission" text DEFAULT '' NOT NULL,
	"origins" text DEFAULT '' NOT NULL,
	"variations" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_tradition_valid" CHECK ("world_tradition_version"."family"='tradition' and length(trim("world_tradition_version"."name")) between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "world_lore_identity" DROP CONSTRAINT "lore_identity_family_valid";--> statement-breakpoint
ALTER TABLE "world_belief_version" ADD CONSTRAINT "lore_belief_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_civilization_version" ADD CONSTRAINT "lore_civilization_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_culture_version" ADD CONSTRAINT "lore_culture_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_language_version" ADD CONSTRAINT "lore_language_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_geography" ADD CONSTRAINT "lore_geography_version_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_lore_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_geography" ADD CONSTRAINT "lore_geography_place_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_geography" ADD CONSTRAINT "lore_geography_destination_fk" FOREIGN KEY ("destination_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_population_version" ADD CONSTRAINT "lore_population_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_tradition_version" ADD CONSTRAINT "lore_tradition_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lore_geography_place_idx" ON "world_lore_geography" USING btree ("world_id","geography_id");--> statement-breakpoint
CREATE INDEX "lore_geography_destination_idx" ON "world_lore_geography" USING btree ("world_id","destination_id");--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "lore_identity_family_valid" CHECK ("world_lore_identity"."family" in ('species','people','origin','relationship','culture','civilization','language','population','belief','tradition'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_lore_version_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE populated boolean;
BEGIN
 IF NEW.family='species' THEN SELECT EXISTS(SELECT 1 FROM world_species_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='people' THEN SELECT EXISTS(SELECT 1 FROM world_people_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='origin' THEN SELECT EXISTS(SELECT 1 FROM world_origin_version WHERE version_id=NEW.id AND length(trim(description))>0) AND EXISTS(SELECT 1 FROM world_lore_participant WHERE version_id=NEW.id AND role='subject' AND target_id IS NOT NULL) INTO populated;
 ELSIF NEW.family='relationship' THEN SELECT EXISTS(SELECT 1 FROM world_relationship_version WHERE version_id=NEW.id AND length(trim(relationship_type))>0) AND (SELECT count(*) FROM world_lore_participant WHERE version_id=NEW.id)>=2 INTO populated;
 ELSIF NEW.family='culture' THEN SELECT EXISTS(SELECT 1 FROM world_culture_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='civilization' THEN SELECT EXISTS(SELECT 1 FROM world_civilization_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='language' THEN SELECT EXISTS(SELECT 1 FROM world_language_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='population' THEN SELECT EXISTS(SELECT 1 FROM world_population_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='belief' THEN SELECT EXISTS(SELECT 1 FROM world_belief_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='tradition' THEN SELECT EXISTS(SELECT 1 FROM world_tradition_version WHERE version_id=NEW.id) INTO populated;
 END IF;
 IF populated IS DISTINCT FROM true THEN RAISE EXCEPTION 'An entity source requires complete typed content and valid participants'; END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
CREATE TRIGGER culture_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_culture_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER civilization_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_civilization_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER language_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_language_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER population_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_population_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER belief_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_belief_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER tradition_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_tradition_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER lore_geography_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_lore_geography FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
