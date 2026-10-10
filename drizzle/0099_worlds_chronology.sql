CREATE TABLE "world_chronology_preference" (
	"world_id" text PRIMARY KEY NOT NULL,
	"default_dating_system_id" text
);
--> statement-breakpoint
CREATE TABLE "world_dating_system" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"origin" text NOT NULL,
	"epoch_year" bigint NOT NULL,
	"numbering" text NOT NULL,
	"before_label" text NOT NULL,
	"after_label" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"referenced_at" timestamp,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_dating_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_dating_valid" CHECK (length(trim("world_dating_system"."name")) BETWEEN 1 AND 160 AND length(trim("world_dating_system"."origin")) BETWEEN 1 AND 1000 AND length(trim("world_dating_system"."before_label")) BETWEEN 1 AND 80 AND length(trim("world_dating_system"."after_label")) BETWEEN 1 AND 80 AND abs("world_dating_system"."epoch_year") <= 1000000000000 AND "world_dating_system"."numbering" IN ('year-zero','no-year-zero') AND "world_dating_system"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD COLUMN "dating_system_id" text;--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD COLUMN "source_dating" jsonb;--> statement-breakpoint
ALTER TABLE "world_historical_era" ADD COLUMN "dating_system_id" text;--> statement-breakpoint
ALTER TABLE "world_historical_era" ADD COLUMN "source_dating" jsonb;--> statement-breakpoint
ALTER TABLE "world_chronology_preference" ADD CONSTRAINT "world_chronology_preference_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_chronology_preference" ADD CONSTRAINT "world_default_dating_world_fk" FOREIGN KEY ("default_dating_system_id","world_id") REFERENCES "public"."world_dating_system"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_dating_system" ADD CONSTRAINT "world_dating_system_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_dating_world_idx" ON "world_dating_system" USING btree ("world_id");--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD CONSTRAINT "world_entry_dating_world_fk" FOREIGN KEY ("dating_system_id","world_id") REFERENCES "public"."world_dating_system"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_historical_era" ADD CONSTRAINT "world_era_dating_world_fk" FOREIGN KEY ("dating_system_id","world_id") REFERENCES "public"."world_dating_system"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD CONSTRAINT "world_entry_dating_source_valid" CHECK (("world_historical_entry"."dating_system_id" IS NULL AND "world_historical_entry"."source_dating" IS NULL) OR ("world_historical_entry"."dating_system_id" IS NOT NULL AND "world_historical_entry"."source_dating" IS NOT NULL AND jsonb_typeof("world_historical_entry"."source_dating") = 'object' AND coalesce("world_historical_entry"."source_dating"->>'version' = '1' AND "world_historical_entry"."source_dating"->>'systemId' = "world_historical_entry"."dating_system_id", false)));--> statement-breakpoint
ALTER TABLE "world_historical_era" ADD CONSTRAINT "world_era_dating_source_valid" CHECK (("world_historical_era"."dating_system_id" IS NULL AND "world_historical_era"."source_dating" IS NULL) OR ("world_historical_era"."dating_system_id" IS NOT NULL AND "world_historical_era"."source_dating" IS NOT NULL AND jsonb_typeof("world_historical_era"."source_dating") = 'object' AND coalesce("world_historical_era"."source_dating"->>'version' = '1' AND "world_historical_era"."source_dating"->>'systemId' = "world_historical_era"."dating_system_id", false)));