CREATE TABLE "world" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"introduction" text DEFAULT '' NOT NULL,
	"historical_overview" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'primary' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_identity_valid" CHECK (length(trim("world"."name")) BETWEEN 1 AND 160 AND "world"."revision" > 0 AND "world"."tone" IN ('primary','secondary','info','muted'))
);
--> statement-breakpoint
CREATE TABLE "world_historical_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"title" text NOT NULL,
	"account" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"historical_time" jsonb NOT NULL,
	"accuracy" text DEFAULT 'established' NOT NULL,
	"narrative" text DEFAULT 'recorded' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_entry_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_entry_valid" CHECK (length(trim("world_historical_entry"."title")) BETWEEN 1 AND 160 AND length(trim("world_historical_entry"."account")) > 0 AND "world_historical_entry"."revision" > 0 AND "world_historical_entry"."accuracy" IN ('established','disputed','unverified','disproven') AND "world_historical_entry"."narrative" IN ('recorded','planned')),
	CONSTRAINT "world_entry_time_valid" CHECK (coalesce(jsonb_typeof("world_historical_entry"."historical_time") = 'object' AND "world_historical_entry"."historical_time"->>'version' = '1' AND "world_historical_entry"."historical_time"->>'scale' = 'world-year' AND CASE "world_historical_entry"."historical_time"->>'kind' WHEN 'undated' THEN NOT ("world_historical_entry"."historical_time" ?| array['year','startYear','endYear']) WHEN 'known' THEN jsonb_typeof("world_historical_entry"."historical_time"->'year') = 'number' AND ("world_historical_entry"."historical_time"->>'year')::numeric BETWEEN -1000000000000 AND 1000000000000 AND trunc(("world_historical_entry"."historical_time"->>'year')::numeric) = ("world_historical_entry"."historical_time"->>'year')::numeric AND NOT ("world_historical_entry"."historical_time" ?| array['startYear','endYear']) WHEN 'approximate' THEN jsonb_typeof("world_historical_entry"."historical_time"->'year') = 'number' AND ("world_historical_entry"."historical_time"->>'year')::numeric BETWEEN -1000000000000 AND 1000000000000 AND trunc(("world_historical_entry"."historical_time"->>'year')::numeric) = ("world_historical_entry"."historical_time"->>'year')::numeric AND NOT ("world_historical_entry"."historical_time" ?| array['startYear','endYear']) WHEN 'window' THEN jsonb_typeof("world_historical_entry"."historical_time"->'startYear') = 'number' AND jsonb_typeof("world_historical_entry"."historical_time"->'endYear') = 'number' AND ("world_historical_entry"."historical_time"->>'startYear')::numeric BETWEEN -1000000000000 AND 1000000000000 AND ("world_historical_entry"."historical_time"->>'endYear')::numeric BETWEEN -1000000000000 AND 1000000000000 AND trunc(("world_historical_entry"."historical_time"->>'startYear')::numeric) = ("world_historical_entry"."historical_time"->>'startYear')::numeric AND trunc(("world_historical_entry"."historical_time"->>'endYear')::numeric) = ("world_historical_entry"."historical_time"->>'endYear')::numeric AND ("world_historical_entry"."historical_time"->>'startYear')::numeric <= ("world_historical_entry"."historical_time"->>'endYear')::numeric AND NOT ("world_historical_entry"."historical_time" ? 'year') WHEN 'duration' THEN jsonb_typeof("world_historical_entry"."historical_time"->'startYear') = 'number' AND jsonb_typeof("world_historical_entry"."historical_time"->'endYear') = 'number' AND ("world_historical_entry"."historical_time"->>'startYear')::numeric BETWEEN -1000000000000 AND 1000000000000 AND ("world_historical_entry"."historical_time"->>'endYear')::numeric BETWEEN -1000000000000 AND 1000000000000 AND trunc(("world_historical_entry"."historical_time"->>'startYear')::numeric) = ("world_historical_entry"."historical_time"->>'startYear')::numeric AND trunc(("world_historical_entry"."historical_time"->>'endYear')::numeric) = ("world_historical_entry"."historical_time"->>'endYear')::numeric AND ("world_historical_entry"."historical_time"->>'startYear')::numeric <= ("world_historical_entry"."historical_time"->>'endYear')::numeric AND NOT ("world_historical_entry"."historical_time" ? 'year') ELSE false END, false))
);
--> statement-breakpoint
CREATE TABLE "world_entry_era" (
	"world_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"era_id" text NOT NULL,
	CONSTRAINT "world_entry_era_entry_id_era_id_pk" PRIMARY KEY("entry_id","era_id")
);
--> statement-breakpoint
CREATE TABLE "world_historical_era" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_year" bigint,
	"end_year" bigint,
	"tone" text DEFAULT 'primary' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_era_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_era_valid" CHECK (length(trim("world_historical_era"."name")) BETWEEN 1 AND 160 AND "world_historical_era"."revision" > 0 AND "world_historical_era"."tone" IN ('primary','secondary','info','muted') AND ("world_historical_era"."start_year" IS NULL OR abs("world_historical_era"."start_year") <= 1000000000000) AND ("world_historical_era"."end_year" IS NULL OR abs("world_historical_era"."end_year") <= 1000000000000) AND ("world_historical_era"."start_year" IS NULL OR "world_historical_era"."end_year" IS NULL OR "world_historical_era"."start_year" <= "world_historical_era"."end_year"))
);
--> statement-breakpoint
CREATE TABLE "world_classification_tag" (
	"world_id" text NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "world_classification_tag_world_id_tag_id_pk" PRIMARY KEY("world_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "world" ADD CONSTRAINT "world_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD CONSTRAINT "world_historical_entry_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_entry_era" ADD CONSTRAINT "world_entry_era_entry_world_fk" FOREIGN KEY ("entry_id","world_id") REFERENCES "public"."world_historical_entry"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_entry_era" ADD CONSTRAINT "world_entry_era_era_world_fk" FOREIGN KEY ("era_id","world_id") REFERENCES "public"."world_historical_era"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_historical_era" ADD CONSTRAINT "world_historical_era_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_classification_tag" ADD CONSTRAINT "world_classification_tag_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_classification_tag" ADD CONSTRAINT "world_classification_tag_tag_id_item_tags_catalog_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."item_tags_catalog"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_owner_idx" ON "world" USING btree ("owner_id","archived_at","updated_at");--> statement-breakpoint
CREATE INDEX "world_entry_world_idx" ON "world_historical_entry" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_entry_era_world_idx" ON "world_entry_era" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_era_world_idx" ON "world_historical_era" USING btree ("world_id");