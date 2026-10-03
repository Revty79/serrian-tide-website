ALTER TABLE "campaign_character_skill_allocation" ADD COLUMN "special_ability_granted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Validate the final transaction state, including imports, Race edits and Race changes.
-- Existing rows/documents are not rewritten or reclassified by this migration.
CREATE FUNCTION assert_character_special_ability_scores(character_key integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE invalid_name text;
BEGIN
  PERFORM id FROM campaign_character WHERE id = character_key FOR UPDATE;
  WITH allocation_scores AS (
    SELECT skill_id, max(points) AS points, bool_or(special_ability_granted) AS assigned
    FROM campaign_character_skill_allocation WHERE character_id = character_key GROUP BY skill_id
  ), race_scores AS (
    SELECT l.skill_id, sum(greatest(l.value, 0)) AS points
    FROM campaign_character_profile p JOIN race_skill_links l ON l.race_id = p.race_id
    WHERE p.character_id = character_key GROUP BY l.skill_id
  )
  SELECT s.name INTO invalid_name
  FROM allocation_scores a FULL JOIN race_scores r USING (skill_id)
  JOIN skill s ON s.id = coalesce(a.skill_id, r.skill_id)
  WHERE (lower(trim(s.classification)) IN ('special ability', 'special abilities')
    AND NOT (coalesce(a.points, 0) + coalesce(r.points, 0) BETWEEN 0 AND 100))
    OR (a.assigned AND coalesce(lower(trim(s.classification)), '') NOT IN ('special ability', 'special abilities'))
  LIMIT 1;
  IF invalid_name IS NOT NULL THEN
    RAISE EXCEPTION 'Special Ability % must have a score from 0 to 100 and an assignment must reference a Special Ability.', invalid_name USING ERRCODE = '23514';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_character_special_ability_scores() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_character_special_ability_scores(NEW.character_id);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER character_special_ability_allocation_score
AFTER INSERT OR UPDATE ON campaign_character_skill_allocation
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_character_special_ability_scores();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER character_special_ability_race_score
AFTER INSERT OR UPDATE OF race_id ON campaign_character_profile
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_character_special_ability_scores();
--> statement-breakpoint
CREATE FUNCTION guard_special_ability_grant_scores() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE character_key integer; ability_key integer; invalid_name text;
BEGIN
  IF TG_TABLE_NAME = 'skill' THEN ability_key := NEW.id; ELSE ability_key := NEW.skill_id; END IF;
  SELECT s.name INTO invalid_name FROM skill s
  WHERE s.id = ability_key AND lower(trim(s.classification)) IN ('special ability', 'special abilities')
    AND EXISTS (SELECT 1 FROM race_skill_links l WHERE l.skill_id = s.id GROUP BY l.race_id HAVING sum(greatest(l.value, 0)) > 100);
  IF invalid_name IS NOT NULL THEN
    RAISE EXCEPTION 'Race-granted Special Ability % must have a score from 0 to 100.', invalid_name USING ERRCODE = '23514';
  END IF;
  FOR character_key IN
    SELECT character_id FROM campaign_character_skill_allocation WHERE skill_id = ability_key
    UNION
    SELECT p.character_id FROM campaign_character_profile p JOIN race_skill_links l ON l.race_id = p.race_id WHERE l.skill_id = ability_key
    ORDER BY character_id
  LOOP
    PERFORM assert_character_special_ability_scores(character_key);
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER race_special_ability_grant_score
AFTER INSERT OR UPDATE ON race_skill_links
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_special_ability_grant_scores();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER skill_special_ability_score
AFTER UPDATE OF classification ON skill
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_special_ability_grant_scores();
