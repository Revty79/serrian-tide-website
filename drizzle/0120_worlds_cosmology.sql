CREATE TABLE "world_celestial_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'celestial' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"appearance" text DEFAULT '' NOT NULL,
	"composition" text DEFAULT '' NOT NULL,
	"scale" text DEFAULT '' NOT NULL,
	"shape" text DEFAULT '' NOT NULL,
	"mass" text DEFAULT '' NOT NULL,
	"gravity" text DEFAULT '' NOT NULL,
	"atmosphere" text DEFAULT '' NOT NULL,
	"surface" text DEFAULT '' NOT NULL,
	"temperature" text DEFAULT '' NOT NULL,
	"rotation" text DEFAULT '' NOT NULL,
	"orbit" text DEFAULT '' NOT NULL,
	"satellites" text DEFAULT '' NOT NULL,
	"rings" text DEFAULT '' NOT NULL,
	"features" text DEFAULT '' NOT NULL,
	"habitability" text DEFAULT '' NOT NULL,
	"life" text DEFAULT '' NOT NULL,
	"extraordinary" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_celestial_valid" CHECK ("world_celestial_version"."family"='celestial' and length(trim("world_celestial_version"."name")) between 1 and 160),
	CONSTRAINT "celestial_protected_fields_valid" CHECK (world_lore_fields_valid("world_celestial_version"."protected_fields", array['description','aliases','classification','appearance','composition','scale','shape','mass','gravity','atmosphere','surface','temperature','rotation','orbit','satellites','rings','features','habitability','life','extraordinary','development']))
);
--> statement-breakpoint
CREATE TABLE "world_cosmic_connection_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'cosmicConnection' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"relationship_type" text DEFAULT '' NOT NULL,
	"conditions" text DEFAULT '' NOT NULL,
	"reliability" text DEFAULT '' NOT NULL,
	"interpretations" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_cosmicConnection_valid" CHECK ("world_cosmic_connection_version"."family"='cosmicConnection' and length(trim("world_cosmic_connection_version"."name")) between 1 and 160),
	CONSTRAINT "cosmic_connection_protected_fields_valid" CHECK (world_lore_fields_valid("world_cosmic_connection_version"."protected_fields", array['description','classification','relationshipType','conditions','reliability','interpretations','provenance']))
);
--> statement-breakpoint
CREATE TABLE "world_cosmic_framework_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'cosmicFramework' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"nature" text DEFAULT '' NOT NULL,
	"extent" text DEFAULT '' NOT NULL,
	"structure" text DEFAULT '' NOT NULL,
	"space" text DEFAULT '' NOT NULL,
	"time" text DEFAULT '' NOT NULL,
	"matter" text DEFAULT '' NOT NULL,
	"consciousness" text DEFAULT '' NOT NULL,
	"magic" text DEFAULT '' NOT NULL,
	"origins" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_cosmicFramework_valid" CHECK ("world_cosmic_framework_version"."family"='cosmicFramework' and length(trim("world_cosmic_framework_version"."name")) between 1 and 160),
	CONSTRAINT "cosmic_framework_protected_fields_valid" CHECK (world_lore_fields_valid("world_cosmic_framework_version"."protected_fields", array['description','aliases','classification','nature','extent','structure','space','time','matter','consciousness','magic','origins','development']))
);
--> statement-breakpoint
CREATE TABLE "world_cosmic_principle_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'cosmicPrinciple' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"statement" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"conditions" text DEFAULT '' NOT NULL,
	"exceptions" text DEFAULT '' NOT NULL,
	"interpretations" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_cosmicPrinciple_valid" CHECK ("world_cosmic_principle_version"."family"='cosmicPrinciple' and length(trim("world_cosmic_principle_version"."name")) between 1 and 160),
	CONSTRAINT "cosmic_principle_protected_fields_valid" CHECK (world_lore_fields_valid("world_cosmic_principle_version"."protected_fields", array['description','classification','statement','scope','conditions','exceptions','interpretations','provenance','development']))
);
--> statement-breakpoint
CREATE TABLE "world_realm_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'realm' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"nature" text DEFAULT '' NOT NULL,
	"form" text DEFAULT '' NOT NULL,
	"space" text DEFAULT '' NOT NULL,
	"boundaries" text DEFAULT '' NOT NULL,
	"structure" text DEFAULT '' NOT NULL,
	"environment" text DEFAULT '' NOT NULL,
	"matter" text DEFAULT '' NOT NULL,
	"consciousness" text DEFAULT '' NOT NULL,
	"magic" text DEFAULT '' NOT NULL,
	"time" text DEFAULT '' NOT NULL,
	"accessibility" text DEFAULT '' NOT NULL,
	"hidden_access" text DEFAULT '' NOT NULL,
	"inhabitants" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_realm_valid" CHECK ("world_realm_version"."family"='realm' and length(trim("world_realm_version"."name")) between 1 and 160),
	CONSTRAINT "realm_protected_fields_valid" CHECK (world_lore_fields_valid("world_realm_version"."protected_fields", array['description','aliases','classification','nature','form','space','boundaries','structure','environment','matter','consciousness','magic','time','accessibility','hiddenAccess','inhabitants','development']))
);
--> statement-breakpoint
ALTER TABLE "world_lore_identity" DROP CONSTRAINT "lore_identity_family_valid";--> statement-breakpoint
ALTER TABLE "world_lore_period" DROP CONSTRAINT "lore_period_valid";--> statement-breakpoint
ALTER TABLE "world_celestial_version" ADD CONSTRAINT "lore_celestial_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_cosmic_connection_version" ADD CONSTRAINT "lore_cosmicConnection_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_cosmic_framework_version" ADD CONSTRAINT "lore_cosmicFramework_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_cosmic_principle_version" ADD CONSTRAINT "lore_cosmicPrinciple_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_realm_version" ADD CONSTRAINT "lore_realm_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "lore_identity_family_valid" CHECK ("world_lore_identity"."family" in ('species','people','origin','relationship','culture','civilization','language','population','belief','tradition','individual','polity','government','institution','office','appointment','claim','agreement','conflict','organization','organizationRole','membership','assignment','network','cosmicFramework','realm','celestial','cosmicPrinciple','cosmicConnection'));--> statement-breakpoint
ALTER TABLE "world_lore_period" ADD CONSTRAINT "lore_period_valid" CHECK ("world_lore_period"."family" in ('polity','government','institution','office','appointment','claim','agreement','conflict','organization','organizationRole','membership','assignment','network','cosmicFramework','realm','celestial','cosmicPrinciple','cosmicConnection') and "world_lore_period"."position" between 0 and 39 and length(trim("world_lore_period"."label")) between 1 and 160 and length(trim("world_lore_period"."status")) between 1 and 160 and ("world_lore_period"."beginning" is null or world_lore_time_valid("world_lore_period"."beginning")) and ("world_lore_period"."ending" is null or world_lore_time_valid("world_lore_period"."ending")));
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
 END IF;
 IF populated IS DISTINCT FROM true THEN RAISE EXCEPTION 'An entity source requires complete typed content and valid participants'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER cosmic_framework_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_cosmic_framework_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER realm_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_realm_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER celestial_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_celestial_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER cosmic_principle_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_cosmic_principle_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER cosmic_connection_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_cosmic_connection_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
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
SELECT version_id,name,classification,''::text,''::text,protected_fields FROM world_cosmic_connection_version;
