CREATE TABLE "campaign_skill_exclusion" (
	"campaign_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"path_key" text NOT NULL,
	CONSTRAINT "campaign_skill_exclusion_campaign_id_path_key_pk" PRIMARY KEY("campaign_id","path_key"),
	CONSTRAINT "campaign_skill_exclusion_path_valid" CHECK ("campaign_skill_exclusion"."path_key" ~ '^[1-9][0-9]*(>[1-9][0-9]*)*$' AND split_part("campaign_skill_exclusion"."path_key", '>', -1) = "campaign_skill_exclusion"."skill_id"::text)
);
--> statement-breakpoint
ALTER TABLE "campaign_skill_exclusion" ADD CONSTRAINT "campaign_skill_exclusion_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_skill_exclusion" ADD CONSTRAINT "campaign_skill_exclusion_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_skill_exclusion_skill_idx" ON "campaign_skill_exclusion" USING btree ("skill_id");