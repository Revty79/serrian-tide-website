CREATE TYPE "public"."derived_ability_acquisition_type" AS ENUM('automatic', 'learned', 'awarded');--> statement-breakpoint
CREATE TYPE "public"."derived_ability_activation_type" AS ENUM('passive', 'activated', 'reaction', 'triggered');--> statement-breakpoint
CREATE TYPE "public"."derived_ability_requirement_scope" AS ENUM('acquisition', 'live');--> statement-breakpoint
CREATE TABLE "derived_ability_cost" (
	"id" serial PRIMARY KEY NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"cost_type" text NOT NULL,
	"amount" double precision NOT NULL,
	"resource_key" text,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_cost_type_nonblank" CHECK (length(trim("derived_ability_cost"."cost_type")) > 0),
	CONSTRAINT "derived_ability_cost_amount_positive" CHECK ("derived_ability_cost"."amount" > 0),
	CONSTRAINT "derived_ability_cost_resource_key_nonblank" CHECK ("derived_ability_cost"."resource_key" IS NULL OR length(trim("derived_ability_cost"."resource_key")) > 0),
	CONSTRAINT "derived_ability_cost_order_valid" CHECK ("derived_ability_cost"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "derived_ability_requirement" (
	"id" serial PRIMARY KEY NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"requirement_scope" "derived_ability_requirement_scope" NOT NULL,
	"requirement_type" text NOT NULL,
	"group_number" integer DEFAULT 0 NOT NULL,
	"attribute_key" text,
	"skill_id" integer,
	"required_derived_ability_id" integer,
	"operator" text,
	"required_value" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_requirement_type_nonblank" CHECK (length(trim("derived_ability_requirement"."requirement_type")) > 0),
	CONSTRAINT "derived_ability_requirement_group_valid" CHECK ("derived_ability_requirement"."group_number" >= 0),
	CONSTRAINT "derived_ability_requirement_attribute_nonblank" CHECK ("derived_ability_requirement"."attribute_key" IS NULL OR length(trim("derived_ability_requirement"."attribute_key")) > 0),
	CONSTRAINT "derived_ability_requirement_operator_nonblank" CHECK ("derived_ability_requirement"."operator" IS NULL OR length(trim("derived_ability_requirement"."operator")) > 0),
	CONSTRAINT "derived_ability_requirement_not_self" CHECK ("derived_ability_requirement"."required_derived_ability_id" IS NULL OR "derived_ability_requirement"."required_derived_ability_id" <> "derived_ability_requirement"."derived_ability_id"),
	CONSTRAINT "derived_ability_requirement_order_valid" CHECK ("derived_ability_requirement"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "derived_ability_use_condition" (
	"id" serial PRIMARY KEY NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"condition_type" text NOT NULL,
	"condition_key" text,
	"operator" text,
	"numeric_value" double precision,
	"text_value" text,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_use_condition_type_nonblank" CHECK (length(trim("derived_ability_use_condition"."condition_type")) > 0),
	CONSTRAINT "derived_ability_use_condition_key_nonblank" CHECK ("derived_ability_use_condition"."condition_key" IS NULL OR length(trim("derived_ability_use_condition"."condition_key")) > 0),
	CONSTRAINT "derived_ability_use_condition_operator_nonblank" CHECK ("derived_ability_use_condition"."operator" IS NULL OR length(trim("derived_ability_use_condition"."operator")) > 0),
	CONSTRAINT "derived_ability_use_condition_text_value_nonblank" CHECK ("derived_ability_use_condition"."text_value" IS NULL OR length(trim("derived_ability_use_condition"."text_value")) > 0),
	CONSTRAINT "derived_ability_use_condition_order_valid" CHECK ("derived_ability_use_condition"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "derived_ability_use_limit" (
	"id" serial PRIMARY KEY NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"maximum_uses" integer NOT NULL,
	"refresh_scope" text NOT NULL,
	"refresh_key" text,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_use_limit_maximum_positive" CHECK ("derived_ability_use_limit"."maximum_uses" > 0),
	CONSTRAINT "derived_ability_use_limit_refresh_scope_nonblank" CHECK (length(trim("derived_ability_use_limit"."refresh_scope")) > 0),
	CONSTRAINT "derived_ability_use_limit_refresh_key_nonblank" CHECK ("derived_ability_use_limit"."refresh_key" IS NULL OR length(trim("derived_ability_use_limit"."refresh_key")) > 0),
	CONSTRAINT "derived_ability_use_limit_order_valid" CHECK ("derived_ability_use_limit"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "derived_ability" ADD COLUMN "acquisition_type" "derived_ability_acquisition_type" DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD COLUMN "activation_type" "derived_ability_activation_type" DEFAULT 'passive' NOT NULL;--> statement-breakpoint
ALTER TABLE "derived_ability_cost" ADD CONSTRAINT "derived_ability_cost_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability_requirement" ADD CONSTRAINT "derived_ability_requirement_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability_requirement" ADD CONSTRAINT "derived_ability_requirement_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability_requirement" ADD CONSTRAINT "derived_ability_requirement_required_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("required_derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability_use_condition" ADD CONSTRAINT "derived_ability_use_condition_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability_use_limit" ADD CONSTRAINT "derived_ability_use_limit_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "derived_ability_cost_ability_idx" ON "derived_ability_cost" USING btree ("derived_ability_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_cost_order_uq" ON "derived_ability_cost" USING btree ("derived_ability_id","sort_order");--> statement-breakpoint
CREATE INDEX "derived_ability_requirement_ability_idx" ON "derived_ability_requirement" USING btree ("derived_ability_id","requirement_scope","group_number","sort_order","id");--> statement-breakpoint
CREATE INDEX "derived_ability_requirement_skill_idx" ON "derived_ability_requirement" USING btree ("skill_id","derived_ability_id");--> statement-breakpoint
CREATE INDEX "derived_ability_requirement_prerequisite_idx" ON "derived_ability_requirement" USING btree ("required_derived_ability_id","derived_ability_id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_requirement_order_uq" ON "derived_ability_requirement" USING btree ("derived_ability_id","requirement_scope","group_number","sort_order");--> statement-breakpoint
CREATE INDEX "derived_ability_use_condition_ability_idx" ON "derived_ability_use_condition" USING btree ("derived_ability_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_use_condition_order_uq" ON "derived_ability_use_condition" USING btree ("derived_ability_id","sort_order");--> statement-breakpoint
CREATE INDEX "derived_ability_use_limit_ability_idx" ON "derived_ability_use_limit" USING btree ("derived_ability_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_use_limit_order_uq" ON "derived_ability_use_limit" USING btree ("derived_ability_id","sort_order");