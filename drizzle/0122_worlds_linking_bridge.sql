-- Additive bridge only. Existing drawings, lore and calendar dates are untouched.
CREATE FUNCTION world_link_content_valid(d jsonb,s jsonb,l text,lv text,m text,c text,cv text,y text,a text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(d)='object' AND jsonb_typeof(s)='object'
  AND d->>'loreId'=l AND s->'lore'->>'id'=l AND s->'lore'->>'versionId'=lv
  AND (s->'lore'->>'revision')::numeric>0 AND (s->'target'->>'revision')::numeric>0
  AND length(trim(d->>'label')) BETWEEN 1 AND 160
  AND length(d->>'interpretation')<=50000 AND length(d->>'perspective')<=4000
  AND d->>'visibility' IN ('ordinary','protected')
  AND (d->'beginning'='null'::jsonb OR world_lore_time_valid(d->'beginning'))
  AND (d->'ending'='null'::jsonb OR world_lore_time_valid(d->'ending'))
  AND ((d->>'kind'='realm-map' AND m IS NOT NULL AND c IS NULL AND cv IS NULL AND y IS NULL AND a IS NULL
    AND d->>'mapId'=m AND s->'target'->>'id'=m AND s->'lore'->>'family'='realm')
   OR (d->>'kind'='society-time' AND m IS NULL AND ((c IS NOT NULL AND y IS NULL) OR (y IS NOT NULL AND c IS NULL))
    AND (d->>'calendarId') IS NOT DISTINCT FROM c AND (d->>'calendarVersionId') IS NOT DISTINCT FROM cv
    AND (d->>'datingSystemId') IS NOT DISTINCT FROM y AND (d->>'adoptionId') IS NOT DISTINCT FROM a
    AND s->'target'->>'id'=coalesce(c,y) AND (cv IS NULL OR (c IS NOT NULL AND s->'target'->>'calendarVersionId'=cv AND (s->'target'->>'rulesRevision')::numeric>0))
    AND (a IS NULL OR (cv IS NOT NULL AND d->'beginning'='null'::jsonb AND d->'ending'='null'::jsonb))
    AND s->'lore'->>'family' IN ('species','people','population','culture','civilization','polity','government','institution','organization','belief','tradition'))),false)
$$;
--> statement-breakpoint
ALTER TABLE "world_calendar_adoption" ADD CONSTRAINT "calendar_adoption_world_uq" UNIQUE("id","world_id");
--> statement-breakpoint
CREATE TABLE "world_link_head" (
	"world_id" text NOT NULL,
	"timeline_id" text NOT NULL,
	"link_id" text NOT NULL,
	"version_id" text NOT NULL,
	"revision" integer NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "world_link_head_timeline_id_link_id_pk" PRIMARY KEY("timeline_id","link_id"),
	CONSTRAINT "world_link_head_valid" CHECK ("world_link_head"."revision">0 and "world_link_head"."mode" in ('authored','inherited','interpretation','excluded'))
);
--> statement-breakpoint
CREATE TABLE "world_link_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"kind" text NOT NULL,
	"origin_timeline_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_link_identity_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_link_kind_valid" CHECK ("world_link_identity"."kind" in ('realm-map','society-time'))
);
--> statement-breakpoint
CREATE TABLE "world_link_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"link_id" text NOT NULL,
	"timeline_id" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"lore_id" text NOT NULL,
	"lore_version_id" text NOT NULL,
	"map_id" text,
	"calendar_id" text,
	"calendar_version_id" text,
	"dating_system_id" text,
	"adoption_id" text,
	"archived" boolean DEFAULT false NOT NULL,
	"draft" jsonb NOT NULL,
	"source" jsonb NOT NULL,
	CONSTRAINT "world_link_version_identity_uq" UNIQUE("id","world_id","link_id"),
	CONSTRAINT "world_link_version_valid" CHECK (world_link_content_valid("world_link_version"."draft","world_link_version"."source","world_link_version"."lore_id","world_link_version"."lore_version_id","world_link_version"."map_id","world_link_version"."calendar_id","world_link_version"."calendar_version_id","world_link_version"."dating_system_id","world_link_version"."adoption_id"))
);
--> statement-breakpoint
ALTER TABLE "world_link_head" ADD CONSTRAINT "world_link_head_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_head" ADD CONSTRAINT "world_link_head_version_fk" FOREIGN KEY ("version_id","world_id","link_id") REFERENCES "public"."world_link_version"("id","world_id","link_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_identity" ADD CONSTRAINT "world_link_identity_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_identity" ADD CONSTRAINT "world_link_identity_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_identity" ADD CONSTRAINT "world_link_origin_fk" FOREIGN KEY ("origin_timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_version_identity_fk" FOREIGN KEY ("link_id","world_id") REFERENCES "public"."world_link_identity"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_version_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_lore_identity_fk" FOREIGN KEY ("lore_id","world_id") REFERENCES "public"."world_lore_identity"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_lore_source_fk" FOREIGN KEY ("lore_version_id","world_id","lore_id") REFERENCES "public"."world_lore_version"("id","world_id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_atlas_map"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_calendar_fk" FOREIGN KEY ("calendar_id","world_id") REFERENCES "public"."world_calendar"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_calendar_version_fk" FOREIGN KEY ("calendar_version_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_dating_fk" FOREIGN KEY ("dating_system_id","world_id") REFERENCES "public"."world_dating_system"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_link_version" ADD CONSTRAINT "world_link_adoption_fk" FOREIGN KEY ("adoption_id","world_id") REFERENCES "public"."world_calendar_adoption"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_link_head_world_idx" ON "world_link_head" USING btree ("world_id","timeline_id");--> statement-breakpoint
CREATE INDEX "world_link_version_lore_idx" ON "world_link_version" USING btree ("world_id","lore_id");--> statement-breakpoint
CREATE INDEX "world_link_version_map_idx" ON "world_link_version" USING btree ("world_id","map_id");--> statement-breakpoint
CREATE FUNCTION world_link_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE family text; kind text; rules_calendar text; adoption_version text;
BEGIN
 SELECT i.kind INTO kind FROM world_link_identity i WHERE i.id=NEW.link_id AND i.world_id=NEW.world_id;
 SELECT v.family INTO family FROM world_lore_version v WHERE v.id=NEW.lore_version_id AND v.entity_id=NEW.lore_id AND v.world_id=NEW.world_id;
 IF kind IS DISTINCT FROM NEW.draft->>'kind' OR family IS DISTINCT FROM NEW.source->'lore'->>'family' THEN RAISE EXCEPTION 'Bridge source kind mismatch'; END IF;
 IF NEW.calendar_version_id IS NOT NULL THEN
  SELECT v.calendar_id INTO rules_calendar FROM world_calendar_version v WHERE v.id=NEW.calendar_version_id AND v.world_id=NEW.world_id;
  IF rules_calendar IS DISTINCT FROM NEW.calendar_id THEN RAISE EXCEPTION 'Bridge rules belong to another calendar'; END IF;
 END IF;
 IF NEW.adoption_id IS NOT NULL THEN
  SELECT a.version_id INTO adoption_version FROM world_calendar_adoption a WHERE a.id=NEW.adoption_id AND a.world_id=NEW.world_id;
  IF adoption_version IS DISTINCT FROM NEW.calendar_version_id OR NOT EXISTS(SELECT 1 FROM world_timeline t WHERE t.id=NEW.timeline_id AND t.is_primary) THEN RAISE EXCEPTION 'Bridge adoption source mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_link_source_guard BEFORE INSERT ON world_link_version FOR EACH ROW EXECUTE FUNCTION world_link_source_guard();
--> statement-breakpoint
CREATE FUNCTION world_link_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Saved bridge identities and source versions are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER world_link_identity_immutable BEFORE UPDATE OR DELETE ON world_link_identity FOR EACH ROW EXECUTE FUNCTION world_link_immutable();
--> statement-breakpoint
CREATE TRIGGER world_link_version_immutable BEFORE UPDATE OR DELETE ON world_link_version FOR EACH ROW EXECUTE FUNCTION world_link_immutable();
--> statement-breakpoint
CREATE FUNCTION world_link_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_timeline text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Exclude a connection instead of deleting its history'; END IF;
 IF TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR NEW.world_id<>OLD.world_id OR NEW.timeline_id<>OLD.timeline_id OR NEW.link_id<>OLD.link_id) THEN RAISE EXCEPTION 'Invalid bridge head revision'; END IF;
 SELECT v.timeline_id INTO source_timeline FROM world_link_version v WHERE v.id=NEW.version_id AND v.world_id=NEW.world_id AND v.link_id=NEW.link_id;
 IF source_timeline<>NEW.timeline_id AND (NEW.mode NOT IN ('inherited','excluded') OR NOT EXISTS(
  WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM world_timeline WHERE id=NEW.timeline_id AND world_id=NEW.world_id UNION ALL SELECT t.id,t.parent_id FROM world_timeline t JOIN ancestors a ON t.id=a.parent_id WHERE t.world_id=NEW.world_id)
  SELECT 1 FROM ancestors WHERE id=source_timeline)) THEN RAISE EXCEPTION 'Bridge source is not from this timeline or its explicitly retained ancestry'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_link_head_guard BEFORE INSERT OR UPDATE OR DELETE ON world_link_head FOR EACH ROW EXECUTE FUNCTION world_link_head_guard();
