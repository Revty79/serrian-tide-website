ALTER TABLE "campaign_session_encounter_reaction" DROP CONSTRAINT "campaign_session_encounter_reaction_defending_item_valid";--> statement-breakpoint
ALTER TABLE "campaign_session_encounter_reaction" ADD CONSTRAINT "campaign_session_encounter_reaction_defending_item_valid" CHECK ((
        ("campaign_session_encounter_reaction"."reaction_type" IN ('block', 'parry') AND (
          "campaign_session_encounter_reaction"."defending_item_id" IS NOT NULL
          OR ("campaign_session_encounter_reaction"."reactor_character_id" < 0 AND "campaign_session_encounter_reaction"."defending_item_id" IS NULL AND "campaign_session_encounter_reaction"."defending_instance_id" IS NULL
            AND coalesce("campaign_session_encounter_reaction"."declaration_snapshot_json"->'source'->>'kind' = 'creature-defense', false)
            AND "campaign_session_encounter_reaction"."committed_initiative_cost" > 0)
        ))
        OR ("campaign_session_encounter_reaction"."reaction_type" IN ('dodge', 'no-reaction') AND "campaign_session_encounter_reaction"."defending_item_id" IS NULL AND "campaign_session_encounter_reaction"."defending_instance_id" IS NULL)
        OR ("campaign_session_encounter_reaction"."reaction_type" NOT IN ('block', 'parry', 'dodge', 'no-reaction'))
      ));