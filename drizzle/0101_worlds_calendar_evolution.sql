CREATE TABLE "world_calendar_adoption" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"version_id" text NOT NULL,
	"label" text NOT NULL,
	"period" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_adoption_valid" CHECK ("world_calendar_adoption"."revision">0 and length(trim("world_calendar_adoption"."label")) between 1 and 160 and coalesce("world_calendar_adoption"."period"->'time'->>'scale'='world-year' and "world_calendar_adoption"."period"->'time'->>'version'='1',false))
);
--> statement-breakpoint
CREATE TABLE "world_calendar_anchor" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"calendar_date" jsonb NOT NULL,
	"elapsed_day" text NOT NULL,
	CONSTRAINT "world_calendar_anchor_version_world_uq" UNIQUE("version_id","world_id"),
	CONSTRAINT "calendar_anchor_valid" CHECK ("world_calendar_anchor"."elapsed_day" ~ '^(0|-?[1-9][0-9]{0,19})$' and coalesce(jsonb_typeof("world_calendar_anchor"."calendar_date")='object' and "world_calendar_anchor"."calendar_date" ?& array['year','month','day'],false))
);
--> statement-breakpoint
CREATE TABLE "world_calendar_entry_date" (
	"entry_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"start_version_id" text NOT NULL,
	"end_version_id" text,
	"source" jsonb NOT NULL,
	CONSTRAINT "calendar_entry_date_valid" CHECK (coalesce("world_calendar_entry_date"."source"->>'version'='1' and "world_calendar_entry_date"."source"->'start'->>'versionId'="world_calendar_entry_date"."start_version_id" and "world_calendar_entry_date"."source"->'start'->>'elapsedDay' ~ '^(0|-?[1-9][0-9]{0,19})$' and case "world_calendar_entry_date"."source"->>'kind' when 'known' then "world_calendar_entry_date"."end_version_id" is null and not ("world_calendar_entry_date"."source" ? 'end') when 'approximate' then "world_calendar_entry_date"."end_version_id" is null and not ("world_calendar_entry_date"."source" ? 'end') when 'window' then "world_calendar_entry_date"."end_version_id"="world_calendar_entry_date"."source"->'end'->>'versionId' and ("world_calendar_entry_date"."source"->'end'->>'elapsedDay')::numeric>=("world_calendar_entry_date"."source"->'start'->>'elapsedDay')::numeric when 'duration' then "world_calendar_entry_date"."end_version_id"="world_calendar_entry_date"."source"->'end'->>'versionId' and ("world_calendar_entry_date"."source"->'end'->>'elapsedDay')::numeric>=("world_calendar_entry_date"."source"->'start'->>'elapsedDay')::numeric else false end,false))
);
--> statement-breakpoint
CREATE TABLE "world_calendar_history" (
	"version_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"period" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "calendar_history_valid" CHECK ("world_calendar_history"."revision">0 and coalesce(jsonb_typeof("world_calendar_history"."period")='object' and "world_calendar_history"."period"->'time'->>'version'='1' and "world_calendar_history"."period"->'time'->>'scale'='world-year',false))
);
--> statement-breakpoint
CREATE TABLE "world_calendar_reform" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"predecessor_id" text NOT NULL,
	"successor_id" text NOT NULL,
	"effective_time" jsonb NOT NULL,
	"reason" text NOT NULL,
	"details" text NOT NULL,
	"entry_id" text,
	"cutover" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_reform_valid" CHECK ("world_calendar_reform"."revision">0 and "world_calendar_reform"."predecessor_id"<>"world_calendar_reform"."successor_id" and length(trim("world_calendar_reform"."name")) between 1 and 160 and length(trim("world_calendar_reform"."reason")) between 1 and 4000 and coalesce("world_calendar_reform"."effective_time"->>'version'='1' and "world_calendar_reform"."effective_time"->>'scale'='world-year',false) and ("world_calendar_reform"."cutover" is null or coalesce("world_calendar_reform"."cutover"->'before'->>'versionId'="world_calendar_reform"."predecessor_id" and "world_calendar_reform"."cutover"->'after'->>'versionId'="world_calendar_reform"."successor_id" and ("world_calendar_reform"."cutover"->'after'->>'elapsedDay')::numeric=("world_calendar_reform"."cutover"->'before'->>'elapsedDay')::numeric+1,false)))
);
--> statement-breakpoint
CREATE TABLE "world_day_reference" (
	"world_id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "world_day_reference_valid" CHECK (length(trim("world_day_reference"."label")) between 1 and 160 and length(trim("world_day_reference"."description")) between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "world_calendar_adoption" ADD CONSTRAINT "calendar_adoption_version_world_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_anchor" ADD CONSTRAINT "world_calendar_anchor_world_id_world_day_reference_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world_day_reference"("world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_anchor" ADD CONSTRAINT "calendar_anchor_version_world_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_entry_date" ADD CONSTRAINT "calendar_entry_date_entry_world_fk" FOREIGN KEY ("entry_id","world_id") REFERENCES "public"."world_historical_entry"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_entry_date" ADD CONSTRAINT "calendar_entry_date_start_anchor_world_fk" FOREIGN KEY ("start_version_id","world_id") REFERENCES "public"."world_calendar_anchor"("version_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_entry_date" ADD CONSTRAINT "calendar_entry_date_end_anchor_world_fk" FOREIGN KEY ("end_version_id","world_id") REFERENCES "public"."world_calendar_anchor"("version_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_history" ADD CONSTRAINT "calendar_history_version_world_fk" FOREIGN KEY ("version_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_reform" ADD CONSTRAINT "calendar_reform_predecessor_world_fk" FOREIGN KEY ("predecessor_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_reform" ADD CONSTRAINT "calendar_reform_successor_world_fk" FOREIGN KEY ("successor_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_reform" ADD CONSTRAINT "calendar_reform_entry_world_fk" FOREIGN KEY ("entry_id","world_id") REFERENCES "public"."world_historical_entry"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_day_reference" ADD CONSTRAINT "world_day_reference_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_adoption_world_idx" ON "world_calendar_adoption" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "calendar_reform_world_idx" ON "world_calendar_reform" USING btree ("world_id");