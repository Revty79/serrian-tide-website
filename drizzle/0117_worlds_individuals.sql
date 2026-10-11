CREATE FUNCTION world_individual_fields_valid(fields jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(fields)='array' THEN jsonb_array_length(fields)<=40
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(fields) e WHERE jsonb_typeof(e)<>'string' OR e #>> '{}' NOT IN ('description','aliases','titles','identity','classification','reputation','form','existence','distinctions','transformations','aging','personality','values','beliefs','motivations','goals','fears','habits','strengths','weaknesses','education','experience','communication','discoveries','talents','skills','affiliations','citizenship','occupations','community','privateReputation','origins','development','experiences','achievements','failures','returns','accounts'))
 AND (SELECT count(DISTINCT e) FROM jsonb_array_elements(fields) e)=jsonb_array_length(fields)
 ELSE false END
$$;
--> statement-breakpoint
CREATE TABLE "world_individual_name" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'individual' NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"meaning" text DEFAULT '' NOT NULL,
	"perspective" text DEFAULT '' NOT NULL,
	"historical_time" jsonb NOT NULL,
	CONSTRAINT "world_individual_name_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "individual_name_valid" CHECK ("world_individual_name"."family"='individual' and "world_individual_name"."position" between 0 and 39 and length(trim("world_individual_name"."name")) between 1 and 160 and length(trim("world_individual_name"."kind")) between 1 and 80 and world_lore_time_valid("world_individual_name"."historical_time"))
);
--> statement-breakpoint
CREATE TABLE "world_individual_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'individual' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"titles" text DEFAULT '' NOT NULL,
	"identity" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"reputation" text DEFAULT '' NOT NULL,
	"form" text DEFAULT '' NOT NULL,
	"existence" text DEFAULT '' NOT NULL,
	"distinctions" text DEFAULT '' NOT NULL,
	"transformations" text DEFAULT '' NOT NULL,
	"aging" text DEFAULT '' NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"values" text DEFAULT '' NOT NULL,
	"beliefs" text DEFAULT '' NOT NULL,
	"motivations" text DEFAULT '' NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"fears" text DEFAULT '' NOT NULL,
	"habits" text DEFAULT '' NOT NULL,
	"strengths" text DEFAULT '' NOT NULL,
	"weaknesses" text DEFAULT '' NOT NULL,
	"education" text DEFAULT '' NOT NULL,
	"experience" text DEFAULT '' NOT NULL,
	"communication" text DEFAULT '' NOT NULL,
	"discoveries" text DEFAULT '' NOT NULL,
	"talents" text DEFAULT '' NOT NULL,
	"skills" text DEFAULT '' NOT NULL,
	"affiliations" text DEFAULT '' NOT NULL,
	"citizenship" text DEFAULT '' NOT NULL,
	"occupations" text DEFAULT '' NOT NULL,
	"community" text DEFAULT '' NOT NULL,
	"private_reputation" text DEFAULT '' NOT NULL,
	"origins" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"experiences" text DEFAULT '' NOT NULL,
	"achievements" text DEFAULT '' NOT NULL,
	"failures" text DEFAULT '' NOT NULL,
	"returns" text DEFAULT '' NOT NULL,
	"accounts" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_individual_valid" CHECK ("world_individual_version"."family"='individual' and length(trim("world_individual_version"."name")) between 1 and 160),
	CONSTRAINT "individual_protected_fields_valid" CHECK (world_individual_fields_valid("world_individual_version"."protected_fields"))
);
--> statement-breakpoint
CREATE TABLE "world_relationship_period" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'relationship' NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"perspective" text DEFAULT '' NOT NULL,
	"beginning" jsonb,
	"ending" jsonb,
	CONSTRAINT "world_relationship_period_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "relationship_period_valid" CHECK ("world_relationship_period"."family"='relationship' and "world_relationship_period"."position" between 0 and 39 and length(trim("world_relationship_period"."label")) between 1 and 160 and "world_relationship_period"."status" in ('ongoing','ended','unknown','disputed') and ("world_relationship_period"."beginning" is null or world_lore_time_valid("world_relationship_period"."beginning")) and ("world_relationship_period"."ending" is null or world_lore_time_valid("world_relationship_period"."ending")))
);
--> statement-breakpoint
ALTER TABLE "world_lore_identity" DROP CONSTRAINT "lore_identity_family_valid";--> statement-breakpoint
ALTER TABLE "world_lore_participant" ADD COLUMN "protected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "world_individual_name" ADD CONSTRAINT "individual_name_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_individual_version" ADD CONSTRAINT "lore_individual_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_relationship_period" ADD CONSTRAINT "relationship_period_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "lore_identity_family_valid" CHECK ("world_lore_identity"."family" in ('species','people','origin','relationship','culture','civilization','language','population','belief','tradition','individual'));
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
 ELSIF NEW.family='individual' THEN SELECT EXISTS(SELECT 1 FROM world_individual_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='tradition' THEN SELECT EXISTS(SELECT 1 FROM world_tradition_version WHERE version_id=NEW.id) INTO populated;
 END IF;
 IF populated IS DISTINCT FROM true THEN RAISE EXCEPTION 'An entity source requires complete typed content and valid participants'; END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
CREATE TRIGGER individual_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_individual_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER individual_name_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_individual_name FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER relationship_period_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_relationship_period FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
