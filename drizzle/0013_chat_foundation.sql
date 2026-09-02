CREATE TYPE "public"."chat_message_status" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."chat_room_scope" AS ENUM('global', 'campaign');--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"author_user_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"content" text NOT NULL,
	"status" "chat_message_status" DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp,
	"deleted_by_user_id" text,
	"deletion_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_client_request_id_valid" CHECK ("chat_message"."client_request_id" = trim("chat_message"."client_request_id")
        AND length("chat_message"."client_request_id") BETWEEN 1 AND 100),
	CONSTRAINT "chat_message_content_valid" CHECK ("chat_message"."content" ~ '[^[:space:]]'
        AND length("chat_message"."content") <= 1000),
	CONSTRAINT "chat_message_deletion_reason_length_valid" CHECK (length("chat_message"."deletion_reason") <= 500),
	CONSTRAINT "chat_message_lifecycle_valid" CHECK ((
        "chat_message"."status" = 'active'
        AND "chat_message"."deleted_at" IS NULL
        AND "chat_message"."deleted_by_user_id" IS NULL
        AND "chat_message"."deletion_reason" = ''
      ) OR (
        "chat_message"."status" = 'deleted'
        AND "chat_message"."deleted_at" IS NOT NULL
        AND "chat_message"."deleted_by_user_id" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "chat_room" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"scope" "chat_room_scope" NOT NULL,
	"campaign_id" integer,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_room_slug_valid" CHECK ("chat_room"."slug" = trim("chat_room"."slug")
        AND length("chat_room"."slug") BETWEEN 1 AND 80
        AND "chat_room"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "chat_room_name_valid" CHECK ("chat_room"."name" = trim("chat_room"."name")
        AND length("chat_room"."name") BETWEEN 1 AND 100),
	CONSTRAINT "chat_room_scope_campaign_valid" CHECK ((
        ("chat_room"."scope" = 'global' AND "chat_room"."campaign_id" IS NULL)
        OR ("chat_room"."scope" = 'campaign' AND "chat_room"."campaign_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_room_id_chat_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_deleted_by_user_id_user_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_author_request_uq" ON "chat_message" USING btree ("author_user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "chat_message_room_history_idx" ON "chat_message" USING btree ("room_id","created_at","id");--> statement-breakpoint
CREATE INDEX "chat_message_author_history_idx" ON "chat_message" USING btree ("author_user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_room_slug_uq" ON "chat_room" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "chat_room_campaign_id_idx" ON "chat_room" USING btree ("campaign_id");--> statement-breakpoint
INSERT INTO "chat_room" ("slug", "name", "scope", "campaign_id", "is_archived")
VALUES ('crossroads', 'The Crossroads', 'global', NULL, false);
