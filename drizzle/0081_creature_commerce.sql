CREATE TABLE "item_creature_grant" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_resale_creature" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"creature_character_id" integer NOT NULL,
	"source_character_id" integer NOT NULL,
	"acquired_transaction_id" integer NOT NULL,
	"sold_transaction_id" integer,
	"status" text DEFAULT 'in-stock' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_resale_creature_lifecycle_valid" CHECK (("shop_resale_creature"."status" = 'in-stock' AND "shop_resale_creature"."sold_transaction_id" IS NULL) OR ("shop_resale_creature"."status" = 'sold' AND "shop_resale_creature"."sold_transaction_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shop_transaction_creature" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"transaction_line_id" integer NOT NULL,
	"creature_character_id" integer NOT NULL,
	"creature_id" integer NOT NULL,
	"name_snapshot" text NOT NULL,
	CONSTRAINT "shop_transaction_creature_line_individual_uq" UNIQUE("transaction_line_id","creature_character_id"),
	CONSTRAINT "shop_transaction_creature_name_valid" CHECK (length(trim("shop_transaction_creature"."name_snapshot")) > 0)
);
--> statement-breakpoint
ALTER TABLE "shop_transaction_line" DROP CONSTRAINT "shop_transaction_line_fulfillment_valid";--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" DROP CONSTRAINT "shop_transaction_request_line_fulfillment_valid";--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD COLUMN "granted_creature_id" integer;--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD COLUMN "creature_character_id" integer;--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD COLUMN "resale_creature_id" integer;--> statement-breakpoint
ALTER TABLE "item_creature_grant" ADD CONSTRAINT "item_creature_grant_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_creature_grant" ADD CONSTRAINT "item_creature_grant_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_creature" ADD CONSTRAINT "shop_resale_creature_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_creature" ADD CONSTRAINT "shop_resale_creature_acquired_transaction_id_shop_transaction_id_fk" FOREIGN KEY ("acquired_transaction_id") REFERENCES "public"."shop_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_creature" ADD CONSTRAINT "shop_resale_creature_sold_transaction_id_shop_transaction_id_fk" FOREIGN KEY ("sold_transaction_id") REFERENCES "public"."shop_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_creature" ADD CONSTRAINT "shop_resale_creature_shop_campaign_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_creature" ADD CONSTRAINT "shop_resale_creature_individual_campaign_fk" FOREIGN KEY ("creature_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_creature" ADD CONSTRAINT "shop_resale_creature_seller_campaign_fk" FOREIGN KEY ("source_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_creature" ADD CONSTRAINT "shop_transaction_creature_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_creature" ADD CONSTRAINT "shop_transaction_creature_transaction_line_id_shop_transaction_line_id_fk" FOREIGN KEY ("transaction_line_id") REFERENCES "public"."shop_transaction_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_creature" ADD CONSTRAINT "shop_transaction_creature_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_creature" ADD CONSTRAINT "shop_transaction_creature_campaign_fk" FOREIGN KEY ("creature_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_creature_grant_creature_idx" ON "item_creature_grant" USING btree ("creature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_resale_creature_active_individual_uq" ON "shop_resale_creature" USING btree ("creature_character_id") WHERE "shop_resale_creature"."status" = 'in-stock';--> statement-breakpoint
CREATE INDEX "shop_resale_creature_stock_idx" ON "shop_resale_creature" USING btree ("shop_id","item_id","status");--> statement-breakpoint
CREATE INDEX "shop_transaction_creature_individual_idx" ON "shop_transaction_creature" USING btree ("creature_character_id");--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_transaction_request_line_granted_creature_id_creatures_id_fk" FOREIGN KEY ("granted_creature_id") REFERENCES "public"."creatures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_transaction_request_line_creature_character_id_campaign_character_id_fk" FOREIGN KEY ("creature_character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_transaction_request_line_resale_creature_id_shop_resale_creature_id_fk" FOREIGN KEY ("resale_creature_id") REFERENCES "public"."shop_resale_creature"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_request_line_creature_idx" ON "shop_transaction_request_line" USING btree ("creature_character_id");--> statement-breakpoint
ALTER TABLE "shop_transaction_line" ADD CONSTRAINT "shop_transaction_line_fulfillment_valid" CHECK ("shop_transaction_line"."fulfillment_kind" IN ('inventory-transfer','service-narrative','creature-transfer'));--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_request_line_creature_valid" CHECK ((
      ("shop_transaction_request_line"."fulfillment_kind" = 'creature-transfer' AND "shop_transaction_request_line"."granted_creature_id" IS NOT NULL AND "shop_transaction_request_line"."item_instance_id" IS NULL)
      OR ("shop_transaction_request_line"."fulfillment_kind" <> 'creature-transfer' AND "shop_transaction_request_line"."granted_creature_id" IS NULL AND "shop_transaction_request_line"."creature_character_id" IS NULL AND "shop_transaction_request_line"."resale_creature_id" IS NULL)
    ) AND ("shop_transaction_request_line"."creature_character_id" IS NULL OR "shop_transaction_request_line"."quantity" = 1)
      AND ("shop_transaction_request_line"."resale_creature_id" IS NULL OR "shop_transaction_request_line"."creature_character_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_transaction_request_line_fulfillment_valid" CHECK ("shop_transaction_request_line"."fulfillment_kind" IN ('inventory-transfer','service-narrative','creature-transfer'));