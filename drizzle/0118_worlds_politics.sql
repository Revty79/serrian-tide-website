CREATE FUNCTION world_lore_fields_valid(fields jsonb, allowed text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(fields)='array' THEN jsonb_array_length(fields)<=40
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(fields) e WHERE jsonb_typeof(e)<>'string' OR NOT (e #>> '{}' = ANY(allowed)))
 AND (SELECT count(DISTINCT e) FROM jsonb_array_elements(fields) e)=jsonb_array_length(fields)
 ELSE false END
$$;
--> statement-breakpoint
CREATE TABLE "world_agreement_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'agreement' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"obligations" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"amendments" text DEFAULT '' NOT NULL,
	"interpretations" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_agreement_valid" CHECK ("world_agreement_version"."family"='agreement' and length(trim("world_agreement_version"."name")) between 1 and 160),
	CONSTRAINT "agreement_protected_fields_valid" CHECK (world_lore_fields_valid("world_agreement_version"."protected_fields", array['description','aliases','classification','terms','obligations','status','amendments','interpretations','provenance']))
);
--> statement-breakpoint
CREATE TABLE "world_appointment_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'appointment' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"selection" text DEFAULT '' NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"succession" text DEFAULT '' NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"interpretation" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_appointment_valid" CHECK ("world_appointment_version"."family"='appointment' and length(trim("world_appointment_version"."name")) between 1 and 160),
	CONSTRAINT "appointment_protected_fields_valid" CHECK (world_lore_fields_valid("world_appointment_version"."protected_fields", array['description','classification','status','selection','authority','succession','evidence','interpretation']))
);
--> statement-breakpoint
CREATE TABLE "world_claim_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'claim' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"jurisdiction" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"interpretation" text DEFAULT '' NOT NULL,
	"administration" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_claim_valid" CHECK ("world_claim_version"."family"='claim' and length(trim("world_claim_version"."name")) between 1 and 160),
	CONSTRAINT "claim_protected_fields_valid" CHECK (world_lore_fields_valid("world_claim_version"."protected_fields", array['description','classification','jurisdiction','status','authority','evidence','interpretation','administration']))
);
--> statement-breakpoint
CREATE TABLE "world_conflict_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'conflict' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"causes" text DEFAULT '' NOT NULL,
	"coalitions" text DEFAULT '' NOT NULL,
	"theaters" text DEFAULT '' NOT NULL,
	"leadership" text DEFAULT '' NOT NULL,
	"developments" text DEFAULT '' NOT NULL,
	"territory" text DEFAULT '' NOT NULL,
	"consequences" text DEFAULT '' NOT NULL,
	"settlement" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_conflict_valid" CHECK ("world_conflict_version"."family"='conflict' and length(trim("world_conflict_version"."name")) between 1 and 160),
	CONSTRAINT "conflict_protected_fields_valid" CHECK (world_lore_fields_valid("world_conflict_version"."protected_fields", array['description','classification','causes','coalitions','theaters','leadership','developments','territory','consequences','settlement','outcome']))
);
--> statement-breakpoint
CREATE TABLE "world_government_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'government' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"foundations" text DEFAULT '' NOT NULL,
	"legitimacy" text DEFAULT '' NOT NULL,
	"philosophy" text DEFAULT '' NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"laws" text DEFAULT '' NOT NULL,
	"decisions" text DEFAULT '' NOT NULL,
	"selection" text DEFAULT '' NOT NULL,
	"succession" text DEFAULT '' NOT NULL,
	"reform" text DEFAULT '' NOT NULL,
	"influences" text DEFAULT '' NOT NULL,
	"revenue" text DEFAULT '' NOT NULL,
	"economy" text DEFAULT '' NOT NULL,
	"infrastructure" text DEFAULT '' NOT NULL,
	"military" text DEFAULT '' NOT NULL,
	"communities" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_government_valid" CHECK ("world_government_version"."family"='government' and length(trim("world_government_version"."name")) between 1 and 160),
	CONSTRAINT "government_protected_fields_valid" CHECK (world_lore_fields_valid("world_government_version"."protected_fields", array['description','aliases','classification','foundations','legitimacy','philosophy','authority','laws','decisions','selection','succession','reform','influences','revenue','economy','infrastructure','military','communities']))
);
--> statement-breakpoint
CREATE TABLE "world_institution_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'institution' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"powers" text DEFAULT '' NOT NULL,
	"structure" text DEFAULT '' NOT NULL,
	"administration" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_institution_valid" CHECK ("world_institution_version"."family"='institution' and length(trim("world_institution_version"."name")) between 1 and 160),
	CONSTRAINT "institution_protected_fields_valid" CHECK (world_lore_fields_valid("world_institution_version"."protected_fields", array['description','classification','purpose','powers','structure','administration','development']))
);
--> statement-breakpoint
CREATE TABLE "world_lore_period" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"family" text NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"perspective" text DEFAULT '' NOT NULL,
	"beginning" jsonb,
	"ending" jsonb,
	CONSTRAINT "world_lore_period_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "lore_period_valid" CHECK ("world_lore_period"."family" in ('polity','government','institution','office','appointment','claim','agreement','conflict') and "world_lore_period"."position" between 0 and 39 and length(trim("world_lore_period"."label")) between 1 and 160 and length(trim("world_lore_period"."status")) between 1 and 160 and ("world_lore_period"."beginning" is null or world_lore_time_valid("world_lore_period"."beginning")) and ("world_lore_period"."ending" is null or world_lore_time_valid("world_lore_period"."ending")))
);
--> statement-breakpoint
CREATE TABLE "world_office_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'office' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"responsibilities" text DEFAULT '' NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"qualifications" text DEFAULT '' NOT NULL,
	"selection" text DEFAULT '' NOT NULL,
	"vacancies" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_office_valid" CHECK ("world_office_version"."family"='office' and length(trim("world_office_version"."name")) between 1 and 160),
	CONSTRAINT "office_protected_fields_valid" CHECK (world_lore_fields_valid("world_office_version"."protected_fields", array['description','classification','responsibilities','authority','qualifications','selection','vacancies','development']))
);
--> statement-breakpoint
CREATE TABLE "world_polity_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'polity' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"foundations" text DEFAULT '' NOT NULL,
	"legitimacy" text DEFAULT '' NOT NULL,
	"identity" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_polity_valid" CHECK ("world_polity_version"."family"='polity' and length(trim("world_polity_version"."name")) between 1 and 160),
	CONSTRAINT "polity_protected_fields_valid" CHECK (world_lore_fields_valid("world_polity_version"."protected_fields", array['description','aliases','classification','foundations','legitimacy','identity','development']))
);
--> statement-breakpoint
ALTER TABLE "world_lore_identity" DROP CONSTRAINT "lore_identity_family_valid";--> statement-breakpoint
ALTER TABLE "world_agreement_version" ADD CONSTRAINT "lore_agreement_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_appointment_version" ADD CONSTRAINT "lore_appointment_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_claim_version" ADD CONSTRAINT "lore_claim_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_conflict_version" ADD CONSTRAINT "lore_conflict_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_government_version" ADD CONSTRAINT "lore_government_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_institution_version" ADD CONSTRAINT "lore_institution_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_period" ADD CONSTRAINT "lore_period_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_office_version" ADD CONSTRAINT "lore_office_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_polity_version" ADD CONSTRAINT "lore_polity_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "lore_identity_family_valid" CHECK ("world_lore_identity"."family" in ('species','people','origin','relationship','culture','civilization','language','population','belief','tradition','individual','polity','government','institution','office','appointment','claim','agreement','conflict'));
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
 END IF;
 IF populated IS DISTINCT FROM true THEN RAISE EXCEPTION 'An entity source requires complete typed content and valid participants'; END IF;
 RETURN NEW;
END $$;


--> statement-breakpoint
CREATE TRIGGER polity_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_polity_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER government_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_government_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER institution_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_institution_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER office_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_office_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER appointment_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_appointment_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER claim_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_claim_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER agreement_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_agreement_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER conflict_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_conflict_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER lore_period_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_lore_period FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE VIEW world_lore_display AS
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
SELECT version_id,name,classification classification,''::text aliases,''::text titles,protected_fields protected_fields FROM world_conflict_version;
