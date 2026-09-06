CREATE TYPE "public"."shop_commerce_operation_kind" AS ENUM('submit-purchase', 'submit-sale', 'god-purchase', 'approve-request', 'reject-request', 'accept-terms', 'cancel-request', 'give-money', 'character-balance-correction', 'shop-balance-correction');--> statement-breakpoint
CREATE TYPE "public"."shop_money_event_kind" AS ENUM('purchase-character-debit', 'purchase-shop-credit', 'sale-shop-debit', 'sale-character-credit', 'grant-character-credit', 'character-balance-correction', 'shop-balance-correction');--> statement-breakpoint
CREATE TYPE "public"."shop_resale_instance_status" AS ENUM('in-stock', 'sold');--> statement-breakpoint
CREATE TYPE "public"."shop_transaction_kind" AS ENUM('purchase', 'sale');--> statement-breakpoint
CREATE TYPE "public"."shop_transaction_request_kind" AS ENUM('purchase', 'sale');--> statement-breakpoint
CREATE TYPE "public"."shop_transaction_request_status" AS ENUM('pending', 'owner-review', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "shop_commerce_operation" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"actor_user_id" text NOT NULL,
	"submission_key" text NOT NULL,
	"intent_hash" text NOT NULL,
	"kind" "shop_commerce_operation_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_commerce_operation_actor_submission_uq" UNIQUE("actor_user_id","submission_key"),
	CONSTRAINT "shop_commerce_operation_submission_nonblank" CHECK (length(trim("shop_commerce_operation"."submission_key")) > 0 AND length("shop_commerce_operation"."submission_key") <= 160),
	CONSTRAINT "shop_commerce_operation_hash_nonblank" CHECK (length(trim("shop_commerce_operation"."intent_hash")) > 0 AND length("shop_commerce_operation"."intent_hash") <= 128)
);
--> statement-breakpoint
CREATE TABLE "shop_money_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"operation_id" integer NOT NULL,
	"transaction_id" integer,
	"campaign_id" integer NOT NULL,
	"character_id" integer,
	"shop_id" integer,
	"kind" "shop_money_event_kind" NOT NULL,
	"amount_credits" double precision NOT NULL,
	"balance_before_credits" double precision NOT NULL,
	"balance_after_credits" double precision NOT NULL,
	"reason" text NOT NULL,
	"currency_snapshot_json" jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_money_event_operation_kind_uq" UNIQUE("operation_id","kind"),
	CONSTRAINT "shop_money_event_owner_valid" CHECK ("shop_money_event"."character_id" IS NOT NULL OR "shop_money_event"."shop_id" IS NOT NULL),
	CONSTRAINT "shop_money_event_balances_valid" CHECK ("shop_money_event"."balance_before_credits" >= 0 AND "shop_money_event"."balance_after_credits" >= 0),
	CONSTRAINT "shop_money_event_amount_finite" CHECK ("shop_money_event"."amount_credits" <> 'Infinity'::float8 AND "shop_money_event"."amount_credits" <> '-Infinity'::float8 AND "shop_money_event"."amount_credits" = "shop_money_event"."amount_credits"),
	CONSTRAINT "shop_money_event_reason_valid" CHECK (length(trim("shop_money_event"."reason")) > 0 AND length("shop_money_event"."reason") <= 1000),
	CONSTRAINT "shop_money_event_currency_snapshot_object" CHECK (jsonb_typeof("shop_money_event"."currency_snapshot_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "shop_resale_item_instance" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"source_character_id" integer NOT NULL,
	"source_item_instance_id" integer NOT NULL,
	"acquired_transaction_id" integer NOT NULL,
	"sold_transaction_id" integer,
	"status" "shop_resale_instance_status" DEFAULT 'in-stock' NOT NULL,
	"current_charges" integer NOT NULL,
	"state_snapshot_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_resale_item_instance_source_uq" UNIQUE("source_item_instance_id"),
	CONSTRAINT "shop_resale_item_instance_charges_valid" CHECK ("shop_resale_item_instance"."current_charges" >= 0),
	CONSTRAINT "shop_resale_item_instance_state_snapshot_object" CHECK (jsonb_typeof("shop_resale_item_instance"."state_snapshot_json") = 'object'),
	CONSTRAINT "shop_resale_item_instance_lifecycle_valid" CHECK (("shop_resale_item_instance"."status" = 'in-stock' AND "shop_resale_item_instance"."sold_transaction_id" IS NULL) OR ("shop_resale_item_instance"."status" = 'sold' AND "shop_resale_item_instance"."sold_transaction_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shop_transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"execution_operation_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"kind" "shop_transaction_kind" NOT NULL,
	"total_credits" double precision NOT NULL,
	"currency_system_snapshot" text NOT NULL,
	"currency_snapshot_json" jsonb NOT NULL,
	"policy_snapshot_json" jsonb NOT NULL,
	"narrative_note" text DEFAULT '' NOT NULL,
	"transaction_override" boolean DEFAULT false NOT NULL,
	"transaction_override_reason" text DEFAULT '' NOT NULL,
	"completed_by_user_id" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_transaction_request_uq" UNIQUE("request_id"),
	CONSTRAINT "shop_transaction_execution_operation_uq" UNIQUE("execution_operation_id"),
	CONSTRAINT "shop_transaction_scope_uq" UNIQUE("id","campaign_id","shop_id","character_id"),
	CONSTRAINT "shop_transaction_total_valid" CHECK ("shop_transaction"."total_credits" >= 0),
	CONSTRAINT "shop_transaction_currency_system_valid" CHECK ("shop_transaction"."currency_system_snapshot" IN ('Credits','Derived Currency')),
	CONSTRAINT "shop_transaction_currency_snapshot_object" CHECK (jsonb_typeof("shop_transaction"."currency_snapshot_json") = 'object'),
	CONSTRAINT "shop_transaction_policy_snapshot_object" CHECK (jsonb_typeof("shop_transaction"."policy_snapshot_json") = 'object'),
	CONSTRAINT "shop_transaction_note_length_valid" CHECK (length("shop_transaction"."narrative_note") <= 1000),
	CONSTRAINT "shop_transaction_override_valid" CHECK (("shop_transaction"."transaction_override" = false AND "shop_transaction"."transaction_override_reason" = '') OR ("shop_transaction"."transaction_override" = true AND length(trim("shop_transaction"."transaction_override_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "shop_transaction_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"request_line_id" integer NOT NULL,
	"offering_id" integer,
	"item_id" integer NOT NULL,
	"source_item_instance_id" integer,
	"acquired_item_instance_id" integer,
	"fulfillment_kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_credits" double precision NOT NULL,
	"total_credits" double precision NOT NULL,
	"item_canonical_id_snapshot" text NOT NULL,
	"item_name_snapshot" text NOT NULL,
	"ownership_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shop_transaction_line_request_line_uq" UNIQUE("request_line_id"),
	CONSTRAINT "shop_transaction_line_order_uq" UNIQUE("transaction_id","sort_order"),
	CONSTRAINT "shop_transaction_line_fulfillment_valid" CHECK ("shop_transaction_line"."fulfillment_kind" IN ('inventory-transfer','service-narrative')),
	CONSTRAINT "shop_transaction_line_quantity_valid" CHECK ("shop_transaction_line"."quantity" > 0),
	CONSTRAINT "shop_transaction_line_price_valid" CHECK ("shop_transaction_line"."unit_price_credits" >= 0 AND "shop_transaction_line"."total_credits" >= 0),
	CONSTRAINT "shop_transaction_line_identity_nonblank" CHECK (length(trim("shop_transaction_line"."item_canonical_id_snapshot")) > 0 AND length(trim("shop_transaction_line"."item_name_snapshot")) > 0),
	CONSTRAINT "shop_transaction_line_ownership_snapshot_object" CHECK (jsonb_typeof("shop_transaction_line"."ownership_snapshot_json") = 'object'),
	CONSTRAINT "shop_transaction_line_sort_valid" CHECK ("shop_transaction_line"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shop_transaction_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"visit_id" integer,
	"visit_member_id" integer,
	"origin_operation_id" integer NOT NULL,
	"kind" "shop_transaction_request_kind" NOT NULL,
	"status" "shop_transaction_request_status" DEFAULT 'pending' NOT NULL,
	"terms_version" integer DEFAULT 1 NOT NULL,
	"owner_accepted_terms_version" integer,
	"god_approved_terms_version" integer,
	"requested_by_user_id" text NOT NULL,
	"resolved_by_user_id" text,
	"transaction_override" boolean DEFAULT false NOT NULL,
	"transaction_override_reason" text DEFAULT '' NOT NULL,
	"narrative_note" text DEFAULT '' NOT NULL,
	"resolution_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "shop_transaction_request_origin_operation_uq" UNIQUE("origin_operation_id"),
	CONSTRAINT "shop_transaction_request_scope_uq" UNIQUE("id","campaign_id","shop_id","character_id"),
	CONSTRAINT "shop_transaction_request_terms_version_valid" CHECK ("shop_transaction_request"."terms_version" > 0 AND ("shop_transaction_request"."owner_accepted_terms_version" IS NULL OR "shop_transaction_request"."owner_accepted_terms_version" > 0) AND ("shop_transaction_request"."god_approved_terms_version" IS NULL OR "shop_transaction_request"."god_approved_terms_version" > 0)),
	CONSTRAINT "shop_transaction_request_visit_identity_valid" CHECK (("shop_transaction_request"."visit_id" IS NULL AND "shop_transaction_request"."visit_member_id" IS NULL) OR ("shop_transaction_request"."visit_id" IS NOT NULL AND "shop_transaction_request"."visit_member_id" IS NOT NULL)),
	CONSTRAINT "shop_transaction_request_override_valid" CHECK (("shop_transaction_request"."transaction_override" = false AND "shop_transaction_request"."transaction_override_reason" = '') OR ("shop_transaction_request"."transaction_override" = true AND length(trim("shop_transaction_request"."transaction_override_reason")) > 0)),
	CONSTRAINT "shop_transaction_request_text_lengths_valid" CHECK (length("shop_transaction_request"."transaction_override_reason") <= 1000 AND length("shop_transaction_request"."narrative_note") <= 1000 AND length("shop_transaction_request"."resolution_reason") <= 1000),
	CONSTRAINT "shop_transaction_request_lifecycle_valid" CHECK (("shop_transaction_request"."status" IN ('pending','owner-review') AND "shop_transaction_request"."resolved_at" IS NULL AND "shop_transaction_request"."resolved_by_user_id" IS NULL AND "shop_transaction_request"."resolution_reason" = '') OR ("shop_transaction_request"."status" IN ('completed','rejected','cancelled') AND "shop_transaction_request"."resolved_at" IS NOT NULL AND "shop_transaction_request"."resolved_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shop_transaction_request_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"offering_id" integer,
	"item_id" integer NOT NULL,
	"item_instance_id" integer,
	"fulfillment_kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"quoted_unit_price_credits" double precision NOT NULL,
	"current_unit_price_credits" double precision NOT NULL,
	"item_canonical_id_snapshot" text NOT NULL,
	"item_name_snapshot" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shop_transaction_request_line_order_uq" UNIQUE("request_id","sort_order"),
	CONSTRAINT "shop_transaction_request_line_fulfillment_valid" CHECK ("shop_transaction_request_line"."fulfillment_kind" IN ('inventory-transfer','service-narrative')),
	CONSTRAINT "shop_transaction_request_line_quantity_valid" CHECK ("shop_transaction_request_line"."quantity" > 0 AND ("shop_transaction_request_line"."item_instance_id" IS NULL OR "shop_transaction_request_line"."quantity" = 1)),
	CONSTRAINT "shop_transaction_request_line_prices_valid" CHECK ("shop_transaction_request_line"."quoted_unit_price_credits" >= 0 AND "shop_transaction_request_line"."current_unit_price_credits" >= 0),
	CONSTRAINT "shop_transaction_request_line_identity_nonblank" CHECK (length(trim("shop_transaction_request_line"."item_canonical_id_snapshot")) > 0 AND length(trim("shop_transaction_request_line"."item_name_snapshot")) > 0),
	CONSTRAINT "shop_transaction_request_line_sort_valid" CHECK ("shop_transaction_request_line"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD COLUMN "provenance_source_instance_id" integer;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD COLUMN "retired_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD COLUMN "retirement_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_character_profile" ADD COLUMN "commerce_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop" ADD COLUMN "commerce_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_offering" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_commerce_operation" ADD CONSTRAINT "shop_commerce_operation_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_commerce_operation" ADD CONSTRAINT "shop_commerce_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_money_event" ADD CONSTRAINT "shop_money_event_operation_id_shop_commerce_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."shop_commerce_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_money_event" ADD CONSTRAINT "shop_money_event_transaction_id_shop_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."shop_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_money_event" ADD CONSTRAINT "shop_money_event_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_money_event" ADD CONSTRAINT "shop_money_event_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_money_event" ADD CONSTRAINT "shop_money_event_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_money_event" ADD CONSTRAINT "shop_money_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_item_instance" ADD CONSTRAINT "shop_resale_item_instance_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_item_instance" ADD CONSTRAINT "shop_resale_item_instance_source_item_instance_id_campaign_character_item_instance_id_fk" FOREIGN KEY ("source_item_instance_id") REFERENCES "public"."campaign_character_item_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_item_instance" ADD CONSTRAINT "shop_resale_item_instance_acquired_transaction_id_shop_transaction_id_fk" FOREIGN KEY ("acquired_transaction_id") REFERENCES "public"."shop_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_item_instance" ADD CONSTRAINT "shop_resale_item_instance_sold_transaction_id_shop_transaction_id_fk" FOREIGN KEY ("sold_transaction_id") REFERENCES "public"."shop_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_item_instance" ADD CONSTRAINT "shop_resale_item_instance_shop_campaign_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_resale_item_instance" ADD CONSTRAINT "shop_resale_item_instance_character_campaign_fk" FOREIGN KEY ("source_character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction" ADD CONSTRAINT "shop_transaction_request_id_shop_transaction_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."shop_transaction_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction" ADD CONSTRAINT "shop_transaction_execution_operation_id_shop_commerce_operation_id_fk" FOREIGN KEY ("execution_operation_id") REFERENCES "public"."shop_commerce_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction" ADD CONSTRAINT "shop_transaction_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction" ADD CONSTRAINT "shop_transaction_request_scope_fk" FOREIGN KEY ("request_id","campaign_id","shop_id","character_id") REFERENCES "public"."shop_transaction_request"("id","campaign_id","shop_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_line" ADD CONSTRAINT "shop_transaction_line_transaction_id_shop_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."shop_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_line" ADD CONSTRAINT "shop_transaction_line_request_line_id_shop_transaction_request_line_id_fk" FOREIGN KEY ("request_line_id") REFERENCES "public"."shop_transaction_request_line"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_line" ADD CONSTRAINT "shop_transaction_line_offering_id_shop_offering_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."shop_offering"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_line" ADD CONSTRAINT "shop_transaction_line_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_line" ADD CONSTRAINT "shop_transaction_line_source_item_instance_id_campaign_character_item_instance_id_fk" FOREIGN KEY ("source_item_instance_id") REFERENCES "public"."campaign_character_item_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_line" ADD CONSTRAINT "shop_transaction_line_acquired_item_instance_id_campaign_character_item_instance_id_fk" FOREIGN KEY ("acquired_item_instance_id") REFERENCES "public"."campaign_character_item_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request" ADD CONSTRAINT "shop_transaction_request_visit_id_campaign_session_scene_shop_visit_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."campaign_session_scene_shop_visit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request" ADD CONSTRAINT "shop_transaction_request_visit_member_id_campaign_session_scene_shop_visit_member_id_fk" FOREIGN KEY ("visit_member_id") REFERENCES "public"."campaign_session_scene_shop_visit_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request" ADD CONSTRAINT "shop_transaction_request_origin_operation_id_shop_commerce_operation_id_fk" FOREIGN KEY ("origin_operation_id") REFERENCES "public"."shop_commerce_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request" ADD CONSTRAINT "shop_transaction_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request" ADD CONSTRAINT "shop_transaction_request_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request" ADD CONSTRAINT "shop_transaction_request_shop_campaign_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."shop"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request" ADD CONSTRAINT "shop_transaction_request_character_campaign_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_transaction_request_line_request_id_shop_transaction_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."shop_transaction_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_transaction_request_line_offering_id_shop_offering_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."shop_offering"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_transaction_request_line_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_transaction_request_line" ADD CONSTRAINT "shop_transaction_request_line_item_instance_id_campaign_character_item_instance_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."campaign_character_item_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_commerce_operation_campaign_history_idx" ON "shop_commerce_operation" USING btree ("campaign_id","created_at","id");--> statement-breakpoint
CREATE INDEX "shop_money_event_character_history_idx" ON "shop_money_event" USING btree ("character_id","created_at","id");--> statement-breakpoint
CREATE INDEX "shop_money_event_shop_history_idx" ON "shop_money_event" USING btree ("shop_id","created_at","id");--> statement-breakpoint
CREATE INDEX "shop_resale_item_instance_stock_idx" ON "shop_resale_item_instance" USING btree ("shop_id","item_id","status","id");--> statement-breakpoint
CREATE INDEX "shop_transaction_shop_history_idx" ON "shop_transaction" USING btree ("shop_id","completed_at","id");--> statement-breakpoint
CREATE INDEX "shop_transaction_character_history_idx" ON "shop_transaction" USING btree ("character_id","completed_at","id");--> statement-breakpoint
CREATE INDEX "shop_transaction_line_item_idx" ON "shop_transaction_line" USING btree ("item_id","transaction_id");--> statement-breakpoint
CREATE INDEX "shop_transaction_line_source_instance_idx" ON "shop_transaction_line" USING btree ("source_item_instance_id");--> statement-breakpoint
CREATE INDEX "shop_transaction_line_acquired_instance_idx" ON "shop_transaction_line" USING btree ("acquired_item_instance_id");--> statement-breakpoint
CREATE INDEX "shop_transaction_request_shop_status_idx" ON "shop_transaction_request" USING btree ("shop_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "shop_transaction_request_character_status_idx" ON "shop_transaction_request" USING btree ("character_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "shop_transaction_request_visit_status_idx" ON "shop_transaction_request" USING btree ("visit_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "shop_transaction_request_line_item_idx" ON "shop_transaction_request_line" USING btree ("item_id","request_id");--> statement-breakpoint
CREATE INDEX "shop_transaction_request_line_instance_idx" ON "shop_transaction_request_line" USING btree ("item_instance_id");--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "campaign_character_item_instance_provenance_source_instance_id_campaign_character_item_instance_id_fk" FOREIGN KEY ("provenance_source_instance_id") REFERENCES "public"."campaign_character_item_instance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_character_item_instance_provenance_idx" ON "campaign_character_item_instance" USING btree ("provenance_source_instance_id");--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "campaign_character_item_instance_retirement_valid" CHECK (("campaign_character_item_instance"."retired_at" IS NULL AND "campaign_character_item_instance"."retirement_reason" = '') OR ("campaign_character_item_instance"."retired_at" IS NOT NULL AND length(trim("campaign_character_item_instance"."retirement_reason")) > 0));--> statement-breakpoint
ALTER TABLE "campaign_character_item_instance" ADD CONSTRAINT "campaign_character_item_instance_retirement_reason_length_valid" CHECK (length("campaign_character_item_instance"."retirement_reason") <= 1000);--> statement-breakpoint
ALTER TABLE "campaign_character_profile" ADD CONSTRAINT "campaign_character_profile_commerce_version_valid" CHECK ("campaign_character_profile"."commerce_version" >= 0);--> statement-breakpoint
ALTER TABLE "shop" ADD CONSTRAINT "shop_commerce_version_valid" CHECK ("shop"."commerce_version" >= 0);--> statement-breakpoint
ALTER TABLE "shop_offering" ADD CONSTRAINT "shop_offering_version_valid" CHECK ("shop_offering"."version" >= 0);