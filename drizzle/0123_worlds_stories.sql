CREATE TABLE "world_story_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'story' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"story" text DEFAULT '' NOT NULL,
	"origin" text DEFAULT '' NOT NULL,
	"authorship" text DEFAULT '' NOT NULL,
	"narrator" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"transmission" text DEFAULT '' NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"interpretations" text DEFAULT '' NOT NULL,
	"source_context" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_story_valid" CHECK ("world_story_version"."family"='story' and length(trim("world_story_version"."name")) between 1 and 160),
	CONSTRAINT "story_protected_fields_valid" CHECK (world_lore_fields_valid("world_story_version"."protected_fields",array['description','classification','story','origin','authorship','narrator','audience','transmission','context','interpretations','sourceContext']))
);
--> statement-breakpoint
CREATE TABLE "world_story_context" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'story' NOT NULL,
	"alleged_time" jsonb NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"dating_system_id" text,
	"source_dating" jsonb,
	"calendar_source" jsonb,
	"start_version_id" text,
	"end_version_id" text,
	CONSTRAINT "story_context_valid" CHECK ("world_story_context"."family"='story' and world_lore_time_valid("world_story_context"."alleged_time") and (("world_story_context"."dating_system_id" is null)=("world_story_context"."source_dating" is null)) and ("world_story_context"."source_dating" is null or coalesce("world_story_context"."source_dating"->>'systemId'="world_story_context"."dating_system_id" and "world_story_context"."source_dating"->>'version'='1',false)) and (("world_story_context"."calendar_source" is null and "world_story_context"."start_version_id" is null and "world_story_context"."end_version_id" is null) or coalesce("world_story_context"."calendar_source"->>'version'='1' and "world_story_context"."calendar_source"->'start'->>'versionId'="world_story_context"."start_version_id" and "world_story_context"."calendar_source"->'start'->>'elapsedDay' ~ '^(0|-?[1-9][0-9]{0,19})$' and case "world_story_context"."calendar_source"->>'kind' when 'known' then "world_story_context"."end_version_id" is null and not ("world_story_context"."calendar_source" ? 'end') when 'approximate' then "world_story_context"."end_version_id" is null and not ("world_story_context"."calendar_source" ? 'end') when 'window' then "world_story_context"."end_version_id"="world_story_context"."calendar_source"->'end'->>'versionId' and ("world_story_context"."calendar_source"->'end'->>'elapsedDay')::numeric>=("world_story_context"."calendar_source"->'start'->>'elapsedDay')::numeric when 'duration' then "world_story_context"."end_version_id"="world_story_context"."calendar_source"->'end'->>'versionId' and ("world_story_context"."calendar_source"->'end'->>'elapsedDay')::numeric>=("world_story_context"."calendar_source"->'start'->>'elapsedDay')::numeric else false end,false)))
);
--> statement-breakpoint
CREATE TABLE "world_story_source" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'story' NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"entity_id" text NOT NULL,
	"source_version_id" text NOT NULL,
	"source_revision" integer NOT NULL,
	"relationship_type" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	CONSTRAINT "world_story_source_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "story_source_valid" CHECK ("world_story_source"."family"='story' and "world_story_source"."position" between 0 and 39 and "world_story_source"."source_revision">0 and "world_story_source"."source_version_id"<>"world_story_source"."version_id" and length(trim("world_story_source"."relationship_type")) between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "world_lore_identity" DROP CONSTRAINT "lore_identity_family_valid";--> statement-breakpoint
ALTER TABLE "world_lore_period" DROP CONSTRAINT "lore_period_valid";--> statement-breakpoint
ALTER TABLE "world_story_version" ADD CONSTRAINT "lore_story_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_story_context" ADD CONSTRAINT "story_context_source_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_story_context" ADD CONSTRAINT "story_context_dating_fk" FOREIGN KEY ("dating_system_id","world_id") REFERENCES "public"."world_dating_system"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_story_context" ADD CONSTRAINT "story_context_start_fk" FOREIGN KEY ("start_version_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_story_context" ADD CONSTRAINT "story_context_end_fk" FOREIGN KEY ("end_version_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_story_source" ADD CONSTRAINT "story_source_owner_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_story_source" ADD CONSTRAINT "story_source_original_fk" FOREIGN KEY ("source_version_id","world_id","entity_id") REFERENCES "public"."world_lore_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_story_source" ADD CONSTRAINT "story_source_family_fk" FOREIGN KEY ("source_version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_source_original_idx" ON "world_story_source" USING btree ("world_id","entity_id");--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "lore_identity_family_valid" CHECK ("world_lore_identity"."family" in ('species','people','origin','relationship','culture','civilization','language','population','belief','tradition','individual','polity','government','institution','office','appointment','claim','agreement','conflict','organization','organizationRole','membership','assignment','network','cosmicFramework','realm','celestial','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink','story'));--> statement-breakpoint
ALTER TABLE "world_lore_period" ADD CONSTRAINT "lore_period_valid" CHECK ("world_lore_period"."family" in ('polity','government','institution','office','appointment','claim','agreement','conflict','organization','organizationRole','membership','assignment','network','cosmicFramework','realm','celestial','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink','story') and "world_lore_period"."position" between 0 and 39 and length(trim("world_lore_period"."label")) between 1 and 160 and length(trim("world_lore_period"."status")) between 1 and 160 and ("world_lore_period"."beginning" is null or world_lore_time_valid("world_lore_period"."beginning")) and ("world_lore_period"."ending" is null or world_lore_time_valid("world_lore_period"."ending")));
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
 ELSIF NEW.family='polity' THEN SELECT EXISTS(SELECT 1 FROM world_polity_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='government' THEN SELECT EXISTS(SELECT 1 FROM world_government_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='institution' THEN SELECT EXISTS(SELECT 1 FROM world_institution_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='office' THEN SELECT EXISTS(SELECT 1 FROM world_office_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='appointment' THEN SELECT EXISTS(SELECT 1 FROM world_appointment_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='claim' THEN SELECT EXISTS(SELECT 1 FROM world_claim_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='agreement' THEN SELECT EXISTS(SELECT 1 FROM world_agreement_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='conflict' THEN SELECT EXISTS(SELECT 1 FROM world_conflict_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='organization' THEN SELECT EXISTS(SELECT 1 FROM world_organization_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='organizationRole' THEN SELECT EXISTS(SELECT 1 FROM world_organization_role_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='membership' THEN SELECT EXISTS(SELECT 1 FROM world_membership_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='assignment' THEN SELECT EXISTS(SELECT 1 FROM world_assignment_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='network' THEN SELECT EXISTS(SELECT 1 FROM world_network_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='cosmicFramework' THEN SELECT EXISTS(SELECT 1 FROM world_cosmic_framework_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='realm' THEN SELECT EXISTS(SELECT 1 FROM world_realm_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='celestial' THEN SELECT EXISTS(SELECT 1 FROM world_celestial_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='cosmicPrinciple' THEN SELECT EXISTS(SELECT 1 FROM world_cosmic_principle_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='cosmicConnection' THEN SELECT EXISTS(SELECT 1 FROM world_cosmic_connection_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='skyCycle' THEN SELECT EXISTS(SELECT 1 FROM world_sky_cycle_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='skyObservation' THEN SELECT EXISTS(SELECT 1 FROM world_sky_observation_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='skyCalendarLink' THEN SELECT EXISTS(SELECT 1 FROM world_sky_calendar_link_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='story' THEN SELECT EXISTS(SELECT 1 FROM world_story_version WHERE version_id=NEW.id) AND EXISTS(SELECT 1 FROM world_story_context WHERE version_id=NEW.id) INTO populated;
 END IF;
 IF populated IS DISTINCT FROM true THEN RAISE EXCEPTION 'An entity source requires complete typed content and valid participants'; END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
CREATE TRIGGER world_story_version_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_story_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER world_story_context_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_story_context FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER world_story_source_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_story_source FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE OR REPLACE VIEW world_lore_display AS
SELECT version_id,name,classification classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_species_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_people_version
UNION ALL
SELECT version_id,name,''::text classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_origin_version
UNION ALL
SELECT version_id,name,''::text classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_relationship_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_culture_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_civilization_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_language_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_population_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_belief_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,'[]'::jsonb protected_fields FROM world_tradition_version
UNION ALL
SELECT version_id,name,classification classification,aliases aliases,titles titles,protected_fields protected_fields FROM world_individual_version
UNION ALL
SELECT version_id,name,classification classification,aliases aliases,''::text titles,protected_fields protected_fields FROM world_polity_version
UNION ALL
SELECT version_id,name,classification classification,aliases aliases,''::text titles,protected_fields protected_fields FROM world_government_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,protected_fields protected_fields FROM world_institution_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,protected_fields protected_fields FROM world_office_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,protected_fields protected_fields FROM world_appointment_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,protected_fields protected_fields FROM world_claim_version
UNION ALL
SELECT version_id,name,classification classification,aliases aliases,''::text titles,protected_fields protected_fields FROM world_agreement_version
UNION ALL
SELECT version_id,name,classification classification,''::text aliases,''::text titles,protected_fields protected_fields FROM world_conflict_version
UNION ALL
SELECT version_id,name,classification,aliases aliases,''::text titles,protected_fields FROM world_organization_version
UNION ALL
SELECT version_id,name,classification,''::text aliases,''::text titles,protected_fields FROM world_organization_role_version
UNION ALL
SELECT version_id,name,classification,''::text aliases,''::text titles,protected_fields FROM world_membership_version
UNION ALL
SELECT version_id,name,classification,''::text aliases,''::text titles,protected_fields FROM world_assignment_version
UNION ALL
SELECT version_id,name,classification,''::text aliases,''::text titles,protected_fields FROM world_network_version
UNION ALL
SELECT version_id,name,classification,aliases,''::text,protected_fields FROM world_cosmic_framework_version
UNION ALL
SELECT version_id,name,classification,aliases,''::text,protected_fields FROM world_realm_version
UNION ALL
SELECT version_id,name,classification,aliases,''::text,protected_fields FROM world_celestial_version
UNION ALL
SELECT version_id,name,classification,''::text,''::text,protected_fields FROM world_cosmic_principle_version
UNION ALL
SELECT version_id,name,classification,''::text,''::text,protected_fields FROM world_cosmic_connection_version
UNION ALL
SELECT version_id,name,classification,''::text,''::text,protected_fields FROM world_sky_cycle_version
UNION ALL
SELECT version_id,name,classification,''::text,''::text,protected_fields FROM world_sky_observation_version
UNION ALL
SELECT version_id,name,classification,''::text,''::text,protected_fields FROM world_sky_calendar_link_version
UNION ALL SELECT version_id,name,classification,''::text aliases,''::text titles,protected_fields FROM world_story_version;
