CREATE TABLE "attribute_score_reference" (
	"attribute_key" varchar(3) NOT NULL,
	"score" integer NOT NULL,
	"max_carry" integer,
	"max_lift" integer,
	"max_spheres" integer,
	"spell_weaving" integer,
	"teaching_base" integer,
	"loyalty_base" integer,
	CONSTRAINT "attribute_score_reference_attribute_key_score_pk" PRIMARY KEY("attribute_key","score"),
	CONSTRAINT "attribute_score_reference_key_valid" CHECK ("attribute_score_reference"."attribute_key" IN ('STR', 'INT', 'WIS', 'CHR')),
	CONSTRAINT "attribute_score_reference_score_range" CHECK ("attribute_score_reference"."score" BETWEEN 1 AND 100),
	CONSTRAINT "attribute_score_reference_values_nonnegative" CHECK (("attribute_score_reference"."max_carry" IS NULL OR "attribute_score_reference"."max_carry" >= 0)
        AND ("attribute_score_reference"."max_lift" IS NULL OR "attribute_score_reference"."max_lift" >= 0)
        AND ("attribute_score_reference"."max_spheres" IS NULL OR "attribute_score_reference"."max_spheres" >= 0)
        AND ("attribute_score_reference"."spell_weaving" IS NULL OR "attribute_score_reference"."spell_weaving" >= 0)
        AND ("attribute_score_reference"."teaching_base" IS NULL OR "attribute_score_reference"."teaching_base" >= 0)
        AND ("attribute_score_reference"."loyalty_base" IS NULL OR "attribute_score_reference"."loyalty_base" >= 0)),
	CONSTRAINT "attribute_score_reference_fields_match_key" CHECK ((
          "attribute_score_reference"."attribute_key" = 'STR'
          AND "attribute_score_reference"."max_carry" IS NOT NULL
          AND "attribute_score_reference"."max_lift" IS NOT NULL
          AND "attribute_score_reference"."max_spheres" IS NULL
          AND "attribute_score_reference"."spell_weaving" IS NULL
          AND "attribute_score_reference"."teaching_base" IS NULL
          AND "attribute_score_reference"."loyalty_base" IS NULL
        ) OR (
          "attribute_score_reference"."attribute_key" = 'INT'
          AND "attribute_score_reference"."max_carry" IS NULL
          AND "attribute_score_reference"."max_lift" IS NULL
          AND "attribute_score_reference"."max_spheres" IS NOT NULL
          AND "attribute_score_reference"."spell_weaving" IS NOT NULL
          AND "attribute_score_reference"."teaching_base" IS NULL
          AND "attribute_score_reference"."loyalty_base" IS NULL
        ) OR (
          "attribute_score_reference"."attribute_key" = 'WIS'
          AND "attribute_score_reference"."max_carry" IS NULL
          AND "attribute_score_reference"."max_lift" IS NULL
          AND "attribute_score_reference"."max_spheres" IS NULL
          AND "attribute_score_reference"."spell_weaving" IS NULL
          AND "attribute_score_reference"."teaching_base" IS NOT NULL
          AND "attribute_score_reference"."loyalty_base" IS NULL
        ) OR (
          "attribute_score_reference"."attribute_key" = 'CHR'
          AND "attribute_score_reference"."max_carry" IS NULL
          AND "attribute_score_reference"."max_lift" IS NULL
          AND "attribute_score_reference"."max_spheres" IS NULL
          AND "attribute_score_reference"."spell_weaving" IS NULL
          AND "attribute_score_reference"."teaching_base" IS NULL
          AND "attribute_score_reference"."loyalty_base" IS NOT NULL
        ))
);
