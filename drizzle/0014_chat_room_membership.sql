ALTER TYPE "public"."chat_room_scope" ADD VALUE 'direct';--> statement-breakpoint
CREATE TABLE "chat_room_member" (
	"room_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_room_member_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "chat_room" DROP CONSTRAINT "chat_room_scope_campaign_valid";--> statement-breakpoint
ALTER TABLE "chat_room_member" ADD CONSTRAINT "chat_room_member_room_id_chat_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_member" ADD CONSTRAINT "chat_room_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_room_member_user_room_idx" ON "chat_room_member" USING btree ("user_id","room_id");--> statement-breakpoint
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_scope_campaign_valid" CHECK ((
        ("chat_room"."scope" = 'campaign' AND "chat_room"."campaign_id" IS NOT NULL)
        OR ("chat_room"."scope" <> 'campaign' AND "chat_room"."campaign_id" IS NULL)
      ));--> statement-breakpoint
INSERT INTO "chat_room" ("slug", "name", "scope", "campaign_id", "is_archived")
SELECT
	'campaign-' || "campaign"."id" || '-general',
	CASE
		WHEN length(trim("campaign"."name")) = 0 THEN 'Campaign Chat'
		ELSE left(trim("campaign"."name"), 95) || ' Chat'
	END,
	'campaign',
	"campaign"."id",
	false
FROM "campaign"
ON CONFLICT ("slug") DO NOTHING;
