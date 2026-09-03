WITH "legacy_trigger_shape" AS (
	SELECT
		trigger_row."id",
		trigger_row."derived_ability_id",
		trigger_row."trigger_type",
		trigger_row."attribute_key",
		trigger_row."minimum_score",
		trigger_row."sort_order",
		count(*) OVER (
			PARTITION BY trigger_row."derived_ability_id"
		) AS "trigger_count"
	FROM "derived_ability_trigger" AS trigger_row
)
INSERT INTO "derived_ability_requirement" (
	"derived_ability_id",
	"requirement_scope",
	"requirement_type",
	"group_number",
	"attribute_key",
	"skill_id",
	"required_derived_ability_id",
	"operator",
	"required_value",
	"notes",
	"sort_order"
)
SELECT
	legacy."derived_ability_id",
	'live',
	'attribute',
	0,
	legacy."attribute_key",
	NULL,
	NULL,
	'gte',
	legacy."minimum_score",
	'',
	legacy."sort_order"
FROM "legacy_trigger_shape" AS legacy
WHERE legacy."trigger_count" = 1
	AND legacy."trigger_type" = 'attribute'
	AND legacy."attribute_key" IN ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHR')
	AND legacy."minimum_score" IS NOT NULL
	AND legacy."minimum_score" >= 0
	AND legacy."sort_order" >= 0
	AND NOT EXISTS (
		SELECT 1
		FROM "derived_ability_requirement" AS existing_requirement
		WHERE existing_requirement."derived_ability_id" = legacy."derived_ability_id"
	)
ORDER BY legacy."derived_ability_id", legacy."id"
ON CONFLICT (
	"derived_ability_id",
	"requirement_scope",
	"group_number",
	"sort_order"
) DO NOTHING;
