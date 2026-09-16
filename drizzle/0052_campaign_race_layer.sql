CREATE TABLE "campaign_race" (
	"campaign_id" integer NOT NULL,
	"race_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_race_campaign_id_race_id_pk" PRIMARY KEY("campaign_id","race_id"),
	CONSTRAINT "campaign_race_order_valid" CHECK ("campaign_race"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_race" ADD CONSTRAINT "campaign_race_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_race" ADD CONSTRAINT "campaign_race_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_race_order_uq" ON "campaign_race" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_race_race_idx" ON "campaign_race" USING btree ("race_id","campaign_id");--> statement-breakpoint
INSERT INTO "campaign_race" ("campaign_id", "race_id", "sort_order")
SELECT "campaign_id", "race_id", "sort_order"
FROM "campaign_allowed_race"
ON CONFLICT ("campaign_id", "race_id") DO NOTHING;