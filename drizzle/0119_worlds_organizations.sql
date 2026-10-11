CREATE TABLE "world_assignment_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'assignment' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"selection" text DEFAULT '' NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"succession" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_assignment_valid" CHECK ("world_assignment_version"."family"='assignment' and length(trim("world_assignment_version"."name")) between 1 and 160),
	CONSTRAINT "assignment_protected_fields_valid" CHECK (world_lore_fields_valid("world_assignment_version"."protected_fields", array['description','classification','status','selection','authority','succession','provenance']))
);
--> statement-breakpoint
CREATE TABLE "world_membership_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'membership' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"recruitment" text DEFAULT '' NOT NULL,
	"obligations" text DEFAULT '' NOT NULL,
	"interpretations" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_membership_valid" CHECK ("world_membership_version"."family"='membership' and length(trim("world_membership_version"."name")) between 1 and 160),
	CONSTRAINT "membership_protected_fields_valid" CHECK (world_lore_fields_valid("world_membership_version"."protected_fields", array['description','classification','status','recruitment','obligations','interpretations','provenance']))
);
--> statement-breakpoint
CREATE TABLE "world_network_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'network' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"relationship_type" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"structure" text DEFAULT '' NOT NULL,
	"interpretations" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_network_valid" CHECK ("world_network_version"."family"='network' and length(trim("world_network_version"."name")) between 1 and 160),
	CONSTRAINT "network_protected_fields_valid" CHECK (world_lore_fields_valid("world_network_version"."protected_fields", array['description','classification','relationshipType','status','purpose','structure','interpretations','provenance']))
);
--> statement-breakpoint
CREATE TABLE "world_organization_role_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'organizationRole' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"responsibilities" text DEFAULT '' NOT NULL,
	"privileges" text DEFAULT '' NOT NULL,
	"qualifications" text DEFAULT '' NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"relationships" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_organizationRole_valid" CHECK ("world_organization_role_version"."family"='organizationRole' and length(trim("world_organization_role_version"."name")) between 1 and 160),
	CONSTRAINT "organization_role_protected_fields_valid" CHECK (world_lore_fields_valid("world_organization_role_version"."protected_fields", array['description','classification','responsibilities','privileges','qualifications','authority','relationships','development']))
);
--> statement-breakpoint
CREATE TABLE "world_organization_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'organization' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"foundations" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"mission" text DEFAULT '' NOT NULL,
	"confidential_goals" text DEFAULT '' NOT NULL,
	"values" text DEFAULT '' NOT NULL,
	"traditions" text DEFAULT '' NOT NULL,
	"culture" text DEFAULT '' NOT NULL,
	"recruitment" text DEFAULT '' NOT NULL,
	"resources" text DEFAULT '' NOT NULL,
	"funding" text DEFAULT '' NOT NULL,
	"influence" text DEFAULT '' NOT NULL,
	"activities" text DEFAULT '' NOT NULL,
	"methods" text DEFAULT '' NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"secret_operations" text DEFAULT '' NOT NULL,
	"achievements" text DEFAULT '' NOT NULL,
	"disputes" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "lore_organization_valid" CHECK ("world_organization_version"."family"='organization' and length(trim("world_organization_version"."name")) between 1 and 160),
	CONSTRAINT "organization_protected_fields_valid" CHECK (world_lore_fields_valid("world_organization_version"."protected_fields", array['description','aliases','classification','foundations','purpose','mission','confidentialGoals','values','traditions','culture','recruitment','resources','funding','influence','activities','methods','image','secretOperations','achievements','disputes','development']))
);
--> statement-breakpoint
ALTER TABLE "world_lore_identity" DROP CONSTRAINT "lore_identity_family_valid";--> statement-breakpoint
ALTER TABLE "world_lore_period" DROP CONSTRAINT "lore_period_valid";--> statement-breakpoint
ALTER TABLE "world_assignment_version" ADD CONSTRAINT "lore_assignment_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_membership_version" ADD CONSTRAINT "lore_membership_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_network_version" ADD CONSTRAINT "lore_network_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_organization_role_version" ADD CONSTRAINT "lore_organizationRole_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_organization_version" ADD CONSTRAINT "lore_organization_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "lore_identity_family_valid" CHECK ("world_lore_identity"."family" in ('species','people','origin','relationship','culture','civilization','language','population','belief','tradition','individual','polity','government','institution','office','appointment','claim','agreement','conflict','organization','organizationRole','membership','assignment','network'));--> statement-breakpoint
ALTER TABLE "world_lore_period" ADD CONSTRAINT "lore_period_valid" CHECK ("world_lore_period"."family" in ('polity','government','institution','office','appointment','claim','agreement','conflict','organization','organizationRole','membership','assignment','network') and "world_lore_period"."position" between 0 and 39 and length(trim("world_lore_period"."label")) between 1 and 160 and length(trim("world_lore_period"."status")) between 1 and 160 and ("world_lore_period"."beginning" is null or world_lore_time_valid("world_lore_period"."beginning")) and ("world_lore_period"."ending" is null or world_lore_time_valid("world_lore_period"."ending")));
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
 END IF;
 IF populated IS DISTINCT FROM true THEN RAISE EXCEPTION 'An entity source requires complete typed content and valid participants'; END IF;
 RETURN NEW;
END $$;



--> statement-breakpoint
CREATE TRIGGER organization_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_organization_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER organization_role_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_organization_role_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER membership_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_membership_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER assignment_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_assignment_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

--> statement-breakpoint
CREATE TRIGGER network_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_network_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();

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
SELECT version_id,name,classification,''::text aliases,''::text titles,protected_fields FROM world_network_version;
