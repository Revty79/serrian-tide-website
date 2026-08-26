CREATE TYPE "public"."campaign_currency_system" AS ENUM('Credits', 'Derived Currency');--> statement-breakpoint
CREATE TYPE "public"."campaign_fate_point_method" AS ENUM('Assigned', 'Rolled');--> statement-breakpoint
CREATE TYPE "public"."campaign_system" AS ENUM('Tier 1', 'Tier 2', 'Tier 3', 'Spellcraft', 'Talismanism', 'Faith', 'Psyonics', 'Special Abilities', 'Bardic Resonance');--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"attribute_points" double precision NOT NULL,
	"skill_points" double precision NOT NULL,
	"max_starting_skill" double precision NOT NULL,
	"points_to_unlock_next_tier" double precision NOT NULL,
	"max_points_in_skill" double precision NOT NULL,
	"starting_credit_amount" double precision NOT NULL,
	"currency_system" "campaign_currency_system" NOT NULL,
	"fate_point_method" "campaign_fate_point_method" NOT NULL,
	"assigned_fate_points" integer,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_allowed_system" (
	"campaign_id" integer NOT NULL,
	"system" "campaign_system" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_allowed_system_campaign_id_system_pk" PRIMARY KEY("campaign_id","system")
);
--> statement-breakpoint
CREATE TABLE "campaign_derived_currency" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"credits_per_unit" double precision NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_player" (
	"campaign_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"is_npc_controller" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_player_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_allowed_system" ADD CONSTRAINT "campaign_allowed_system_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_derived_currency" ADD CONSTRAINT "campaign_derived_currency_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_player" ADD CONSTRAINT "campaign_player_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_player" ADD CONSTRAINT "campaign_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_created_by_user_id_idx" ON "campaign" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "campaign_allowed_system_campaign_id_idx" ON "campaign_allowed_system" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_derived_currency_campaign_id_idx" ON "campaign_derived_currency" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_player_user_id_idx" ON "campaign_player" USING btree ("user_id");