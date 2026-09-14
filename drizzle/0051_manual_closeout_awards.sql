CREATE TABLE "tabletop_closeout_award" (
	"id" serial PRIMARY KEY NOT NULL,
	"decision_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"character_name" text NOT NULL,
	"experience" double precision NOT NULL,
	"fame" double precision NOT NULL,
	"quintessence" double precision NOT NULL,
	CONSTRAINT "closeout_award_amounts_valid" CHECK ("tabletop_closeout_award"."experience" BETWEEN 0 AND 9007199254740991 AND "tabletop_closeout_award"."fame" BETWEEN 0 AND 9007199254740991 AND "tabletop_closeout_award"."quintessence" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "tabletop_closeout_award_decision" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"scene_id" integer,
	"awarded_by_user_id" text NOT NULL,
	"awarded_by_name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "closeout_award_decision_campaign_uq" UNIQUE("id","campaign_id"),
	CONSTRAINT "closeout_award_note_valid" CHECK (length("tabletop_closeout_award_decision"."note") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "tabletop_closeout_award" ADD CONSTRAINT "closeout_award_decision_fk" FOREIGN KEY ("decision_id","campaign_id") REFERENCES "public"."tabletop_closeout_award_decision"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_closeout_award" ADD CONSTRAINT "closeout_award_character_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_closeout_award_decision" ADD CONSTRAINT "tabletop_closeout_award_decision_awarded_by_user_id_user_id_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_closeout_award_decision" ADD CONSTRAINT "closeout_award_session_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_closeout_award_decision" ADD CONSTRAINT "closeout_award_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "closeout_award_recipient_uq" ON "tabletop_closeout_award" USING btree ("decision_id","character_id");--> statement-breakpoint
CREATE INDEX "closeout_award_character_idx" ON "tabletop_closeout_award" USING btree ("character_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "closeout_award_session_once_uq" ON "tabletop_closeout_award_decision" USING btree ("session_id") WHERE "tabletop_closeout_award_decision"."scene_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "closeout_award_scene_once_uq" ON "tabletop_closeout_award_decision" USING btree ("scene_id") WHERE "tabletop_closeout_award_decision"."scene_id" IS NOT NULL;