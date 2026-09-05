CREATE TABLE "lifecycle_audit_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"target_name" text NOT NULL,
	"campaign_id_snapshot" integer,
	"owner_user_id_snapshot" text,
	"actor_user_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"dependency_summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lifecycle_audit_event_action_valid" CHECK ("lifecycle_audit_event"."action" IN ('archive', 'restore', 'delete')),
	CONSTRAINT "lifecycle_audit_event_entity_kind_valid" CHECK ("lifecycle_audit_event"."entity_kind" IN (
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
        'campaign-player'
      )),
	CONSTRAINT "lifecycle_audit_event_target_id_nonblank" CHECK (length(trim("lifecycle_audit_event"."target_id")) > 0),
	CONSTRAINT "lifecycle_audit_event_target_name_nonblank" CHECK (length(trim("lifecycle_audit_event"."target_name")) > 0),
	CONSTRAINT "lifecycle_audit_event_campaign_id_valid" CHECK ("lifecycle_audit_event"."campaign_id_snapshot" IS NULL OR "lifecycle_audit_event"."campaign_id_snapshot" > 0),
	CONSTRAINT "lifecycle_audit_event_owner_snapshot_valid" CHECK ("lifecycle_audit_event"."owner_user_id_snapshot" IS NULL OR length(trim("lifecycle_audit_event"."owner_user_id_snapshot")) > 0),
	CONSTRAINT "lifecycle_audit_event_reason_length_valid" CHECK (length("lifecycle_audit_event"."reason") <= 1000),
	CONSTRAINT "lifecycle_audit_event_dependency_summary_object" CHECK (jsonb_typeof("lifecycle_audit_event"."dependency_summary_json") = 'object')
);
--> statement-breakpoint
ALTER TABLE "skill_relationship" DROP CONSTRAINT "skill_relationship_skill_id_skill_id_fk";
--> statement-breakpoint
ALTER TABLE "skill_relationship" DROP CONSTRAINT "skill_relationship_related_skill_id_skill_id_fk";
--> statement-breakpoint
ALTER TABLE "race_skill_links" DROP CONSTRAINT "race_skill_links_skill_id_skill_id_fk";
--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "creatures" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "creatures" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "creatures" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD COLUMN "npc_build_mode" text;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD COLUMN "npc_role_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "campaign_character"
SET "npc_build_mode" = 'detailed'
WHERE "is_npc" = true AND "npc_build_mode" IS NULL;--> statement-breakpoint
ALTER TABLE "lifecycle_audit_event" ADD CONSTRAINT "lifecycle_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lifecycle_audit_event_target_idx" ON "lifecycle_audit_event" USING btree ("entity_kind","target_id","created_at","id");--> statement-breakpoint
CREATE INDEX "lifecycle_audit_event_campaign_idx" ON "lifecycle_audit_event" USING btree ("campaign_id_snapshot","created_at","id");--> statement-breakpoint
CREATE INDEX "lifecycle_audit_event_actor_idx" ON "lifecycle_audit_event" USING btree ("actor_user_id","created_at","id");--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_relationship" ADD CONSTRAINT "skill_relationship_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_relationship" ADD CONSTRAINT "skill_relationship_related_skill_id_skill_id_fk" FOREIGN KEY ("related_skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_skill_links" ADD CONSTRAINT "race_skill_links_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD CONSTRAINT "derived_ability_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character" ADD CONSTRAINT "campaign_character_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_archive_idx" ON "campaign" USING btree ("archived_at","name","id");--> statement-breakpoint
CREATE INDEX "skill_archive_idx" ON "skill" USING btree ("archived_at","name","id");--> statement-breakpoint
CREATE INDEX "races_archive_idx" ON "races" USING btree ("archived_at","name","id");--> statement-breakpoint
CREATE INDEX "creatures_archive_idx" ON "creatures" USING btree ("archived_at","canonical_name","id");--> statement-breakpoint
CREATE INDEX "derived_ability_archive_idx" ON "derived_ability" USING btree ("archived_at","name","id");--> statement-breakpoint
CREATE INDEX "items_archive_idx" ON "items" USING btree ("archived_at","name","id");--> statement-breakpoint
CREATE INDEX "campaign_character_campaign_archive_idx" ON "campaign_character" USING btree ("campaign_id","is_npc","archived_at","name","id");--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_archive_state_valid" CHECK ((
        ("campaign"."archived_at" IS NULL AND "campaign"."archived_by_user_id" IS NULL AND "campaign"."archive_reason" = '')
        OR "campaign"."archived_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_archive_state_valid" CHECK ((
        ("skill"."archived_at" IS NULL AND "skill"."archived_by_user_id" IS NULL AND "skill"."archive_reason" = '')
        OR "skill"."archived_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_archive_state_valid" CHECK ((
        ("races"."archived_at" IS NULL AND "races"."archived_by_user_id" IS NULL AND "races"."archive_reason" = '')
        OR "races"."archived_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_archive_state_valid" CHECK ((
        ("creatures"."archived_at" IS NULL AND "creatures"."archived_by_user_id" IS NULL AND "creatures"."archive_reason" = '')
        OR "creatures"."archived_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "derived_ability" ADD CONSTRAINT "derived_ability_archive_state_valid" CHECK ((
        ("derived_ability"."archived_at" IS NULL AND "derived_ability"."archived_by_user_id" IS NULL AND "derived_ability"."archive_reason" = '')
        OR "derived_ability"."archived_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_archive_state_valid" CHECK ((
        ("items"."archived_at" IS NULL AND "items"."archived_by_user_id" IS NULL AND "items"."archive_reason" = '')
        OR "items"."archived_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "campaign_character" ADD CONSTRAINT "campaign_character_npc_build_mode_valid" CHECK ("campaign_character"."npc_build_mode" IS NULL OR "campaign_character"."npc_build_mode" IN ('simple', 'detailed'));--> statement-breakpoint
ALTER TABLE "campaign_character" ADD CONSTRAINT "campaign_character_npc_build_mode_presence" CHECK ((
        ("campaign_character"."is_npc" = true AND "campaign_character"."npc_build_mode" IS NOT NULL)
        OR ("campaign_character"."is_npc" = false AND "campaign_character"."npc_build_mode" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "campaign_character" ADD CONSTRAINT "campaign_character_archive_state_valid" CHECK ((
        ("campaign_character"."archived_at" IS NULL AND "campaign_character"."archived_by_user_id" IS NULL AND "campaign_character"."archive_reason" = '')
        OR "campaign_character"."archived_at" IS NOT NULL
      ));
