CREATE FUNCTION world_lore_time_valid(t jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE lo numeric; hi numeric;
BEGIN
 IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR t->>'version' IS DISTINCT FROM '1' OR t->>'scale' IS DISTINCT FROM 'world-year' THEN RETURN false; END IF;
 IF t->>'kind'='undated' THEN RETURN true; END IF;
 IF t->>'kind' IN ('known','approximate') THEN lo:=(t->>'year')::numeric;hi:=lo;
 ELSIF t->>'kind' IN ('window','duration') THEN lo:=(t->>'startYear')::numeric;hi:=(t->>'endYear')::numeric;
 ELSE RETURN false; END IF;
 RETURN coalesce(lo=trunc(lo) AND hi=trunc(hi) AND abs(lo)<=1000000000000 AND abs(hi)<=1000000000000 AND lo<=hi,false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE TABLE "world_history_version_entity" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"target_id" text NOT NULL,
	"lore_id" text,
	"geography_id" text,
	"event_type" text NOT NULL,
	"entity_category" text NOT NULL,
	CONSTRAINT "world_history_version_entity_version_id_target_id_pk" PRIMARY KEY("version_id","target_id"),
	CONSTRAINT "history_entity_target_valid" CHECK (coalesce(length(trim("world_history_version_entity"."entity_category")) between 1 and 160 and length(trim("world_history_version_entity"."event_type")) between 1 and 160 and (("world_history_version_entity"."lore_id"="world_history_version_entity"."target_id" and "world_history_version_entity"."geography_id" is null) or ("world_history_version_entity"."geography_id"="world_history_version_entity"."target_id" and "world_history_version_entity"."lore_id" is null)),false))
);
--> statement-breakpoint
CREATE TABLE "world_lore_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"timeline_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"version_id" text NOT NULL,
	"revision" integer NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lore_change_revision_uq" UNIQUE("timeline_id","entity_id","revision")
);
--> statement-breakpoint
CREATE TABLE "world_lore_head" (
	"world_id" text NOT NULL,
	"timeline_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"version_id" text NOT NULL,
	"revision" integer NOT NULL,
	"mode" text NOT NULL,
	"source_timeline_id" text,
	"source_version_id" text,
	"source_revision" integer,
	CONSTRAINT "world_lore_head_timeline_id_entity_id_pk" PRIMARY KEY("timeline_id","entity_id"),
	CONSTRAINT "lore_head_valid" CHECK ("world_lore_head"."revision">0 and "world_lore_head"."mode" in ('authored','inherited','pending','excluded','interpretation') and (("world_lore_head"."source_timeline_id" is null and "world_lore_head"."source_version_id" is null and "world_lore_head"."source_revision" is null and "world_lore_head"."mode"='authored') or ("world_lore_head"."source_timeline_id" is not null and "world_lore_head"."source_version_id" is not null and "world_lore_head"."source_revision" is not null and "world_lore_head"."source_revision">0 and "world_lore_head"."mode"<>'authored')))
);
--> statement-breakpoint
CREATE TABLE "world_lore_history" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"history_version_id" text NOT NULL,
	CONSTRAINT "world_lore_history_version_id_entity_id_pk" PRIMARY KEY("version_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "world_lore_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text NOT NULL,
	"origin_timeline_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lore_identity_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "lore_identity_family_uq" UNIQUE("id","world_id","family"),
	CONSTRAINT "lore_identity_request_uq" UNIQUE("world_id","creator_id","request_id"),
	CONSTRAINT "lore_identity_family_valid" CHECK ("world_lore_identity"."family" in ('species','people','origin','relationship'))
);
--> statement-breakpoint
CREATE TABLE "world_lore_participant" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"position" integer NOT NULL,
	"target_id" text,
	"authored_reference" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	CONSTRAINT "world_lore_participant_version_id_position_pk" PRIMARY KEY("version_id","position"),
	CONSTRAINT "lore_participant_valid" CHECK ("world_lore_participant"."position" between 0 and 99 and length(trim("world_lore_participant"."role")) between 1 and 80 and (("world_lore_participant"."target_id" is not null and "world_lore_participant"."authored_reference"='') or ("world_lore_participant"."target_id" is null and length(trim("world_lore_participant"."authored_reference")) between 1 and 1000)))
);
--> statement-breakpoint
CREATE TABLE "world_lore_section" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"protected" boolean NOT NULL,
	CONSTRAINT "world_lore_section_version_id_id_pk" PRIMARY KEY("version_id","id"),
	CONSTRAINT "lore_section_valid" CHECK ("world_lore_section"."position" between 0 and 39 and length(trim("world_lore_section"."title")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_lore_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"family" text NOT NULL,
	"timeline_id" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"historical_time" jsonb NOT NULL,
	"accuracy" text NOT NULL,
	"narrative" text NOT NULL,
	"visibility" text NOT NULL,
	"private_notes" text DEFAULT '' NOT NULL,
	"dating_system_id" text,
	"source_dating" jsonb,
	"calendar_source" jsonb,
	"start_version_id" text,
	"end_version_id" text,
	CONSTRAINT "lore_version_entity_uq" UNIQUE("id","world_id","entity_id"),
	CONSTRAINT "lore_version_family_uq" UNIQUE("id","world_id","family"),
	CONSTRAINT "lore_version_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "lore_version_context_valid" CHECK ("world_lore_version"."accuracy" in ('established','disputed','unverified','disproven') and "world_lore_version"."narrative" in ('recorded','planned') and "world_lore_version"."visibility" in ('ordinary','protected') and world_lore_time_valid("world_lore_version"."historical_time"))
);
--> statement-breakpoint
CREATE TABLE "world_origin_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'origin' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"provenance" text DEFAULT '' NOT NULL,
	"perspective" text DEFAULT '' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_origin_valid" CHECK ("world_origin_version"."family"='origin' and length(trim("world_origin_version"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_people_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'people' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"identity" text DEFAULT '' NOT NULL,
	"heritage" text DEFAULT '' NOT NULL,
	"distinctions" text DEFAULT '' NOT NULL,
	"practices" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_people_valid" CHECK ("world_people_version"."family"='people' and length(trim("world_people_version"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_relationship_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'relationship' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"relationship_type" text DEFAULT '' NOT NULL,
	"interpretation" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_relationship_valid" CHECK ("world_relationship_version"."family"='relationship' and length(trim("world_relationship_version"."name")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "world_species_version" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"family" text DEFAULT 'species' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"form" text DEFAULT '' NOT NULL,
	"biology" text DEFAULT '' NOT NULL,
	"propagation" text DEFAULT '' NOT NULL,
	"development" text DEFAULT '' NOT NULL,
	"aging" text DEFAULT '' NOT NULL,
	"adaptations" text DEFAULT '' NOT NULL,
	"habitats" text DEFAULT '' NOT NULL,
	"supernatural" text DEFAULT '' NOT NULL,
	"traits" text DEFAULT '' NOT NULL,
	"variations" text DEFAULT '' NOT NULL,
	"transformations" text DEFAULT '' NOT NULL,
	CONSTRAINT "lore_species_valid" CHECK ("world_species_version"."family"='species' and length(trim("world_species_version"."name")) between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD COLUMN "visibility" text DEFAULT 'ordinary' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_history_version_entity" ADD CONSTRAINT "history_entity_version_fk" FOREIGN KEY ("version_id","world_id","entry_id") REFERENCES "public"."world_history_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version_entity" ADD CONSTRAINT "history_entity_lore_fk" FOREIGN KEY ("lore_id","world_id") REFERENCES "public"."world_lore_identity"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version_entity" ADD CONSTRAINT "history_entity_geography_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_change" ADD CONSTRAINT "world_lore_change_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_change" ADD CONSTRAINT "lore_change_head_fk" FOREIGN KEY ("timeline_id","entity_id") REFERENCES "public"."world_lore_head"("timeline_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_change" ADD CONSTRAINT "lore_change_version_fk" FOREIGN KEY ("version_id","world_id","entity_id") REFERENCES "public"."world_lore_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_head" ADD CONSTRAINT "lore_head_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_head" ADD CONSTRAINT "lore_head_version_fk" FOREIGN KEY ("version_id","world_id","entity_id") REFERENCES "public"."world_lore_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_head" ADD CONSTRAINT "lore_head_source_version_fk" FOREIGN KEY ("source_version_id","world_id","entity_id") REFERENCES "public"."world_lore_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_head" ADD CONSTRAINT "lore_head_source_timeline_fk" FOREIGN KEY ("source_timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_history" ADD CONSTRAINT "lore_history_version_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_lore_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_history" ADD CONSTRAINT "lore_history_source_fk" FOREIGN KEY ("history_version_id","world_id","entity_id") REFERENCES "public"."world_history_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "world_lore_identity_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "world_lore_identity_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_identity" ADD CONSTRAINT "lore_identity_timeline_fk" FOREIGN KEY ("origin_timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_participant" ADD CONSTRAINT "lore_participant_version_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_lore_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_participant" ADD CONSTRAINT "lore_participant_target_fk" FOREIGN KEY ("target_id","world_id") REFERENCES "public"."world_lore_identity"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_section" ADD CONSTRAINT "lore_section_version_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_lore_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_version" ADD CONSTRAINT "world_lore_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_version" ADD CONSTRAINT "lore_version_identity_fk" FOREIGN KEY ("entity_id","world_id","family") REFERENCES "public"."world_lore_identity"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_version" ADD CONSTRAINT "lore_version_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_version" ADD CONSTRAINT "lore_version_dating_fk" FOREIGN KEY ("dating_system_id","world_id") REFERENCES "public"."world_dating_system"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_version" ADD CONSTRAINT "lore_version_calendar_start_fk" FOREIGN KEY ("start_version_id","world_id") REFERENCES "public"."world_calendar_anchor"("version_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_lore_version" ADD CONSTRAINT "lore_version_calendar_end_fk" FOREIGN KEY ("end_version_id","world_id") REFERENCES "public"."world_calendar_anchor"("version_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_origin_version" ADD CONSTRAINT "lore_origin_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_people_version" ADD CONSTRAINT "lore_people_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_relationship_version" ADD CONSTRAINT "lore_relationship_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_species_version" ADD CONSTRAINT "lore_species_version_fk" FOREIGN KEY ("version_id","world_id","family") REFERENCES "public"."world_lore_version"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_entity_target_idx" ON "world_history_version_entity" USING btree ("world_id","target_id");--> statement-breakpoint
CREATE INDEX "history_entity_category_idx" ON "world_history_version_entity" USING btree ("world_id","entity_category");--> statement-breakpoint
CREATE INDEX "history_entity_type_idx" ON "world_history_version_entity" USING btree ("world_id","event_type");--> statement-breakpoint
CREATE INDEX "lore_change_entity_idx" ON "world_lore_change" USING btree ("world_id","entity_id","id");--> statement-breakpoint
CREATE INDEX "lore_head_world_idx" ON "world_lore_head" USING btree ("world_id","timeline_id");--> statement-breakpoint
CREATE INDEX "lore_history_source_idx" ON "world_lore_history" USING btree ("world_id","entity_id");--> statement-breakpoint
CREATE INDEX "lore_identity_world_idx" ON "world_lore_identity" USING btree ("world_id","family");--> statement-breakpoint
CREATE INDEX "lore_participant_target_idx" ON "world_lore_participant" USING btree ("world_id","target_id");--> statement-breakpoint
CREATE INDEX "lore_version_entity_idx" ON "world_lore_version" USING btree ("world_id","entity_id","created_at");--> statement-breakpoint
ALTER TABLE world_historical_entry ADD CONSTRAINT world_entry_visibility_valid CHECK (visibility IN ('ordinary','protected'));
--> statement-breakpoint
CREATE FUNCTION world_lore_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Retained World identity, source or audit rows cannot be changed or deleted'; END $$;
--> statement-breakpoint
CREATE TRIGGER lore_identity_immutable BEFORE UPDATE OR DELETE ON world_lore_identity FOR EACH ROW EXECUTE FUNCTION world_lore_immutable();
--> statement-breakpoint
CREATE TRIGGER lore_version_immutable BEFORE UPDATE OR DELETE ON world_lore_version FOR EACH ROW EXECUTE FUNCTION world_lore_immutable();
--> statement-breakpoint
CREATE TRIGGER lore_change_immutable BEFORE UPDATE OR DELETE ON world_lore_change FOR EACH ROW EXECUTE FUNCTION world_lore_immutable();
--> statement-breakpoint
CREATE FUNCTION world_lore_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id text; own_transaction boolean;
BEGIN
 source_id:=CASE WHEN TG_OP='DELETE' THEN OLD.version_id ELSE NEW.version_id END;
 IF TG_TABLE_NAME='world_history_version_entity' THEN
  SELECT xmin::text=(txid_current()%4294967296)::text INTO own_transaction FROM world_history_version WHERE id=source_id;
 ELSE SELECT xmin::text=(txid_current()%4294967296)::text INTO own_transaction FROM world_lore_version WHERE id=source_id; END IF;
 IF own_transaction IS DISTINCT FROM true THEN RAISE EXCEPTION 'Committed historical source components are immutable'; END IF;
 IF TG_TABLE_NAME='world_history_version_entity' AND TG_OP<>'DELETE' THEN
  IF NOT EXISTS (SELECT 1 FROM world_history_version WHERE id=NEW.version_id AND entry_id=NEW.entry_id) THEN RAISE EXCEPTION 'Entity milestones reference an event source'; END IF;
  IF NEW.lore_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM world_lore_identity WHERE id=NEW.lore_id AND world_id=NEW.world_id AND family=NEW.entity_category) THEN RAISE EXCEPTION 'Milestone category must match its entity'; END IF;
  IF NEW.geography_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM world_geography WHERE id=NEW.geography_id AND world_id=NEW.world_id AND (CASE WHEN context='place' THEN kind ELSE context END)=NEW.entity_category) AND NOT EXISTS (SELECT 1 FROM world_history_version_entity WHERE world_id=NEW.world_id AND entry_id=NEW.entry_id AND target_id=NEW.target_id AND entity_category=NEW.entity_category) THEN RAISE EXCEPTION 'Milestone category must match its geography'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.version_id<>NEW.version_id THEN RAISE EXCEPTION 'Source identity is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
--> statement-breakpoint
CREATE TRIGGER species_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_species_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER people_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_people_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER origin_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_origin_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER relationship_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_relationship_version FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER participant_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_lore_participant FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER section_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_lore_section FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER lore_history_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_lore_history FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE TRIGGER event_entity_source_guard BEFORE INSERT OR UPDATE OR DELETE ON world_history_version_entity FOR EACH ROW EXECUTE FUNCTION world_lore_child_guard();
--> statement-breakpoint
CREATE FUNCTION world_lore_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_parent text; source_timeline text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain entity history; archive or exclude its account instead'; END IF;
 IF TG_OP='UPDATE' AND (NEW.world_id<>OLD.world_id OR NEW.timeline_id<>OLD.timeline_id OR NEW.entity_id<>OLD.entity_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Immutable entity head or stale revision'; END IF;
 IF TG_OP='INSERT' AND NEW.revision<>1 THEN RAISE EXCEPTION 'New entity heads begin at revision one'; END IF;
 SELECT t.parent_id INTO source_parent FROM world_timeline t WHERE t.id=NEW.timeline_id;
 SELECT timeline_id INTO source_timeline FROM world_lore_version WHERE id=NEW.version_id;
 IF NEW.mode IN ('authored','interpretation') AND source_timeline<>NEW.timeline_id THEN RAISE EXCEPTION 'A local interpretation requires a local source'; END IF;
 IF NEW.mode<>'interpretation' AND source_timeline<>NEW.timeline_id AND NEW.version_id IS DISTINCT FROM NEW.source_version_id THEN RAISE EXCEPTION 'Inherited account must use the pinned parent source'; END IF;
 IF NEW.source_timeline_id IS NOT NULL THEN
  IF source_parent IS DISTINCT FROM NEW.source_timeline_id THEN RAISE EXCEPTION 'Only direct-parent sources can be pinned'; END IF;
  IF TG_OP='INSERT' OR NEW.source_version_id IS DISTINCT FROM OLD.source_version_id OR NEW.source_revision IS DISTINCT FROM OLD.source_revision THEN
   IF NOT EXISTS (SELECT 1 FROM world_lore_head h WHERE h.timeline_id=source_parent AND h.entity_id=NEW.entity_id AND h.version_id=NEW.source_version_id AND h.revision=NEW.source_revision) THEN RAISE EXCEPTION 'Parent source changed; reconcile explicitly'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lore_head_guard BEFORE INSERT OR UPDATE OR DELETE ON world_lore_head FOR EACH ROW EXECUTE FUNCTION world_lore_head_guard();
--> statement-breakpoint
CREATE FUNCTION world_lore_version_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE populated boolean;
BEGIN
 IF NEW.family='species' THEN SELECT EXISTS(SELECT 1 FROM world_species_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='people' THEN SELECT EXISTS(SELECT 1 FROM world_people_version WHERE version_id=NEW.id) INTO populated;
 ELSIF NEW.family='origin' THEN SELECT EXISTS(SELECT 1 FROM world_origin_version WHERE version_id=NEW.id AND length(trim(description))>0) AND EXISTS(SELECT 1 FROM world_lore_participant WHERE version_id=NEW.id AND role='subject' AND target_id IS NOT NULL) INTO populated;
 ELSIF NEW.family='relationship' THEN SELECT EXISTS(SELECT 1 FROM world_relationship_version WHERE version_id=NEW.id AND length(trim(relationship_type))>0) AND (SELECT count(*) FROM world_lore_participant WHERE version_id=NEW.id)>=2 INTO populated;
 END IF;
 IF populated IS DISTINCT FROM true THEN RAISE EXCEPTION 'An entity source requires complete typed content and valid participants'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER lore_version_complete AFTER INSERT ON world_lore_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_lore_version_complete();

--> statement-breakpoint
CREATE FUNCTION world_lore_author_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text; actor text;
BEGIN
 SELECT w.owner_id INTO owner_id FROM world w WHERE w.id=NEW.world_id;
 IF TG_TABLE_NAME='world_lore_identity' THEN actor:=NEW.creator_id; ELSIF TG_TABLE_NAME='world_lore_version' THEN actor:=NEW.author_id; ELSE actor:=NEW.actor_id; END IF;
 IF actor IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'World authorship must match its owner'; END IF;
 IF TG_TABLE_NAME='world_lore_change' THEN
 IF NOT EXISTS (SELECT 1 FROM world_lore_head h WHERE h.world_id=NEW.world_id AND h.timeline_id=NEW.timeline_id AND h.entity_id=NEW.entity_id AND h.version_id=NEW.version_id AND h.revision=NEW.revision) THEN RAISE EXCEPTION 'Audit must record the current entity head'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lore_identity_author_guard BEFORE INSERT ON world_lore_identity FOR EACH ROW EXECUTE FUNCTION world_lore_author_guard();
--> statement-breakpoint
CREATE TRIGGER lore_version_author_guard BEFORE INSERT ON world_lore_version FOR EACH ROW EXECUTE FUNCTION world_lore_author_guard();
--> statement-breakpoint
CREATE TRIGGER lore_change_author_guard BEFORE INSERT ON world_lore_change FOR EACH ROW EXECUTE FUNCTION world_lore_author_guard();
