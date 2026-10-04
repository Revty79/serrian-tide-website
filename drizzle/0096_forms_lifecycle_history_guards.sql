CREATE FUNCTION verify_form_use_reset_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM campaign_character c WHERE c.id=NEW.character_id AND c.campaign_id=NEW.campaign_id)
    OR (NEW.after_entry_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM form_transition_event e WHERE e.id=NEW.after_entry_event_id AND e.character_id=NEW.character_id AND e.operation='enter')) THEN
    RAISE EXCEPTION 'Form refresh must retain its exact individual and Campaign provenance.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER form_reset_provenance BEFORE INSERT ON form_use_reset_event FOR EACH ROW EXECUTE FUNCTION verify_form_use_reset_event();
--> statement-breakpoint
-- Match transition history: immutable during play, with deletion only through
-- the existing explicitly authorized whole-Campaign dependency plan.
CREATE TRIGGER form_reset_immutable BEFORE UPDATE ON form_use_reset_event FOR EACH ROW EXECUTE FUNCTION prevent_form_event_update();
