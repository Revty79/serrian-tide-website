CREATE TABLE "campaign_allowed_derived_ability" (
	"campaign_id" integer NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_allowed_derived_ability_campaign_id_derived_ability_id_pk" PRIMARY KEY("campaign_id","derived_ability_id"),
	CONSTRAINT "campaign_allowed_derived_ability_order_valid" CHECK ("campaign_allowed_derived_ability"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "derived_ability" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"mechanical_effect" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"source_system" text,
	"source_external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_name_nonblank" CHECK (length(trim("derived_ability"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "derived_ability_trigger" (
	"id" serial PRIMARY KEY NOT NULL,
	"derived_ability_id" integer NOT NULL,
	"trigger_type" text NOT NULL,
	"attribute_key" text,
	"minimum_score" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "derived_ability_trigger_type_v1" CHECK ("derived_ability_trigger"."trigger_type" = 'attribute'),
	CONSTRAINT "derived_ability_trigger_attribute_key_v1" CHECK ("derived_ability_trigger"."attribute_key" IS NOT NULL AND "derived_ability_trigger"."attribute_key" IN ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHR')),
	CONSTRAINT "derived_ability_trigger_minimum_score_v1" CHECK ("derived_ability_trigger"."minimum_score" IS NOT NULL AND "derived_ability_trigger"."minimum_score" >= 0),
	CONSTRAINT "derived_ability_trigger_order_valid" CHECK ("derived_ability_trigger"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_allowed_derived_ability" ADD CONSTRAINT "campaign_allowed_derived_ability_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_allowed_derived_ability" ADD CONSTRAINT "campaign_allowed_derived_ability_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD CONSTRAINT "derived_ability_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability_trigger" ADD CONSTRAINT "derived_ability_trigger_derived_ability_id_derived_ability_id_fk" FOREIGN KEY ("derived_ability_id") REFERENCES "public"."derived_ability"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_allowed_derived_ability_order_uq" ON "campaign_allowed_derived_ability" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE INDEX "campaign_allowed_derived_ability_ability_idx" ON "campaign_allowed_derived_ability" USING btree ("derived_ability_id","campaign_id");--> statement-breakpoint
CREATE INDEX "derived_ability_name_idx" ON "derived_ability" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "derived_ability_created_by_user_idx" ON "derived_ability" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_source_identity_uq" ON "derived_ability" USING btree ("source_system","source_external_id") WHERE "derived_ability"."source_system" IS NOT NULL AND "derived_ability"."source_external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "derived_ability_trigger_ability_idx" ON "derived_ability_trigger" USING btree ("derived_ability_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "derived_ability_trigger_order_uq" ON "derived_ability_trigger" USING btree ("derived_ability_id","sort_order");
--> statement-breakpoint
INSERT INTO "derived_ability" (
	"name",
	"description",
	"mechanical_effect",
	"source_system",
	"source_external_id"
) VALUES
	('Durable Muscles', '', '', 'serrian-tide-derived-ability-canon', 'DA-STR-40-DURABLE-MUSCLES'),
	('Ambidexterity', '', '', 'serrian-tide-derived-ability-canon', 'DA-DEX-40-AMBIDEXTERITY'),
	('Poison Resistance', '', '', 'serrian-tide-derived-ability-canon', 'DA-CON-40-POISON-RESISTANCE'),
	('Eidetic Memory', '', '', 'serrian-tide-derived-ability-canon', 'DA-INT-40-EIDETIC-MEMORY'),
	('Indomitable Will', '', '', 'serrian-tide-derived-ability-canon', 'DA-WIS-40-INDOMITABLE-WILL'),
	('Likeable', '', '', 'serrian-tide-derived-ability-canon', 'DA-CHR-40-LIKEABLE')
ON CONFLICT ("source_system", "source_external_id")
WHERE "source_system" IS NOT NULL AND "source_external_id" IS NOT NULL
DO NOTHING;
--> statement-breakpoint
INSERT INTO "derived_ability_trigger" (
	"derived_ability_id",
	"trigger_type",
	"attribute_key",
	"minimum_score",
	"sort_order"
)
SELECT
	ability."id",
	'attribute',
	canonical."attribute_key",
	40,
	0
FROM (VALUES
	('DA-STR-40-DURABLE-MUSCLES', 'STR'),
	('DA-DEX-40-AMBIDEXTERITY', 'DEX'),
	('DA-CON-40-POISON-RESISTANCE', 'CON'),
	('DA-INT-40-EIDETIC-MEMORY', 'INT'),
	('DA-WIS-40-INDOMITABLE-WILL', 'WIS'),
	('DA-CHR-40-LIKEABLE', 'CHR')
) AS canonical("source_external_id", "attribute_key")
INNER JOIN "derived_ability" AS ability
	ON ability."source_system" = 'serrian-tide-derived-ability-canon'
	AND ability."source_external_id" = canonical."source_external_id"
ON CONFLICT ("derived_ability_id", "sort_order") DO UPDATE SET
	"trigger_type" = EXCLUDED."trigger_type",
	"attribute_key" = EXCLUDED."attribute_key",
	"minimum_score" = EXCLUDED."minimum_score";
