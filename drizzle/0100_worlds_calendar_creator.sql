CREATE TABLE "world_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_calendar_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_calendar_valid" CHECK (length(trim("world_calendar"."name")) BETWEEN 1 AND 160 AND "world_calendar"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "world_calendar_preference" (
	"world_id" text PRIMARY KEY NOT NULL,
	"default_version_id" text
);
--> statement-breakpoint
CREATE TABLE "world_calendar_version" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"title" text NOT NULL,
	"rules" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "world_calendar_version_id_world_uq" UNIQUE("id","world_id"),
	CONSTRAINT "world_calendar_version_valid" CHECK (length(trim("world_calendar_version"."title")) BETWEEN 1 AND 160 AND "world_calendar_version"."revision">0 AND coalesce(jsonb_typeof("world_calendar_version"."rules")='object' AND "world_calendar_version"."rules"->>'version'='1',false))
);
--> statement-breakpoint
ALTER TABLE "world_calendar" ADD CONSTRAINT "world_calendar_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_preference" ADD CONSTRAINT "world_calendar_preference_world_id_world_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_preference" ADD CONSTRAINT "world_calendar_default_world_fk" FOREIGN KEY ("default_version_id","world_id") REFERENCES "public"."world_calendar_version"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_calendar_version" ADD CONSTRAINT "world_calendar_version_calendar_world_fk" FOREIGN KEY ("calendar_id","world_id") REFERENCES "public"."world_calendar"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_calendar_world_idx" ON "world_calendar" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_calendar_version_world_idx" ON "world_calendar_version" USING btree ("world_id");