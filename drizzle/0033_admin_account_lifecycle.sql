ALTER TABLE "lifecycle_audit_event" DROP CONSTRAINT "lifecycle_audit_event_entity_kind_valid";--> statement-breakpoint
ALTER TABLE "lifecycle_audit_event" ADD CONSTRAINT "lifecycle_audit_event_entity_kind_valid" CHECK ("lifecycle_audit_event"."entity_kind" IN (
        'campaign',
        'player-character',
        'race-npc',
        'creature-npc',
        'race',
        'creature',
        'skill',
        'item',
        'derived-ability',
        'campaign-session',
        'scene',
        'encounter',
        'campaign-player',
        'user-account'
      ));