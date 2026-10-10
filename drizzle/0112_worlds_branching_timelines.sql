CREATE TABLE "world_timeline" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"parent_id" text,
	"divergence_year" bigint,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_timeline_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_timeline_valid" CHECK (length(trim("world_timeline"."name")) between 1 and 160 and "world_timeline"."revision">0 and (("world_timeline"."is_primary" and "world_timeline"."parent_id" is null and "world_timeline"."divergence_year" is null and "world_timeline"."archived_at" is null) or (not "world_timeline"."is_primary" and "world_timeline"."parent_id" is not null and "world_timeline"."parent_id"<>"world_timeline"."id" and "world_timeline"."divergence_year" is not null and abs("world_timeline"."divergence_year")<=1000000000000)))
);
--> statement-breakpoint
CREATE TABLE "world_history_head" (
	"timeline_id" text NOT NULL,
	"world_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"version_id" text NOT NULL,
	"mode" text NOT NULL,
	"revision" integer NOT NULL,
	"source_timeline_id" text,
	"source_version_id" text,
	"source_revision" integer,
	"covered_until" bigint,
	CONSTRAINT "world_history_head_timeline_id_entity_id_pk" PRIMARY KEY("timeline_id","entity_id"),
	CONSTRAINT "world_history_head_valid" CHECK ("world_history_head"."revision">0 and "world_history_head"."mode" in ('authored','inherited','partial','pending','excluded','interpretation') and (("world_history_head"."source_timeline_id" is null and "world_history_head"."source_version_id" is null and "world_history_head"."source_revision" is null and "world_history_head"."mode"='authored') or ("world_history_head"."source_timeline_id" is not null and "world_history_head"."source_version_id" is not null and "world_history_head"."source_revision">0)) and ("world_history_head"."covered_until" is null or abs("world_history_head"."covered_until")<=1000000000000))
);
--> statement-breakpoint
CREATE TABLE "world_history_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"entry_id" text,
	"era_id" text,
	"timeline_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dating_system_id" text,
	"start_version_id" text,
	"end_version_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_history_version_identity_uq" UNIQUE("id","world_id","entity_id"),
	CONSTRAINT "world_history_version_valid" CHECK ((("world_history_version"."entry_id"="world_history_version"."entity_id" and "world_history_version"."era_id" is null) or ("world_history_version"."era_id"="world_history_version"."entity_id" and "world_history_version"."entry_id" is null)) and coalesce("world_history_version"."payload"->>'id'="world_history_version"."entity_id" and "world_history_version"."payload"->>'worldId'="world_history_version"."world_id" and ("world_history_version"."payload"->>'revision')::integer>0 and jsonb_typeof("world_history_version"."payload")='object',false))
);
--> statement-breakpoint
CREATE TABLE "world_history_version_era" (
	"version_id" text NOT NULL,
	"world_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"era_id" text NOT NULL,
	CONSTRAINT "world_history_version_era_version_id_era_id_pk" PRIMARY KEY("version_id","era_id")
);
--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD COLUMN "timeline_id" text;--> statement-breakpoint
ALTER TABLE "world_historical_era" ADD COLUMN "timeline_id" text;--> statement-breakpoint
-- Additive population and safeguards appended to the generated migration before publication.
INSERT INTO world_timeline(id,world_id,is_primary,name)
SELECT gen_random_uuid()::text,id,true,'Primary History' FROM world;
--> statement-breakpoint
UPDATE world_historical_entry e SET timeline_id=t.id FROM world_timeline t WHERE t.world_id=e.world_id AND t.is_primary;
--> statement-breakpoint
UPDATE world_historical_era e SET timeline_id=t.id FROM world_timeline t WHERE t.world_id=e.world_id AND t.is_primary;
--> statement-breakpoint
ALTER TABLE world_historical_entry ALTER COLUMN timeline_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE world_historical_era ALTER COLUMN timeline_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "world_timeline" ADD CONSTRAINT "world_timeline_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_timeline" ADD CONSTRAINT "world_timeline_parent_id_world_timeline_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."world_timeline"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_timeline" ADD CONSTRAINT "world_timeline_parent_world_fk" FOREIGN KEY ("parent_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_head" ADD CONSTRAINT "history_head_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_head" ADD CONSTRAINT "history_head_version_fk" FOREIGN KEY ("version_id","world_id","entity_id") REFERENCES "public"."world_history_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_head" ADD CONSTRAINT "history_head_source_timeline_fk" FOREIGN KEY ("source_timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_head" ADD CONSTRAINT "history_head_source_version_fk" FOREIGN KEY ("source_version_id","world_id","entity_id") REFERENCES "public"."world_history_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version" ADD CONSTRAINT "history_version_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version" ADD CONSTRAINT "history_version_entry_fk" FOREIGN KEY ("entry_id","world_id") REFERENCES "public"."world_historical_entry"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version" ADD CONSTRAINT "history_version_era_fk" FOREIGN KEY ("era_id","world_id") REFERENCES "public"."world_historical_era"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version" ADD CONSTRAINT "history_version_dating_fk" FOREIGN KEY ("dating_system_id","world_id") REFERENCES "public"."world_dating_system"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version" ADD CONSTRAINT "history_version_start_fk" FOREIGN KEY ("start_version_id","world_id") REFERENCES "public"."world_calendar_anchor"("version_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version" ADD CONSTRAINT "history_version_end_fk" FOREIGN KEY ("end_version_id","world_id") REFERENCES "public"."world_calendar_anchor"("version_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version_era" ADD CONSTRAINT "history_version_link_fk" FOREIGN KEY ("version_id","world_id","entry_id") REFERENCES "public"."world_history_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_history_version_era" ADD CONSTRAINT "history_version_link_era_fk" FOREIGN KEY ("era_id","world_id") REFERENCES "public"."world_historical_era"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "world_timeline_primary_uq" ON "world_timeline" USING btree ("world_id") WHERE "world_timeline"."is_primary";--> statement-breakpoint
CREATE INDEX "world_timeline_world_idx" ON "world_timeline" USING btree ("world_id","parent_id");--> statement-breakpoint
CREATE INDEX "world_history_head_world_idx" ON "world_history_head" USING btree ("world_id","timeline_id");--> statement-breakpoint
CREATE INDEX "world_history_version_entity_idx" ON "world_history_version" USING btree ("world_id","entity_id","created_at");--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD CONSTRAINT "world_historical_entry_timeline_id_world_timeline_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "public"."world_timeline"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD CONSTRAINT "world_entry_timeline_world_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_historical_era" ADD CONSTRAINT "world_historical_era_timeline_id_world_timeline_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "public"."world_timeline"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_historical_era" ADD CONSTRAINT "world_era_timeline_world_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_entry_timeline_idx" ON "world_historical_entry" USING btree ("timeline_id","updated_at");--> statement-breakpoint
CREATE INDEX "world_era_timeline_idx" ON "world_historical_era" USING btree ("timeline_id","start_year");
--> statement-breakpoint
INSERT INTO world_history_version(id,world_id,entity_id,era_id,timeline_id,dating_system_id,payload)
SELECT gen_random_uuid()::text,e.world_id,e.id,e.id,e.timeline_id,e.dating_system_id,
jsonb_build_object('id',e.id,'worldId',e.world_id,'name',e.name,'description',e.description,'startYear',e.start_year,'endYear',e.end_year,'tone',e.tone,'revision',e.revision,'archived',e.archived_at is not null,'datingSystemId',e.dating_system_id,'datingSystemRevision',e.source_dating->'revision','sourceDating',e.source_dating)
FROM world_historical_era e;
--> statement-breakpoint
INSERT INTO world_history_version(id,world_id,entity_id,entry_id,timeline_id,dating_system_id,start_version_id,end_version_id,payload)
SELECT gen_random_uuid()::text,e.world_id,e.id,e.id,e.timeline_id,e.dating_system_id,c.start_version_id,c.end_version_id,
jsonb_build_object('id',e.id,'worldId',e.world_id,'title',e.title,'account',e.account,'notes',e.notes,'time',e.historical_time,'accuracy',e.accuracy,'narrative',e.narrative,'revision',e.revision,'archived',e.archived_at is not null,'updatedAt',to_char(e.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'datingSystemId',e.dating_system_id,'datingSystemRevision',e.source_dating->'revision','sourceDating',e.source_dating,'calendarSource',c.source,'eraIds',coalesce((select jsonb_agg(l.era_id order by l.era_id) from world_entry_era l where l.entry_id=e.id),'[]'::jsonb))
FROM world_historical_entry e LEFT JOIN world_calendar_entry_date c ON c.entry_id=e.id;
--> statement-breakpoint
INSERT INTO world_history_version_era(version_id,world_id,entry_id,era_id)
SELECT v.id,l.world_id,l.entry_id,l.era_id FROM world_history_version v JOIN world_entry_era l ON l.entry_id=v.entry_id;
--> statement-breakpoint
INSERT INTO world_history_head(timeline_id,world_id,entity_id,version_id,mode,revision)
SELECT timeline_id,world_id,entity_id,id,'authored',(payload->>'revision')::integer FROM world_history_version;
--> statement-breakpoint
CREATE FUNCTION world_primary_timeline_create() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO world_timeline(id,world_id,is_primary,name) VALUES(gen_random_uuid()::text,NEW.id,true,'Primary History');
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_primary_timeline_create AFTER INSERT ON world FOR EACH ROW EXECUTE FUNCTION world_primary_timeline_create();
--> statement-breakpoint
CREATE FUNCTION world_history_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.timeline_id IS DISTINCT FROM OLD.timeline_id OR NEW.world_id<>OLD.world_id OR NEW.id<>OLD.id) THEN RAISE EXCEPTION 'Historical identity and origin are immutable'; END IF;
  IF NEW.timeline_id IS NULL THEN SELECT id INTO NEW.timeline_id FROM world_timeline WHERE world_id=NEW.world_id AND is_primary; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_entry_origin_guard BEFORE INSERT OR UPDATE ON world_historical_entry FOR EACH ROW EXECUTE FUNCTION world_history_origin_guard();
--> statement-breakpoint
CREATE TRIGGER world_era_origin_guard BEFORE INSERT OR UPDATE ON world_historical_era FOR EACH ROW EXECUTE FUNCTION world_history_origin_guard();
--> statement-breakpoint
CREATE FUNCTION world_timeline_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_row world_timeline;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive timelines instead of deleting them'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.world_id<>OLD.world_id OR NEW.is_primary<>OLD.is_primary OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.divergence_year IS DISTINCT FROM OLD.divergence_year) THEN RAISE EXCEPTION 'Timeline ancestry and divergence are immutable'; END IF;
  IF TG_OP='INSERT' AND NOT NEW.is_primary THEN
    SELECT * INTO parent_row FROM world_timeline WHERE id=NEW.parent_id AND world_id=NEW.world_id FOR UPDATE;
    IF NOT FOUND OR parent_row.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Choose an active same-world parent timeline'; END IF;
    IF parent_row.divergence_year IS NOT NULL AND NEW.divergence_year<parent_row.divergence_year THEN RAISE EXCEPTION 'Divergence precedes parent timeline'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_timeline_guard BEFORE INSERT OR UPDATE OR DELETE ON world_timeline FOR EACH ROW EXECUTE FUNCTION world_timeline_guard();
--> statement-breakpoint
CREATE FUNCTION world_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historical source versions are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER world_history_version_immutable BEFORE UPDATE OR DELETE ON world_history_version FOR EACH ROW EXECUTE FUNCTION world_history_immutable();
--> statement-breakpoint
CREATE TRIGGER world_history_version_era_immutable BEFORE UPDATE OR DELETE ON world_history_version_era FOR EACH ROW EXECUTE FUNCTION world_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_history_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE timeline_row world_timeline; version_timeline text;
BEGIN
  SELECT * INTO timeline_row FROM world_timeline WHERE id=NEW.timeline_id AND world_id=NEW.world_id;
  IF NEW.source_timeline_id IS NOT NULL AND NEW.source_timeline_id IS DISTINCT FROM timeline_row.parent_id THEN RAISE EXCEPTION 'Inherited source must be the direct parent timeline'; END IF;
  SELECT timeline_id INTO version_timeline FROM world_history_version WHERE id=NEW.version_id;
  IF NEW.mode IN ('authored','interpretation') AND version_timeline<>NEW.timeline_id THEN RAISE EXCEPTION 'Authored version must belong to selected timeline'; END IF;
  IF TG_OP='UPDATE' AND (NEW.timeline_id<>OLD.timeline_id OR NEW.world_id<>OLD.world_id OR NEW.entity_id<>OLD.entity_id OR NEW.source_timeline_id IS DISTINCT FROM OLD.source_timeline_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Historical identity, ancestry and revisions must be preserved'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_history_head_guard BEFORE INSERT OR UPDATE ON world_history_head FOR EACH ROW EXECUTE FUNCTION world_history_head_guard();
--> statement-breakpoint
CREATE FUNCTION world_history_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF num_nonnulls(NEW.entry_id,NEW.era_id)<>1 OR NEW.entity_id IS DISTINCT FROM coalesce(NEW.entry_id,NEW.era_id) THEN RAISE EXCEPTION 'A historical version requires exactly one matching entry or era identity'; END IF;
  IF NEW.payload->>'datingSystemId' IS DISTINCT FROM NEW.dating_system_id OR NEW.payload->'calendarSource'->'start'->>'versionId' IS DISTINCT FROM NEW.start_version_id OR NEW.payload->'calendarSource'->'end'->>'versionId' IS DISTINCT FROM NEW.end_version_id THEN RAISE EXCEPTION 'Historical source references must match their same-world protected columns'; END IF;
  IF NEW.entry_id IS NOT NULL AND NOT coalesce(NEW.payload->'time'->>'version'='1' AND NEW.payload->'time'->>'scale'='world-year' AND NEW.payload->'time'->>'kind' IN ('known','approximate','window','duration','undated') AND NEW.payload->>'accuracy' IN ('established','disputed','unverified','disproven') AND NEW.payload->>'narrative' IN ('recorded','planned') AND jsonb_typeof(NEW.payload->'eraIds')='array',false) THEN RAISE EXCEPTION 'Historical entry versions must retain valid chronology and classifications'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_history_version_guard BEFORE INSERT ON world_history_version FOR EACH ROW EXECUTE FUNCTION world_history_version_guard();
--> statement-breakpoint
CREATE FUNCTION world_history_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM world_history_version WHERE id=NEW.version_id AND world_id=NEW.world_id AND entry_id=NEW.entry_id) THEN RAISE EXCEPTION 'Era relationships require a same-world entry source version'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_history_link_guard BEFORE INSERT ON world_history_version_era FOR EACH ROW EXECUTE FUNCTION world_history_link_guard();
--> statement-breakpoint
CREATE TRIGGER world_history_head_retained BEFORE DELETE ON world_history_head FOR EACH ROW EXECUTE FUNCTION world_history_immutable();
