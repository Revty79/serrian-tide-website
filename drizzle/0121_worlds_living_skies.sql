CREATE OR REPLACE FUNCTION world_sky_number_valid(value text, positive boolean) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n numeric; d numeric;
BEGIN
 IF value IS NULL OR value !~ '^-?[0-9]{1,24}([.][0-9]{1,12}|/[0-9]{1,12})?$' THEN RETURN false; END IF;
 IF position('/' in value)>0 THEN n:=split_part(value,'/',1)::numeric; d:=split_part(value,'/',2)::numeric; IF d=0 THEN RETURN false; END IF; ELSE n:=value::numeric; d:=1; END IF;
 RETURN NOT positive OR n/d>0;
END $$;
--> statement-breakpoint
CREATE TABLE "world_sky_calendar_binding" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"calendar_version_id" text NOT NULL,
	"source_revision" integer NOT NULL,
	"calendar_name" text NOT NULL,
	"version_title" text NOT NULL,
	"role" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	CONSTRAINT "world_sky_calendar_binding_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "sky_binding_position_uq" UNIQUE("version_id","position"),
	CONSTRAINT "sky_binding_valid" CHECK ("world_sky_calendar_binding"."position" between 0 and 39 and "world_sky_calendar_binding"."source_revision">0 and length(trim("world_sky_calendar_binding"."role")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_sky_calendar_link_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'skyCalendarLink' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"convention" text DEFAULT '' NOT NULL,
	"interpretation" text DEFAULT '' NOT NULL,
	"perspective" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_skyCalendarLink_valid" CHECK ("world_sky_calendar_link_version"."family"='skyCalendarLink' and length(trim("world_sky_calendar_link_version"."name")) between 1 and 160),
	CONSTRAINT "skyCalendarLink_protected_fields_valid" CHECK (world_lore_fields_valid("world_sky_calendar_link_version"."protected_fields", array['description','classification','convention','interpretation','perspective']))
);
--> statement-breakpoint
CREATE TABLE "world_sky_cycle_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'skyCycle' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"behavior" text DEFAULT '' NOT NULL,
	"progression" text DEFAULT '' NOT NULL,
	"conditions" text DEFAULT '' NOT NULL,
	"perspective" text DEFAULT '' NOT NULL,
	"calculation" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_skyCycle_valid" CHECK ("world_sky_cycle_version"."family"='skyCycle' and length(trim("world_sky_cycle_version"."name")) between 1 and 160),
	CONSTRAINT "skyCycle_protected_fields_valid" CHECK (world_lore_fields_valid("world_sky_cycle_version"."protected_fields", array['description','classification','behavior','progression','conditions','perspective','calculation','development']))
);
--> statement-breakpoint
CREATE TABLE "world_sky_observation_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'skyObservation' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"account_kind" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"perspective" text DEFAULT '' NOT NULL,
	"conditions" text DEFAULT '' NOT NULL,
	"interpretation" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_skyObservation_valid" CHECK ("world_sky_observation_version"."family"='skyObservation' and length(trim("world_sky_observation_version"."name")) between 1 and 160),
	CONSTRAINT "skyObservation_protected_fields_valid" CHECK (world_lore_fields_valid("world_sky_observation_version"."protected_fields", array['description','classification','accountKind','state','perspective','conditions','interpretation']))
);
--> statement-breakpoint
CREATE TABLE "world_sky_phase" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"duration" text,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "world_sky_phase_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "sky_phase_position_uq" UNIQUE("version_id","position"),
	CONSTRAINT "sky_phase_valid" CHECK ("world_sky_phase"."position" between 0 and 39 and length(trim("world_sky_phase"."name")) between 1 and 160 and ("world_sky_phase"."duration" is null or world_sky_number_valid("world_sky_phase"."duration",true)))
);
--> statement-breakpoint
CREATE TABLE "world_sky_rule" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'skyCycle' NOT NULL,
	"scale" text NOT NULL,
	"unit" text NOT NULL,
	"period" text,
	"anchor" text,
	"offset" text DEFAULT '0' NOT NULL,
	"event_window" text,
	"beginning" text,
	"ending" text,
	"approximate" boolean DEFAULT false NOT NULL,
	"anchor_version_id" text,
	"anchor_source" jsonb,
	"day_reference_world_id" text,
	CONSTRAINT "sky_rule_valid" CHECK ("world_sky_rule"."family"='skyCycle' and (("world_sky_rule"."scale"='world-year' and "world_sky_rule"."unit"='year') or ("world_sky_rule"."scale"='elapsed-day' and "world_sky_rule"."unit" in ('day','hour','minute'))) and ("world_sky_rule"."period" is null or world_sky_number_valid("world_sky_rule"."period",true)) and world_sky_number_valid("world_sky_rule"."offset",false) and ("world_sky_rule"."event_window" is null or world_sky_number_valid("world_sky_rule"."event_window",true)) and ("world_sky_rule"."anchor" is null or "world_sky_rule"."anchor" ~ '^(0|-?[1-9][0-9]{0,19})$') and ("world_sky_rule"."beginning" is null or "world_sky_rule"."beginning" ~ '^(0|-?[1-9][0-9]{0,19})$') and ("world_sky_rule"."ending" is null or "world_sky_rule"."ending" ~ '^(0|-?[1-9][0-9]{0,19})$') and ("world_sky_rule"."beginning" is null or "world_sky_rule"."ending" is null or "world_sky_rule"."beginning"::numeric<="world_sky_rule"."ending"::numeric) and ("world_sky_rule"."scale"<>'world-year' or (("world_sky_rule"."anchor" is null or abs("world_sky_rule"."anchor"::numeric)<=1000000000000) and ("world_sky_rule"."beginning" is null or abs("world_sky_rule"."beginning"::numeric)<=1000000000000) and ("world_sky_rule"."ending" is null or abs("world_sky_rule"."ending"::numeric)<=1000000000000))) and ("world_sky_rule"."day_reference_world_id" is null or "world_sky_rule"."day_reference_world_id"="world_sky_rule"."world_id") and ("world_sky_rule"."scale"<>'elapsed-day' or "world_sky_rule"."anchor" is null or coalesce("world_sky_rule"."day_reference_world_id"="world_sky_rule"."world_id",false)) and (("world_sky_rule"."anchor_version_id" is null and "world_sky_rule"."anchor_source" is null) or ("world_sky_rule"."anchor_version_id" is not null and "world_sky_rule"."anchor" is null and "world_sky_rule"."scale"='elapsed-day' and coalesce("world_sky_rule"."anchor_source"->'start'->>'versionId'="world_sky_rule"."anchor_version_id",false))))
);
--> statement-breakpoint
ALTER TABLE "world_lore_identity" DROP CONSTRAINT "lore_identity_family_valid";--> statement-breakpoint
ALTER TABLE "world_lore_period" DROP CONSTRAINT "lore_period_valid";--> statement-breakpoint
ALTER TABLE "world_calendar" DROP CONSTRAINT "world_calendar_valid";--> statement-breakpoint
ALTER TABLE "world_calendar" ADD COLUMN "visibility" text DEFAULT 'ordinary' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_sky_calendar_binding" ADD CONSTRAINT "sky_binding_source_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_lore_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_calendar_binding" ADD CONSTRAINT "sky_binding_calendar_fk" FOREIGN KEY ("calendar_version_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_calendar_link_version" ADD CONSTRAINT "lore_skyCalendarLink_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_cycle_version" ADD CONSTRAINT "lore_skyCycle_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_observation_version" ADD CONSTRAINT "lore_skyObservation_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_phase" ADD CONSTRAINT "sky_phase_rule_fk" FOREIGN KEY ("version_id") REFERENCES "public"."world_sky_rule"("version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_phase" ADD CONSTRAINT "sky_phase_source_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_lore_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_rule" ADD CONSTRAINT "sky_rule_source_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_rule" ADD CONSTRAINT "sky_rule_anchor_fk" FOREIGN KEY ("anchor_version_id","world_id") REFERENCES "public"."world_calendar_anchor"("version_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_sky_rule" ADD CONSTRAINT "sky_rule_day_reference_fk" FOREIGN KEY ("day_reference_world_id") REFERENCES "public"."world_day_reference"("world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "lore_identity_family_valid" CHECK ("world_lore_identity"."family" in ('species','people','origin','relationship','culture','civilization','language','population','belief','tradition','individual','polity','government','institution','office','appointment','claim','agreement','conflict','organization','organizationRole','membership','assignment','network','cosmicFramework','realm','celestial','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink'));--> statement-breakpoint
ALTER TABLE "world_lore_period" ADD CONSTRAINT "lore_period_valid" CHECK ("world_lore_period"."family" in ('polity','government','institution','office','appointment','claim','agreement','conflict','organization','organizationRole','membership','assignment','network','cosmicFramework','realm','celestial','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink') and "world_lore_period"."position" between 0 and 39 and length(trim("world_lore_period"."label")) between 1 and 160 and length(trim("world_lore_period"."status")) between 1 and 160 and ("world_lore_period"."beginning" is null or world_lore_time_valid("world_lore_period"."beginning")) and ("world_lore_period"."ending" is null or world_lore_time_valid("world_lore_period"."ending")));--> statement-breakpoint
ALTER TABLE "world_calendar" ADD CONSTRAINT "world_calendar_valid" CHECK (length(trim("world_calendar"."name")) BETWEEN 1 AND 160 AND "world_calendar"."revision">0 AND "world_calendar"."visibility" in ('ordinary','protected'));
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
 END IF;
 IF populated IS DISTINCT FROM true THEN RAISE EXCEPTION 'An entity source requires complete typed content and valid participants'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_sky_cycle_version_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_sky_cycle_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER world_sky_observation_version_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_sky_observation_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER world_sky_calendar_link_version_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_sky_calendar_link_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER world_sky_rule_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_sky_rule FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER world_sky_phase_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_sky_phase FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER world_sky_calendar_binding_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_sky_calendar_binding FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
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
SELECT version_id,name,classification,''::text,''::text,protected_fields FROM world_sky_calendar_link_version;
