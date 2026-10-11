CREATE TABLE "world_authoring_selection" (
	"user_id" text PRIMARY KEY NOT NULL,
	"context_id" text,
	"viewing_year" bigint,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_authoring_selection_valid" CHECK ("world_authoring_selection"."revision" >= 0 and ("world_authoring_selection"."viewing_year" is null or ("world_authoring_selection"."context_id" is not null and abs("world_authoring_selection"."viewing_year") <= 1000000000000)))
);
--> statement-breakpoint
CREATE TABLE "world_campaign_context" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"world_id" text NOT NULL,
	"timeline_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"starting_year" bigint,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	CONSTRAINT "world_campaign_context_identity_uq" UNIQUE("campaign_id","world_id","timeline_id"),
	CONSTRAINT "world_campaign_context_campaign_uq" UNIQUE("id","campaign_id"),
	CONSTRAINT "world_campaign_context_valid" CHECK ("world_campaign_context"."revision" > 0 and ("world_campaign_context"."starting_year" is null or abs("world_campaign_context"."starting_year") <= 1000000000000))
);
--> statement-breakpoint
CREATE TABLE "world_campaign_context_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"context_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_campaign_context_change_valid" CHECK ("world_campaign_context_change"."action" in ('link','edit','remove','restore','home') and jsonb_typeof("world_campaign_context_change"."snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "world_campaign_home" (
	"campaign_id" integer PRIMARY KEY NOT NULL,
	"context_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_campaign_home_revision_valid" CHECK ("world_campaign_home"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "world_authoring_selection" ADD CONSTRAINT "world_authoring_selection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_authoring_selection" ADD CONSTRAINT "world_authoring_selection_context_id_world_campaign_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."world_campaign_context"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_campaign_context" ADD CONSTRAINT "world_campaign_context_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_campaign_context" ADD CONSTRAINT "world_campaign_context_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_campaign_context" ADD CONSTRAINT "world_campaign_context_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_campaign_context" ADD CONSTRAINT "world_campaign_context_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_campaign_context_change" ADD CONSTRAINT "world_campaign_context_change_context_id_world_campaign_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."world_campaign_context"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_campaign_context_change" ADD CONSTRAINT "world_campaign_context_change_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_campaign_home" ADD CONSTRAINT "world_campaign_home_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_campaign_home" ADD CONSTRAINT "world_campaign_home_context_fk" FOREIGN KEY ("context_id","campaign_id") REFERENCES "public"."world_campaign_context"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_campaign_context_world_idx" ON "world_campaign_context" USING btree ("world_id","campaign_id");--> statement-breakpoint
CREATE INDEX "world_campaign_context_creator_idx" ON "world_campaign_context" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "world_campaign_context_change_idx" ON "world_campaign_context_change" USING btree ("context_id","id");
--> statement-breakpoint
CREATE FUNCTION world_campaign_context_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Remove associations without deleting retained context history'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.world_id<>OLD.world_id OR NEW.campaign_id<>OLD.campaign_id OR NEW.timeline_id<>OLD.timeline_id OR NEW.creator_id<>OLD.creator_id OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Association identity is immutable'; END IF;
    IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Association revision must advance exactly once'; END IF;
    IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL AND EXISTS(select 1 from world_campaign_home where context_id=OLD.id) THEN RAISE EXCEPTION 'Explicitly clear or replace the home before removing its association'; END IF;
  END IF;
  IF TG_OP='INSERT' OR (OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL) THEN
    IF NOT EXISTS(select 1 from world w join campaign c on c.id=NEW.campaign_id join world_timeline t on t.id=NEW.timeline_id and t.world_id=w.id where w.id=NEW.world_id and w.owner_id=NEW.creator_id and c.created_by_user_id=NEW.creator_id and w.archived_at is null and c.archived_at is null and t.archived_at is null) THEN RAISE EXCEPTION 'An active same-owner World, Campaign and same-World timeline are required'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_campaign_context_guard BEFORE INSERT OR UPDATE OR DELETE ON world_campaign_context FOR EACH ROW EXECUTE FUNCTION world_campaign_context_guard();
--> statement-breakpoint
CREATE FUNCTION world_campaign_pointer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE context_row world_campaign_context;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Clear authoring designations without deleting their revision history'; END IF;
  IF TG_OP='UPDATE' AND NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Context designation revision must advance exactly once'; END IF;
  IF TG_OP='UPDATE' THEN
    IF TG_TABLE_NAME='world_campaign_home' THEN
      IF NEW.campaign_id<>OLD.campaign_id THEN RAISE EXCEPTION 'Home Campaign identity is immutable'; END IF;
    ELSE
      IF NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'Authoring creator identity is immutable'; END IF;
    END IF;
  END IF;
  IF NEW.context_id IS NOT NULL THEN
    SELECT * INTO context_row FROM world_campaign_context WHERE id=NEW.context_id;
    IF NOT FOUND OR context_row.removed_at IS NOT NULL THEN RAISE EXCEPTION 'Choose an available association'; END IF;
    IF TG_TABLE_NAME='world_campaign_home' THEN
      IF context_row.campaign_id<>NEW.campaign_id THEN RAISE EXCEPTION 'Home must belong to this Campaign'; END IF;
    ELSE
      IF context_row.creator_id<>NEW.user_id THEN RAISE EXCEPTION 'Authoring selection must belong to this creator'; END IF;
    END IF;
    IF NOT EXISTS(select 1 from world w join campaign c on c.id=context_row.campaign_id join world_timeline t on t.id=context_row.timeline_id and t.world_id=w.id where w.id=context_row.world_id and w.owner_id=context_row.creator_id and c.created_by_user_id=context_row.creator_id and w.archived_at is null and c.archived_at is null and t.archived_at is null) THEN RAISE EXCEPTION 'Choose an active same-owner context'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER world_campaign_home_guard BEFORE INSERT OR UPDATE OR DELETE ON world_campaign_home FOR EACH ROW EXECUTE FUNCTION world_campaign_pointer_guard();
--> statement-breakpoint
CREATE TRIGGER world_authoring_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON world_authoring_selection FOR EACH ROW EXECUTE FUNCTION world_campaign_pointer_guard();
--> statement-breakpoint
CREATE FUNCTION world_campaign_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Association audit history is immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER world_campaign_audit_immutable BEFORE UPDATE OR DELETE ON world_campaign_context_change FOR EACH ROW EXECUTE FUNCTION world_campaign_audit_immutable();
