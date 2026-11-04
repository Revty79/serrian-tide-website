CREATE TABLE "atlas_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer NOT NULL,
	"head_version" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_asset_valid" CHECK ("atlas_asset"."revision">0 AND "atlas_asset"."head_version">0)
);
--> statement-breakpoint
CREATE TABLE "atlas_asset_operation" (
	"request_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"world_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_asset_operation_owner_request_uq" UNIQUE("owner_id","request_id"),
	CONSTRAINT "atlas_asset_operation_hash_valid" CHECK ("atlas_asset_operation"."input_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "atlas_asset_preference" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"favorites" jsonb NOT NULL,
	"recent" jsonb NOT NULL,
	CONSTRAINT "atlas_asset_preference_valid" CHECK ("atlas_asset_preference"."revision">0 AND jsonb_typeof("atlas_asset_preference"."favorites")='array' AND jsonb_array_length("atlas_asset_preference"."favorites")<=128 AND jsonb_typeof("atlas_asset_preference"."recent")='array' AND jsonb_array_length("atlas_asset_preference"."recent")<=32)
);
--> statement-breakpoint
CREATE TABLE "atlas_asset_usage" (
	"world_id" text NOT NULL,
	"kind" text NOT NULL,
	"map_id" text NOT NULL,
	"revision" integer NOT NULL,
	"asset_id" text NOT NULL,
	"asset_version" integer NOT NULL,
	CONSTRAINT "atlas_asset_usage_world_id_kind_map_id_revision_asset_id_asset_version_pk" PRIMARY KEY("world_id","kind","map_id","revision","asset_id","asset_version")
);
--> statement-breakpoint
CREATE TABLE "atlas_asset_version" (
	"asset_id" text NOT NULL,
	"version" integer NOT NULL,
	"metadata" jsonb NOT NULL,
	"filename" text NOT NULL,
	"format" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"objects" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_asset_version_asset_id_version_pk" PRIMARY KEY("asset_id","version"),
	CONSTRAINT "atlas_asset_version_valid" CHECK ("atlas_asset_version"."version">0 AND "atlas_asset_version"."width">0 AND "atlas_asset_version"."height">0 AND "atlas_asset_version"."width"<=8192 AND "atlas_asset_version"."height"<=8192 AND "atlas_asset_version"."width"::bigint*"atlas_asset_version"."height"<=16777216 AND "atlas_asset_version"."bytes" BETWEEN 1 AND 8388608 AND "atlas_asset_version"."format" IN ('png','jpeg','webp') AND jsonb_typeof("atlas_asset_version"."objects")='array')
);
--> statement-breakpoint
CREATE TABLE "atlas_composition" (
	"world_id" text NOT NULL,
	"kind" text NOT NULL,
	"map_id" text NOT NULL,
	"revision" integer NOT NULL,
	"layer" jsonb NOT NULL,
	CONSTRAINT "atlas_composition_world_id_kind_map_id_pk" PRIMARY KEY("world_id","kind","map_id"),
	CONSTRAINT "atlas_composition_valid" CHECK ("atlas_composition"."kind" IN ('terrain','town','floor','underground') AND "atlas_composition"."revision">0 AND "atlas_composition"."layer"->>'version'='1' AND jsonb_typeof("atlas_composition"."layer"->'placements')='array' AND jsonb_array_length("atlas_composition"."layer"->'placements')<=256)
);
--> statement-breakpoint
CREATE TABLE "atlas_composition_version" (
	"world_id" text NOT NULL,
	"kind" text NOT NULL,
	"map_id" text NOT NULL,
	"revision" integer NOT NULL,
	"layer" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_composition_version_world_id_kind_map_id_revision_pk" PRIMARY KEY("world_id","kind","map_id","revision"),
	CONSTRAINT "atlas_composition_version_valid" CHECK ("atlas_composition_version"."revision">0 AND "atlas_composition_version"."layer"->>'version'='1' AND jsonb_typeof("atlas_composition_version"."layer"->'placements')='array' AND jsonb_array_length("atlas_composition_version"."layer"->'placements')<=256)
);
--> statement-breakpoint
ALTER TABLE "atlas_asset" ADD CONSTRAINT "atlas_asset_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_asset_operation" ADD CONSTRAINT "atlas_asset_operation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_asset_operation" ADD CONSTRAINT "atlas_asset_operation_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_asset_preference" ADD CONSTRAINT "atlas_asset_preference_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_asset_usage" ADD CONSTRAINT "atlas_asset_usage_world_id_kind_map_id_revision_atlas_composition_version_world_id_kind_map_id_revision_fk" FOREIGN KEY ("world_id","kind","map_id","revision") REFERENCES "public"."atlas_composition_version"("world_id","kind","map_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_asset_usage" ADD CONSTRAINT "atlas_asset_usage_asset_id_asset_version_atlas_asset_version_asset_id_version_fk" FOREIGN KEY ("asset_id","asset_version") REFERENCES "public"."atlas_asset_version"("asset_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_asset_version" ADD CONSTRAINT "atlas_asset_version_asset_id_atlas_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."atlas_asset"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_composition" ADD CONSTRAINT "atlas_composition_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_composition_version" ADD CONSTRAINT "atlas_composition_version_world_id_kind_map_id_atlas_composition_world_id_kind_map_id_fk" FOREIGN KEY ("world_id","kind","map_id") REFERENCES "public"."atlas_composition"("world_id","kind","map_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atlas_asset_owner_idx" ON "atlas_asset" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "atlas_asset_usage_asset_idx" ON "atlas_asset_usage" USING btree ("asset_id","asset_version");