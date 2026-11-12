CREATE TABLE "atlas_source_rights" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_version" text NOT NULL,
	"evidence" jsonb,
	"original" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_source_subject_uq" UNIQUE("subject_kind","subject_id","subject_version"),
	CONSTRAINT "atlas_source_kind_valid" CHECK ("atlas_source_rights"."subject_kind" in ('reference','asset','geographic','raster','legacy-world'))
);
--> statement-breakpoint
CREATE TABLE "atlas_source_parent" (
	"source_id" text NOT NULL,
	"parent_id" text NOT NULL,
	CONSTRAINT "atlas_source_parent_source_id_parent_id_pk" PRIMARY KEY("source_id","parent_id"),
	CONSTRAINT "atlas_source_parent_distinct" CHECK ("atlas_source_parent"."source_id"<>"atlas_source_parent"."parent_id")
);
--> statement-breakpoint
CREATE TABLE "atlas_source_review" (
	"source_id" text NOT NULL,
	"revision" integer NOT NULL,
	"reviewer_id" text NOT NULL,
	"request_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"review" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_source_review_source_id_revision_pk" PRIMARY KEY("source_id","revision"),
	CONSTRAINT "atlas_source_review_request_uq" UNIQUE("request_id"),
	CONSTRAINT "atlas_source_review_valid" CHECK ("atlas_source_review"."revision">0 and "atlas_source_review"."input_hash" ~ '^[a-f0-9]{64}$' and "atlas_source_review"."review"->>'decision' in ('approved','hold','rejected'))
);
--> statement-breakpoint
CREATE TABLE "atlas_source_use" (
	"world_id" text NOT NULL,
	"source_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"version" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_source_use_world_id_source_id_kind_target_id_version_pk" PRIMARY KEY("world_id","source_id","kind","target_id","version")
);
--> statement-breakpoint
ALTER TABLE "atlas_source_rights" ADD CONSTRAINT "atlas_source_rights_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_parent" ADD CONSTRAINT "atlas_source_parent_source_id_atlas_source_rights_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."atlas_source_rights"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_parent" ADD CONSTRAINT "atlas_source_parent_parent_id_atlas_source_rights_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."atlas_source_rights"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_review" ADD CONSTRAINT "atlas_source_review_source_id_atlas_source_rights_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."atlas_source_rights"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_review" ADD CONSTRAINT "atlas_source_review_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_use" ADD CONSTRAINT "atlas_source_use_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_use" ADD CONSTRAINT "atlas_source_use_source_id_atlas_source_rights_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."atlas_source_rights"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atlas_source_owner_idx" ON "atlas_source_rights" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "atlas_source_use_source_idx" ON "atlas_source_use" USING btree ("source_id");
--> statement-breakpoint
-- Existing content is never presumed source-free. These review sidecars do not
-- alter original geometry, files, version payloads, accounts or attribution.
INSERT INTO atlas_source_rights(id,owner_id,subject_kind,subject_id,subject_version)
SELECT gen_random_uuid()::text,owner_id,'legacy-world',id,revision::text FROM world;
--> statement-breakpoint
INSERT INTO atlas_source_use(world_id,source_id,kind,target_id,version,note)
SELECT subject_id,id,'legacy-world',subject_id,subject_version,'Pre-A3 World: review retained provenance before further derivation or distribution. No source-free origin is inferred.' FROM atlas_source_rights WHERE subject_kind='legacy-world';
--> statement-breakpoint
INSERT INTO atlas_source_rights(id,owner_id,subject_kind,subject_id,subject_version)
SELECT gen_random_uuid()::text,a.owner_id,'asset',v.asset_id,v.version::text FROM atlas_asset_version v JOIN atlas_asset a ON a.id=v.asset_id;
--> statement-breakpoint
INSERT INTO atlas_source_use(world_id,source_id,kind,target_id,version,note)
SELECT u.world_id,s.id,u.kind,u.map_id,u.revision::text,'Retained pre-A3 artwork; review the exact immutable asset metadata and original bytes.' FROM atlas_asset_usage u JOIN atlas_source_rights s ON s.subject_kind='asset' AND s.subject_id=u.asset_id AND s.subject_version=u.asset_version::text;
--> statement-breakpoint
INSERT INTO atlas_source_rights(id,owner_id,subject_kind,subject_id,subject_version)
SELECT gen_random_uuid()::text,importer_id,'geographic',id,content_sha256 FROM world_geo_dataset WHERE provenance->>'kind' IS DISTINCT FROM 'creator-authored';
--> statement-breakpoint
INSERT INTO atlas_source_use(world_id,source_id,kind,target_id,version,note)
SELECT d.world_id,s.id,'geographic',d.id,d.content_sha256,'External dataset: original provider, edition, license and lineage remain in the immutable geographic dataset.' FROM world_geo_dataset d JOIN atlas_source_rights s ON s.subject_kind='geographic' AND s.subject_id=d.id;
--> statement-breakpoint
INSERT INTO atlas_source_rights(id,owner_id,subject_kind,subject_id,subject_version)
SELECT gen_random_uuid()::text,author_id,'raster',id,revision::text FROM world_raster_version;
--> statement-breakpoint
INSERT INTO atlas_source_use(world_id,source_id,kind,target_id,version,note)
SELECT v.world_id,s.id,'raster',v.id,v.revision::text,'External raster: original source manifest and exact version remain retained.' FROM world_raster_version v JOIN atlas_source_rights s ON s.subject_kind='raster' AND s.subject_id=v.id;
--> statement-breakpoint
CREATE FUNCTION atlas_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Source evidence, uses and review history are append-only; append a new review instead.'; END $$;
--> statement-breakpoint
CREATE TRIGGER atlas_source_immutable BEFORE UPDATE OR DELETE ON atlas_source_rights FOR EACH ROW EXECUTE FUNCTION atlas_source_immutable();
--> statement-breakpoint
CREATE TRIGGER atlas_source_review_immutable BEFORE UPDATE OR DELETE ON atlas_source_review FOR EACH ROW EXECUTE FUNCTION atlas_source_immutable();
--> statement-breakpoint
CREATE TRIGGER atlas_source_use_immutable BEFORE UPDATE OR DELETE ON atlas_source_use FOR EACH ROW EXECUTE FUNCTION atlas_source_immutable();
--> statement-breakpoint
CREATE TRIGGER atlas_source_parent_immutable BEFORE UPDATE OR DELETE ON atlas_source_parent FOR EACH ROW EXECUTE FUNCTION atlas_source_immutable();
