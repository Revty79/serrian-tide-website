CREATE TABLE "campaign_session_roster" (
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"prep_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_roster_session_id_character_id_pk" PRIMARY KEY("session_id","character_id"),
	CONSTRAINT "campaign_session_roster_sort_order_nonnegative" CHECK ("campaign_session_roster"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_id_campaign_uq" ON "campaign_character" USING btree ("id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_session_id_campaign_uq" ON "campaign_session" USING btree ("id","campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_session_roster" ADD CONSTRAINT "campaign_session_roster_session_campaign_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_roster" ADD CONSTRAINT "campaign_session_roster_character_campaign_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_session_roster_session_order_idx" ON "campaign_session_roster" USING btree ("session_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_session_roster_character_idx" ON "campaign_session_roster" USING btree ("character_id","campaign_id");
