CREATE TABLE "atlas_template" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"world_id" text NOT NULL,
	"family" text NOT NULL,
	"name" text NOT NULL,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_template_valid" CHECK ("atlas_template"."revision" BETWEEN 1 AND 128 AND "atlas_template"."family" IN ('geography','town','interior','underground','craft','appearance') AND jsonb_typeof("atlas_template"."metadata")='object')
);
--> statement-breakpoint
CREATE TABLE "atlas_template_asset_usage" (
	"template_id" text NOT NULL,
	"template_revision" integer NOT NULL,
	"asset_id" text NOT NULL,
	"asset_version" integer NOT NULL,
	CONSTRAINT "atlas_template_asset_usage_template_id_template_revision_asset_id_asset_version_pk" PRIMARY KEY("template_id","template_revision","asset_id","asset_version")
);
--> statement-breakpoint
CREATE TABLE "atlas_template_operation" (
	"request_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"world_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_template_operation_valid" CHECK ("atlas_template_operation"."input_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "atlas_template_version" (
	"template_id" text NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_template_version_template_id_revision_pk" PRIMARY KEY("template_id","revision"),
	CONSTRAINT "atlas_template_version_valid" CHECK ("atlas_template_version"."revision" BETWEEN 1 AND 128 AND jsonb_typeof("atlas_template_version"."snapshot")='object' AND octet_length("atlas_template_version"."snapshot"::text)<=5000000)
);
--> statement-breakpoint
ALTER TABLE "atlas_template" ADD CONSTRAINT "atlas_template_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_template" ADD CONSTRAINT "atlas_template_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_template_asset_usage" ADD CONSTRAINT "atlas_template_asset_usage_template_id_template_revision_atlas_template_version_template_id_revision_fk" FOREIGN KEY ("template_id","template_revision") REFERENCES "public"."atlas_template_version"("template_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_template_asset_usage" ADD CONSTRAINT "atlas_template_asset_usage_asset_id_asset_version_atlas_asset_version_asset_id_version_fk" FOREIGN KEY ("asset_id","asset_version") REFERENCES "public"."atlas_asset_version"("asset_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_template_operation" ADD CONSTRAINT "atlas_template_operation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_template_operation" ADD CONSTRAINT "atlas_template_operation_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_template_version" ADD CONSTRAINT "atlas_template_version_template_id_atlas_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."atlas_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_template_version" ADD CONSTRAINT "atlas_template_version_request_id_atlas_template_operation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."atlas_template_operation"("request_id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "atlas_template_owner_idx" ON "atlas_template" USING btree ("owner_id","family");--> statement-breakpoint
CREATE INDEX "atlas_template_world_idx" ON "atlas_template" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "atlas_template_asset_usage_asset_idx" ON "atlas_template_asset_usage" USING btree ("asset_id","asset_version");--> statement-breakpoint
CREATE INDEX "atlas_template_operation_owner_idx" ON "atlas_template_operation" USING btree ("owner_id");
--> statement-breakpoint
CREATE FUNCTION atlas_template_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Accepted template versions, requests and identities are retained permanently'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER atlas_template_version_immutable BEFORE UPDATE OR DELETE ON atlas_template_version FOR EACH ROW EXECUTE FUNCTION atlas_template_immutable();
--> statement-breakpoint
CREATE TRIGGER atlas_template_operation_immutable BEFORE UPDATE OR DELETE ON atlas_template_operation FOR EACH ROW EXECUTE FUNCTION atlas_template_immutable();
--> statement-breakpoint
CREATE TRIGGER atlas_template_no_delete BEFORE DELETE ON atlas_template FOR EACH ROW EXECUTE FUNCTION atlas_template_immutable();
--> statement-breakpoint
CREATE FUNCTION atlas_template_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.world_id<>OLD.world_id OR NEW.family<>OLD.family OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Retain template identity, owner, source World and consecutive revisions'; END IF;
 IF NEW.metadata->>'id' IS DISTINCT FROM NEW.id OR NEW.metadata->>'family' IS DISTINCT FROM NEW.family OR NEW.metadata->>'name' IS DISTINCT FROM NEW.name OR (NEW.metadata->>'revision')::integer IS DISTINCT FROM NEW.revision OR (NEW.metadata->>'archived')::boolean IS DISTINCT FROM NEW.archived OR NEW.metadata->>'builtIn' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Template metadata must match its retained head'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER atlas_template_head_guard BEFORE INSERT OR UPDATE ON atlas_template FOR EACH ROW EXECUTE FUNCTION atlas_template_head_guard();
--> statement-breakpoint
CREATE FUNCTION atlas_template_head_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM atlas_template_version v WHERE v.template_id=NEW.id AND v.revision=NEW.revision AND v.snapshot-'content'=NEW.metadata AND v.snapshot->'content'->>'family'=NEW.family) THEN RAISE EXCEPTION 'The template head requires its exact accepted immutable version'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER atlas_template_head_version AFTER INSERT OR UPDATE ON atlas_template DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atlas_template_head_version();
--> statement-breakpoint
CREATE FUNCTION atlas_template_version_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM atlas_template t JOIN atlas_template_operation o ON o.request_id=NEW.request_id WHERE t.id=NEW.template_id AND t.revision>=NEW.revision AND o.owner_id=t.owner_id AND o.result->>'templateId'=NEW.template_id AND (o.result->>'revision')::integer=NEW.revision AND NEW.snapshot->>'id'=NEW.template_id AND (NEW.snapshot->>'revision')::integer=NEW.revision AND NEW.snapshot->>'family'=t.family) THEN RAISE EXCEPTION 'Template history requires its exact authorized request receipt'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER atlas_template_version_request AFTER INSERT ON atlas_template_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atlas_template_version_request();
--> statement-breakpoint
CREATE TRIGGER atlas_template_asset_usage_immutable BEFORE UPDATE OR DELETE ON atlas_template_asset_usage FOR EACH ROW EXECUTE FUNCTION atlas_template_immutable();
--> statement-breakpoint
CREATE FUNCTION atlas_template_refs_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  WITH refs AS (SELECT DISTINCT p->>'assetId' asset_id,(p->>'version')::integer asset_version FROM jsonb_array_elements(NEW.snapshot->'content'->'images') i CROSS JOIN LATERAL jsonb_array_elements(i->'layer'->'placements') p WHERE p->>'assetId' ~ '^[a-fA-F0-9]{8}-')
  SELECT 1 FROM ((SELECT asset_id,asset_version FROM refs EXCEPT SELECT u.asset_id,u.asset_version FROM atlas_template_asset_usage u WHERE u.template_id=NEW.template_id AND u.template_revision=NEW.revision) UNION ALL (SELECT u.asset_id,u.asset_version FROM atlas_template_asset_usage u WHERE u.template_id=NEW.template_id AND u.template_revision=NEW.revision EXCEPT SELECT asset_id,asset_version FROM refs)) mismatch
 ) THEN RAISE EXCEPTION 'Template image pins require their exact retained asset-version references'; END IF;
 IF EXISTS (SELECT 1 FROM atlas_template_asset_usage u JOIN atlas_asset a ON a.id=u.asset_id JOIN atlas_template t ON t.id=u.template_id WHERE u.template_id=NEW.template_id AND u.template_revision=NEW.revision AND a.owner_id<>t.owner_id) THEN RAISE EXCEPTION 'Private template references retain their creator ownership'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER atlas_template_refs_guard AFTER INSERT ON atlas_template_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atlas_template_refs_guard();
