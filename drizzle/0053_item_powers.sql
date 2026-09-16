CREATE TABLE "item_powers" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"trigger" text NOT NULL,
	"activation_label" text DEFAULT 'Activate' NOT NULL,
	"initiative_cost" double precision,
	"resource_cost_kind" text DEFAULT 'none' NOT NULL,
	"resource_cost_amount" integer,
	"required_equipment_state" text,
	"resolution_mode" text DEFAULT 'automatic' NOT NULL,
	"fixed_roll_target" integer,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_powers_name_nonblank" CHECK (length(trim("item_powers"."name")) > 0),
	CONSTRAINT "item_powers_trigger_valid" CHECK ("item_powers"."trigger" IN ('activated','passive','weapon-hit')),
	CONSTRAINT "item_powers_resource_kind_valid" CHECK ("item_powers"."resource_cost_kind" IN ('none','shared-charges','consume-item')),
	CONSTRAINT "item_powers_resolution_valid" CHECK ("item_powers"."resolution_mode" IN ('automatic','weapon-hit','fixed-roll','manual')),
	CONSTRAINT "item_powers_initiative_valid" CHECK ("item_powers"."initiative_cost" IS NULL OR "item_powers"."initiative_cost" >= 0),
	CONSTRAINT "item_powers_resource_amount_valid" CHECK ("item_powers"."resource_cost_amount" IS NULL OR "item_powers"."resource_cost_amount" > 0),
	CONSTRAINT "item_powers_roll_target_valid" CHECK ("item_powers"."fixed_roll_target" IS NULL OR "item_powers"."fixed_roll_target" > 0),
	CONSTRAINT "item_powers_sort_order_valid" CHECK ("item_powers"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_power_effects" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_power_id" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"effect_json" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "item_power_effects_schema_version_valid" CHECK ("item_power_effects"."schema_version" > 0),
	CONSTRAINT "item_power_effects_sort_order_valid" CHECK ("item_power_effects"."sort_order" >= 0),
	CONSTRAINT "item_power_effects_json_object" CHECK (jsonb_typeof("item_power_effects"."effect_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "item_power_sources" (
	"item_power_id" integer PRIMARY KEY NOT NULL,
	"source_kind" text NOT NULL,
	"source_skill_id" integer NOT NULL,
	"source_extension_type" text NOT NULL,
	"source_schema_version" integer NOT NULL,
	"fixed_power_level" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_power_sources_kind_valid" CHECK ("item_power_sources"."source_kind" = 'spell-construction'),
	CONSTRAINT "item_power_sources_extension_valid" CHECK ("item_power_sources"."source_extension_type" = 'spell-construction'),
	CONSTRAINT "item_power_sources_schema_valid" CHECK ("item_power_sources"."source_schema_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "item_powers" ADD CONSTRAINT "item_powers_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_power_effects" ADD CONSTRAINT "item_power_effects_item_power_id_item_powers_id_fk" FOREIGN KEY ("item_power_id") REFERENCES "public"."item_powers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_power_sources" ADD CONSTRAINT "item_power_sources_item_power_id_item_powers_id_fk" FOREIGN KEY ("item_power_id") REFERENCES "public"."item_powers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_power_sources" ADD CONSTRAINT "item_power_sources_source_skill_id_skill_id_fk" FOREIGN KEY ("source_skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "item_powers_item_order_idx" ON "item_powers" USING btree ("item_id","sort_order","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "item_power_effects_order_uq" ON "item_power_effects" USING btree ("item_power_id","sort_order");
--> statement-breakpoint
CREATE INDEX "item_power_effects_power_idx" ON "item_power_effects" USING btree ("item_power_id");
