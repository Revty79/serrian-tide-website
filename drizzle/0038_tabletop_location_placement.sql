CREATE TABLE "campaign_session_prepared_shop" (
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_prepared_shop_session_id_shop_id_pk" PRIMARY KEY("session_id","shop_id"),
	CONSTRAINT "campaign_session_prepared_shop_hierarchy_uq" UNIQUE("session_id","campaign_id","shop_id"),
	CONSTRAINT "campaign_session_prepared_shop_order_valid" CHECK ("campaign_session_prepared_shop"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_prepared_town" (
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"town_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_prepared_town_session_id_town_id_pk" PRIMARY KEY("session_id","town_id"),
	CONSTRAINT "campaign_session_prepared_town_hierarchy_uq" UNIQUE("session_id","campaign_id","town_id"),
	CONSTRAINT "campaign_session_prepared_town_order_valid" CHECK ("campaign_session_prepared_town"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_scene_shop" (
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_shop_scene_id_shop_id_pk" PRIMARY KEY("scene_id","shop_id"),
	CONSTRAINT "campaign_session_scene_shop_order_valid" CHECK ("campaign_session_scene_shop"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_scene_town" (
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"town_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_town_scene_id_town_id_pk" PRIMARY KEY("scene_id","town_id"),
	CONSTRAINT "campaign_session_scene_town_hierarchy_uq" UNIQUE("scene_id","session_id","campaign_id","town_id"),
	CONSTRAINT "campaign_session_scene_town_order_valid" CHECK ("campaign_session_scene_town"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_scene_town_npc" (
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"town_id" integer NOT NULL,
	"npc_character_id" integer NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_town_npc_scene_id_town_id_npc_character_id_pk" PRIMARY KEY("scene_id","town_id","npc_character_id"),
	CONSTRAINT "campaign_session_scene_town_npc_order_valid" CHECK ("campaign_session_scene_town_npc"."sort_order" >= 0),
	CONSTRAINT "campaign_session_scene_town_npc_reveal_valid" CHECK ("campaign_session_scene_town_npc"."included" = true OR "campaign_session_scene_town_npc"."revealed" = false)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_scene_town_place" (
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"town_id" integer NOT NULL,
	"place_id" integer NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_town_place_scene_id_town_id_place_id_pk" PRIMARY KEY("scene_id","town_id","place_id"),
	CONSTRAINT "campaign_session_scene_town_place_order_valid" CHECK ("campaign_session_scene_town_place"."sort_order" >= 0),
	CONSTRAINT "campaign_session_scene_town_place_reveal_valid" CHECK ("campaign_session_scene_town_place"."included" = true OR "campaign_session_scene_town_place"."revealed" = false)
);
--> statement-breakpoint
CREATE TABLE "campaign_session_scene_town_shop" (
	"scene_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"town_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_session_scene_town_shop_scene_id_town_id_shop_id_pk" PRIMARY KEY("scene_id","town_id","shop_id"),
	CONSTRAINT "campaign_session_scene_town_shop_order_valid" CHECK ("campaign_session_scene_town_shop"."sort_order" >= 0),
	CONSTRAINT "campaign_session_scene_town_shop_reveal_valid" CHECK ("campaign_session_scene_town_shop"."included" = true OR "campaign_session_scene_town_shop"."revealed" = false)
);
--> statement-breakpoint
ALTER TABLE "town_place" ADD CONSTRAINT "town_place_id_town_campaign_uq" UNIQUE("id","town_id","campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_session_prepared_shop" ADD CONSTRAINT "campaign_session_prepared_shop_session_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_prepared_shop" ADD CONSTRAINT "campaign_session_prepared_shop_shop_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_prepared_town" ADD CONSTRAINT "campaign_session_prepared_town_session_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_session"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_prepared_town" ADD CONSTRAINT "campaign_session_prepared_town_town_fk" FOREIGN KEY ("town_id","campaign_id") REFERENCES "public"."town"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop" ADD CONSTRAINT "campaign_session_scene_shop_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop" ADD CONSTRAINT "campaign_session_scene_shop_prepared_fk" FOREIGN KEY ("session_id","campaign_id","shop_id") REFERENCES "public"."campaign_session_prepared_shop"("session_id","campaign_id","shop_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_shop" ADD CONSTRAINT "campaign_session_scene_shop_source_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town" ADD CONSTRAINT "campaign_session_scene_town_scene_fk" FOREIGN KEY ("scene_id","session_id","campaign_id") REFERENCES "public"."campaign_session_scene"("id","session_id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town" ADD CONSTRAINT "campaign_session_scene_town_prepared_fk" FOREIGN KEY ("session_id","campaign_id","town_id") REFERENCES "public"."campaign_session_prepared_town"("session_id","campaign_id","town_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town" ADD CONSTRAINT "campaign_session_scene_town_source_fk" FOREIGN KEY ("town_id","campaign_id") REFERENCES "public"."town"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town_npc" ADD CONSTRAINT "campaign_session_scene_town_npc_placement_fk" FOREIGN KEY ("scene_id","session_id","campaign_id","town_id") REFERENCES "public"."campaign_session_scene_town"("scene_id","session_id","campaign_id","town_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town_npc" ADD CONSTRAINT "campaign_session_scene_town_npc_source_fk" FOREIGN KEY ("npc_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town_place" ADD CONSTRAINT "campaign_session_scene_town_place_placement_fk" FOREIGN KEY ("scene_id","session_id","campaign_id","town_id") REFERENCES "public"."campaign_session_scene_town"("scene_id","session_id","campaign_id","town_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town_place" ADD CONSTRAINT "campaign_session_scene_town_place_source_fk" FOREIGN KEY ("place_id","town_id","campaign_id") REFERENCES "public"."town_place"("id","town_id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town_shop" ADD CONSTRAINT "campaign_session_scene_town_shop_placement_fk" FOREIGN KEY ("scene_id","session_id","campaign_id","town_id") REFERENCES "public"."campaign_session_scene_town"("scene_id","session_id","campaign_id","town_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_session_scene_town_shop" ADD CONSTRAINT "campaign_session_scene_town_shop_source_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_session_prepared_shop_order_idx" ON "campaign_session_prepared_shop" USING btree ("session_id","sort_order","shop_id");--> statement-breakpoint
CREATE INDEX "campaign_session_prepared_shop_source_idx" ON "campaign_session_prepared_shop" USING btree ("shop_id","session_id");--> statement-breakpoint
CREATE INDEX "campaign_session_prepared_town_order_idx" ON "campaign_session_prepared_town" USING btree ("session_id","sort_order","town_id");--> statement-breakpoint
CREATE INDEX "campaign_session_prepared_town_source_idx" ON "campaign_session_prepared_town" USING btree ("town_id","session_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_shop_order_idx" ON "campaign_session_scene_shop" USING btree ("scene_id","sort_order","shop_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_shop_source_idx" ON "campaign_session_scene_shop" USING btree ("shop_id","scene_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_town_order_idx" ON "campaign_session_scene_town" USING btree ("scene_id","sort_order","town_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_town_source_idx" ON "campaign_session_scene_town" USING btree ("town_id","scene_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_town_npc_order_idx" ON "campaign_session_scene_town_npc" USING btree ("scene_id","town_id","sort_order","npc_character_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_town_npc_source_idx" ON "campaign_session_scene_town_npc" USING btree ("npc_character_id","scene_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_town_place_order_idx" ON "campaign_session_scene_town_place" USING btree ("scene_id","town_id","sort_order","place_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_town_place_source_idx" ON "campaign_session_scene_town_place" USING btree ("place_id","scene_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_town_shop_order_idx" ON "campaign_session_scene_town_shop" USING btree ("scene_id","town_id","sort_order","shop_id");--> statement-breakpoint
CREATE INDEX "campaign_session_scene_town_shop_source_idx" ON "campaign_session_scene_town_shop" USING btree ("shop_id","scene_id");
